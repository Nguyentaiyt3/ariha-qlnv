"use client";

import { Trophy } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useMemo } from "react";
import { getInitials, avatarColor } from "@/lib/utils";

export default function TeamLeaderboardWidget() {
  const { tasks, users } = useTaskStore();

  const scores = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return users
      .filter((u) => u.isActive && u.role !== "guest")
      .map((u) => {
        const myTasks = tasks.filter(
          (t) =>
            (t.mainPerformerId === u.id || (t.stakeholders ?? []).some((s) => s.userId === u.id && s.role === "assignee")) &&
            t.deadlineBase &&
            new Date(t.deadlineBase) >= monthStart,
        );
        const done = myTasks.filter((t) => t.status === "done");
        const rate = myTasks.length > 0 ? Math.round((done.length / myTasks.length) * 100) : 0;
        return { user: u, rate, total: myTasks.length, done: done.length };
      })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }, [tasks, users]);

  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5 mb-3">
        <Trophy className="w-4 h-4 text-amber-500" />
        Xếp hạng nhóm (tháng này)
      </h3>
      <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
        {scores.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Chưa có dữ liệu</p>
        ) : (
          scores.map(({ user, rate, total, done }, i) => (
            <div key={user.id} className="flex items-center gap-2.5">
              <span className="text-base w-5 text-center">{MEDALS[i] ?? `${i + 1}.`}</span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: avatarColor(user.name) }}
              >
                {getInitials(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--foreground)] truncate">{user.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex-1 bg-[var(--muted)] rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-green-500"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)] flex-shrink-0">{done}/{total}</span>
                </div>
              </div>
              <span className="text-xs font-bold text-green-600 w-9 text-right">{rate}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
