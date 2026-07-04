"use client";

import { Users, TrendingUp, AlertCircle, CheckCircle2, Edit2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicalTrialEnrollment } from "@/types";

interface EnrollmentDashboardProps {
  enrollment?: ClinicalTrialEnrollment;
  onUpdateClick?: () => void;
  onShareClick?: () => void;
  onCreateLinkClick?: () => void;
  canEdit?: boolean;
}

function StatCard({
  label,
  actual,
  target,
  icon: Icon,
  color = "slate",
}: {
  label: string;
  actual?: number;
  target?: number;
  icon: React.ComponentType<{ className?: string }>;
  color?: "green" | "amber" | "red" | "blue" | "slate";
}) {
  const progress = target && actual ? Math.round((actual / target) * 100) : 0;
  const isAtRisk = target && actual && actual > target;
  const isCompleted = target && actual && actual >= target;

  const bgMap = {
    green: "bg-green-50 dark:bg-green-900/20",
    amber: "bg-amber-50 dark:bg-amber-900/20",
    red: "bg-red-50 dark:bg-red-900/20",
    blue: "bg-blue-50 dark:bg-blue-900/20",
    slate: "bg-slate-50 dark:bg-slate-900/20",
  };

  const textMap = {
    green: "text-green-700 dark:text-green-300",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-red-700 dark:text-red-300",
    blue: "text-blue-700 dark:text-blue-300",
    slate: "text-slate-700 dark:text-slate-300",
  };

  return (
    <div className={cn("rounded-lg border border-slate-200 dark:border-slate-700 p-3", bgMap[color])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <Icon className={cn("w-4 h-4", textMap[color])} />
      </div>
      {target !== undefined ? (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={cn("text-lg font-bold", textMap[color])}>
              {actual ?? "—"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">/ {target}</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all rounded-full",
                isCompleted
                  ? "bg-green-500"
                  : isAtRisk
                    ? "bg-red-500"
                    : progress > 50
                      ? "bg-amber-500"
                      : "bg-blue-500"
              )}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">{progress}%</span>
        </div>
      ) : (
        <span className={cn("text-lg font-bold", textMap[color])}>{actual ?? "—"}</span>
      )}
    </div>
  );
}

export function EnrollmentDashboard({ enrollment, onUpdateClick, onShareClick, onCreateLinkClick, canEdit }: EnrollmentDashboardProps) {
  if (!enrollment) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        Chưa có dữ liệu tuyển bệnh
      </div>
    );
  }

  const enrollmentColor =
    enrollment.enrolledAtSite &&
    enrollment.targetSite &&
    enrollment.enrolledAtSite > enrollment.targetSite
      ? "red"
      : enrollment.enrolledAtSite &&
          enrollment.targetSite &&
          enrollment.enrolledAtSite >= enrollment.targetSite * 0.8
        ? "green"
        : "amber";

  const randomColor =
    enrollment.randomized && enrollment.targetSite
      ? enrollment.randomized >= enrollment.targetSite
        ? "green"
        : "amber"
      : "slate";

  const aeWarning = enrollment.aeCount && enrollment.aeCount > 5 ? "red" : enrollment.aeCount ? "amber" : "slate";
  const saeWarning = enrollment.saeCount && enrollment.saeCount > 2 ? "red" : enrollment.saeCount ? "amber" : "slate";

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      {canEdit && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onUpdateClick}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            <Edit2 className="w-4 h-4" />
            Cập nhật tiến độ
          </button>
          <button
            onClick={onCreateLinkClick}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition"
          >
            <Mail className="w-4 h-4" />
            Tạo liên kết
          </button>
          <button
            onClick={onShareClick}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition"
          >
            <Mail className="w-4 h-4" />
            Gửi mail
          </button>
        </div>
      )}

      {/* Main Enrollment Progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="Thu tuyển tại site"
          actual={enrollment.enrolledAtSite}
          target={enrollment.targetSite}
          icon={Users}
          color={enrollmentColor}
        />
        <StatCard
          label="Phân ngẫu nhiên"
          actual={enrollment.randomized}
          target={enrollment.targetSite}
          icon={TrendingUp}
          color={randomColor}
        />
        <StatCard
          label="ICF ký"
          actual={enrollment.icfSigned}
          target={enrollment.targetSite}
          icon={CheckCircle2}
          color={enrollment.icfSigned ? "green" : "slate"}
        />
      </div>

      {/* Screening & Outcome Metrics */}
      {(enrollment.screenFailed || enrollment.discontinuedDeath || enrollment.onTreatment || enrollment.completedTreatment) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          {enrollment.screenFailed !== undefined && (
            <StatCard label="Sàng lọc thất bại" actual={enrollment.screenFailed} icon={AlertCircle} color="slate" />
          )}
          {enrollment.discontinuedDeath !== undefined && (
            <StatCard label="Ngưng NC (tử vong)" actual={enrollment.discontinuedDeath} icon={AlertCircle} color="red" />
          )}
          {enrollment.discontinuedDrugOnly !== undefined && (
            <StatCard label="Ngừng thuốc (tiếp tục)" actual={enrollment.discontinuedDrugOnly} icon={AlertCircle} color="amber" />
          )}
          {enrollment.onTreatment !== undefined && (
            <StatCard label="Đang điều trị" actual={enrollment.onTreatment} icon={Users} color="blue" />
          )}
          {enrollment.lostToFollowUp !== undefined && (
            <StatCard label="Mất theo dõi" actual={enrollment.lostToFollowUp} icon={AlertCircle} color="amber" />
          )}
          {enrollment.completedTreatment !== undefined && (
            <StatCard label="Hoàn tất điều trị" actual={enrollment.completedTreatment} icon={CheckCircle2} color="green" />
          )}
        </div>
      )}

      {/* Safety Monitoring */}
      {(enrollment.aeCount !== undefined || enrollment.saeCount !== undefined) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <StatCard
            label="Sự kiện không mong muốn (AE)"
            actual={enrollment.aeCount}
            icon={AlertCircle}
            color={aeWarning}
          />
          <StatCard
            label="Sự kiện nghiêm trọng (SAE)"
            actual={enrollment.saeCount}
            icon={AlertCircle}
            color={saeWarning}
          />
        </div>
      )}

      {/* Summary Stats */}
      {(enrollment.totalEnrolledAllSites || enrollment.targetTotal) && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Tổng toàn site: <span className="font-semibold text-slate-700 dark:text-slate-300">{enrollment.totalEnrolledAllSites}</span> / {enrollment.targetTotal}
          </p>
        </div>
      )}
    </div>
  );
}
