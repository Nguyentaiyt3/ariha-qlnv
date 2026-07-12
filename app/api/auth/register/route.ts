import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserAccount } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { UserModel } from "@/lib/mongodb/models";
import { parseBody } from "@/lib/validation";
import type { UserRole } from "@/types";

const USER_ROLES = [
  "guest", "staff", "teamLead", "director", "hrAdmin",
  "financeViewer", "financeAuditor", "financeSupervisor",
] as const;

const registerSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  name: z.string().trim().min(1),
  role: z.enum(USER_ROLES).optional(),
  department: z.string().optional(),
  position: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, registerSchema);
    if ("error" in parsed) return parsed.error;
    const { email, password, name, role: requestedRole, department, position } = parsed.data;

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
