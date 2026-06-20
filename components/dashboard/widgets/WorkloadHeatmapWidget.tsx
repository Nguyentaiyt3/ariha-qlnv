"use client";

import { useTaskStore } from "@/stores/useTaskStore";
import { useMemo } from "react";
import { Flame } from "lucide-react";
import { getInitials, avatarColor } from "@/lib/utils";

export default function WorkloadHeatmapWidget() {
  const { tasks, users } = useTaskStore();

  const workload = useMemo(() => {
    return users
      .filter((u) => u.isActive && u.role !== "guest")
      .map((u) => {
        const active = tasks.filter(
          (t) =>
            t.status !== "done" &&
            t.status !== "cancelled" &&
            (t.mainPerformerId === u.id || t.stakeholders.some((s) => s.userId === u.id && s.role === "assignee")),
        );
        const risk = active.filter((t) => t.riskFlag).length;
        return { user: u, count: active.length, risk };
      })
      .filter((w) => w.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [tasks, users]);

  const maxCount = Math.max(...workload.map((w) => w.count), 1);

  const heatColor = (count: number, max: number) => {
    const ratio = count / max;
    if (ratio >= 0.8) return "bg-red-500";
    if (ratio >= 0.6) return "bg-orange-400";
    if (ratio >= 0.4) return "bg-amber-400";
    if (ratio >= 0.2) return "bg-blue-400";
    return "bg-blue-200";
  };

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5 mb-3">
        <Flame className="w-4 h-4 text-orange-500" />
        Phân bổ công việc
      </h3>
      <div className="space-y-1.5 flex-1 overflow-y-auto min-h-0">
        {workload.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Chưa có dữ liệu</p>
        ) : (
          workload.map(({ user, count, risk }) => (
            <div key={user.id} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: avatarColor(user.name) }}
              >
                {getInitials(user.name)}
              </div>
              <p className="text-xs text-[var(--foreground)] w-20 truncate flex-shrink-0">{user.name.split(" ").pop()}</p>
              <div className="flex-1 bg-[var(--muted)] rounded-full h-3.5 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${heatColor(count, maxCount)}`}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-[var(--muted-foreground)] w-5 text-right">{count}</span>
              {risk > 0 && (
                <span className="text-xs text-red-500 font-medium">⚠{risk}</span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200 inline-block" />Thấp</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Trung bình</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Cao</span>
      </div>
    </div>
  );
}
