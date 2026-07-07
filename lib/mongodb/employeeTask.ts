import {
  getTask, createTask, saveUser, getWorkflows, saveWorkflow,
} from "@/lib/mongodb/firestore";
import { getUser } from "@/lib/mongodb/auth";
import { nodesToTaskSteps, linearStepsToTaskSteps } from "@/lib/workflow-engine";
import { generateId } from "@/lib/utils";
import type { User, Task, TaskStep, Stakeholder, Workflow, WorkflowNode, WorkflowEdge } from "@/types";

/** id 2 Workflow mẫu mặc định — tự sinh 1 lần trong module Quy trình nếu chưa có. */
export const ONBOARDING_WORKFLOW_ID = "wf-employee-onboarding";
export const OFFBOARDING_WORKFLOW_ID = "wf-employee-offboarding";

interface NodeDef {
  id: string;
  name: string;
  output: string;
}

function buildLinearWorkflow(id: string, name: string, description: string, defs: NodeDef[], actorUserId: string, actorName: string): Workflow {
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
    id, name, description,
    steps: [],
    nodes, edges,
    status: "published",
    createdBy: actorUserId,
    createdByName: actorName,
    createdAt: now,
    updatedAt: now,
  };
}

function buildDefaultOnboardingWorkflow(actorUserId: string, actorName: string): Workflow {
  return buildLinearWorkflow(
    ONBOARDING_WORKFLOW_ID,
    "Hội nhập nhân viên mới",
    "Quy trình mẫu hội nhập nhân viên mới — từ hoàn thiện hồ sơ đến đánh giá kết thúc thử việc.",
    [
      { id: "docs",             name: "Hoàn thiện hồ sơ nhân sự",          output: "Hồ sơ nhân sự đầy đủ (CV, hợp đồng, bằng cấp)" },
      { id: "account",          name: "Cấp tài khoản hệ thống",            output: "Tài khoản WorkHub + email đã cấp, đã phân quyền" },
      { id: "equipment",        name: "Bàn giao thiết bị & chỗ làm việc",  output: "Đã bàn giao thiết bị/thẻ ra vào" },
      { id: "orientation",      name: "Đào tạo hội nhập",                  output: "Đã hoàn thành đào tạo hội nhập (quy trình, an toàn, văn hoá tổ chức)" },
      { id: "probation_review", name: "Đánh giá thử việc",                 output: "Kết quả đánh giá thử việc / quyết định chính thức" },
    ],
    actorUserId, actorName,
  );
}

function buildDefaultOffboardingWorkflow(actorUserId: string, actorName: string): Workflow {
  return buildLinearWorkflow(
    OFFBOARDING_WORKFLOW_ID,
    "Nghỉ việc nhân viên",
    "Quy trình mẫu xử lý nhân viên nghỉ việc — từ bàn giao công việc đến hoàn tất hồ sơ.",
    [
      { id: "notice",     name: "Thông báo & xác nhận ngày nghỉ",     output: "Đã xác nhận ngày nghỉ việc cuối cùng" },
      { id: "handover",   name: "Bàn giao công việc",                  output: "Biên bản bàn giao công việc/tài liệu cho người kế nhiệm" },
      { id: "revoke",     name: "Thu hồi thiết bị & tài khoản",        output: "Đã thu hồi thiết bị, thẻ ra vào, khoá tài khoản hệ thống" },
      { id: "settlement", name: "Quyết toán lương & bảo hiểm",         output: "Đã chốt công, quyết toán lương/BHXH" },
      { id: "finalize",   name: "Hoàn tất hồ sơ nghỉ việc",            output: "Đã cập nhật hồ sơ nhân sự (ngày nghỉ, trạng thái)" },
    ],
    actorUserId, actorName,
  );
}

/**
 * Lấy Workflow dùng để sinh Task hội nhập/nghỉ việc. Nếu chỉ định `workflowId` (chọn tay trong
 * module Quy trình), dùng đúng workflow đó; nếu không, dùng mẫu mặc định tương ứng — tự sinh 1
 * lần nếu chưa có.
 */
async function resolveWorkflow(
  workflowId: string | undefined,
  defaultId: string,
  buildDefault: (actorUserId: string, actorName: string) => Workflow,
  actorUserId: string,
  actorName: string,
): Promise<Workflow> {
  const all = await getWorkflows(true);
  if (workflowId) {
    const picked = all.find((w) => w.id === workflowId);
    if (picked) return picked;
  }
  const existing = all.find((w) => w.id === defaultId);
  if (existing) return existing;
  const template = buildDefault(actorUserId, actorName);
  await saveWorkflow(template);
  return template;
}

function buildTaskFromWorkflow(workflow: Workflow, mainPerformerId: string): TaskStep[] {
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];
  const assigneeByNode = Object.fromEntries(nodes.map((n) => [n.id, mainPerformerId]));
  const steps = nodes.length > 0
    ? nodesToTaskSteps(nodes, edges, { assigneeByNode, defaultKpiUnit: "bước" })
    : linearStepsToTaskSteps(workflow.steps, { defaultKpiUnit: "bước" });
  for (const step of steps) {
    if (!step.assigneeId) step.assigneeId = mainPerformerId;
  }
  return steps;
}

/**
 * Sinh Task hội nhập cho 1 nhân viên mới được duyệt (idempotent — kiểm tra onboardingTaskId
 * trước). `actorUserId` là người phê duyệt (HR/Director) — trở thành người thực hiện chính của
 * checklist hội nhập; nhân viên mới được thêm làm người liên quan để theo dõi.
 */
export async function ensureOnboardingTask(
  employee: User,
  actorUserId: string,
  workflowId?: string,
): Promise<string> {
  if (employee.onboardingTaskId) {
    const existing = await getTask(employee.onboardingTaskId);
    if (existing) return existing.id;
  }

  const actorUser = await getUser(actorUserId);
  const workflow = await resolveWorkflow(workflowId, ONBOARDING_WORKFLOW_ID, buildDefaultOnboardingWorkflow, actorUserId, actorUser?.name || "");
  const steps = buildTaskFromWorkflow(workflow, actorUserId);

  const now = new Date().toISOString();
  const deadline = new Date(Date.now() + 30 * 86400000).toISOString(); // mốc 30 ngày mặc định
  const stakeholders: Stakeholder[] = [
    { userId: actorUserId, role: "assignee" },
    { userId: employee.id, role: "collaborator" },
  ];

  const taskId = generateId("t");
  const newTask: Omit<Task, "id"> & { id: string } = {
    id: taskId,
    name: `[Hội nhập] ${employee.name}`,
    description: `Checklist hội nhập nhân viên mới: ${employee.name} (${employee.email}).`,
    status: "in_progress",
    phase: "execute",
    priority: "medium",
    deadlineBase: deadline,
    deadlinePrepare: now,
    deadlineExecute: deadline,
    deadlineFinalize: deadline,
    creatorId: actorUserId,
    mainPerformerId: actorUserId,
    stakeholders,
    dependencies: [],
    workflowId: workflow.id,
    workflowName: workflow.name,
    steps,
    subtasks: [],
    kpi: { type: "custom", target: 1, current: 0, unit: "nhân viên" },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: true,
    approvedBy: actorUserId,
    approvedAt: now,
    department: employee.department,
    tags: ["nhan-su", "hoi-nhap"],
    createdAt: now,
    updatedAt: now,
  };

  await createTask(newTask);
  await saveUser({ id: employee.id, onboardingTaskId: taskId });
  return taskId;
}

/**
 * Sinh Task nghỉ việc cho 1 nhân viên có đơn "Nghỉ việc" vừa được duyệt (idempotent). `actorUserId`
 * là người phê duyệt đơn — trở thành người thực hiện chính của checklist bàn giao/thu hồi.
 */
export async function ensureOffboardingTask(
  employee: User,
  actorUserId: string,
  workflowId?: string,
): Promise<string> {
  if (employee.offboardingTaskId) {
    const existing = await getTask(employee.offboardingTaskId);
    if (existing) return existing.id;
  }

  const actorUser = await getUser(actorUserId);
  const workflow = await resolveWorkflow(workflowId, OFFBOARDING_WORKFLOW_ID, buildDefaultOffboardingWorkflow, actorUserId, actorUser?.name || "");
  const steps = buildTaskFromWorkflow(workflow, actorUserId);

  const now = new Date().toISOString();
  const stakeholders: Stakeholder[] = [
    { userId: actorUserId, role: "assignee" },
    { userId: employee.id, role: "collaborator" },
  ];

  const taskId = generateId("t");
  const newTask: Omit<Task, "id"> & { id: string } = {
    id: taskId,
    name: `[Nghỉ việc] ${employee.name}`,
    description: `Checklist bàn giao & thu hồi khi nghỉ việc: ${employee.name} (${employee.email}).`,
    status: "in_progress",
    phase: "execute",
    priority: "high",
    deadlineBase: now,
    deadlinePrepare: now,
    deadlineExecute: now,
    deadlineFinalize: now,
    creatorId: actorUserId,
    mainPerformerId: actorUserId,
    stakeholders,
    dependencies: [],
    workflowId: workflow.id,
    workflowName: workflow.name,
    steps,
    subtasks: [],
    kpi: { type: "custom", target: 1, current: 0, unit: "nhân viên" },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: true,
    approvedBy: actorUserId,
    approvedAt: now,
    department: employee.department,
    tags: ["nhan-su", "nghi-viec"],
    createdAt: now,
    updatedAt: now,
  };

  await createTask(newTask);
  await saveUser({ id: employee.id, offboardingTaskId: taskId });
  return taskId;
}
