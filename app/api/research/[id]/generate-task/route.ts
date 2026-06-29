import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopic, updateResearchTopic, getTask, createTask } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { buildResearchTaskSteps } from "@/lib/research";
import { calcPhaseDeadlines, DEFAULT_MILESTONE_CONFIG } from "@/lib/deadline-calc";
import { generateId } from "@/lib/utils";
import type { Task, Stakeholder } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

/** Suy ra deadline gốc từ "Quý III, năm 2026" (cuối quý) hoặc cuối năm đề tài. */
function deadlineFromTimeline(timeline: string | undefined, year: number): string {
  let quarter: number | null = null;
  if (timeline) {
    const m = timeline.match(/Quý\s+(IV|III|II|I)\b/i);
    if (m) quarter = ROMAN[m[1].toUpperCase()] ?? null;
  }
  // Cuối quý (tháng cuối) hoặc 31/12 nếu không có quý
  const endMonth = quarter ? quarter * 3 : 12; // 1..12
  // ngày 0 của (endMonth) trong JS = ngày cuối tháng endMonth (month index endMonth → day 0)
  return new Date(Date.UTC(year, endMonth, 0, 17, 0, 0)).toISOString();
}

/**
 * POST /api/research/[id]/generate-task
 * Sinh Task per-đề-tài (hub tích hợp tiến độ/risk/3T/plan) khi đề tài vào GĐ Triển khai.
 * Idempotent: nếu đã có executionTaskId hợp lệ thì trả về task đó.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(u.userId);
  const topic = await getResearchTopic(params.id);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Chỉ quản lý / chủ nhiệm / người thực hiện được sinh task
  const isManager = !!me && hasPermission(me.role, "research:manage");
  const isParticipant =
    topic.principalInvestigatorId === u.userId || topic.mainPerformerId === u.userId;
  if (!isManager && !isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent — task đã tồn tại
  if (topic.executionTaskId) {
    const existing = await getTask(topic.executionTaskId);
    if (existing) return NextResponse.json({ taskId: existing.id, created: false });
  }

  // Kế thừa planId từ task "ô" theo quý (phương án a)
  let planId: string | undefined;
  let planItemParentId: string | undefined;
  if (topic.taskId) {
    const umbrella = await getTask(topic.taskId);
    if (umbrella?.planId) {
      planId = umbrella.planId;
      planItemParentId = umbrella.planItemParentId;
    }
  }

  const base = deadlineFromTimeline(topic.completionTimeline, topic.year);
  const phases = calcPhaseDeadlines(base, DEFAULT_MILESTONE_CONFIG);

  const mainPerformerId = topic.mainPerformerId || topic.principalInvestigatorId || u.userId;
  const stakeholders: Stakeholder[] = [{ userId: mainPerformerId, role: "assignee" }];
  if (topic.supervisorId && topic.supervisorId !== mainPerformerId) {
    stakeholders.push({ userId: topic.supervisorId, role: "supervisor" });
  }
  if (topic.principalInvestigatorId && !stakeholders.some(s => s.userId === topic.principalInvestigatorId)) {
    stakeholders.push({ userId: topic.principalInvestigatorId, role: "collaborator" });
  }

  const taskId = generateId("t");
  const newTask: Omit<Task, "id"> & { id: string } = {
    id: taskId,
    name: `[NCKH] ${topic.title}`,
    description: topic.abstract || topic.compileNote || "Nhiệm vụ thực thi đề tài NCKH cấp cơ sở.",
    status: "in_progress",
    phase: "execute",
    priority: "medium",
    deadlineBase: base,
    deadlinePrepare: phases.prepare,
    deadlineExecute: phases.execute,
    deadlineFinalize: phases.finalize,
    creatorId: u.userId,
    mainPerformerId,
    stakeholders,
    dependencies: [],
    workflowName: "NCKH cấp cơ sở",
    steps: buildResearchTaskSteps(topic),
    subtasks: [],
    kpi: { type: "custom", target: 1, current: 0, unit: "đề tài" },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: true,
    approvedBy: u.userId,
    approvedAt: new Date().toISOString(),
    department: topic.department,
    tags: ["NCKH"],
    ...(planId ? { planId } : {}),
    ...(planItemParentId ? { planItemParentId } : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await createTask(newTask);
  await updateResearchTopic(params.id, { executionTaskId: taskId });

  return NextResponse.json({ taskId, created: true });
}
