"use client";

import { useMemo } from "react";
import { useTaskStore } from "@/stores/useTaskStore";
import { format, differenceInDays, parseISO, startOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import Link from "next/link";
import { isOverdue } from "@/lib/utils";

const MONTHS_TO_SHOW = 3;
const DAY_WIDTH = 20; // px per day

export default function GanttPage() {
  const { tasks } = useTaskStore();

  const activeTasks = tasks.filter(
    (t) => t.status !== "cancelled" && t.deadlineBase,
  );

  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(1); // start of current month
  const end = new Date(start);
  end.setMonth(end.getMonth() + MONTHS_TO_SHOW);

  const totalDays = differenceInDays(end, start);

  // Build month headers
  const monthHeaders: { label: string; days: number }[] = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const daysVisible = Math.min(daysInMonth, differenceInDays(end, cursor));
    monthHeaders.push({ label: format(cursor, "MMMM yyyy", { locale: vi }), days: daysVisible });
    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(1);
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Gantt Chart</h1>
        <Link href="/tasks" className="text-sm text-blue-600 hover:underline">← Kanban</Link>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: totalDays * DAY_WIDTH + 220 }}>
          {/* Header: months */}
          <div className="flex">
            <div className="w-[220px] flex-shrink-0" />
            {monthHeaders.map((m, i) => (
              <div
                key={i}
                className="text-xs font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] border-r border-[var(--border)] flex items-center justify-center"
                style={{ width: m.days * DAY_WIDTH, height: 28 }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Today marker position */}
          {(() => {
            const todayOffset = differenceInDays(today, start);
            const todayX = 220 + todayOffset * DAY_WIDTH;
            return (
              <div className="relative">
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none"
                  style={{ left: todayX }}
                />

                {/* Task rows */}
                {activeTasks.length === 0 ? (
                  <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">Không có nhiệm vụ nào</div>
                ) : (
                  activeTasks.map((task, idx) => {
                    const deadline = parseISO(task.deadlineBase!);
                    const taskStart = task.deadlinePrepare ? parseISO(task.deadlinePrepare) : startOfDay(deadline);
                    const taskEnd = task.deadlineFinalize ? parseISO(task.deadlineFinalize) : deadline;

                    const startOffset = Math.max(0, differenceInDays(taskStart, start));
                    const endOffset = Math.min(totalDays, differenceInDays(taskEnd, start) + 1);
                    const barWidth = Math.max(1, endOffset - startOffset) * DAY_WIDTH;
                    const barLeft = startOffset * DAY_WIDTH;

                    const overdue = isOverdue(task.deadlineBase);

                    return (
                      <div
                        key={task.id}
                        className={`flex items-center border-b border-[var(--border)] ${idx % 2 === 0 ? "bg-[var(--card)]" : "bg-[var(--muted)]"}`}
                        style={{ height: 38 }}
                      >
                        {/* Task name */}
                        <Link
                          href={`/tasks/${task.id}`}
                          className="w-[220px] flex-shrink-0 px-3 text-xs font-medium text-[var(--foreground)] truncate hover:text-blue-600"
                        >
                          {task.riskFlag && <span className="text-red-500 mr-1">⚠</span>}
                          {task.name}
                        </Link>

                        {/* Gantt bar */}
                        <div className="relative flex-1" style={{ height: 38 }}>
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-5 rounded flex items-center px-2 text-xs text-white font-medium overflow-hidden whitespace-nowrap ${
                              overdue ? "bg-red-500" : task.riskFlag ? "bg-orange-500" : "bg-blue-500"
                            }`}
                            style={{ left: barLeft, width: barWidth }}
                          >
                            {task.progress}%
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-[var(--muted-foreground)]">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" />Đang tiến hành</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500" />Rủi ro</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" />Quá hạn</div>
        <div className="flex items-center gap-1.5"><span className="w-0.5 h-4 bg-blue-500" />Hôm nay</div>
      </div>
    </div>
  );
}
