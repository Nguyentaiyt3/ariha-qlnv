import { NextRequest, NextResponse } from "next/server";
import { loginWithEmail } from "@/lib/mongodb/auth";
import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts, getClientIp } from "@/lib/mongodb/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email và mật khẩu là bắt buộc" },
        { status: 400 }
      );
    }

    // Giới hạn theo "ip:email" — chặn brute-force nhắm vào 1 tài khoản cụ thể mà không
    // khoá nhầm người dùng khác chung IP (mạng NAT/văn phòng).
    const rateLimitKey = `${getClientIp(req)}:${email.toLowerCase()}`;
    const rateLimit = await checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      const minutes = Math.ceil((rateLimit.retryAfterSeconds ?? 0) / 60);
      return NextResponse.json(
        { error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.` },
        { status: 429 }
      );
    }

    let user, token;
    try {
      ({ user, token } = await loginWithEmail(email, password));
    } catch (error) {
      await recordFailedLogin(rateLimitKey);
      throw error;
    }
    await clearLoginAttempts(rateLimitKey);

    const response = NextResponse.json({ user, token });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đăng nhập thất bại";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
