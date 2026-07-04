"use client";

import { CheckCircle2, Circle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLINICAL_TRIAL_PIPELINE, CLINICAL_TRIAL_STATUS_LABEL,
  CLINICAL_TRIAL_TERMINAL_BRANCHES,
} from "@/types";
import type { ClinicalTrialStatus } from "@/types";

interface Props {
  status: ClinicalTrialStatus;
  /** Nếu có, hiển thị dạng nút bấm để đổi trạng thái. */
  onChange?: (status: ClinicalTrialStatus) => void;
}

const isTerminalBranch = (s: ClinicalTrialStatus) =>
  CLINICAL_TRIAL_TERMINAL_BRANCHES.includes(s);

export function TrialStatusPipeline({ status, onChange }: Props) {
  const onBranch = isTerminalBranch(status);
  const currentIdx = onBranch ? CLINICAL_TRIAL_PIPELINE.length : CLINICAL_TRIAL_PIPELINE.indexOf(status);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-0.5 flex-wrap pb-2">
        {CLINICAL_TRIAL_PIPELINE.map((s, idx) => {
          const done = !onBranch && idx < currentIdx;
          const active = !onBranch && idx === currentIdx;
          const Icon = done ? CheckCircle2 : active ? Clock : Circle;
          return (
            <div key={s} className="flex items-center shrink-0">
              <button
                type="button"
                disabled={!onChange}
                onClick={() => onChange?.(s)}
                title={CLINICAL_TRIAL_STATUS_LABEL[s]}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition whitespace-nowrap",
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : done
                      ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700",
                  onChange && "hover:opacity-80 cursor-pointer",
                )}
              >
                <Icon className="w-3 h-3" />
                {CLINICAL_TRIAL_STATUS_LABEL[s]}
              </button>
              {idx < CLINICAL_TRIAL_PIPELINE.length - 1 && (
                <div className={cn("w-4 h-0.5 shrink-0", done ? "bg-green-300" : "bg-slate-200 dark:bg-slate-700")} />
              )}
            </div>
          );
        })}
      </div>

      {(onBranch || onChange) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400">Nhánh kết thúc sớm:</span>
          {CLINICAL_TRIAL_TERMINAL_BRANCHES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!onChange}
              onClick={() => onChange?.(s)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition",
                status === s
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-500 border-red-200 dark:bg-red-900/15 dark:border-red-800",
                onChange && "hover:opacity-80 cursor-pointer",
              )}
            >
              <XCircle className="w-3 h-3" />
              {CLINICAL_TRIAL_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
