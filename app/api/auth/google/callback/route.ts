import { NextRequest, NextResponse } from "next/server";
import { loginWithGoogle } from "@/lib/mongodb/auth";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export async function GET(req: NextRequest) {
  const reqUrl = new URL(req.url);
  const origin = reqUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const { searchParams } = reqUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${origin}/login?error=google_cancelled`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error("Không thể lấy token từ Google");
    }

    const tokens = await tokenRes.json();

    // Get user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      throw new Error("Không thể lấy thông tin người dùng từ Google");
    }

    const googleUser = await userInfoRes.json();

    if (!googleUser.email) {
      throw new Error("Tài khoản Google không có email");
    }

    // Find or create user in MongoDB
    const { token } = await loginWithGoogle({
      email: googleUser.email,
      name: googleUser.name || googleUser.email,
      picture: googleUser.picture,
    });

    const response = NextResponse.redirect(`${origin}/dashboard`);

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error("[Google OAuth callback error]", err);
    const msg = err instanceof Error ? encodeURIComponent(err.message) : "google_error";
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }
}
