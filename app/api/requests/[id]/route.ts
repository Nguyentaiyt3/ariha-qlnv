import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getRequest, updateRequest, getUser, saveUser } from "@/lib/mongodb/firestore";
import { ensureOffboardingTask } from "@/lib/mongodb/employeeTask";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { logAudit } from "@/lib/mongodb/auditLog";
import { PROFILE_EDITABLE_FIELDS } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

/** Đơn "Nghỉ việc"/"Thay đổi thông tin" đụng tới hồ sơ nhân sự/CCCD — chỉ role có request:approveHR mới duyệt được. */
function requiredApprovePermission(type: string | undefined): "request:approve" | "request:approveHR" {
  return type === "resignation" || type === "profile_change" ? "request:approveHR" : "request:approve";
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const request = await getRequest(params.id);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updates = await req.json();
  const prevRequest = updates.status ? await getRequest(params.id) : null;

  // Xác thực quyền TRƯỚC khi ghi, dựa trên loại hành động + loại đơn (không chỉ dựa vào UI ẩn
  // nút — client có thể gọi PATCH trực tiếp).
  if (updates.status && prevRequest) {
    const isDecision = updates.status === "approved" || updates.status === "rejected";
    const requiredPerm = requiredApprovePermission(prevRequest.type);

    if (isDecision) {
      await ensurePermissionOverridesLoaded();
      const me = await getUser(u.userId);
      if (!me || !hasPermission(me.role, requiredPerm)) {
        return NextResponse.json({ error: "Bạn không có quyền duyệt loại đơn này" }, { status: 403 });
      }
    } else if (updates.status === "cancelled" && prevRequest.submittedBy !== u.userId) {
      await ensurePermissionOverridesLoaded();
      const me = await getUser(u.userId);
      if (!me || !hasPermission(me.role, requiredPerm)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  await updateRequest(params.id, updates);

  // Đơn "Nghỉ việc" vừa được phê duyệt → tự sinh Task bàn giao/thu hồi. Bọc try/catch: lỗi sinh
  // Task không được làm hỏng việc duyệt đơn (đã lưu thành công ở trên).
  if (updates.status === "approved" && prevRequest?.type === "resignation" && prevRequest.status !== "approved") {
    try {
      const employee = await getUser(prevRequest.submittedBy);
      if (employee) await ensureOffboardingTask(employee, u.userId);
    } catch (e) {
      console.error("[requests/[id]:PATCH] Lỗi khi tự sinh Task nghỉ việc:", e);
    }
  }

  // Đơn "Đề xuất thay đổi thông tin cá nhân" vừa được phê duyệt → áp dụng thay đổi vào hồ sơ
  // nhân viên. Lọc CHẶT theo PROFILE_EDITABLE_FIELDS — dù request.formData có chứa field lạ
  // (vd. bị chỉnh sửa thủ công để chèn "role") thì cũng bị bỏ qua, không bao giờ ghi vào User.
  if (updates.status === "approved" && prevRequest?.type === "profile_change" && prevRequest.status !== "approved") {
    try {
      const formData = prevRequest.formData ?? {};
      const applied: Record<string, string> = {};
      for (const field of PROFILE_EDITABLE_FIELDS) {
        if (typeof formData[field] === "string") applied[field] = formData[field] as string;
      }
      if (Object.keys(applied).length > 0) {
        await saveUser({ id: prevRequest.submittedBy, ...applied });
      }
    } catch (e) {
      console.error("[requests/[id]:PATCH] Lỗi khi áp dụng thay đổi hồ sơ:", e);
    }
  }

  // Truy vết quyết định duyệt/từ chối MỌI loại đơn từ (nghỉ phép, tăng ca... lẫn đơn nhân sự
  // nhạy cảm hơn như nghỉ việc/thay đổi thông tin — cùng 1 action, phân biệt qua entityLabel/after.type).
  if (
    prevRequest &&
    (updates.status === "approved" || updates.status === "rejected") &&
    prevRequest.status !== updates.status
  ) {
    const actor = await getUser(u.userId);
    await logAudit({
      actorId: u.userId, actorName: actor?.name, actorRole: actor?.role,
      action: updates.status === "approved" ? "request.approved" : "request.rejected",
      entityType: "WorkRequest", entityId: params.id, entityLabel: prevRequest.title,
      before: { status: prevRequest.status },
      after: { status: updates.status, type: prevRequest.type, submittedBy: prevRequest.submittedBy },
      note: updates.reviewComment,
    });
  }

  return NextResponse.json({ success: true });
}
