import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { bulkApproveUsers, getUsers } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { ensureOnboardingTask } from "@/lib/mongodb/employeeTask";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // NB: verifyToken() chỉ trả về { userId } — trước đây route này cast auth.role trực tiếp
  // (luôn undefined) nên check quyền không bao giờ pass. Sửa lại theo đúng pattern hasPermission
  // dùng ở các route khác (vd. clinical-trials).
  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  if (!me || !hasPermission(me.role, "user:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { userIds, role } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }
    const validRoles = ["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Lấy trạng thái TRƯỚC khi cập nhật để biết ai đang từ "guest" chuyển sang vai trò chính
    // thức (không phát hiện được sau khi bulkApproveUsers đã ghi đè).
    const prevUsers = (await getUsers()).filter((u) => userIds.includes(u.id) && u.role === "guest");

    const count = await bulkApproveUsers(userIds, role);

    // Tự sinh Task hội nhập cho từng nhân viên vừa được duyệt. Bọc try/catch: lỗi sinh Task
    // không được làm hỏng việc duyệt tài khoản (đã lưu thành công ở trên).
    for (const prevUser of prevUsers) {
      try {
        await ensureOnboardingTask({ ...prevUser, role }, auth.userId);
      } catch (e) {
        console.error("[users/bulk-approve:POST] Lỗi khi tự sinh Task hội nhập:", e);
      }
    }

    return NextResponse.json({ success: true, count });
  } catch (e) {
    console.error("[API /users/bulk-approve POST]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
