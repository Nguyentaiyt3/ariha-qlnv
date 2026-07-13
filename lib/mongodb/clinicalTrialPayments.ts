import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrials } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { sameUnit } from "@/lib/rbac/scope";
import type { ClinicalTrial, User } from "@/types";

export async function getTrialByPaymentId(paymentId: string): Promise<ClinicalTrial | null> {
  const trials = await getClinicalTrials();
  return trials.find((t) => t.payments?.some((p) => p.id === paymentId)) ?? null;
}

/**
 * Xác thực + phân quyền cho các route thao tác trên payment của thử nghiệm lâm sàng.
 * requireApprove=true: chỉ finance:approve/trial:manage (duyệt/từ chối/xác nhận quyết toán).
 * requireApprove=false: PI/điều phối/người tạo trial, teamLead cùng đơn vị, hoặc finance:approve/
 * trial:manage — dùng cho các hành động nộp/đề nghị do chính nhóm thực hiện trial thao tác.
 */
export async function authorizePaymentAction(
  req: NextRequest,
  trial: ClinicalTrial,
  opts: { requireApprove?: boolean } = {}
): Promise<{ ok: true; me: User } | { ok: false; response: NextResponse }> {
  const token = req.cookies.get("auth-token")?.value;
  const auth = token ? verifyToken(token) : null;
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  if (!me) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const canApprove = hasPermission(me.role, "finance:approve") || hasPermission(me.role, "trial:manage");

  if (opts.requireApprove) {
    if (!canApprove) {
      return { ok: false, response: NextResponse.json({ error: "Không có quyền duyệt tài chính" }, { status: 403 }) };
    }
    return { ok: true, me };
  }

  const isMember =
    trial.principalInvestigatorId === me.id ||
    trial.coordinatorId === me.id ||
    trial.createdBy === me.id;
  const isTeamLeadOwnUnit = me.role === "teamLead" && sameUnit(trial.department, me.department);

  if (isMember || canApprove || isTeamLeadOwnUnit) {
    return { ok: true, me };
  }
  return { ok: false, response: NextResponse.json({ error: "Không có quyền thực hiện hành động này" }, { status: 403 }) };
}
