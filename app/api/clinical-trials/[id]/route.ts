import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, updateClinicalTrial, deleteClinicalTrial, getDepartmentTeamLeads, createNotification } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { isFullAccessRole, isClinicalTrialViewManager, sameUnit } from "@/lib/rbac/scope";
import { applyTrialStatusChange } from "@/lib/mongodb/clinicalTrialTask";
import type { ClinicalTrial, User, RecordChangeRequest } from "@/types";

async function notifyChangeRequestReviewers(trial: ClinicalTrial, req: RecordChangeRequest) {
  const leads = await getDepartmentTeamLeads(trial.department);
  const title = req.type === "edit" ? "Yêu cầu sửa thử nghiệm lâm sàng chờ duyệt" : "Yêu cầu xoá thử nghiệm lâm sàng chờ duyệt";
  const body = `${req.requestedBy} đề nghị ${req.type === "edit" ? "sửa" : "xoá"} thử nghiệm "${trial.code || trial.title}"`;
  for (const lead of leads) {
    await createNotification({
      userId: lead.id, type: "approval_request", title, body,
      link: `/clinical-trials/${trial.id}`, read: false, priority: "normal",
      actionRequired: true, createdAt: new Date().toISOString(),
    });
  }
}

/** director/hrAdmin: không giới hạn. teamLead: PI/điều phối/người tạo, hoặc cùng đơn vị. Vai trò khác: chỉ khi là thành viên. */
function canAccessTrial(me: User | null, userId: string, trial: ClinicalTrial): boolean {
  const isMember =
    trial.principalInvestigatorId === userId ||
    trial.coordinatorId === userId ||
    trial.createdBy === userId;
  if (isMember) return true;
  if (me && isFullAccessRole(me.role)) return true;
  if (me && me.role === "teamLead") return sameUnit(trial.department, me.department);
  return false;
}

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trial = await getClinicalTrial(params.id);
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(u.userId);
  if (!canAccessTrial(me, u.userId, trial)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ trial });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(u.userId);
  const isManager = !!me && hasPermission(me.role, "trial:manage");
  const isDesignatedViewManager = isClinicalTrialViewManager(me);
  if (!me || (!isManager && !isDesignatedViewManager)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const existingTrial = await getClinicalTrial(params.id);
  if (!existingTrial) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates = await req.json();

  // Người chỉ có chỉ định "Quản lý NCLS" (không có quyền trial:manage theo role) — sửa nội dung
  // phải qua duyệt của trưởng nhóm cùng đơn vị, không áp dụng ngay.
  if (!isManager && isDesignatedViewManager) {
    if (existingTrial.pendingChangeRequest?.status === "pending") {
      return NextResponse.json({ error: "Thử nghiệm đang có 1 yêu cầu sửa/xoá chờ duyệt" }, { status: 409 });
    }
    const pendingChangeRequest: RecordChangeRequest = {
      type: "edit",
      requestedAt: new Date().toISOString(),
      requestedBy: me.name,
      requestedByUserId: me.id,
      proposedChanges: updates,
      status: "pending",
    };
    await updateClinicalTrial(params.id, { pendingChangeRequest });
    await notifyChangeRequestReviewers(existingTrial, pendingChangeRequest);
    return NextResponse.json({ success: true, pending: true });
  }

  if (!canAccessTrial(me, u.userId, existingTrial)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prevStatus = existingTrial.status;

  await updateClinicalTrial(params.id, updates);

  // Bọc try/catch: lỗi đồng bộ Task tổng theo dõi/3 Task pha không được làm hỏng việc đổi
  // trạng thái trial (đã lưu thành công ở trên).
  if (updates.status) {
    try {
      await applyTrialStatusChange(params.id, updates.status, prevStatus, u.userId);
    } catch (e) {
      console.error("[clinical-trials/[id]:PATCH] Lỗi khi đồng bộ trạng thái sang Task:", e);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensurePermissionOverridesLoaded();
  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (hasPermission(me.role, "trial:manage")) {
    const existingTrial = await getClinicalTrial(params.id);
    if (!existingTrial) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessTrial(me, u.userId, existingTrial)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await deleteClinicalTrial(params.id);
    return NextResponse.json({ success: true });
  }

  // Người chỉ có chỉ định "Quản lý NCLS" có thể đề nghị xoá, nhưng phải nêu lý do và chờ
  // trưởng nhóm cùng đơn vị duyệt — không xoá ngay.
  if (isClinicalTrialViewManager(me)) {
    const existingTrial = await getClinicalTrial(params.id);
    if (!existingTrial) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existingTrial.pendingChangeRequest?.status === "pending") {
      return NextResponse.json({ error: "Thử nghiệm đang có 1 yêu cầu sửa/xoá chờ duyệt" }, { status: 409 });
    }
    const body = await req.json().catch(() => ({}) as { reason?: string });
    const reason = (body?.reason || "").trim();
    if (!reason) {
      return NextResponse.json({ error: "Cần nhập lý do xoá" }, { status: 400 });
    }
    const pendingChangeRequest: RecordChangeRequest = {
      type: "delete",
      requestedAt: new Date().toISOString(),
      requestedBy: me.name,
      requestedByUserId: me.id,
      reason,
      status: "pending",
    };
    await updateClinicalTrial(params.id, { pendingChangeRequest });
    await notifyChangeRequestReviewers(existingTrial, pendingChangeRequest);
    return NextResponse.json({ success: true, pending: true });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
