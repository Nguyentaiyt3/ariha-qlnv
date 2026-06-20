import type { Task, Evaluation, KPIFramework } from "@/types";

export interface PerformanceInput {
  tasks: Task[];
  evaluations: Evaluation[];
  framework?: KPIFramework;
  userId: string;
  periodStart: string;
  periodEnd: string;
}

export interface PerformanceResult {
  userId: string;
  executionScore: number;   // 0-100, 60% weight
  qualitativeScore: number; // 0-100, 40% weight
  totalScore: number;       // weighted sum
  completionRate: number;
  onTimeRate: number;
  evalCount: number;
}

export function calcPerformanceScore(input: PerformanceInput): PerformanceResult {
  const { tasks, evaluations, userId, periodStart, periodEnd } = input;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Filter tasks in period for this user
  const myTasks = tasks.filter(
    (t) =>
      (t.mainPerformerId === userId || (t.stakeholders ?? []).some((s) => s.userId === userId && s.role === "assignee")) &&
      t.deadlineBase &&
      new Date(t.deadlineBase) >= start &&
      new Date(t.deadlineBase) <= end,
  );

  const done = myTasks.filter((t) => t.status === "done");
  const completionRate = myTasks.length > 0 ? done.length / myTasks.length : 0;
  const onTime = done.filter((t) => {
    if (!t.deadlineBase || !t.updatedAt) return false;
    return new Date(t.updatedAt) <= new Date(t.deadlineBase);
  });
  const onTimeRate = done.length > 0 ? onTime.length / done.length : 0;

  // Execution score: 50% completion rate + 50% on-time rate
  const executionScore = Math.round((completionRate * 0.5 + onTimeRate * 0.5) * 100);

  // Qualitative score: average of evaluation scores for this user
  const myEvals = evaluations.filter((e) => e.evaluatedUserId === userId);
  let qualitativeScore = 0;
  if (myEvals.length > 0) {
    const allScores = myEvals.flatMap((e) => Object.values(e.scores));
    qualitativeScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;
  }

  const totalScore = Math.round(executionScore * 0.6 + qualitativeScore * 0.4);

  return {
    userId,
    executionScore,
    qualitativeScore,
    totalScore,
    completionRate: Math.round(completionRate * 100),
    onTimeRate: Math.round(onTimeRate * 100),
    evalCount: myEvals.length,
  };
}

export function getRank(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Xuất sắc", color: "text-green-600" };
  if (score >= 75) return { label: "Tốt", color: "text-blue-600" };
  if (score >= 60) return { label: "Khá", color: "text-amber-600" };
  if (score >= 45) return { label: "Trung bình", color: "text-orange-600" };
  return { label: "Cần cải thiện", color: "text-red-600" };
}
