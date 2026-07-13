"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { cn, formatPeriodDDMMYY } from "@/lib/utils";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";
import { CLINICAL_TRIAL_STATUS_LABEL } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus } from "@/types";

const STATUS_BADGE: Record<ClinicalTrialStatus, string> = {
  feasibility:            "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  awaiting_sponsor:       "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  preparing_ethics:       "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  national_ethics_met:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  lec_approved:           "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  awaiting_moh:           "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pre_deployment:         "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  running_pre_enroll:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  running_enrolled:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  completed:              "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  terminated_no_efficacy: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  not_feasible:           "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

interface TrialTableProps {
  trials: ClinicalTrial[];
  selectable?: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (trial: ClinicalTrial) => void;
}

export function TrialTable({
  trials, selectable = false, selectedIds, onToggleSelect, onToggleSelectAll, onRowClick,
}: TrialTableProps) {
  const allSelected = trials.length > 0 && trials.every((t) => selectedIds.has(t.id));
  const abbr = useUnitAbbr();

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              {selectable && (
                <th className="px-3 py-2.5 w-9">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                </th>
              )}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Mã / Tên viết tắt</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Tên nghiên cứu</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">PI</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Khoa</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Trạng thái</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Thời gian</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Nhiệm vụ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {trials.map((trial) => (
              <tr
                key={trial.id}
                onClick={() => onRowClick(trial)}
                className={cn(
                  "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition",
                  selectable && selectedIds.has(trial.id) && "bg-blue-50/60 dark:bg-blue-900/10",
                )}
              >
                {selectable && (
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(trial.id)}
                      onChange={() => onToggleSelect(trial.id)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <p className="font-medium text-slate-800 dark:text-white">{trial.abbreviation || trial.code}</p>
                  {trial.abbreviation && trial.code && (
                    <p className="text-[11px] text-slate-400">{trial.code}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 max-w-xs">
                  <p className="text-slate-600 dark:text-slate-300 line-clamp-2">{trial.title}</p>
                </td>
                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {trial.principalInvestigatorName || "—"}
                </td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {trial.department ? abbr(trial.department) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap", STATUS_BADGE[trial.status])}>
                    {CLINICAL_TRIAL_STATUS_LABEL[trial.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                  {trial.startPeriod || trial.endPeriod
                    ? `${formatPeriodDDMMYY(trial.startPeriod)} – ${formatPeriodDDMMYY(trial.endPeriod)}`
                    : "—"}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {trial.executionTaskId ? (
                    <Link
                      href={`/tasks/${trial.executionTaskId}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ClipboardList className="w-3 h-3" /> Xem nhiệm vụ
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Chưa có</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
