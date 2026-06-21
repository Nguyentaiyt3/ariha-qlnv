"use client";

import { useMemo, useRef } from "react";
import {
  addDays, differenceInDays, format, startOfMonth,
  endOfMonth, addMonths, parseISO, isValid,
} from "date-fns";
import { vi } from "date-fns/locale";
import { cn, avatarColor, getInitials, statusLabel } from "@/lib/utils";
import type { Task, User } from "@/types";

const STATUS_BAR: Record<string, { track: string; bar: string }> = {
  todo:        { track: "bg-slate-100 dark:bg-slate-700",      bar: "bg-slate-400" },
  in_progress: { track: "bg-blue-50 dark:bg-blue-900/20",      bar: "bg-blue-500" },
  review:      { track: "bg-amber-50 dark:bg-amber-900/20",    bar: "bg-amber-400" },
  done:        { track: "bg-green-50 dark:bg-green-900/20",    bar: "bg-green-500" },
  cancelled:   { track: "bg-slate-50 dark:bg-slate-800",       bar: "bg-slate-300 dark:bg-slate-600" },
};

const PRIORITY_BORDER: Record<string, string> = {
  low:    "border-l-slate-300",
  medium: "border-l-blue-400",
  high:   "border-l-orange-400",
  urgent: "border-l-red-500",
};

const ROW_H = 44; // px per task row
const HEADER_H = 56; // px header height
const LABEL_W = 220; // px left label column

interface Props {
  tasks: Task[];
  users: User[];
  onSelectTask: (task: Task) => void;
}

export function TaskGanttView({ tasks, users, onSelectTask }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);

  // Filter tasks with a deadline
  const ganttTasks = useMemo(
    () => tasks.filter((t) => t.deadlineBase && t.status !== "cancelled"),
    [tasks]
  );

  // Compute time range
  const { ganttStart, ganttEnd, totalDays, months } = useMemo(() => {
    if (ganttTasks.length === 0) {
      const s = startOfMonth(today);
      const e = endOfMonth(addMonths(today, 2));
      return { ganttStart: s, ganttEnd: e, totalDays: differenceInDays(e, s) + 1, months: buildMonths(s, e) };
    }

    const dates = ganttTasks.map((t) => {
      const start = t.createdAt ? parseISO(t.createdAt) : addDays(parseISO(t.deadlineBase), -14);
      const end   = parseISO(t.deadlineBase);
      return { start: isValid(start) ? start : today, end: isValid(end) ? end : today };
    });

    const minDate = dates.reduce((m, d) => (d.start < m ? d.start : m), dates[0].start);
    const maxDate = dates.reduce((m, d) => (d.end   > m ? d.end   : m), dates[0].end);

    // Pad: 1 week before first start, 2 weeks after last end
    const s = startOfMonth(addDays(minDate, -7));
    const e = endOfMonth(addDays(maxDate, 14));
    const total = differenceInDays(e, s) + 1;

    return { ganttStart: s, ganttEnd: e, totalDays: total, months: buildMonths(s, e) };
  }, [ganttTasks, today]);

  function pct(date: Date): number {
    return Math.max(0, Math.min(100, (differenceInDays(date, ganttStart) / totalDays) * 100));
  }

  function widthPct(start: Date, end: Date): number {
    const w = ((differenceInDays(end, start) + 1) / totalDays) * 100;
    return Math.max(0.5, w);
  }

  const todayPct = pct(today);

  if (ganttTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400">
        <p className="text-sm">Chưa có nhiệm vụ nào để hiển thị trên Gantt.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

      {/* Gantt body — sticky left label + scrollable right */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: task label column (fixed) */}
        <div className="shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700" style={{ width: LABEL_W }}>
          {/* Header spacer */}
          <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 flex items-center gap-2"
               style={{ height: HEADER_H }}>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nhiệm vụ</span>
            <span className="ml-auto text-xs text-slate-400">{ganttTasks.length}</span>
          </div>

          {/* Task labels */}
          <div className="overflow-y-auto flex-1">
            {ganttTasks.map((task) => {
              const performer = users.find((u) => u.id === task.mainPerformerId);
              const colors = STATUS_BAR[task.status] ?? STATUS_BAR.todo;
              return (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 text-left border-b border-slate-100 dark:border-slate-700/60 border-l-2 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition",
                    PRIORITY_BORDER[task.priority]
                  )}
                  style={{ height: ROW_H }}
                >
                  {performer && (
                    <div className={cn("w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white", avatarColor(performer.name))}>
                      {performer.avatar
                        ? <img src={performer.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                        : getInitials(performer.name)
                      }
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{task.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: timeline (scrollable horizontally) */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ minWidth: Math.max(800, totalDays * 3) }} className="h-full flex flex-col">

            {/* Month headers */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 shrink-0"
                 style={{ height: HEADER_H / 2 }}>
              {months.map((m) => (
                <div
                  key={m.label}
                  className="border-r border-slate-200 dark:border-slate-700 px-2 flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300"
                  style={{ width: `${(m.days / totalDays) * 100}%` }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Day tick row */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 shrink-0"
                 style={{ height: HEADER_H / 2 }}>
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = addDays(ganttStart, i);
                const isFirstOfWeek = d.getDay() === 1;
                const isTodayD = differenceInDays(d, today) === 0;
                return (
                  <div
                    key={i}
                    style={{ width: `${(1 / totalDays) * 100}%` }}
                    className={cn(
                      "border-r border-slate-100 dark:border-slate-700/40 flex items-center justify-center text-[8px]",
                      isTodayD   ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold" : "text-transparent",
                      isFirstOfWeek && !isTodayD ? "border-r border-slate-200 dark:border-slate-600" : ""
                    )}
                  >
                    {(isFirstOfWeek || isTodayD) ? format(d, "d") : ""}
                  </div>
                );
              })}
            </div>

            {/* Task rows */}
            <div className="flex-1 relative overflow-y-auto">
              {/* Today vertical line */}
              {todayPct > 0 && todayPct < 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-400 dark:bg-blue-500 z-10 pointer-events-none"
                  style={{ left: `${todayPct}%` }}
                />
              )}

              {ganttTasks.map((task) => {
                const taskStart = task.createdAt ? parseISO(task.createdAt) : addDays(parseISO(task.deadlineBase), -14);
                const taskEnd   = parseISO(task.deadlineBase);
                const validStart = isValid(taskStart) ? taskStart : today;
                const validEnd   = isValid(taskEnd)   ? taskEnd   : today;

                const leftP  = pct(validStart);
                const widthP = widthPct(validStart, validEnd);
                const progP  = Math.min(100, task.progress ?? 0);
                const colors = STATUS_BAR[task.status] ?? STATUS_BAR.todo;
                const isOverdue = validEnd < today && task.status !== "done";

                return (
                  <div
                    key={task.id}
                    className="relative border-b border-slate-100 dark:border-slate-700/60"
                    style={{ height: ROW_H }}
                  >
                    {/* Track + bar */}
                    <button
                      onClick={() => onSelectTask(task)}
                      className="absolute inset-y-0 flex items-center group"
                      style={{ left: `${leftP}%`, width: `${widthP}%`, minWidth: 8 }}
                    >
                      {/* Track background */}
                      <div className={cn("w-full rounded-md overflow-hidden group-hover:ring-2 ring-blue-400 transition", colors.track)}
                           style={{ height: 20 }}>
                        {/* Progress fill */}
                        <div
                          className={cn("h-full rounded-md transition-all", colors.bar, isOverdue && task.status !== "done" ? "opacity-70" : "")}
                          style={{ width: `${progP}%` }}
                        />
                      </div>

                      {/* Task name label on bar (if wide enough) */}
                      {widthP > 8 && (
                        <span className="absolute left-2 text-[10px] font-medium text-white dark:text-white truncate pointer-events-none"
                              style={{ textShadow: "0 0 4px rgba(0,0,0,0.5)", maxWidth: "90%" }}>
                          {task.name}
                        </span>
                      )}

                      {/* Overdue marker */}
                      {isOverdue && (
                        <span className="absolute -top-1 right-0 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white dark:ring-slate-800" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex-wrap">
        <span className="text-xs text-slate-400">Thanh tiến độ theo màu trạng thái:</span>
        {(["todo","in_progress","review","done"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn("w-3 h-2.5 rounded-sm", STATUS_BAR[s].bar)} />
            {statusLabel(s)}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-blue-500 ml-auto">
          <span className="w-0.5 h-4 bg-blue-400 inline-block" /> Hôm nay
        </span>
        <span className="flex items-center gap-1.5 text-xs text-red-500">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Trễ hạn
        </span>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function buildMonths(start: Date, end: Date): { label: string; days: number }[] {
  const months: { label: string; days: number }[] = [];
  let cursor = startOfMonth(start);
  while (cursor <= end) {
    const mEnd = endOfMonth(cursor);
    const clampEnd = mEnd < end ? mEnd : end;
    const clampStart = cursor < start ? start : cursor;
    months.push({
      label: format(cursor, "MMMM yyyy", { locale: vi }),
      days: differenceInDays(clampEnd, clampStart) + 1,
    });
    cursor = addMonths(cursor, 1);
  }
  return months;
}
