import type { Evaluation, EvaluationConfig, Eval3TScore, StepSubTask } from "@/types";

export const DEFAULT_EVAL_CONFIG: EvaluationConfig = {
  weights: { t1: 0.30, t2: 0.50, t3: 0.20 },
  thresholds: { xuatSac: 10, hoanThanhTot: 8, hoanThanh: 5 },
};

// ── T1 · Tiến độ ──────────────────────────────────────────────

export function scoreT1(deadlineBase: string | undefined, referenceDate: string): number {
  if (!deadlineBase) return 5; // không có hạn → trung lập

  const deadline = new Date(deadlineBase);
  deadline.setHours(23, 59, 59, 999);
  const diffDays = Math.ceil(
    (new Date(referenceDate).getTime() - deadline.getTime()) / 86_400_000
  );

  if (diffDays <= -3) return 10;
  if (diffDays <= -1) return 9;
  if (diffDays === 0) return 8;
  if (diffDays <= 2)  return 6;
  if (diffDays <= 5)  return 4;
  if (diffDays <= 14) return 2;
  return 0;
}

// ── T2 · Chất lượng ───────────────────────────────────────────

/** Dùng cho nhiệm vụ chính: từ 360° evaluations, fallback sang manager rating / KPI */
export function scoreT2Task(
  evals: Evaluation[],
  fallbackRating?: number,   // completionProposal.reviewRating (1–5)
  kpiTarget?: number,
  kpiCurrent?: number,
): number {
  if (evals.length > 0) {
    const avg = evals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / evals.length;
    return roundHalf(Math.min(10, avg / 10));
  }
  if (fallbackRating && fallbackRating > 0) {
    return roundHalf(Math.min(10, fallbackRating * 2));
  }
  if (kpiTarget && kpiTarget > 0 && kpiCurrent != null) {
    return roundHalf(Math.min(10, (kpiCurrent / kpiTarget) * 10));
  }
  return 5; // không đủ dữ liệu → trung lập
}

/** Dùng cho từng bước: KPI × hệ số proof, hoặc chỉ proof nếu không có KPI */
export function scoreT2Step(
  kpiTarget: number,
  kpiCurrent: number,
  proofCount: number,
): number {
  const proofFactor = proofCount > 0 ? 1.0 : 0.7;
  if (kpiTarget > 0) {
    const kpiScore = Math.min(10, (kpiCurrent / kpiTarget) * 10);
    return roundHalf(kpiScore * proofFactor);
  }
  return proofCount > 0 ? 8 : 4;
}

// ── T3 · Tài nguyên ───────────────────────────────────────────

/** Nhiệm vụ: chi phí thực / ngân sách, fallback proof coverage */
export function scoreT3Task(
  totalAmount?: number,
  totalExpense?: number,
  stepsWithProof?: number,
  totalSteps?: number,
): number {
  if (totalAmount && totalAmount > 0 && totalExpense != null) {
    const pct = (totalExpense / totalAmount) * 100;
    if (pct <= 85)  return 10;
    if (pct <= 90)  return 9;
    if (pct <= 95)  return 8;
    if (pct <= 100) return 7;
    if (pct <= 105) return 5;
    if (pct <= 110) return 4;
    if (pct <= 125) return 2;
    return 0;
  }
  // fallback: tỷ lệ bước có minh chứng
  if (totalSteps && totalSteps > 0 && stepsWithProof != null) {
    return roundHalf((stepsWithProof / totalSteps) * 10);
  }
  return 5;
}

/** Bước: tỷ lệ sub-tasks hoàn thành; nếu không có sub-tasks thì dùng proof */
export function scoreT3Step(
  subTasks: StepSubTask[] | undefined,
  proofCount: number,
): number {
  if (subTasks && subTasks.length > 0) {
    const done = subTasks.filter((st) => st.status === "completed").length;
    return roundHalf((done / subTasks.length) * 10);
  }
  return proofCount > 0 ? 8 : 4;
}

// ── Tổng hợp ──────────────────────────────────────────────────

export function computeTotal(
  t1: number, t2: number, t3: number,
  weights: EvaluationConfig["weights"],
): number {
  return roundHalf(t1 * weights.t1 + t2 * weights.t2 + t3 * weights.t3);
}

export function getGrade(
  total: number,
  thresholds: EvaluationConfig["thresholds"],
): Eval3TScore["grade"] {
  if (total >= thresholds.xuatSac)      return "xuatSac";
  if (total >  thresholds.hoanThanhTot) return "hoanThanhTot";
  if (total >= thresholds.hoanThanh)    return "hoanThanh";
  return "khongHoanThanh";
}

export function buildEval3TScore(
  t1: number, t2: number, t3: number,
  config: EvaluationConfig,
): Eval3TScore {
  const total = computeTotal(t1, t2, t3, config.weights);
  return {
    t1, t2, t3, total,
    grade: getGrade(total, config.thresholds),
    computedAt: new Date().toISOString(),
  };
}

export const GRADE_LABEL: Record<Eval3TScore["grade"], string> = {
  xuatSac:        "Xuất sắc",
  hoanThanhTot:   "Hoàn thành tốt",
  hoanThanh:      "Hoàn thành",
  khongHoanThanh: "Không hoàn thành",
};

function roundHalf(n: number): number {
  return Math.round(n * 10) / 10;
}
