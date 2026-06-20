"use client";

import { CheckSquare, AlertTriangle, ArrowRight } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { statusLabel, isOverdue, isNearDeadline } from "@/lib/utils";
import Link from "next/link";

export default function MyTasksWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const myTasks = tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "cancelled" &&
        (t.mainPerformerId === currentUser?.id ||
          t.stakeholders.some((s) => s.userId === currentUser?.id && s.role === "assignee")),
    )
    .sort((a, b) => {
      if (a.riskFlag && !b.riskFlag) return -1;
      if (!a.riskFlag && b.riskFlag) return 1;
      return 0;
    })
    .slice(0, 6);

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4 text-blue-500" />
          Nhiệm vụ của tôi
        </h3>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
          {myTasks.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto min-h-0">
        {myTasks.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Không có nhiệm vụ nào</p>
        ) : (
          myTasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors group"
            >
              {t.riskFlag && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--foreground)] truncate">{t.name}</p>
                <p className={`text-xs ${isOverdue(t.deadlineBase) ? "text-red-500" : isNearDeadline(t.deadlineBase) ? "text-amber-500" : "text-[var(--muted-foreground)]"}`}>
                  {t.deadlineBase
                    ? isOverdue(t.deadlineBase)
                      ? "Đã quá hạn"
                      : `Còn ${Math.ceil((new Date(t.deadlineBase).getTime() - Date.now()) / 86400000)} ngày`
                    : "—"}
                </p>
              </div>
              <div className="w-10 bg-[var(--muted)] rounded-full h-1.5 flex-shrink-0">
                <div
                  className={`h-1.5 rounded-full ${t.progress === 100 ? "bg-green-500" : t.riskFlag ? "bg-red-500" : "bg-blue-500"}`}
                  style={{ width: `${t.progress}%` }}
                />
              </div>
            </Link>
          ))
        )}
      </div>
      <Link href="/tasks" className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline">
        Xem tất cả <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
