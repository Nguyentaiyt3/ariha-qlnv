import { NextRequest, NextResponse } from "next/server";
import { createUserAccount } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { UserModel } from "@/lib/mongodb/models";
import type { UserRole } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role: requestedRole, department, position } = await req.json();

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

    // First user ever → allow requested role (setup flow); otherwise always guest
    await connectDB();
    const existingCount = await UserModel.countDocuments().limit(1);
    const role: UserRole = existingCount === 0 && requestedRole ? requestedRole as UserRole : "guest";

    const { user, token } = await createUserAccount(
      email,
      password,
      name,
      role,
      department,
      position,
    );

    const response = NextResponse.json({ user, token });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đăng ký thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
