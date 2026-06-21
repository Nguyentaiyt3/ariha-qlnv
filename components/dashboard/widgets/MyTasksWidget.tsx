"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { isOverdue } from "@/lib/utils";
import Link from "next/link";
import type { Task } from "@/types";
import { useContainerWidth } from "@/hooks/useContainerWidth";

// ── Palette ──────────────────────────────────────────────────────
const P = {
  purple: "#8B5CF6", cyan: "#06B6D4", amber: "#F59E0B",
  green:  "#22C55E", slate: "#94A3B8", pink:  "#EC4899",
};

const STATUS_ITEMS = [
  { key: "done",        label: "Hoàn thành",     color: P.green  },
  { key: "in_progress", label: "Đang thực hiện", color: P.purple },
  { key: "review",      label: "Xét duyệt",      color: P.cyan   },
  { key: "todo",        label: "Chờ thực hiện",  color: P.slate  },
] as const;

// ── Stat badge ────────────────────────────────────────────────────
function StatBadge({ label, value, color, compact = false }: {
  label: string; value: number; color: string; compact?: boolean;
}) {
  return (
    <div className="flex-1 rounded-xl flex flex-col items-center justify-center gap-0.5" style={{ background: `${color}12`, padding: compact ? "6px 4px" : "8px 6px" }}>
      <span className={`${compact ? "text-base" : "text-lg"} font-bold leading-none`} style={{ color }}>{value}</span>
      <span className="text-[9px] text-[var(--muted-foreground)] text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Donut with legend (right side) ────────────────────────────────
function DonutCard({ tasks, title, accent, donutSize = 90 }: {
  tasks: Task[]; title: string; accent: string; donutSize?: number;
}) {
  const total    = tasks.length;
  const data     = STATUS_ITEMS.map((s) => ({ ...s, value: tasks.filter((t) => t.status === s.key).length }));
  const display  = data.some((d) => d.value > 0)
    ? data.filter((d) => d.value > 0)
    : [{ key: "empty", label: "Không có", color: "#E2E8F0", value: 1 }];
  const doneRate = total > 0 ? Math.round((data.find((d) => d.key === "done")?.value ?? 0) / total * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[var(--muted)]/30 rounded-xl p-2.5 min-w-0">
      {/* title + rate */}
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <span className="text-[11px] font-semibold text-[var(--foreground)] truncate">{title}</span>
        <span className="text-[11px] font-bold ml-1 shrink-0" style={{ color: accent }}>{doneRate}%</span>
      </div>

      {/* legend left + donut right */}
      <div className="flex items-center gap-2 flex-1 min-h-0">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {data.map((d) => (
            <div key={d.key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-[9px] text-[var(--muted-foreground)] flex-1 truncate">{d.label}</span>
              <span className="text-[10px] font-semibold text-[var(--foreground)] shrink-0">{d.value}</span>
            </div>
          ))}
        </div>

        <div className="relative shrink-0" style={{ width: donutSize, height: donutSize }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={display} cx="50%" cy="50%"
                innerRadius="38%" outerRadius="65%"
                dataKey="value" strokeWidth={2}
                stroke="var(--card, #fff)"
                startAngle={90} endAngle={-270}
                paddingAngle={display.length > 1 ? 3 : 0}
              >
                {display.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 10, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}
                formatter={(v: number) => [`${v} NV (${total > 0 ? Math.round(v/total*100) : 0}%)`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs font-bold leading-none" style={{ color: accent }}>{doneRate}%</span>
            <span className="text-[8px] text-[var(--muted-foreground)] mt-0.5">{total} NV</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function MyTasksWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();
  const uid = currentUser?.id ?? "";
  const { ref, xs, sm } = useContainerWidth();

  const { mainTasks, supportTasks, allMyTasks, overdueCount, urgentCount } = useMemo(() => {
    const mainTasks    = tasks.filter((t) => t.mainPerformerId === uid);
    const supportTasks = tasks.filter(
      (t) => t.mainPerformerId !== uid && (t.stakeholders ?? []).some((s) => s.userId === uid),
    );
    const seen = new Set<string>();
    const allMyTasks = [...mainTasks, ...supportTasks].filter((t) => {
      if (seen.has(t.id)) return false; seen.add(t.id); return true;
    });
    const overdueCount = allMyTasks.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done").length;
    const urgentCount  = allMyTasks.filter((t) => t.priority === "urgent" && t.status !== "done").length;
    return { mainTasks, supportTasks, allMyTasks, overdueCount, urgentCount };
  }, [tasks, uid]);

  // Donut size scales with available width
  const donutSize = sm ? 90 : xs ? 80 : 70;

  return (
    <div ref={ref} className="flex flex-col h-full p-3 sm:p-4 gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-[var(--foreground)]">Nhiệm vụ của tôi</h3>
        <Link href="/tasks" className="text-[10px] text-[var(--muted-foreground)] hover:text-blue-500 transition-colors">
          Xem tất cả →
        </Link>
      </div>

      {/* Stat badges */}
      <div className="flex gap-1.5 shrink-0">
        <StatBadge label="Chính"     value={mainTasks.length}    color={P.purple} compact={!xs} />
        <StatBadge label="Hỗ trợ"   value={supportTasks.length} color={P.cyan}   compact={!xs} />
        <StatBadge label="Trễ hạn"  value={overdueCount}        color={P.pink}   compact={!xs} />
        <StatBadge label="Khẩn cấp" value={urgentCount}         color={P.amber}  compact={!xs} />
      </div>

      {/* Donuts — side by side on ≥ 360px, stacked below */}
      <div className={`${xs ? "flex gap-2" : "flex flex-col gap-2"} flex-1 min-h-0`}>
        <DonutCard tasks={mainTasks}    title="Thực hiện chính" accent={P.green}  donutSize={donutSize} />
        <DonutCard tasks={supportTasks} title="Hỗ trợ"          accent={P.cyan}   donutSize={donutSize} />
      </div>
    </div>
  );
}
