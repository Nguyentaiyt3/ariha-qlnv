"use client";

import { useMemo } from "react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useDashboardFilter } from "@/stores/useDashboardFilter";
import { Target, TrendingUp, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BAR_COLORS = [
  "#3B82F6", "#8B5CF6", "#06B6D4", "#22C55E",
  "#F59E0B", "#EC4899", "#64748B", "#EF4444",
];

interface Group {
  name: string;
  total: number;
  done: number;
  inProgress: number;
  rate: number;
}

export default function AnnualKPIWidget() {
  const { tasks } = useTaskStore();
  const { year, mode } = useDashboardFilter();

  // Use selected year when mode==="year", otherwise current year
  const targetYear = mode === "year" ? year : new Date().getFullYear();

  const { groups, totalTasks, totalDone, overallRate } = useMemo(() => {
    const yearStr = String(targetYear);
    const yearTasks = tasks.filter(
      (t) => t.deadlineBase?.startsWith(yearStr) || t.createdAt?.startsWith(yearStr),
    );

    // Group by workflowName → department → "Chưa phân loại"
    const map = new Map<string, typeof yearTasks>();
    for (const t of yearTasks) {
      const key = t.workflowName?.trim() || t.department?.trim() || "Chưa phân loại";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    const groups: Group[] = Array.from(map.entries())
      .map(([name, ts]) => {
        const active = ts.filter((t) => t.status !== "cancelled");
        const done = active.filter((t) => t.status === "done").length;
        const inProgress = active.filter((t) => t.status === "in_progress").length;
        return {
          name,
          total: active.length,
          done,
          inProgress,
          rate: active.length > 0 ? Math.round((done / active.length) * 100) : 0,
        };
      })
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);

    const totalTasks = groups.reduce((s, g) => s + g.total, 0);
    const totalDone  = groups.reduce((s, g) => s + g.done, 0);
    const overallRate = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

    return { groups, totalTasks, totalDone, overallRate };
  }, [tasks, targetYear]);

  const accentColor = overallRate >= 70 ? "#22C55E" : overallRate >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div className="flex flex-col h-full p-3 sm:p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <Target className="w-4 h-4 text-blue-500" />
          <h3 className="font-bold text-sm text-[var(--foreground)]">
            KPI Kế hoạch {targetYear}
          </h3>
        </div>
        <Link href="/tasks" className="text-[10px] text-[var(--muted-foreground)] hover:text-blue-500 transition-colors">
          Chi tiết →
        </Link>
      </div>

      {/* Overall summary */}
      <div
        className="shrink-0 rounded-xl px-3 py-2 flex items-center gap-3"
        style={{ background: `${accentColor}12` }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[var(--muted-foreground)]">Tổng tiến độ năm</span>
            <span className="text-sm font-bold" style={{ color: accentColor }}>{overallRate}%</span>
          </div>
          <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${overallRate}%`, background: accentColor }}
            />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-[var(--foreground)] leading-none">{totalDone}<span className="text-[var(--muted-foreground)] text-xs">/{totalTasks}</span></p>
          <p className="text-[9px] text-[var(--muted-foreground)]">hoàn thành</p>
        </div>
      </div>

      {/* Group list */}
      {groups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <TrendingUp className="w-8 h-8 text-[var(--border)]" />
          <p className="text-xs text-[var(--muted-foreground)]">Chưa có nhiệm vụ nào trong năm {targetYear}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
          {groups.map((g, i) => {
            const color = BAR_COLORS[i % BAR_COLORS.length];
            return (
              <div key={g.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-[11px] font-medium text-[var(--foreground)] truncate" title={g.name}>
                      {g.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {g.done > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        {g.done}
                      </span>
                    )}
                    <span className="text-[10px] font-bold" style={{ color }}>
                      {g.rate}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${g.rate}%`, background: color }}
                  />
                </div>
                <p className="text-[9px] text-[var(--muted-foreground)]">
                  {g.done}/{g.total} hoàn thành
                  {g.inProgress > 0 && ` · ${g.inProgress} đang thực hiện`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
