import type { Task, Evaluation, User, UserRole } from "@/types";

export interface PerformanceInput {
  tasks: Task[];
  evaluations: Evaluation[];
  /** All evaluations across users — used for team member qualitative scoring. Falls back to evaluations if absent. */
  allEvaluations?: Evaluation[];
  userId: string;
  periodStart: string;
  periodEnd: string;
  // Optional — enables unit-score component for managers
  role?: UserRole;
  department?: string;
  allUsers?: User[];
}

export interface PerformanceResult {
  userId: string;
  executionScore: number;    // personal execution 0-100
  qualitativeScore: number;  // personal qualitative 0-100
  personalScore: number;     // exec×60% + qual×40% (personal component)
  teamScore: number;         // avg personal score of direct reports; 0 for staff
  totalScore: number;        // personal + team weighted (or = personalScore for staff)
  completionRate: number;    // %
  onTimeRate: number;        // %
  evalCount: number;
  teamMemberCount: number;   // 0 for non-managers
}

// How much of the total score comes from the unit vs the individual
const MANAGER_WEIGHTS: Partial<Record<UserRole, { personal: number; team: number }>> = {
  teamLead: { personal: 0.4, team: 0.6 },
  director: { personal: 0.3, team: 0.7 },
  hrAdmin:  { personal: 0.3, team: 0.7 },
};

function calcPersonalOnly(
  tasks: Task[],
  evaluations: Evaluation[],
  userId: string,
  periodStart: string,
  periodEnd: string,
): Omit<PerformanceResult, "userId" | "teamScore" | "totalScore" | "teamMemberCount"> {
  const start = new Date(periodStart);
  const end   = new Date(periodEnd);

  const myTasks = tasks.filter(
    (t) =>
      (t.mainPerformerId === userId ||
        (t.stakeholders ?? []).some((s) => s.userId === userId && s.role === "assignee")) &&
      t.deadlineBase &&
      new Date(t.deadlineBase) >= start &&
      new Date(t.deadlineBase) <= end,
  );

  const done   = myTasks.filter((t) => t.status === "done");
  const active = myTasks.filter((t) => t.status !== "cancelled");

  const onTime = done.filter(
    (t) => t.deadlineBase && t.updatedAt && new Date(t.updatedAt) <= new Date(t.deadlineBase),
  );

  const completionRate = active.length > 0 ? done.length / active.length : 0;
  const onTimeRate     = done.length > 0 ? onTime.length / done.length : 0;

  // Weighted progress: done tasks = 100%, in-progress = avg step progress (continuous 0–1)
  const weightedProgress = active.length > 0
    ? active.reduce((sum, t) => {
        if (t.status === "done") return sum + 1;
        const steps = t.steps ?? [];
        if (steps.length > 0) {
          return sum + steps.reduce((s, st) => s + (st.progress ?? 0), 0) / steps.length / 100;
        }
        // No steps: estimate from status
        if (t.status === "review")      return sum + 0.9;
        if (t.status === "in_progress") return sum + 0.4;
        return sum + 0.05; // todo
      }, 0) / active.length
    : 0;

  // executionScore: 40% weighted progress + 30% completion rate + 30% on-time rate
  const executionScore = Math.round((weightedProgress * 0.4 + completionRate * 0.3 + onTimeRate * 0.3) * 100);

  const myEvals = evaluations.filter((e) => e.evaluatedUserId === userId);
  let qualitativeScore = 0;
  if (myEvals.length > 0) {
    const allScores = myEvals.flatMap((e) => Object.values(e.scores ?? {}));
    qualitativeScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;
  }

  return {
    executionScore,
    qualitativeScore,
    personalScore: Math.round(executionScore * 0.6 + qualitativeScore * 0.4),
    completionRate: Math.round(completionRate * 100),
    onTimeRate:     Math.round(onTimeRate * 100),
    evalCount:      myEvals.length,
  };
}

export function calcPerformanceScore(input: PerformanceInput): PerformanceResult {
  const { tasks, evaluations, allEvaluations, userId, periodStart, periodEnd, role, department, allUsers } = input;

  const personal = calcPersonalOnly(tasks, evaluations, userId, periodStart, periodEnd);
  const weights  = role ? MANAGER_WEIGHTS[role] : undefined;

  // Use allEvaluations for team member scoring so qualitative scores are correct
  const teamEvals = allEvaluations ?? evaluations;

  let teamScore       = 0;
  let teamMemberCount = 0;
  let totalScore      = personal.personalScore;

  if (weights && allUsers && allUsers.length > 0) {
    const members = allUsers.filter((u) => {
      if (u.id === userId || !u.isActive || u.role === "guest") return false;
      if (role === "teamLead") return u.role === "staff" && u.department === department;
      // director / hrAdmin: all staff + teamLeads across all departments
      return u.role === "staff" || u.role === "teamLead";
    });

    teamMemberCount = members.length;

    if (teamMemberCount > 0) {
      const memberScores = members.map(
        (u) => calcPersonalOnly(tasks, teamEvals, u.id, periodStart, periodEnd).personalScore,
      );
      teamScore  = Math.round(memberScores.reduce((s, v) => s + v, 0) / memberScores.length);
      totalScore = Math.round(personal.personalScore * weights.personal + teamScore * weights.team);
    }
  }

  return {
    userId,
    ...personal,
    teamScore,
    teamMemberCount,
    totalScore,
  };
}

export function getRank(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Xuất sắc",     color: "text-green-600"  };
  if (score >= 75) return { label: "Tốt",           color: "text-blue-600"   };
  if (score >= 60) return { label: "Khá",           color: "text-amber-600"  };
  if (score >= 45) return { label: "Trung bình",    color: "text-orange-600" };
  return                  { label: "Cần cải thiện", color: "text-red-600"    };
}

// Weights accessor for UI display
export function getManagerWeights(role: UserRole): { personal: number; team: number } | undefined {
  return MANAGER_WEIGHTS[role];
}
