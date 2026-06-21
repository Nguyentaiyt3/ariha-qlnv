"use client";

import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import type { View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { vi } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { cn } from "@/lib/utils";
import type { Task, User } from "@/types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { vi },
});

const PRIORITY_COLOR: Record<string, string> = {
  low:    "#94a3b8",
  medium: "#3b82f6",
  high:   "#f97316",
  urgent: "#ef4444",
};

const STATUS_COLOR: Record<string, string> = {
  todo:        "#94a3b8",
  in_progress: "#3b82f6",
  review:      "#f59e0b",
  done:        "#22c55e",
  cancelled:   "#cbd5e1",
};

const MESSAGES = {
  today:              "Hôm nay",
  previous:           "‹",
  next:               "›",
  month:              "Tháng",
  week:               "Tuần",
  day:                "Ngày",
  agenda:             "Lịch biểu",
  noEventsInRange:    "Không có nhiệm vụ nào trong khoảng này",
  showMore:           (n: number) => `+${n} nhiệm vụ`,
};

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: Task;
}

interface Props {
  tasks: Task[];
  users: User[];
  onSelectTask: (task: Task) => void;
}

export function TaskCalendarView({ tasks, users, onSelectTask }: Props) {
  const [view, setView]   = useState<View>("month");
  const [date, setDate]   = useState(new Date());

  const events = useMemo<CalEvent[]>(() =>
    tasks
      .filter((t) => t.deadlineBase)
      .map((t) => {
        const d = new Date(t.deadlineBase);
        return { id: t.id, title: t.name, start: d, end: d, allDay: true, resource: t };
      }),
  [tasks]);

  function eventStyleGetter(event: CalEvent) {
    const t = event.resource;
    const color = t.status === "done"
      ? STATUS_COLOR.done
      : t.riskFlag
      ? "#ef4444"
      : PRIORITY_COLOR[t.priority] ?? "#3b82f6";
    return {
      style: {
        backgroundColor: color,
        borderRadius: "6px",
        border: "none",
        color: "#fff",
        fontSize: "11px",
        padding: "2px 6px",
        opacity: t.status === "cancelled" ? 0.45 : 1,
      },
    };
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Màu theo độ ưu tiên:</span>
        {[
          { label: "Thấp",     color: PRIORITY_COLOR.low    },
          { label: "Trung bình", color: PRIORITY_COLOR.medium },
          { label: "Cao",      color: PRIORITY_COLOR.high   },
          { label: "Khẩn cấp", color: PRIORITY_COLOR.urgent },
        ].map((p) => (
          <span key={p.label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
            {p.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-sm inline-block bg-green-500" />
          Hoàn thành
        </span>
      </div>

      {/* Calendar */}
      <div className="flex-1 p-4 rbc-container">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%" }}
          view={view}
          date={date}
          onNavigate={setDate}
          onView={(v) => setView(v)}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={(e) => onSelectTask(e.resource)}
          culture="vi"
          messages={MESSAGES}
          popup
        />
      </div>
    </div>
  );
}
