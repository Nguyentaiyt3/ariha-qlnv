import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-calendar";
import { saveUser, getUser } from "@/lib/firebase/firestore";
import { cookies } from "next/headers";

// GET /api/calendar/google/callback?code=...&userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state"); // state = userId passed in auth URL

  if (!code || !userId) {
    return NextResponse.redirect(
      new URL("/calendar?error=missing_params", req.url),
    );
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await getUser(userId);
    if (!user) throw new Error("User not found");

    await saveUser({
      ...user,
      googleCalendarToken: {
        access_token: tokens.access_token ?? "",
        refresh_token: tokens.refresh_token ?? "",
        expiry_date: tokens.expiry_date ?? 0,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.redirect(new URL("/calendar?connected=1", appUrl));
  } catch (err) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.redirect(new URL("/calendar?error=oauth_failed", appUrl));
  }
}
