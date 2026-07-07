import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createUserAccount, getUser } from "@/lib/mongodb/auth";
import { getUsers, saveUser } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { ensureOnboardingTask } from "@/lib/mongodb/employeeTask";
import type { UserRole } from "@/types";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[API /users GET]", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

/**
 * POST /api/users — HR/Admin tạo trực tiếp 1 tài khoản nhân viên chính thức (khác với luồng tự
 * đăng ký → "guest" → chờ duyệt). Sau khi tạo, tự sinh Task hội nhập ngay (không cần chuyển vai
 * trò từ "guest" nên hook trong PATCH /api/users/[id] không áp dụng ở luồng này).
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  if (!me || !hasPermission(me.role, "user:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, name, tempPassword, role, department, position, employeeCode } = await req.json();
    if (!email || !name || !tempPassword || !role) {
      return NextResponse.json({ error: "Email, tên, mật khẩu tạm và vai trò là bắt buộc" }, { status: 400 });
    }
    if (tempPassword.length < 6) {
      return NextResponse.json({ error: "Mật khẩu tạm tối thiểu 6 ký tự" }, { status: 400 });
    }

    const { user: newUser } = await createUserAccount(
      email, tempPassword, name, role as UserRole, department || undefined, position || undefined,
    );

    // Bắt đổi mật khẩu ở lần đăng nhập đầu (giống luồng reset mật khẩu) + lưu mã nhân viên nếu có.
    await saveUser({
      id: newUser.id,
      mustChangePassword: true,
      passwordUpdatedAt: new Date().toISOString(),
      ...(employeeCode ? { employeeCode } : {}),
    });

    try {
      await ensureOnboardingTask({ ...newUser, department, employeeCode }, auth.userId);
    } catch (e) {
      console.error("[users:POST] Lỗi khi tự sinh Task hội nhập:", e);
    }

    return NextResponse.json({ success: true, id: newUser.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tạo tài khoản thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
