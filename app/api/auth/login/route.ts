import { NextRequest, NextResponse } from "next/server";
import { loginWithEmail } from "@/lib/mongodb/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email và mật khẩu là bắt buộc" },
        { status: 400 }
      );
    }

    const { user, token } = await loginWithEmail(email, password);

    const response = NextResponse.json({ user, token });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đăng nhập thất bại";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
