"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface TrialListItemProps {
  trial: ClinicalTrial;
  onClick: () => void;
}

export function TrialListItem({ trial, onClick }: TrialListItemProps) {
  const enrollment = trial.enrollment;
  const enrollmentPercent = enrollment?.targetSite
    ? Math.round((enrollment.enrolledAtSite || 0) / enrollment.targetSite * 100)
    : 0;

  // Determine progress color
  const progressColor =
    enrollmentPercent >= 75 ? "green" : enrollmentPercent >= 50 ? "amber" : "red";

  // Collect alerts
  const alerts = [];
  if (enrollment?.targetSite && enrollmentPercent < 50) {
    alerts.push({ type: "low-enrollment", label: "Tuyển bệnh thấp", severity: "warn" });
  }
  if (enrollment?.aeCount && enrollment.aeCount > 10) {
    alerts.push({ type: "high-ae", label: `AE cao: ${enrollment.aeCount}`, severity: "error" });
  }
  if (enrollment?.saeCount && enrollment.saeCount > 2) {
    alerts.push({ type: "high-sae", label: `SAE: ${enrollment.saeCount}`, severity: "error" });
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4 hover:border-blue-300 dark:hover:border-blue-600 transition"
    >
      {/* Title & Status */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-white">
            {trial.abbreviation || trial.code}
          </h3>
          {trial.code && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Mã: {trial.code}
            </p>
          )}
        </div>
        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0", STATUS_BADGE[trial.status])}>
          {CLINICAL_TRIAL_STATUS_LABEL[trial.status]}
        </span>
      </div>

      {/* PI */}
      {trial.principalInvestigatorName && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="font-medium">PI:</span> {trial.principalInvestigatorName}
        </p>
      )}

      {/* Description */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{trial.title}</p>

      {/* Progress Bar */}
      {enrollment && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Tiến độ: {enrollment.enrolledAtSite || 0}/{enrollment.targetSite}
            </span>
            <span
              className={cn("text-xs font-bold", {
                "text-green-600": progressColor === "green",
                "text-amber-600": progressColor === "amber",
                "text-red-600": progressColor === "red",
              })}
            >
              {enrollmentPercent}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn("h-full transition-all", {
                "bg-green-500": progressColor === "green",
                "bg-amber-500": progressColor === "amber",
                "bg-red-500": progressColor === "red",
              })}
              style={{ width: `${Math.min(enrollmentPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-3 space-y-1">
          {alerts.map((alert) => (
            <div key={alert.type} className="flex items-center gap-2 text-xs">
              <AlertTriangle
                className={cn("w-3.5 h-3.5", {
                  "text-amber-600": alert.severity === "warn",
                  "text-red-600": alert.severity === "error",
                })}
              />
              <span
                className={cn({
                  "text-amber-600 dark:text-amber-400": alert.severity === "warn",
                  "text-red-600 dark:text-red-400": alert.severity === "error",
                })}
              >
                {alert.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {enrollment && (
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>🩺 AE: {enrollment.aeCount || 0}</span>
          <span>🚨 SAE: {enrollment.saeCount || 0}</span>
          <span>💰 {trial.payments?.length ? "✅" : "⏳"}</span>
        </div>
      )}
    </button>
  );
}
