import { getTask, createTask, updateTask, updateClinicalTrial, getUnitPlans } from "@/lib/mongodb/firestore";
import { calcPhaseDeadlines, DEFAULT_MILESTONE_CONFIG } from "@/lib/deadline-calc";
import { parseTrialPeriod } from "@/lib/utils/clinicalTrialPeriod";
import { generateId } from "@/lib/utils";
import { CLINICAL_TRIAL_TERMINAL_BRANCHES } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus, Task, TaskStatus, TaskStep, Stakeholder } from "@/types";

/** Ánh xạ 12+2 trạng thái trial → 5 trạng thái thô của Task (Chuẩn bị + Đang chạy đều "in_progress"). */
export function mapTrialStatusToTaskStatus(status: ClinicalTrialStatus): TaskStatus {
  if (status === "completed") return "done";
  if ((CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(status)) return "cancelled";
  return "in_progress";
}

/**
 * 9 node quy trình theo dõi TNLS (đã chốt với người dùng) — chuỗi tuyến tính,
 * mỗi node phụ thuộc node liền trước. assigneeId mặc định là người thực hiện chính;
 * helpers chỉ là GỢI Ý người hỗ trợ (không phải chỉ định cứng) — người thực hiện chính
 * có thể tự đề xuất lại khi cấp trên duyệt task.
 */
function buildTrialTaskSteps(trial: ClinicalTrial, mainPerformerId: string): TaskStep[] {
  const piHelper = trial.principalInvestigatorId && trial.principalInvestigatorId !== mainPerformerId
    ? [trial.principalInvestigatorId]
    : [];

  const defs: { id: string; name: string; expectedOutput: string; helpers?: string[] }[] = [
    { id: "feasibility", name: "Khảo sát tính khả thi", expectedOutput: "Báo cáo khảo sát tính khả thi" },
    { id: "sponsor", name: "Chờ chấp thuận tài trợ", expectedOutput: "Hợp đồng tài trợ đã ký" },
    { id: "ethics_prep", name: "Chuẩn bị hồ sơ HĐĐĐ Quốc gia", expectedOutput: "Bộ hồ sơ hoàn chỉnh đã nộp", helpers: piHelper },
    { id: "ethics_meeting", name: "Họp HĐĐĐ Quốc gia", expectedOutput: "Biên bản họp + ý kiến hội đồng", helpers: piHelper },
    { id: "lec", name: "Thông qua LEC (Hội đồng ĐĐ cơ sở)", expectedOutput: "Quyết định phê duyệt của LEC", helpers: piHelper },
    { id: "moh", name: "Chờ chấp thuận Bộ Y tế", expectedOutput: "Công văn chấp thuận Bộ Y tế" },
    { id: "pre_deploy", name: "Chuẩn bị triển khai", expectedOutput: "Số QĐ triển khai + site sẵn sàng thu tuyển" },
    { id: "enrollment", name: "Thu tuyển bệnh nhân", expectedOutput: "Số liệu tuyển + báo cáo AE/SAE định kỳ", helpers: piHelper },
    { id: "closeout", name: "Kết thúc & Quyết toán", expectedOutput: "Biên bản bàn giao đã ký + báo cáo tổng kết", helpers: piHelper },
  ];

  return defs.map((d, i) => ({
    id: d.id,
    name: d.name,
    assigneeId: mainPerformerId,
    status: "pending" as const,
    progress: 0,
    kpiTarget: 1,
    kpiCurrent: 0,
    kpiUnit: "bước",
    proofs: [],
    dependsOn: i > 0 ? [defs[i - 1].id] : [],
    expectedOutput: d.expectedOutput,
    ...(d.helpers && d.helpers.length > 0 ? { helpers: d.helpers } : {}),
  }));
}

/**
 * Lấy Task theo dõi của 1 trial, tự sinh nếu chưa có (idempotent).
 * Dùng chung cho nút "Tạo nhiệm vụ theo dõi" và các luồng cần gắn dữ liệu tài chính vào Task thật
 * (vd. duyệt bàn giao thanh toán) — tránh gán taskId giả (trial.id) vào FinancialTransaction.
 */
export async function ensureTrialExecutionTask(
  trial: ClinicalTrial,
  actorUserId: string
): Promise<string> {
  if (trial.executionTaskId) {
    const existing = await getTask(trial.executionTaskId);
    if (existing) return existing.id;
  }

  const endDate = parseTrialPeriod(trial.endPeriod);
  const base = (endDate || new Date(new Date().getFullYear() + 1, 11, 31)).toISOString();
  const phases = calcPhaseDeadlines(base, DEFAULT_MILESTONE_CONFIG);

  const mainPerformerId = trial.coordinatorId || trial.principalInvestigatorId || actorUserId;
  const stakeholders: Stakeholder[] = [{ userId: mainPerformerId, role: "assignee" }];
  if (trial.principalInvestigatorId && trial.principalInvestigatorId !== mainPerformerId) {
    stakeholders.push({ userId: trial.principalInvestigatorId, role: "collaborator" });
  }

  const taskId = generateId("t");
  const newTask: Omit<Task, "id"> & { id: string } = {
    id: taskId,
    name: `[TNLS] ${trial.abbreviation || trial.code} — ${trial.title}`,
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
    workflowName: "Thử nghiệm lâm sàng",
    steps: buildTrialTaskSteps(trial, mainPerformerId),
    subtasks: [],
    kpi: { type: "custom", target: 1, current: 0, unit: "nghiên cứu" },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: true,
    approvedBy: actorUserId,
    approvedAt: new Date().toISOString(),
    department: trial.department,
    tags: ["TNLS"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
