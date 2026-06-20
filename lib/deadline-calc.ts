import { addDays, subDays, parseISO } from "date-fns";
import type { MilestoneConfig } from "@/types";

export interface PhaseDeadlines {
  prepare: string;
  execute: string;
  finalize: string;
}

/**
 * Tính deadline 3 giai đoạn dựa trên deadline gốc và cấu hình mốc quy trình.
 * - Chuẩn bị  = baseDeadline - daysBeforeForPrepare
 * - Tổ chức   = baseDeadline (giữ nguyên)
 * - Hoàn thiện = baseDeadline + daysAfterForFinalize
 */
export function calcPhaseDeadlines(
  baseDeadline: string,
  config: Pick<MilestoneConfig, "daysBeforeForPrepare" | "daysAfterForFinalize">
): PhaseDeadlines {
  const base = typeof baseDeadline === "string" ? parseISO(baseDeadline) : baseDeadline;

  return {
    prepare: subDays(base, config.daysBeforeForPrepare).toISOString(),
    execute: base.toISOString(),
    finalize: addDays(base, config.daysAfterForFinalize).toISOString(),
  };
}

/** Determines the active phase based on current date vs phase deadlines */
export function getActivePhase(
  deadlinePrepare: string,
  deadlineExecute: string,
  deadlineFinalize: string
): "prepare" | "execute" | "finalize" {
  const now = new Date();
  if (now <= new Date(deadlinePrepare)) return "prepare";
  if (now <= new Date(deadlineExecute)) return "execute";
  return "finalize";
}

/** Default milestone config if none is configured */
export const DEFAULT_MILESTONE_CONFIG: Pick<
  MilestoneConfig,
  "daysBeforeForPrepare" | "daysAfterForFinalize"
> = {
  daysBeforeForPrepare: 3,
  daysAfterForFinalize: 5,
};
