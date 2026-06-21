"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { isOverdue } from "@/lib/utils";
import Link from "next/link";
import type { Task } from "@/types";

// ── Colour palette ──────────────────────────────────────────────────────────
const STATUS_CONFIG = [
  { key: "review",      label: "Đang xét duyệt", color: "#f59e0b" },
  { key: "todo",        label: "Chờ thực hiện",  color: "#94a3b8" },
  { key: "in_progress", label: "Đang thực hiện", color: "#3b82f6" },
  { key: "done",        label: "Hoàn thành",      color: "#22c55e" },
] as const;

type Segment = { name: string; value: number; color: string };

// ── helpers ─────────────────────────────────────────────────────────────────
function buildSegments(tasks: Task[]): Segment[] {
  const counts: Record<string, number> = {};
  STATUS_CONFIG.forEach((s) => (counts[s.key] = 0));
  tasks.forEach((t) => { if (t.status in counts) counts[t.status]++; });
  return STATUS_CONFIG
    .filter((s) => counts[s.key] > 0)
    .map((s) => ({ name: s.label, value: counts[s.key], color: s.color }));
}

function completionRate(tasks: Task[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
}

function overdueRate(tasks: Task[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done").length / tasks.length) * 100);
}

// ── DonutChart component ─────────────────────────────────────────────────────
interface DonutProps {
  title: string;
  subtitle: string;
  tasks: Task[];
  centerValue: number;
  centerSuffix?: string;
  accentColor?: string;
}

function DonutChart({ title, subtitle, tasks, centerValue, accentColor = "#3b82f6" }: DonutProps) {
  const segments = buildSegments(tasks);
  const total = tasks.length;
  const empty: Segment[] = [{ name: "Không có", value: 1, color: "#e2e8f0" }];
  const data = segments.length > 0 ? segments : empty;

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      {/* Donut */}
      <div className="relative w-[96px] h-[96px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={46}
              dataKey="value"
              strokeWidth={1.5}
              stroke="var(--card, #fff)"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number, name: string) => [
                `${v} nhiệm vụ (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-base font-bold leading-none" style={{ color: accentColor }}>
            {centerValue}%
          </span>
          <span className="text-[9px] text-slate-400 mt-0.5">{total} NV</span>
        </div>
      </div>

      {/* Text labels */}
      <div className="text-center leading-tight">
        <p className="text-xs font-semibold text-[var(--foreground)]">{title}</p>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1">
      {STATUS_CONFIG.map((s) => (
        <span key={s.key} className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function MyTasksWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const uid = currentUser?.id ?? "";

  const {
    mainTasks,
    supportTasks,
    allMyTasks,
    overdueMain,
    overdueSupport,
  } = useMemo(() => {
    const mainTasks = tasks.filter((t) => t.mainPerformerId === uid);
    const supportTasks = tasks.filter(
      (t) =>
        t.mainPerformerId !== uid &&
        (t.stakeholders ?? []).some((s) => s.userId === uid),
    );
    const seen = new Set<string>();
    const allMyTasks = [...mainTasks, ...supportTasks].filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    const overdueMain = mainTasks.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done");
    const overdueSupport = supportTasks.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done");
    return { mainTasks, supportTasks, allMyTasks, overdueMain, overdueSupport };
  }, [tasks, uid]);

  const charts: DonutProps[] = [
    {
      title: "Thực hiện chính",
      subtitle: "Tỷ lệ hoàn thành",
      tasks: mainTasks,
      centerValue: completionRate(mainTasks),
      accentColor: "#22c55e",
    },
    {
      title: "Hỗ trợ",
      subtitle: "Tỷ lệ hoàn thành",
      tasks: supportTasks,
      centerValue: completionRate(supportTasks),
      accentColor: "#22c55e",
    },
    {
      title: "Tổng số nhiệm vụ",
      subtitle: "Tỷ lệ hoàn thành",
      tasks: allMyTasks,
      centerValue: completionRate(allMyTasks),
      accentColor: "#22c55e",
    },
    {
      title: "NV chính trễ hạn",
      subtitle: `${overdueMain.length}/${mainTasks.length} đang trễ`,
      tasks: overdueMain,
      centerValue: overdueRate(mainTasks),
      accentColor: "#ef4444",
    },
    {
      title: "NV hỗ trợ trễ hạn",
      subtitle: `${overdueSupport.length}/${supportTasks.length} đang trễ`,
      tasks: overdueSupport,
      centerValue: overdueRate(supportTasks),
      accentColor: "#ef4444",
    },
  ];

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-[var(--foreground)]">Nhiệm vụ của tôi</h3>
        <Link
          href="/tasks"
          className="text-[10px] text-blue-500 hover:underline"
        >
          Xem tất cả →
        </Link>
      </div>

      {/* Charts row */}
      <div className="flex items-start justify-around gap-2 flex-1">
        {charts.map((c) => (
          <DonutChart key={c.title} {...c} centerSuffix="%" />
        ))}
      </div>

      {/* Shared legend */}
      <Legend />
    </div>
  );
}
