import { NextRequest, NextResponse } from "next/server";
import { listGoogleEvents } from "@/lib/google-calendar";
import { verifyToken, getUser } from "@/lib/mongodb/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const auth = token ? verifyToken(token) : null;
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  if (!userId || !timeMin || !timeMax) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  // Chỉ được đọc lịch Google của chính mình — token OAuth cá nhân không dùng để xem hộ người khác.
  if (userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await getUser(userId);
    if (!user?.googleCalendarToken) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const events = await listGoogleEvents(
      user.googleCalendarToken as unknown as Record<string, unknown>,
      timeMin,
      timeMax,
    );
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
