"use client";

import { Calendar, ArrowRight } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useMemo } from "react";
import { format, addDays, isToday, isTomorrow } from "date-fns";
import { vi } from "date-fns/locale";
import Link from "next/link";

export default function CalendarMiniWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const upcoming = useMemo(() => {
    const now = new Date();
    const in7days = addDays(now, 7);
    return tasks
      .filter((t) => {
        if (t.status === "done" || t.status === "cancelled" || !t.deadlineBase) return false;
        const d = new Date(t.deadlineBase);
        const mine =
          t.mainPerformerId === currentUser?.id ||
          (t.stakeholders ?? []).some((s) => s.userId === currentUser?.id);
        return mine && d >= now && d <= in7days;
      })
      .sort((a, b) => new Date(a.deadlineBase!).getTime() - new Date(b.deadlineBase!).getTime())
      .slice(0, 6);
  }, [tasks, currentUser]);

  const dateLabel = (iso: string) => {
    const d = new Date(iso);
    if (isToday(d)) return "Hôm nay";
    if (isTomorrow(d)) return "Ngày mai";
    return format(d, "EEE dd/MM", { locale: vi });
  };

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5 mb-3">
        <Calendar className="w-4 h-4 text-blue-500" />
        7 ngày tới
      </h3>
      <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
        {upcoming.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Không có deadline trong 7 ngày</p>
        ) : (
          upcoming.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              className="flex items-center gap-2 group hover:bg-[var(--muted)] p-1.5 rounded-lg transition-colors"
            >
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex-shrink-0 w-20 text-center">
                {dateLabel(t.deadlineBase!)}
              </span>
              <p className="text-xs text-[var(--foreground)] truncate">{t.name}</p>
            </Link>
          ))
        )}
      </div>
      <Link href="/calendar" className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline">
        Xem lịch đầy đủ <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
