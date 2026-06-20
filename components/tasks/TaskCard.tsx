"use client";

import { AlertTriangle, Clock, User, Calendar, Flag, CheckSquare } from "lucide-react";
import { cn, formatDate, daysUntilDeadline, statusLabel, priorityLabel, getInitials, avatarColor, truncate } from "@/lib/utils";
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
  const performer = users.find((u) => u.id === task.mainPerformerId);
  const days = task.deadlineBase ? daysUntilDeadline(task.deadlineBase) : null;
  const isOverdue = days !== null && days < 0 && task.status !== "done" && task.status !== "cancelled";
  const isNear = days !== null && days >= 0 && days <= 2 && task.status !== "done";
  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;

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
        {task.riskFlag && (
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 risk-pulse" />
        )}
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_COLORS[task.status])}>
          {statusLabel(task.status)}
        </span>
        {task.department && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
            {task.department}
          </span>
        )}
        {!task.approved && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700">
            Chờ phê duyệt
          </span>
        )}
      </div>

      {/* Progress bar */}
      {task.progress > 0 && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400">Tiến độ</span>
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{task.progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                task.progress >= 100 ? "bg-green-500" : task.riskFlag ? "bg-red-500" : "bg-blue-500"
              )}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        {/* Performer avatar */}
        {performer && (
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white",
              avatarColor(performer.name)
            )}>
              {performer.avatar
                ? <img src={performer.avatar} alt={performer.name} className="w-full h-full rounded-full object-cover" />
                : getInitials(performer.name)
              }
            </div>
            <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{performer.name}</span>
          </div>
        )}

        {/* Deadline */}
        {task.deadlineBase && (
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
    </div>
  );
}
