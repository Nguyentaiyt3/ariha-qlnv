import { NextRequest, NextResponse } from "next/server";
import { verifyToken, changePassword } from "@/lib/mongodb/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const auth = token ? verifyToken(token) : null;
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { oldPassword, newPassword } = await req.json();
    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: "Thiếu mật khẩu cũ hoặc mới." }, { status: 400 });
    }
    await changePassword(auth.userId, oldPassword, newPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đổi mật khẩu thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
