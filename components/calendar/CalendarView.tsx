"use client";

import { useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer, Views, View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import type { Task, CalendarEvent } from "@/types";
import { useRouter } from "next/navigation";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales: { vi },
});

export interface BigCalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    type: "internal" | "google";
    taskId?: string;
    color?: string;
    isOverdue?: boolean;
  };
}

interface Props {
  internalEvents: BigCalEvent[];
  googleEvents: BigCalEvent[];
  showGoogle: boolean;
  onRangeChange?: (start: Date, end: Date) => void;
}

const EVENT_COLORS = {
  internal: "#3b82f6",
  google: "#ea4335",
  overdue: "#ef4444",
};

export default function CalendarView({ internalEvents, googleEvents, showGoogle, onRangeChange }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const allEvents = showGoogle ? [...internalEvents, ...googleEvents] : internalEvents;

  const eventStyleGetter = useCallback(
    (event: BigCalEvent) => {
      const bg = event.resource.isOverdue
        ? EVENT_COLORS.overdue
        : event.resource.type === "google"
        ? EVENT_COLORS.google
        : event.resource.color ?? EVENT_COLORS.internal;
      return {
        style: {
          backgroundColor: bg,
          borderRadius: "6px",
          border: "none",
          color: "#fff",
          fontSize: "12px",
          padding: "2px 6px",
        },
      };
    },
    [],
  );

  const handleSelectEvent = useCallback(
    (event: BigCalEvent) => {
      if (event.resource.taskId) {
        router.push(`/tasks/${event.resource.taskId}`);
      }
    },
    [router],
  );

  const handleRangeChange = useCallback(
    (range: Date[] | { start: Date; end: Date }) => {
      if (!onRangeChange) return;
      if (Array.isArray(range)) {
        onRangeChange(range[0], range[range.length - 1]);
      } else {
        onRangeChange(range.start, range.end);
      }
    },
    [onRangeChange],
  );

  return (
    <div className="h-full min-h-[600px]">
      <Calendar
        localizer={localizer}
        events={allEvents}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        onSelectEvent={handleSelectEvent}
        onRangeChange={handleRangeChange}
        eventPropGetter={eventStyleGetter}
        culture="vi"
        messages={{
          today: "Hôm nay",
          previous: "←",
          next: "→",
          month: "Tháng",
          week: "Tuần",
          day: "Ngày",
          agenda: "Lịch trình",
          noEventsInRange: "Không có sự kiện nào",
          allDay: "Cả ngày",
          showMore: (total) => `+${total} thêm`,
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
