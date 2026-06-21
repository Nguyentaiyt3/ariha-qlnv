"use client";

import { AlertTriangle, Clock, CheckSquare, Star, Timer } from "lucide-react";
import { cn, formatDate, daysUntilDeadline, statusLabel, getInitials, avatarColor } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Task, User as UserType } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-600",
};

interface TaskCardProps {
  task: Task;
  users: UserType[];
  onClick?: () => void;
  isDragging?: boolean;
  className?: string;
}

export function TaskCard({ task, users, onClick, isDragging, className }: TaskCardProps) {
  const { currentUser } = useAuthStore();
  const performer = users.find((u) => u.id === task.mainPerformerId);

  // Current user's role in this task
  const myRole = (() => {
    if (!currentUser) return null;
    if (task.mainPerformerId === currentUser.id)
      return { label: "Thực hiện chính", cls: "bg-blue-600 text-white" };
    const s = (task.stakeholders ?? []).find((s) => s.userId === currentUser.id);
    if (!s) return null;
    if (s.role === "approver")    return { label: "Phê duyệt", cls: "bg-amber-500 text-white" };
    if (s.role === "assignee")    return { label: "Hỗ trợ",    cls: "bg-violet-500 text-white" };
    if (s.role === "collaborator")return { label: "Cộng tác",  cls: "bg-indigo-500 text-white" };
    return null; // watcher — không hiện
  })();
  const days = task.deadlineBase ? daysUntilDeadline(task.deadlineBase) : null;
  const isOverdue = days !== null && days < 0 && task.status !== "done" && task.status !== "cancelled";
  const isNear = days !== null && days >= 0 && days <= 2 && task.status !== "done";
  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;

  // Stakeholder avatars (exclude main performer & watchers)
  const stakeholderUsers = (task.stakeholders ?? [])
    .filter((s) => s.userId !== task.mainPerformerId && s.role !== "watcher")
    .map((s) => users.find((u) => u.id === s.userId))
    .filter(Boolean) as UserType[];
  const visibleStakeholders = stakeholderUsers.slice(0, 3);
  const extraCount = stakeholderUsers.length - visibleStakeholders.length;

  // Steps completion — count as done if status="completed" OR progress≥100
  const totalSteps = task.steps?.length ?? 0;
  const completedSteps = task.steps?.filter(
    (s) => s.status === "completed" || (s.progress ?? 0) >= 100
  ).length ?? 0;

  // Effective performance rate:
  //   1. kpi.current/target when explicitly tracked (current > 0)
  //   2. average step progress when steps exist
  //   3. task.progress as final fallback
  const avgStepProgress = totalSteps > 0
    ? Math.round((task.steps ?? []).reduce((sum, s) => sum + (s.progress ?? 0), 0) / totalSteps)
    : null;

  const kpiRate = (() => {
    if (task.kpi?.target > 0 && task.kpi.current > 0) {
      return Math.round((task.kpi.current / task.kpi.target) * 100);
    }
    if (avgStepProgress !== null) return avgStepProgress;
    return task.progress > 0 ? task.progress : null;
  })();

  // Show raw kpi detail only when explicitly tracked
  const showKpiDetail = (task.kpi?.target ?? 0) > 0 && task.kpi.current > 0;

  const kpiBarColor =
    kpiRate === null ? "" :
    kpiRate >= 100 ? "bg-green-500" :
    kpiRate >= 70  ? "bg-blue-500" :
    kpiRate >= 40  ? "bg-amber-500" :
    "bg-red-500";
  const kpiTextColor =
    kpiRate === null ? "" :
    kpiRate >= 100 ? "text-green-600 dark:text-green-400" :
    kpiRate >= 70  ? "text-blue-600 dark:text-blue-400" :
    kpiRate >= 40  ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";
  const kpiStatusLabel =
    kpiRate === null ? "" :
    kpiRate >= 100 ? "Đạt KPI" :
    kpiRate >= 70  ? "Gần đạt" :
    kpiRate >= 40  ? "Đang phấn đấu" :
    "Chưa đạt";

  // Time logged
  const totalMinutes = (task.timeLogs ?? []).reduce((s, l) => s + l.minutes, 0);
  const timeLabel = totalMinutes > 0
    ? `${Math.floor(totalMinutes / 60) > 0 ? `${Math.floor(totalMinutes / 60)}h ` : ""}${totalMinutes % 60 > 0 ? `${totalMinutes % 60}p` : ""}`.trim()
    : null;

  // Schedule status
  const scheduleStatus = (() => {
    if (!task.deadlineBase || task.status === "cancelled") return null;
    if (task.status === "done") return days !== null && days >= 0 ? "ahead" : "late";
    if (isOverdue) return "late";
    if (isNear) return "near";
    return "ontrack";
  })();

  const SCHEDULE_META: Record<string, { label: string; cls: string }> = {
    ahead:   { label: "Trước hạn",    cls: "text-green-500" },
    late:    { label: "Trễ hạn",      cls: "text-red-500" },
    near:    { label: "Sắp đến hạn",  cls: "text-amber-500" },
    ontrack: { label: "Đúng tiến độ", cls: "text-slate-400 dark:text-slate-500" },
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 cursor-pointer",
        "hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200",
        isDragging && "shadow-2xl scale-105 rotate-2 opacity-90",
        task.riskFlag && "border-l-2 border-l-red-500",
        className
      )}
    >
      {/* Top row: priority dot + title + risk badge */}
      <div className="flex items-start gap-2">
        <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", PRIORITY_DOT[task.priority])} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white leading-snug line-clamp-2">
            {task.name}
          </p>
          {task.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {myRole && (
            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold leading-none", myRole.cls)}>
              {myRole.label}
            </span>
          )}
          {task.riskFlag && (
            <AlertTriangle className="w-4 h-4 text-red-500 risk-pulse" />
          )}
        </div>
      </div>

      {/* Tags + metrics row — all badges on one line */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {/* Trạng thái */}
        {task.approved && (
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_COLORS[task.status])}>
            {statusLabel(task.status)}
          </span>
        )}
        {!task.approved && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700">
            Chờ phê duyệt
          </span>
        )}
        {task.department && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
            {task.department}
          </span>
        )}

        {/* Tiến độ % */}
        {task.progress > 0 && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
            task.progress >= 100
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : task.progress >= 70
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : task.progress >= 40
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {task.progress}%
          </span>
        )}

        {/* Hiệu suất % */}
        {kpiRate !== null && (
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums border",
              kpiRate >= 100
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                : kpiRate >= 70
                ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                : kpiRate >= 40
                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                : "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
            )}
            title={showKpiDetail
              ? `KPI: ${task.kpi.current}/${task.kpi.target} ${task.kpi.unit}`
              : avgStepProgress !== null ? "Trung bình các bước" : "Tiến độ tổng thể"}
          >
            HS {kpiRate}%
          </span>
        )}

        {/* Bước */}
        {totalSteps > 0 && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-semibold",
            completedSteps === totalSteps
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
          )}>
            {completedSteps}/{totalSteps} bước
          </span>
        )}

        {/* Giờ làm */}
        {timeLabel && (
          <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            <Timer className="w-2.5 h-2.5" />{timeLabel}
          </span>
        )}
      </div>

      {/* Footer: avatar stack + deadline */}
      <div className="flex items-center justify-between mt-3">
        {/* Avatar stack: performer + stakeholders */}
        <div className="flex -space-x-1.5">
          {performer && (
            <div
              title={performer.name}
              className={cn(
                "w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-800 flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                avatarColor(performer.name)
              )}
            >
              {performer.avatar
                ? <img src={performer.avatar} alt={performer.name} className="w-full h-full rounded-full object-cover" />
                : getInitials(performer.name)
              }
            </div>
          )}
          {visibleStakeholders.map((u) => (
            <div
              key={u.id}
              title={u.name}
              className={cn(
                "w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-800 flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                avatarColor(u.name)
              )}
            >
              {u.avatar
                ? <img src={u.avatar} alt={u.name} className="w-full h-full rounded-full object-cover" />
                : getInitials(u.name)
              }
            </div>
          ))}
          {extraCount > 0 && (
            <div className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-800 bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-[9px] font-bold text-slate-500 dark:text-slate-300 shrink-0">
              +{extraCount}
            </div>
          )}
        </div>

        {/* Deadline + schedule status */}
        {task.deadlineBase && (
          <div className="flex flex-col items-end gap-0.5">
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              isOverdue ? "text-red-500" : isNear ? "text-amber-500" : "text-slate-400"
            )}>
              <Clock className="w-3 h-3" />
              {isOverdue
                ? `Trễ ${Math.abs(days!)} ngày`
                : days === 0
                ? "Hôm nay"
                : days! > 0
                ? `${days} ngày`
                : formatDate(task.deadlineBase)
              }
            </div>
            {scheduleStatus && (
              <span className={cn("text-[9px] font-semibold leading-none", SCHEDULE_META[scheduleStatus].cls)}>
                {SCHEDULE_META[scheduleStatus].label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Subtasks indicator */}
      {totalSubtasks > 0 && (
        <div className="flex items-center gap-1 mt-2">
          <CheckSquare className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] text-slate-400">
            {completedSubtasks}/{totalSubtasks} việc con
          </span>
        </div>
      )}

      {/* Evaluation rating */}
      {task.evaluationRating != null && task.evaluationRating > 0 && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <span className="text-[9px] text-slate-400 mr-0.5">Đánh giá:</span>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={cn(
                "w-3 h-3",
                i <= task.evaluationRating! ? "fill-amber-400 text-amber-400" : "text-slate-200 dark:text-slate-600"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
