import {
  getTask, createTask, updateTask, getClinicalTrial, getClinicalTrialByExecutionTaskId, updateClinicalTrial,
  getUnitPlans, getWorkflows, saveWorkflow,
} from "@/lib/mongodb/firestore";
import { getUser } from "@/lib/mongodb/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { logAudit } from "@/lib/mongodb/auditLog";
import { calcPhaseDeadlines, DEFAULT_MILESTONE_CONFIG } from "@/lib/deadline-calc";
import { parseTrialPeriod } from "@/lib/utils/clinicalTrialPeriod";
import { nodesToTaskSteps, linearStepsToTaskSteps } from "@/lib/workflow-engine";
import { generateId } from "@/lib/utils";
import { CLINICAL_TRIAL_PIPELINE, CLINICAL_TRIAL_TERMINAL_BRANCHES } from "@/types";
import type {
  ClinicalTrial, ClinicalTrialStatus, Task, TaskStatus, TaskStep, Stakeholder, Workflow,
  WorkflowNode, WorkflowEdge,
} from "@/types";

/** Ánh xạ 12+2 trạng thái trial → 5 trạng thái thô của Task (Chuẩn bị + Đang chạy đều "in_progress"). */
export function mapTrialStatusToTaskStatus(status: ClinicalTrialStatus): TaskStatus {
  if (status === "completed") return "done";
  if ((CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(status)) return "cancelled";
  return "in_progress";
}

/** id Workflow mẫu mặc định "Thử nghiệm lâm sàng" — tự sinh 1 lần trong module Quy trình nếu chưa có. */
export const CLINICAL_TRIAL_WORKFLOW_ID = "wf-clinical-trial";

/** node nào có PI là người hỗ trợ GỢI Ý (giữ đúng nội dung 9-node đã chốt trước đây). */
const PI_HELPER_NODE_IDS = new Set(["ethics_prep", "ethics_meeting", "lec", "enrollment", "closeout"]);

/** node hoàn thành → trạng thái trial kế tiếp (chỉ áp dụng khi Task dùng đúng mẫu mặc định). */
const NODE_ID_TO_NEXT_TRIAL_STATUS: Partial<Record<string, ClinicalTrialStatus>> = {
  feasibility: "awaiting_sponsor",
  sponsor: "preparing_ethics",
  ethics_prep: "national_ethics_met",
  ethics_meeting: "lec_approved",
  lec: "awaiting_moh",
  moh: "pre_deployment",
  pre_deploy: "running_pre_enroll",
  enrollment: "running_enrolled",
  closeout: "completed",
};

function buildDefaultClinicalTrialWorkflow(actorUserId: string, actorName: string): Workflow {
  const defs: { id: string; name: string; output: string }[] = [
    { id: "feasibility", name: "Khảo sát tính khả thi", output: "Báo cáo khảo sát tính khả thi" },
    { id: "sponsor", name: "Chờ chấp thuận tài trợ", output: "Hợp đồng tài trợ đã ký" },
    { id: "ethics_prep", name: "Chuẩn bị hồ sơ HĐĐĐ Quốc gia", output: "Bộ hồ sơ hoàn chỉnh đã nộp" },
    { id: "ethics_meeting", name: "Họp HĐĐĐ Quốc gia", output: "Biên bản họp + ý kiến hội đồng" },
    { id: "lec", name: "Thông qua LEC (Hội đồng ĐĐ cơ sở)", output: "Quyết định phê duyệt của LEC" },
    { id: "moh", name: "Chờ chấp thuận Bộ Y tế", output: "Công văn chấp thuận Bộ Y tế" },
    { id: "pre_deploy", name: "Chuẩn bị triển khai", output: "Số QĐ triển khai + site sẵn sàng thu tuyển" },
    { id: "enrollment", name: "Thu tuyển bệnh nhân", output: "Số liệu tuyển + báo cáo AE/SAE định kỳ" },
    { id: "closeout", name: "Kết thúc & Quyết toán", output: "Biên bản bàn giao đã ký + báo cáo tổng kết" },
  ];

  const nodes: WorkflowNode[] = defs.map((d, i) => ({
    id: d.id,
    name: d.name,
    status: "todo",
    position: { x: i * 220, y: 120 },
    output: d.output,
  }));
  const edges: WorkflowEdge[] = defs.slice(1).map((d, i) => ({
    id: `e-${defs[i].id}-${d.id}`,
    source: defs[i].id,
    target: d.id,
    required: true,
  }));

  const now = new Date().toISOString();
  return {
    id: CLINICAL_TRIAL_WORKFLOW_ID,
    name: "Thử nghiệm lâm sàng",
    description: "Quy trình mẫu theo dõi thử nghiệm lâm sàng, từ khảo sát tính khả thi đến kết thúc & quyết toán.",
    steps: [],
    nodes,
    edges,
    status: "published",
    createdBy: actorUserId,
    createdByName: actorName,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Lấy Workflow dùng để sinh Task theo dõi TNLS. Nếu chỉ định `workflowId` (chọn tay trong module
 * Quy trình), dùng đúng workflow đó; nếu không, dùng mẫu mặc định — tự sinh 1 lần nếu chưa có.
 */
async function resolveTrialWorkflow(
  workflowId: string | undefined,
  actorUserId: string,
  actorName: string
): Promise<Workflow> {
  const all = await getWorkflows(true);
  if (workflowId) {
    const picked = all.find((w) => w.id === workflowId);
    if (picked) return picked;
  }
  const existing = all.find((w) => w.id === CLINICAL_TRIAL_WORKFLOW_ID);
  if (existing) return existing;
  const template = buildDefaultClinicalTrialWorkflow(actorUserId, actorName);
  await saveWorkflow(template);
  return template;
}

/**
 * Lấy Task theo dõi của 1 trial, tự sinh nếu chưa có (idempotent).
 * Dùng chung cho nút "Tạo nhiệm vụ theo dõi" và các luồng cần gắn dữ liệu tài chính vào Task thật
 * (vd. duyệt bàn giao thanh toán) — tránh gán taskId giả (trial.id) vào FinancialTransaction.
 *
 * `workflowId`: cho phép chọn tay 1 quy trình mẫu khác trong module Quy trình (mặc định dùng
 * mẫu "Thử nghiệm lâm sàng", tự sinh 1 lần nếu chưa có).
 */
export async function ensureTrialExecutionTask(
  trial: ClinicalTrial,
  actorUserId: string,
  workflowId?: string,
  assigneeId?: string,
  supervisorId?: string,
  planId?: string
): Promise<string> {
  if (trial.executionTaskId) {
    const existing = await getTask(trial.executionTaskId);
    if (existing) return existing.id;
  }

  const endDate = parseTrialPeriod(trial.endPeriod);
  const base = (endDate || new Date(new Date().getFullYear() + 1, 11, 31)).toISOString();
  const phases = calcPhaseDeadlines(base, DEFAULT_MILESTONE_CONFIG);

  // Người thực hiện chính dự kiến = người được chỉ định theo dõi (assigneeId, dùng cho phân công
  // hàng loạt từ danh sách bảng), mặc định là người đang thao tác nếu không chỉ định.
  const mainPerformerId = assigneeId || actorUserId;
  const stakeholders: Stakeholder[] = [{ userId: mainPerformerId, role: "assignee" }];
  if (trial.principalInvestigatorId && trial.principalInvestigatorId !== mainPerformerId) {
    stakeholders.push({ userId: trial.principalInvestigatorId, role: "collaborator" });
  }
  if (supervisorId && supervisorId !== mainPerformerId && supervisorId !== trial.principalInvestigatorId) {
    stakeholders.push({ userId: supervisorId, role: "supervisor" });
  }

  await ensurePermissionOverridesLoaded();
  const actorUser = await getUser(actorUserId);
  const canAutoApprove = !!actorUser && hasPermission(actorUser.role, "task:approve");

  const workflow = await resolveTrialWorkflow(workflowId, actorUserId, actorUser?.name || "");
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];
  const assigneeByNode = Object.fromEntries(nodes.map((n) => [n.id, mainPerformerId]));
  const steps = nodes.length > 0
    ? nodesToTaskSteps(nodes, edges, { assigneeByNode, defaultKpiUnit: "bước" })
    : linearStepsToTaskSteps(workflow.steps, { defaultKpiUnit: "bước" });
  for (const step of steps) {
    if (!step.assigneeId) step.assigneeId = mainPerformerId;
  }

  // PI chỉ là người hỗ trợ GỢI Ý ở các bước liên quan hồ sơ đạo đức/thu tuyển/kết thúc — giữ đúng
  // hành vi cũ của mẫu mặc định (không áp dụng khi người dùng tự chọn quy trình khác).
  if (workflow.id === CLINICAL_TRIAL_WORKFLOW_ID && trial.principalInvestigatorId && trial.principalInvestigatorId !== mainPerformerId) {
    for (const step of steps) {
      if (PI_HELPER_NODE_IDS.has(step.id)) step.helpers = [trial.principalInvestigatorId];
    }
  }

  const now = new Date().toISOString();
  const taskId = generateId("t");
  const namePrefix = trial.abbreviation ? `${trial.abbreviation} (${trial.code})` : trial.code;
  const newTask: Omit<Task, "id"> & { id: string } = {
    id: taskId,
    name: `[TNLS] ${namePrefix} - ${trial.title}`,
    description: `Nhiệm vụ theo dõi thử nghiệm lâm sàng ${trial.code}.`,
    status: mapTrialStatusToTaskStatus(trial.status),
    phase: "execute",
    priority: "medium",
    deadlineBase: base,
    deadlinePrepare: phases.prepare,
    deadlineExecute: phases.execute,
    deadlineFinalize: phases.finalize,
    creatorId: actorUserId,
    mainPerformerId,
    stakeholders,
    dependencies: [],
    workflowId: workflow.id,
    workflowName: workflow.name,
    steps,
    subtasks: [],
    kpi: { type: "custom", target: 1, current: 0, unit: "nghiên cứu" },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: canAutoApprove,
    ...(canAutoApprove ? { approvedBy: actorUserId, approvedAt: now } : {}),
    department: trial.department,
    tags: ["TNLS"],
    planId: planId || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await createTask(newTask);
  await updateClinicalTrial(trial.id, { executionTaskId: taskId });
  return taskId;
}

// ─── 3 Task pha riêng — tự sinh/tự đóng để cộng dồn vào Kế hoạch đúng kỳ ───

export type TrialPhaseKey = "feasibility" | "execution" | "closeout";

const PHASE_TASK_NAME: Record<TrialPhaseKey, string> = {
  feasibility: "Khảo sát tính khả thi",
  execution: "Đang triển khai",
  closeout: "Kết thúc & Quyết toán",
};

/** Tìm Kế hoạch đơn vị đang hoạt động khớp department + năm hiện tại (để tự gắn planId khi hoàn thành mốc). */
async function findActivePlanId(department: string | undefined, year: number): Promise<string | undefined> {
  if (!department) return undefined;
  const plans = await getUnitPlans();
  return plans.find((p) => p.department === department && p.year === year)?.id;
}

/**
 * Sinh 1 trong 3 Task pha (idempotent) nếu chưa có. Task này CHỈ dùng để ghi nhận cộng dồn
 * vào Kế hoạch đúng kỳ hoàn thành — không dùng cho hiển thị chi tiết (xem Task tổng executionTaskId).
 */
export async function ensurePhaseTask(
  trial: ClinicalTrial,
  phase: TrialPhaseKey,
  actorUserId: string
): Promise<string> {
  const existingId = trial.phaseTaskIds?.[phase];
  if (existingId) {
    const existing = await getTask(existingId);
    if (existing) return existing.id;
  }

  const mainPerformerId = trial.coordinatorId || trial.principalInvestigatorId || actorUserId;
  const taskId = generateId("t");
  const now = new Date().toISOString();

  const newTask: Omit<Task, "id"> & { id: string } = {
    id: taskId,
    name: `[TNLS] ${PHASE_TASK_NAME[phase]} — ${trial.abbreviation || trial.code}`,
    description: `Mốc "${PHASE_TASK_NAME[phase]}" của thử nghiệm lâm sàng ${trial.code}. Tự động sinh/đóng theo trạng thái nghiên cứu — dùng để cộng dồn vào Kế hoạch đơn vị đúng kỳ hoàn thành.`,
    status: "in_progress",
    phase: "execute",
    priority: "medium",
    deadlineBase: now,
    deadlinePrepare: now,
    deadlineExecute: now,
    deadlineFinalize: now,
    creatorId: actorUserId,
    mainPerformerId,
    stakeholders: [{ userId: mainPerformerId, role: "assignee" }],
    dependencies: [],
    workflowName: "Thử nghiệm lâm sàng",
    steps: [],
    subtasks: [],
    kpi: { type: "custom", target: 1, current: 0, unit: "mốc" },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: true,
    approvedBy: actorUserId,
    approvedAt: now,
    department: trial.department,
    tags: ["TNLS", "TNLS-moc"],
    createdAt: now,
    updatedAt: now,
  };

  await createTask(newTask);
  const phaseTaskIds = { ...(trial.phaseTaskIds || {}), [phase]: taskId };
  await updateClinicalTrial(trial.id, { phaseTaskIds });

  // Mốc "Kết thúc & Quyết toán" mà trial không có khoản thanh toán nào cần bàn giao → đóng ngay, không chờ gì thêm
  if (phase === "closeout" && !(trial.payments && trial.payments.length > 0)) {
    await completePhaseTask({ ...trial, phaseTaskIds }, "closeout", actorUserId);
  }

  return taskId;
}

/**
 * Đánh dấu 1 Task pha đã hoàn thành + tự duyệt (completionProposal approved) + tự gắn vào
 * Kế hoạch đơn vị đúng kỳ (năm hiện tại) nếu tìm thấy — để cộng dồn vào chỉ tiêu ngay lập tức,
 * không cần thao tác thủ công nào thêm.
 */
export async function completePhaseTask(
  trial: ClinicalTrial,
  phase: TrialPhaseKey,
  actorUserId: string
): Promise<void> {
  const taskId = trial.phaseTaskIds?.[phase];
  if (!taskId) return;

  const task = await getTask(taskId);
  if (!task || task.status === "done") return;

  const now = new Date().toISOString();
  const planId = await findActivePlanId(trial.department, new Date().getFullYear());

  await updateTask(taskId, {
    status: "done",
    progress: 100,
    completedAt: now,
    ...(planId ? { planId } : {}),
    completionProposal: {
      submittedBy: actorUserId,
      submittedAt: now,
      summary: `Tự động hoàn thành khi thử nghiệm lâm sàng đạt mốc "${PHASE_TASK_NAME[phase]}".`,
      status: "approved",
      reviewedBy: actorUserId,
      reviewedAt: now,
      score3T: { t1: 10, t2: 10, t3: 10, total: 10, grade: "hoanThanh", computedAt: now },
    },
  });
}

// ─── Đồng bộ 2 chiều Task ↔ ClinicalTrial ──────────────────────

/**
 * Áp dụng các side-effect khi trạng thái trial thay đổi: đồng bộ sang Task tổng theo dõi
 * (executionTaskId) + cascade đóng/mở 3 Task pha. Trạng thái trial (và statusHistory, nếu có)
 * PHẢI được ghi vào DB trước khi gọi hàm này — dùng chung cho cả 2 chiều đồng bộ:
 * (a) đổi trạng thái thủ công tại trang chi tiết trial (PATCH /api/clinical-trials/[id]),
 * (b) hoàn thành bước trong Task tổng theo dõi (PATCH /api/tasks/[id], xem hàm bên dưới).
 */
export async function applyTrialStatusChange(
  trialId: string,
  newStatus: ClinicalTrialStatus,
  prevStatus: ClinicalTrialStatus | undefined,
  actorUserId: string
): Promise<void> {
  let trial = await getClinicalTrial(trialId);
  if (!trial) return;

  if (prevStatus !== newStatus) {
    const actor = await getUser(actorUserId);
    await logAudit({
      actorId: actorUserId,
      actorName: actor?.name,
      actorRole: actor?.role,
      action: "trial.status_changed",
      entityType: "ClinicalTrial",
      entityId: trialId,
      entityLabel: trial.abbreviation || trial.code,
      before: { status: prevStatus },
      after: { status: newStatus },
    });
  }

  if (trial.executionTaskId) {
    await updateTask(trial.executionTaskId, {
      status: mapTrialStatusToTaskStatus(newStatus),
      ...(newStatus === "completed" ? { completedAt: new Date().toISOString() } : {}),
    });
  }

  const isTerminalOrCompleted =
    newStatus === "completed" || (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(newStatus);
  const wasTerminalOrCompleted =
    prevStatus === "completed" || (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(prevStatus || "");

  // Rời "Khảo sát tính khả thi" → đóng pha ①, mở pha ②
  if (prevStatus === "feasibility" && newStatus !== "feasibility") {
    await completePhaseTask(trial, "feasibility", actorUserId);
    await ensurePhaseTask(trial, "execution", actorUserId);
    // Refetch để có phaseTaskIds mới nhất trước khi xét bước tiếp theo (tránh dùng dữ liệu cũ
    // nếu trial nhảy thẳng từ "feasibility" sang "completed"/dừng sớm trong cùng 1 lần cập nhật)
    trial = await getClinicalTrial(trialId);
  }

  // Vừa đạt "Đã kết thúc" hoặc 1 trong 2 nhánh dừng sớm → đóng pha ②, mở pha ③
  if (trial && isTerminalOrCompleted && !wasTerminalOrCompleted) {
    await completePhaseTask(trial, "execution", actorUserId);
    await ensurePhaseTask(trial, "closeout", actorUserId);
  }
}

/**
 * Chiều đồng bộ ngược: khi 1 bước của Task tổng theo dõi được đánh dấu hoàn thành, tự động
 * đẩy trạng thái ClinicalTrial tương ứng tiến lên (chỉ áp dụng cho Task sinh từ mẫu mặc định
 * `CLINICAL_TRIAL_WORKFLOW_ID` — id bước khớp đúng thứ tự pipeline trial). Nếu người dùng chọn
 * quy trình khác bằng tay, bước hoàn thành không khớp id nào trong pipeline → bỏ qua an toàn.
 */
export async function syncTrialStatusFromCompletedSteps(
  taskId: string,
  prevSteps: TaskStep[] | undefined,
  newSteps: TaskStep[] | undefined,
  actorUserId: string
): Promise<void> {
  if (!newSteps || newSteps.length === 0) return;

  // Tính trước (thuần trong bộ nhớ, không cần DB) — phần lớn lượt lưu tiến độ (0%→25%→50%...)
  // không hoàn thành bước nào cả, nên thoát sớm ở đây tránh phải tra cứu ClinicalTrial mỗi lần
  // lưu tiến độ (trước đây luôn quét toàn bộ bảng trial dù task không liên quan gì đến trial).
  const prevCompletedIds = new Set((prevSteps ?? []).filter((s) => s.status === "completed").map((s) => s.id));
  const newlyCompleted = newSteps.filter((s) => s.status === "completed" && !prevCompletedIds.has(s.id));
  if (newlyCompleted.length === 0) return;

  const trial = await getClinicalTrialByExecutionTaskId(taskId);
  if (!trial) return;

  // Nếu nhiều bước hoàn thành cùng lúc (hoặc không theo thứ tự), nhảy tới trạng thái xa nhất
  // trong pipeline — tránh lùi trạng thái nếu người dùng tick bỏ bước ở giữa.
  const currentIdx = CLINICAL_TRIAL_PIPELINE.indexOf(trial.status);
  let targetStatus: ClinicalTrialStatus | undefined;
  let targetIdx = currentIdx;
  for (const step of newlyCompleted) {
    const candidate = NODE_ID_TO_NEXT_TRIAL_STATUS[step.id];
    if (!candidate) continue;
    const idx = CLINICAL_TRIAL_PIPELINE.indexOf(candidate);
    if (idx > targetIdx) {
      targetIdx = idx;
      targetStatus = candidate;
    }
  }
  if (!targetStatus) return;

  const prevStatus = trial.status;
  const actor = await getUser(actorUserId);
  const statusHistory = [
    ...(trial.statusHistory || []),
    { status: targetStatus, changedAt: new Date().toISOString(), changedBy: actor?.name || actorUserId },
  ];

  await updateClinicalTrial(trial.id, { status: targetStatus, statusHistory });
  await applyTrialStatusChange(trial.id, targetStatus, prevStatus, actorUserId);
}
