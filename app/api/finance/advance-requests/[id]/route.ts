import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { updateAdvanceRequest, submitAdvanceSettlement, createFinancialTransaction, recomputeFinancialSummary, getTask } from "@/lib/mongodb/firestore";
import { AdvanceRequestModel } from "@/lib/mongodb/models";
import { logAudit } from "@/lib/mongodb/auditLog";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { sameUnit } from "@/lib/rbac/scope";
import { parseBody } from "@/lib/validation";

const bankAccountSchema = z.object({
  bankId: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
});

const patchSchema = z.object({
  action: z.enum(["submitSettlement", "approve", "reject", "approveSettlement", "rejectSettlement"]),
  amountUsed: z.number().nonnegative().optional(),
  proofs: z.array(z.unknown()).optional(),
  notes: z.string().optional(),
  bankAccount: bankAccountSchema.optional(),
  reason: z.string().optional(),
});

const AUDIT_ACTION: Record<string, string> = {
  approve: "finance.advance_approved",
  reject: "finance.advance_rejected",
  approveSettlement: "finance.advance_settlement_approved",
  rejectSettlement: "finance.advance_settlement_rejected",
};

const DECISION_ACTIONS = new Set(["approve", "reject", "approveSettlement", "rejectSettlement"]);

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, patchSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const now = new Date().toISOString();

  if (body.action === "submitSettlement") {
    try {
      const target = await AdvanceRequestModel.findById(params.id).lean() as any;
      if (!target) return NextResponse.json({ error: "Không tìm thấy đơn tạm ứng" }, { status: 404 });
      // Chỉ chính người đã nộp đơn tạm ứng mới được gửi quyết toán cho đơn đó — nếu không, ai đó
      // đã đăng nhập có thể ghi đè quyết toán (kể cả số tài khoản nhận hoàn ứng) của người khác.
      if (target.requestedBy !== user.userId) {
        return NextResponse.json({ error: "Bạn không có quyền gửi quyết toán cho đơn tạm ứng này" }, { status: 403 });
      }
      if (typeof body.amountUsed !== "number") {
        return NextResponse.json({ error: "Thiếu amountUsed" }, { status: 400 });
      }
      await submitAdvanceSettlement(params.id, {
        amountUsed: body.amountUsed,
        proofs: body.proofs,
        notes: body.notes,
        bankAccount: body.bankAccount,
      });
      if (target?.taskId) await recomputeFinancialSummary(target.taskId);
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  // Danh tính người duyệt luôn lấy từ phiên đăng nhập, không tin theo body — tránh giả mạo
  // approvedBy/approvedByName trong nhật ký kiểm toán.
  const approverIdentity = await getUser(user.userId);

  const actions: Record<string, Record<string, unknown>> = {
    approve: {
      status: "APPROVED",
      approvedBy: user.userId,
      approvedByName: approverIdentity?.name,
      approvedAt: now,
    },
    reject: { status: "REJECTED", rejectedReason: body.reason },
    approveSettlement: {
      status: "SETTLED",
      settlementApprovedBy: user.userId,
      settlementApprovedByName: approverIdentity?.name,
      settledAt: now,
    },
    rejectSettlement: { status: "APPROVED", settlementRejectedReason: body.reason },
  };

  const update = actions[body.action];
  if (!update) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const before = await AdvanceRequestModel.findById(params.id).lean() as any;

  // Duyệt/từ chối tạm ứng — quyền finance:approve; trưởng nhóm chỉ được duyệt tạm ứng của
  // nhiệm vụ thuộc đơn vị mình (director/hrAdmin không giới hạn).
  if (DECISION_ACTIONS.has(body.action)) {
    await ensurePermissionOverridesLoaded();
    const me = approverIdentity;
    if (!me || !hasPermission(me.role, "finance:approve")) {
      return NextResponse.json({ error: "Bạn không có quyền duyệt tạm ứng" }, { status: 403 });
    }
    if (me.role === "teamLead") {
      const task = before?.taskId ? await getTask(before.taskId) : null;
      if (!task || !sameUnit(task.department, me.department)) {
        return NextResponse.json({ error: "Bạn chỉ được duyệt tạm ứng của nhiệm vụ thuộc đơn vị mình" }, { status: 403 });
      }
    }
  }

  const mode: string = before?.mode ?? "ADVANCE";

  // Duyệt thanh toán tạm ứng (mode=ADVANCE): tính & lưu chênh lệch giữa số tiền đã tạm ứng và số tiền
  // thực chi — nếu không lưu lại, thông tin "trả lại công ty / công ty chi thêm" sẽ mất ngay sau khi duyệt.
  let settlementDifference: number | undefined;
  let settlementType: "RETURN_TO_COMPANY" | "PAY_EMPLOYEE_ADDITIONAL" | "BALANCED" | undefined;
  if (body.action === "approveSettlement" && mode === "ADVANCE") {
    const amountUsed = before.settlementAmountUsed ?? before.amount;
    settlementDifference = before.amount - amountUsed;
    settlementType = settlementDifference > 0 ? "RETURN_TO_COMPANY" : settlementDifference < 0 ? "PAY_EMPLOYEE_ADDITIONAL" : "BALANCED";
    Object.assign(update, { settlementDifference, settlementType });
  }

  await updateAdvanceRequest(params.id, update as any);

  // Ghi nhận dòng tiền THỰC của công ty vào sổ quỹ — đúng thời điểm tiền thực sự di chuyển,
  // không phải lúc tạo/nộp đơn:
  //  - ADVANCE:   công ty chi tiền ngay khi duyệt đơn (approve).
  //  - SELF_PAID: công ty không chi gì lúc duyệt đơn — chỉ chi khi duyệt quyết toán (hoàn ứng cho NV).
  if (body.action === "approve" && mode === "ADVANCE") {
    await createFinancialTransaction({
      taskId: before.taskId, stepId: before.stepId,
      createdBy: before.requestedBy, createdByName: before.requestedByName,
      amount: before.amount, direction: "DEBIT", fundSource: "ADVANCE",
      category: "Tạm ứng", description: before.purpose ?? "Chi tạm ứng",
      proofs: [], advanceRequestId: params.id, status: "VALID", isDisbursement: true,
      createdAt: now, updatedAt: now,
    });
  }
  if (body.action === "approveSettlement" && mode === "SELF_PAID") {
    await createFinancialTransaction({
      taskId: before.taskId, stepId: before.stepId,
      createdBy: before.requestedBy, createdByName: before.requestedByName,
      amount: before.settlementAmountUsed ?? before.amount, direction: "DEBIT", fundSource: "OUT_OF_POCKET",
      category: "Hoàn ứng", description: before.settlementNotes || before.purpose || "Hoàn ứng tự chi",
      isDisbursement: true,
      proofs: before.settlementProofs ?? [], advanceRequestId: params.id, status: "VALID",
      createdAt: now, updatedAt: now,
    });
  }
  // Ghi nhận chênh lệch quyết toán tạm ứng vào sổ quỹ — khoản tạm ứng ban đầu đã được ghi "chi" trọn vẹn
  // lúc duyệt (approve), giờ chỉ cần điều chỉnh đúng phần chênh lệch.
  if (settlementType === "RETURN_TO_COMPANY" && settlementDifference) {
    await createFinancialTransaction({
      taskId: before.taskId, stepId: before.stepId,
      createdBy: before.requestedBy, createdByName: before.requestedByName,
      amount: settlementDifference, direction: "CREDIT", fundSource: "REVENUE",
      category: "Hoàn trả tạm ứng", description: `Hoàn trả tạm ứng dư — ${before.purpose ?? ""}`.trim(),
      proofs: [], advanceRequestId: params.id, status: "VALID",
      createdAt: now, updatedAt: now,
    });
  } else if (settlementType === "PAY_EMPLOYEE_ADDITIONAL" && settlementDifference) {
    await createFinancialTransaction({
      taskId: before.taskId, stepId: before.stepId,
      createdBy: before.requestedBy, createdByName: before.requestedByName,
      amount: Math.abs(settlementDifference), direction: "DEBIT", fundSource: "ADVANCE",
      category: "Tạm ứng", description: `Chi bổ sung tạm ứng (chênh lệch quyết toán) — ${before.purpose ?? ""}`.trim(),
      proofs: [], advanceRequestId: params.id, status: "VALID", isDisbursement: true,
      createdAt: now, updatedAt: now,
    });
  }

  const auditAction = AUDIT_ACTION[body.action];
  if (auditAction) {
    const actor = await getUser(user.userId);
    await logAudit({
      actorId: user.userId, actorName: actor?.name, actorRole: actor?.role,
      action: auditAction, entityType: "AdvanceRequest", entityId: params.id,
      entityLabel: before ? `${before.requestedByName || ""} — ${before.amount ?? ""}đ`.trim() : undefined,
      before: { status: before?.status }, after: { status: update.status },
      note: body.reason,
    });
  }

  // Mọi hành động ở trên đều có thể làm thay đổi số liệu tài chính của nhiệm vụ (giải ngân, hoàn ứng,
  // chênh lệch quyết toán) — tính lại ngay để Dashboard/trang Tài chính không hiển thị số liệu cũ.
  if (before?.taskId) await recomputeFinancialSummary(before.taskId);

  return NextResponse.json({ success: true });
}
