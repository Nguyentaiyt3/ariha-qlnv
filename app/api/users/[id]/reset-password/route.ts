import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser, adminResetPassword } from "@/lib/mongodb/auth";
import { hasPermission } from "@/lib/rbac/permissions";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get("auth-token")?.value;
  const auth = token ? verifyToken(token) : null;
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only managers with user:manage may reset other users' passwords
  const requester = await getUser(auth.userId);
  if (!requester || !hasPermission(requester.role, "user:manage")) {
    return NextResponse.json({ error: "Không có quyền reset mật khẩu." }, { status: 403 });
  }

  try {
    const { tempPassword } = await req.json();
    if (!tempPassword) {
      return NextResponse.json({ error: "Thiếu mật khẩu tạm." }, { status: 400 });
    }
    await adminResetPassword(params.id, tempPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset mật khẩu thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
