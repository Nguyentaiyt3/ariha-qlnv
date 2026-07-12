import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken, createUserAccount, getUser } from "@/lib/mongodb/auth";
import { getUsers, saveUser } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { ensureOnboardingTask } from "@/lib/mongodb/employeeTask";
import { logAudit } from "@/lib/mongodb/auditLog";
import { sameUnit } from "@/lib/rbac/scope";
import { parseBody } from "@/lib/validation";
import type { UserRole } from "@/types";

const USER_ROLES = [
  "guest", "staff", "teamLead", "director", "hrAdmin",
  "financeViewer", "financeAuditor", "financeSupervisor",
] as const;

const createUserSchema = z.object({
  email: z.string().trim().min(1),
  name: z.string().trim().min(1),
  tempPassword: z.string().min(6, "Mật khẩu tạm tối thiểu 6 ký tự"),
  role: z.enum(USER_ROLES),
  department: z.string().optional(),
  position: z.string().optional(),
  employeeCode: z.string().optional(),
  idNumber: z.string().optional(),
});

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let users = await getUsers();

    // "onlyOwnUnit=1": dùng riêng cho trang Nhân sự — trưởng nhóm chỉ thấy nhân viên cùng đơn
    // vị. KHÔNG áp dụng mặc định vì endpoint này còn là nguồn chọn người dùng chung (chọn
    // stakeholder, PI...) ở khắp nơi trong app.
    if (req.nextUrl.searchParams.get("onlyOwnUnit") === "1") {
      const me = await getUser(auth.userId);
      if (me && me.role === "teamLead") {
        users = users.filter((u) => u.id === me.id || sameUnit(u.department, me.department));
      }
    }

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
  if (!me || !hasPermission(me.role, "user:create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = await parseBody(req, createUserSchema);
    if ("error" in parsed) return parsed.error;
    const { email, name, tempPassword, role, department, position, employeeCode, idNumber } = parsed.data;

    const { user: newUser } = await createUserAccount(
      email, tempPassword, name, role as UserRole, department || undefined, position || undefined,
    );

    // Bắt đổi mật khẩu ở lần đăng nhập đầu (giống luồng reset mật khẩu) + lưu mã nhân viên/CCCD nếu có.
    await saveUser({
      id: newUser.id,
      mustChangePassword: true,
      passwordUpdatedAt: new Date().toISOString(),
      ...(employeeCode ? { employeeCode } : {}),
      ...(idNumber ? { idNumber } : {}),
    });

    try {
      await ensureOnboardingTask({ ...newUser, department, employeeCode }, auth.userId);
    } catch (e) {
      console.error("[users:POST] Lỗi khi tự sinh Task hội nhập:", e);
    }

    await logAudit({
      actorId: me.id,
      actorName: me.name,
      actorRole: me.role,
      action: "user.created",
      entityType: "User",
      entityId: newUser.id,
      entityLabel: newUser.name,
      after: { email, name, role, department, position },
    });

    return NextResponse.json({ success: true, id: newUser.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tạo tài khoản thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
