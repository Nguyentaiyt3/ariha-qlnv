import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getUser, saveUser, deleteUser } from "@/lib/mongodb/firestore";
import { ensureOnboardingTask } from "@/lib/mongodb/employeeTask";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { logAudit } from "@/lib/mongodb/auditLog";

const CONTRACT_FIELDS = ["employeeCode", "contractType", "contractStart", "contractEnd"];
// Field tự phục vụ — không cần quyền user:manage vì bất kỳ ai cũng được tự sửa cho chính mình
// (đổi ảnh đại diện, tuỳ chọn thông báo). Đổi thông tin hồ sơ khác (tên, đơn vị, chức vụ...) đi
// qua luồng "Đề xuất thay đổi thông tin" (request duyệt), không qua route này.
const SELF_SERVICE_FIELDS = new Set(["avatar", "notificationPrefs"]);

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (params.id !== auth.userId) {
      await ensurePermissionOverridesLoaded();
      const me = await getUser(auth.userId);
      if (!me || !hasPermission(me.role, "user:read")) {
        return NextResponse.json({ error: "Không có quyền xem hồ sơ nhân viên" }, { status: 403 });
      }
    }
    const user = await getUser(params.id);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const updates = await req.json();

    // Lấy trạng thái TRƯỚC khi cập nhật — cần để (1) so sánh field nào THỰC SỰ đổi giá trị (vd.
    // tự đổi avatar gửi kèm nguyên object nên có cả role/department cũ, không phải đang đổi
    // chúng), và (2) ghi nhật ký đổi vai trò/vô hiệu hoá, phát hiện "guest" được duyệt lên vai
    // trò chính thức.
    const prevUser = await getUser(params.id);
    if (!prevUser) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Field tự phục vụ chỉ được miễn kiểm tra quyền khi người gọi đang sửa CHÍNH hồ sơ của mình —
    // nếu không, ai đó có thể PATCH /api/users/{id-người-khác} với body chỉ gồm avatar/
    // notificationPrefs để né hoàn toàn khối kiểm tra quyền bên dưới.
    const isSelf = params.id === auth.userId;

    const touchesContract = Object.keys(updates).some((k) => CONTRACT_FIELDS.includes(k));
    const touchesCredentials = Object.prototype.hasOwnProperty.call(updates, "credentials");
    // Field nào ngoài "tự phục vụ"/hợp đồng/chứng chỉ mà giá trị THỰC SỰ thay đổi so với hiện tại
    // → coi là cập nhật hồ sơ nhân sự chung, cần quyền user:manage (vd. vai trò, đơn vị, chức
    // vụ, trạng thái hoạt động...). Trước đây route này không kiểm tra gì cho các field này cả.
    const touchesGeneralProfile = Object.keys(updates).some((k) =>
      k !== "id" &&
      !(isSelf && SELF_SERVICE_FIELDS.has(k)) &&
      !CONTRACT_FIELDS.includes(k) &&
      k !== "credentials" &&
      JSON.stringify(updates[k]) !== JSON.stringify((prevUser as unknown as Record<string, unknown>)[k])
    );

    if (touchesContract || touchesCredentials || touchesGeneralProfile) {
      await ensurePermissionOverridesLoaded();
      const me = await getUser(auth.userId);
      if (touchesContract && !(me && hasPermission(me.role, "user:manageContract"))) {
        return NextResponse.json({ error: "Không có quyền quản lý hồ sơ hợp đồng" }, { status: 403 });
      }
      if (touchesCredentials && !(me && hasPermission(me.role, "user:manageCredentials"))) {
        return NextResponse.json({ error: "Không có quyền quản lý chứng chỉ/bằng cấp" }, { status: 403 });
      }
      if (touchesGeneralProfile && !(me && hasPermission(me.role, "user:manage"))) {
        return NextResponse.json({ error: "Không có quyền chỉnh sửa hồ sơ nhân viên" }, { status: 403 });
      }
    }

    await saveUser({ ...updates, id: params.id });

    // Tự sinh Task hội nhập khi tài khoản chuyển từ "guest" sang vai trò chính thức. Bọc
    // try/catch: lỗi sinh Task không được làm hỏng việc cập nhật vai trò (đã lưu thành công ở trên).
    if (prevUser && prevUser.role === "guest" && updates.role && updates.role !== "guest") {
      try {
        const updated = await getUser(params.id);
        if (updated) await ensureOnboardingTask(updated, auth.userId);
      } catch (e) {
        console.error("[users/[id]:PATCH] Lỗi khi tự sinh Task hội nhập:", e);
      }
    }

    if (prevUser) {
      const actor = await getUser(auth.userId);
      if (updates.role !== undefined && updates.role !== prevUser.role) {
        await logAudit({
          actorId: auth.userId, actorName: actor?.name, actorRole: actor?.role,
          action: "user.role_changed", entityType: "User", entityId: params.id, entityLabel: prevUser.name,
          before: { role: prevUser.role }, after: { role: updates.role },
        });
      }
      if (updates.isActive !== undefined && updates.isActive !== prevUser.isActive) {
        await logAudit({
          actorId: auth.userId, actorName: actor?.name, actorRole: actor?.role,
          action: updates.isActive ? "user.activated" : "user.deactivated",
          entityType: "User", entityId: params.id, entityLabel: prevUser.name,
          before: { isActive: prevUser.isActive }, after: { isActive: updates.isActive },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !hasPermission(me.role, "user:manage")) {
      return NextResponse.json({ error: "Không có quyền vô hiệu hoá nhân viên" }, { status: 403 });
    }
    const target = await getUser(params.id);
    await deleteUser(params.id);
    const actor = await getUser(auth.userId);
    await logAudit({
      actorId: auth.userId, actorName: actor?.name, actorRole: actor?.role,
      action: "user.deactivated", entityType: "User", entityId: params.id, entityLabel: target?.name,
      before: { isActive: target?.isActive }, after: { isActive: false },
      note: "Vô hiệu hoá qua DELETE /api/users/[id]",
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
