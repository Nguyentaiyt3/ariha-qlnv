"use client";

import { Clock, AlertTriangle } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { isOverdue, daysUntilDeadline } from "@/lib/utils";
import Link from "next/link";

export default function DeadlineAlertWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const urgent = tasks
    .filter((t) => {
      if (t.status === "done" || t.status === "cancelled" || !t.deadlineBase) return false;
      const days = daysUntilDeadline(t.deadlineBase);
      const isMyTask =
        t.mainPerformerId === currentUser?.id ||
        t.stakeholders.some((s) => s.userId === currentUser?.id);
      return isMyTask && days <= 5;
    })
    .sort((a, b) => {
      const da = daysUntilDeadline(a.deadlineBase!);
      const db = daysUntilDeadline(b.deadlineBase!);
      return da - db;
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5 mb-3">
        <Clock className="w-4 h-4 text-amber-500" />
        Sắp đến hạn
      </h3>
      <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
        {urgent.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Không có deadline gấp</p>
        ) : (
          urgent.map((t) => {
            const days = daysUntilDeadline(t.deadlineBase!);
            const overdue = days < 0;
            return (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${overdue ? "text-red-500" : days <= 1 ? "text-red-400" : "text-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--foreground)] truncate">{t.name}</p>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 ${overdue ? "text-red-600" : days <= 1 ? "text-red-500" : "text-amber-600"}`}>
                  {overdue ? `Trễ ${Math.abs(days)}n` : days === 0 ? "Hôm nay" : `${days}n`}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
