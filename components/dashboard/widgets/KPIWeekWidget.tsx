"use client";

import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useMemo } from "react";

export default function KPIWeekWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const stats = useMemo(() => {
    if (!currentUser) return null;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const myTasks = tasks.filter(
      (t) =>
        t.mainPerformerId === currentUser.id ||
        t.stakeholders.some((s) => s.userId === currentUser.id && s.role === "assignee"),
    );

    const thisWeek = myTasks.filter(
      (t) => t.deadlineBase && new Date(t.deadlineBase) >= weekStart,
    );

    const done = thisWeek.filter((t) => t.status === "done").length;
    const total = thisWeek.length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const risk = myTasks.filter((t) => t.riskFlag && t.status !== "done").length;
    const avgProgress = myTasks.length > 0
      ? Math.round(myTasks.reduce((s, t) => s + t.progress, 0) / myTasks.length)
      : 0;

    return { done, total, rate, risk, avgProgress };
  }, [currentUser, tasks]);

  if (!stats) return null;

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5 mb-3">
        <BarChart3 className="w-4 h-4 text-blue-500" />
        KPI tuần này
      </h3>
      <div className="grid grid-cols-2 gap-2 flex-1">
        <div className="bg-blue-50 rounded-lg p-3 flex flex-col justify-center">
          <p className="text-2xl font-bold text-blue-700">{stats.done}<span className="text-sm text-blue-400">/{stats.total}</span></p>
          <p className="text-xs text-blue-600 mt-0.5">Nhiệm vụ xong</p>
        </div>
        <div className={`rounded-lg p-3 flex flex-col justify-center ${stats.rate >= 70 ? "bg-green-50" : "bg-amber-50"}`}>
          <p className={`text-2xl font-bold ${stats.rate >= 70 ? "text-green-700" : "text-amber-700"}`}>{stats.rate}%</p>
          <p className={`text-xs mt-0.5 ${stats.rate >= 70 ? "text-green-600" : "text-amber-600"}`}>Tỷ lệ hoàn thành</p>
        </div>
        <div className="bg-[var(--muted)] rounded-lg p-3 flex flex-col justify-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{stats.avgProgress}%</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Trung bình tiến độ</p>
        </div>
        <div className={`rounded-lg p-3 flex flex-col justify-center ${stats.risk > 0 ? "bg-red-50" : "bg-green-50"}`}>
          <p className={`text-2xl font-bold ${stats.risk > 0 ? "text-red-700" : "text-green-700"}`}>{stats.risk}</p>
          <p className={`text-xs mt-0.5 ${stats.risk > 0 ? "text-red-600" : "text-green-600"}`}>Rủi ro</p>
        </div>
      </div>
    </div>
  );
}
