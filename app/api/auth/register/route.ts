import { NextRequest, NextResponse } from "next/server";
import { createUserAccount } from "@/lib/mongodb/auth";
import type { UserRole } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, department } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, mật khẩu và tên là bắt buộc" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Mật khẩu tối thiểu 6 ký tự" },
        { status: 400 }
      );
    }

    const { user, token } = await createUserAccount(
      email,
      password,
      name,
      "guest" as UserRole,
      department
    );

    const response = NextResponse.json({ user, token });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đăng ký thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
