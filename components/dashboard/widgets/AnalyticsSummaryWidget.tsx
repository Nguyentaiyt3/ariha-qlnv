"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useTaskStore } from "@/stores/useTaskStore";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, Clock, AlertTriangle, TrendingUp,
  Layers, Users, ShieldAlert, Zap,
} from "lucide-react";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  todo:        "#94a3b8",
  in_progress: "#3b82f6",
  review:      "#f59e0b",
  done:        "#22c55e",
  cancelled:   "#cbd5e1",
};

const STATUS_LABEL: Record<string, string> = {
  todo:        "Chờ",
  in_progress: "Đang làm",
  review:      "Xét duyệt",
  done:        "Xong",
  cancelled:   "Hủy",
};

// ── Small stat card ──────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color = "blue", alert = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "red" | "amber" | "slate";
  alert?: boolean;
}) {
  const colorMap = {
    blue:  { bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-700 dark:text-blue-300",   icon: "text-blue-500" },
    green: { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-300", icon: "text-green-500" },
    red:   { bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-300",     icon: "text-red-500" },
    amber: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", icon: "text-amber-500" },
    slate: { bg: "bg-slate-50 dark:bg-slate-800",    text: "text-slate-700 dark:text-slate-300", icon: "text-slate-400" },
  };
  const c = colorMap[color];
  return (
    <div className={cn("rounded-xl p-3 flex items-center gap-3", c.bg, alert && "ring-2 ring-red-300 dark:ring-red-700")}>
      <Icon className={cn("w-5 h-5 shrink-0", c.icon)} />
      <div className="min-w-0">
        <p className={cn("text-xl font-bold leading-none", c.text)}>{value}</p>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">{label}</p>
        {sub && <p className={cn("text-[10px] font-medium mt-0.5", c.text)}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────
export default function AnalyticsSummaryWidget() {
  const { tasks, users } = useTaskStore();

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "cancelled");
    const total  = active.length;
    const done   = active.filter((t) => t.status === "done").length;
    const inProg = active.filter((t) => t.status === "in_progress").length;
    const review = active.filter((t) => t.status === "review").length;
    const todo   = active.filter((t) => t.status === "todo").length;

    const today = new Date().toISOString().slice(0, 10);
    const overdue = active.filter(
      (t) => t.deadlineBase && t.deadlineBase < today && t.status !== "done",
    ).length;
    const risk    = active.filter((t) => t.riskFlag && t.status !== "done").length;
    const urgent  = active.filter((t) => t.priority === "urgent" && t.status !== "done").length;
    const pending = active.filter((t) => !t.approved).length;

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avgProgress = total > 0
      ? Math.round(active.reduce((s, t) => s + (t.progress ?? 0), 0) / total)
      : 0;

    // On-time rate: tasks done whose deadline wasn't past at completion
    const doneWithDeadline = active.filter((t) => t.status === "done" && t.deadlineBase);
    const onTime = doneWithDeadline.filter((t) => {
      // approximate: use updatedAt vs deadlineBase
      const updated = t.updatedAt ? t.updatedAt.slice(0, 10) : today;
      return updated <= t.deadlineBase!;
    }).length;
    const onTimeRate = doneWithDeadline.length > 0
      ? Math.round((onTime / doneWithDeadline.length) * 100)
      : null;

    // Status distribution for bar chart
    const statusDist = [
      { name: "Chờ",       value: todo,   color: STATUS_COLOR.todo },
      { name: "Đang làm",  value: inProg, color: STATUS_COLOR.in_progress },
      { name: "Xét duyệt", value: review, color: STATUS_COLOR.review },
      { name: "Hoàn thành",value: done,   color: STATUS_COLOR.done },
    ].filter((d) => d.value > 0);

    // Department breakdown
    const deptMap = new Map<string, { total: number; done: number; overdue: number }>();
    active.forEach((t) => {
      const dept = t.department || "Chưa phân";
      if (!deptMap.has(dept)) deptMap.set(dept, { total: 0, done: 0, overdue: 0 });
      const d = deptMap.get(dept)!;
      d.total++;
      if (t.status === "done") d.done++;
      if (t.deadlineBase && t.deadlineBase < today && t.status !== "done") d.overdue++;
    });

    const depts = Array.from(deptMap.entries())
      .map(([name, d]) => ({ name, ...d, rate: Math.round((d.done / d.total) * 100) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // Active users
    const activeUsers = new Set<string>();
    active.filter((t) => t.status !== "done").forEach((t) => {
      if (t.mainPerformerId) activeUsers.add(t.mainPerformerId);
      (t.stakeholders ?? []).forEach((s) => activeUsers.add(s.userId));
    });

    return {
      total, done, inProg, review, todo, overdue, risk, urgent, pending,
      completionRate, avgProgress, onTimeRate, statusDist, depts,
      activeUserCount: activeUsers.size,
    };
  }, [tasks]);

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-blue-500" />
          Tổng quan tổ chức
        </h3>
        <Link href="/tasks" className="text-[10px] text-blue-500 hover:underline">
          Xem tất cả →
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          icon={Layers}
          label="Tổng nhiệm vụ"
          value={stats.total}
          sub={`${stats.done} đã xong`}
          color="blue"
        />
        <StatCard
          icon={CheckCircle2}
          label="Tỷ lệ hoàn thành"
          value={`${stats.completionRate}%`}
          sub={stats.onTimeRate !== null ? `${stats.onTimeRate}% đúng hạn` : undefined}
          color={stats.completionRate >= 70 ? "green" : "amber"}
        />
        <StatCard
          icon={Clock}
          label="Trễ hạn"
          value={stats.overdue}
          sub={stats.urgent > 0 ? `${stats.urgent} khẩn cấp` : undefined}
          color={stats.overdue > 0 ? "red" : "green"}
          alert={stats.overdue > 0}
        />
        <StatCard
          icon={ShieldAlert}
          label="Rủi ro"
          value={stats.risk}
          sub={stats.pending > 0 ? `${stats.pending} chờ duyệt` : undefined}
          color={stats.risk > 0 ? "red" : "green"}
          alert={stats.risk > 0}
        />
      </div>

      {/* Charts row */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Status bar chart */}
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2 shrink-0">
            Phân bổ trạng thái
          </p>
          {stats.statusDist.length > 0 ? (
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.statusDist} barCategoryGap="25%" layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={68} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number) => [`${v} nhiệm vụ`, ""]}
                  />
                  <Bar dataKey="value" radius={4}>
                    {stats.statusDist.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Chưa có dữ liệu</p>
          )}
        </div>

        {/* Vertical divider */}
        <div className="w-px bg-slate-100 dark:bg-slate-700 shrink-0" />

        {/* Department breakdown */}
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2 shrink-0">
            Theo phòng ban
          </p>
          <div className="space-y-1.5 flex-1 overflow-y-auto min-h-0">
            {stats.depts.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Chưa phân phòng ban</p>
            )}
            {stats.depts.map((dept) => (
              <div key={dept.name} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--foreground)] truncate w-24 shrink-0">{dept.name}</span>
                <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      dept.rate >= 80 ? "bg-green-500"
                      : dept.rate >= 50 ? "bg-blue-500"
                      : dept.overdue > 0 ? "bg-red-400"
                      : "bg-amber-400"
                    )}
                    style={{ width: `${dept.rate}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-[var(--muted-foreground)] w-8 text-right shrink-0">
                  {dept.rate}%
                </span>
                {dept.overdue > 0 && (
                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-700 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
          <Users className="w-3 h-3" />
          {stats.activeUserCount} người đang thực hiện
        </span>
        <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
          <TrendingUp className="w-3 h-3" />
          Trung bình tiến độ: <span className="font-semibold text-[var(--foreground)] ml-1">{stats.avgProgress}%</span>
        </span>
        {stats.urgent > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-red-500 font-semibold">
            <Zap className="w-3 h-3" />
            {stats.urgent} nhiệm vụ khẩn cấp
          </span>
        )}
        {stats.pending > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
            <Clock className="w-3 h-3" />
            {stats.pending} chờ phê duyệt
          </span>
        )}
      </div>
    </div>
  );
}
