import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, getTask } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { ensureTrialExecutionTask } from "@/lib/mongodb/clinicalTrialTask";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

/**
 * POST /api/clinical-trials/[id]/generate-task
 * Sinh Task theo dõi cho 1 thử nghiệm lâm sàng (hub: tiến độ/tài chính/hiệu suất).
 * Idempotent: nếu đã có executionTaskId hợp lệ thì trả về task đó.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(u.userId);
  const trial = await getClinicalTrial(params.id);
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isManager = !!me && hasPermission(me.role, "trial:manage");
  const isParticipant =
    trial.principalInvestigatorId === u.userId || trial.coordinatorId === u.userId;
  if (!isManager && !isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const workflowId: string | undefined = body?.workflowId || undefined;

  try {
    const alreadyExists = !!(trial.executionTaskId && (await getTask(trial.executionTaskId)));
    const taskId = await ensureTrialExecutionTask(trial, u.userId, workflowId);
    return NextResponse.json({ taskId, created: !alreadyExists });
  } catch (e) {
    console.error("[generate-task] Lỗi khi tạo nhiệm vụ theo dõi:", e);
    return NextResponse.json({ error: "Lỗi khi tạo nhiệm vụ theo dõi" }, { status: 500 });
  }
}
