import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { updateReimbursementRequest, getTask } from "@/lib/mongodb/firestore";
import { ReimbursementRequestModel } from "@/lib/mongodb/models";
import { logAudit } from "@/lib/mongodb/auditLog";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

const AUDIT_ACTION: Record<string, string> = {
  approve: "finance.reimbursement_approved",
  reject: "finance.reimbursement_rejected",
};

const DECISION_ACTIONS = new Set(["approve", "markPaid", "reject"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const now = new Date().toISOString();

  const actions: Record<string, Record<string, unknown>> = {
    approve: { status: "APPROVED", approvedBy: body.approvedBy ?? user.userId, approvedByName: body.approvedByName, approvedAt: now },
    markPaid: { status: "PAID", paidAt: now },
    reject: { status: "REJECTED", rejectedReason: body.reason },
    submit: { status: "SUBMITTED", submittedAt: now },
  };

  const update = actions[body.action];
  if (!update) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const before = await ReimbursementRequestModel.findById(params.id).lean() as any;
  if (!before) return NextResponse.json({ error: "Không tìm thấy đơn hoàn ứng" }, { status: 404 });

  // "submit" là hành động của chính người nộp đơn — chỉ chủ đơn mới được gửi, tránh ai đó
  // đã đăng nhập gửi hộ/gửi sớm đơn hoàn ứng còn đang nháp của người khác.
  if (body.action === "submit" && before.requestedBy !== user.userId) {
    return NextResponse.json({ error: "Bạn không có quyền gửi đơn hoàn ứng này" }, { status: 403 });
  }

  // Duyệt/từ chối/đánh dấu đã chi hoàn ứng — quyền finance:approve; trưởng nhóm chỉ được xử lý
  // hoàn ứng của nhiệm vụ thuộc đơn vị mình (director/hrAdmin không giới hạn).
  if (DECISION_ACTIONS.has(body.action)) {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(user.userId);
    if (!me || !hasPermission(me.role, "finance:approve")) {
      return NextResponse.json({ error: "Bạn không có quyền duyệt hoàn ứng" }, { status: 403 });
    }
    if (me.role === "teamLead") {
      const task = before?.taskId ? await getTask(before.taskId) : null;
      if (!task || !sameUnit(task.department, me.department)) {
        return NextResponse.json({ error: "Bạn chỉ được duyệt hoàn ứng của nhiệm vụ thuộc đơn vị mình" }, { status: 403 });
      }
    }
  }

  await updateReimbursementRequest(params.id, update as any);

  const auditAction = AUDIT_ACTION[body.action];
  if (auditAction) {
    const actor = await getUser(user.userId);
    await logAudit({
      actorId: user.userId, actorName: actor?.name, actorRole: actor?.role,
      action: auditAction, entityType: "ReimbursementRequest", entityId: params.id,
      entityLabel: before ? `${before.requestedByName || ""} — ${before.amount ?? ""}đ`.trim() : undefined,
      before: { status: before?.status }, after: { status: update.status },
      note: body.reason,
    });
  }

  return NextResponse.json({ success: true });
}
