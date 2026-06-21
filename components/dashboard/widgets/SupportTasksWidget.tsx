"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn, avatarColor, getInitials, formatDate } from "@/lib/utils";
import Link from "next/link";
import type { StepSubTask, User } from "@/types";
import { AlertTriangle } from "lucide-react";

// ── Status config ────────────────────────────────────────────────
const STATUS_CONFIG = [
  { key: "completed",   label: "Hoàn thành",     color: "#22c55e" },
  { key: "in_progress", label: "Đang thực hiện",  color: "#3b82f6" },
  { key: "pending",     label: "Chờ thực hiện",   color: "#94a3b8" },
] as const;

type SubStatus = "completed" | "in_progress" | "pending";

interface SubEntry extends StepSubTask {
  taskName: string;
  stepName: string;
}

interface SupporterStat {
  user: User;
  subs: SubEntry[];
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
  completionRate: number;
}

// ── Donut ────────────────────────────────────────────────────────
function SupporterDonut({ stat }: { stat: SupporterStat }) {
  const data = [
    { name: "Hoàn thành",    value: stat.completed,  color: "#22c55e" },
    { name: "Đang thực hiện", value: stat.inProgress, color: "#3b82f6" },
    { name: "Chờ thực hiện", value: stat.pending,    color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  const total = stat.subs.length;
  const display = data.length > 0 ? data : [{ name: "Không có", value: 1, color: "#e2e8f0" }];
  const rate = stat.completionRate;
  const accentColor = rate >= 80 ? "#22c55e" : rate >= 50 ? "#3b82f6" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-h-0" style={{ minWidth: 120 }}>
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
          avatarColor(stat.user.name)
        )}>
          {stat.user.avatar
            ? <img src={stat.user.avatar} alt={stat.user.name} className="w-full h-full rounded-full object-cover" />
            : getInitials(stat.user.name)
          }
        </div>
        {stat.overdue > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-2 h-2 text-white" />
          </span>
        )}
      </div>

      {/* Donut — fills available height */}
      <div className="relative flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={display}
              cx="50%"
              cy="50%"
              innerRadius="20%"
              outerRadius="46%"
              dataKey="value"
              strokeWidth={1.5}
              stroke="var(--card, #fff)"
              startAngle={90}
              endAngle={-270}
            >
              {display.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number, name: string) => [
                `${v} việc (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-sm font-bold leading-none" style={{ color: accentColor }}>
            {rate}%
          </span>
          <span className="text-[9px] text-slate-400 mt-0.5">{total} việc</span>
        </div>
      </div>

      {/* Name */}
      <div className="text-center leading-tight shrink-0">
        <p className="text-[11px] font-semibold text-[var(--foreground)] truncate max-w-[90px]">{stat.user.name}</p>
        {stat.overdue > 0 ? (
          <p className="text-[9px] text-red-500 font-medium">{stat.overdue} trễ hạn</p>
        ) : (
          <p className="text-[9px] text-[var(--muted-foreground)]">{stat.completed}/{total} xong</p>
        )}
      </div>
    </div>
  );
}

// ── Summary donut (all supporters combined) ────────────────────────────────
function SummaryDonut({ stats }: { stats: SupporterStat[] }) {
  const allSubs = stats.flatMap((s) => s.subs);
  const total = allSubs.length;
  if (total === 0) return null;

  const completed  = allSubs.filter((s) => subIsDone(s)).length;
  const inProgress = allSubs.filter((s) => s.status === "in_progress" && !subIsDone(s)).length;
  const pending    = total - completed - inProgress;
  const rate = Math.round((completed / total) * 100);
  const overdue = stats.reduce((n, s) => n + s.overdue, 0);

  const data = [
    { name: "Hoàn thành",    value: completed,  color: "#22c55e" },
    { name: "Đang thực hiện", value: inProgress, color: "#3b82f6" },
    { name: "Chờ thực hiện", value: pending,    color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  const display = data.length > 0 ? data : [{ name: "Không có", value: 1, color: "#e2e8f0" }];
  const accentColor = rate >= 80 ? "#22c55e" : rate >= 50 ? "#3b82f6" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-h-0 border-r border-slate-100 dark:border-slate-700 pr-3 mr-1" style={{ minWidth: 120 }}>
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">Tổng</span>
      <div className="relative flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={display}
              cx="50%"
              cy="50%"
              innerRadius="20%"
              outerRadius="46%"
              dataKey="value"
              strokeWidth={1.5}
              stroke="var(--card, #fff)"
              startAngle={90}
              endAngle={-270}
            >
              {display.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number, name: string) => [`${v} việc`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-sm font-bold leading-none" style={{ color: accentColor }}>{rate}%</span>
          <span className="text-[9px] text-slate-400 mt-0.5">{total} việc</span>
        </div>
      </div>
      <div className="text-center shrink-0">
        <p className="text-[11px] font-semibold text-[var(--foreground)]">{stats.length} người</p>
        {overdue > 0
          ? <p className="text-[9px] text-red-500 font-medium">{overdue} trễ hạn</p>
          : <p className="text-[9px] text-[var(--muted-foreground)]">{completed}/{total} xong</p>
        }
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────
function subIsDone(s: StepSubTask) {
  return s.status === "completed" || (s.progress ?? 0) >= 100;
}

function subIsOverdue(s: StepSubTask) {
  if (!s.deadline) return false;
  return new Date(s.deadline) < new Date(new Date().toDateString()) && !subIsDone(s);
}

function subStatus(s: StepSubTask): SubStatus {
  if (subIsDone(s))             return "completed";
  if (s.status === "in_progress") return "in_progress";
  return "pending";
}

// ── Main widget ────────────────────────────────────────────────────
export default function SupportTasksWidget() {
  const { currentUser } = useAuthStore();
  const { tasks, users } = useTaskStore();

  const uid = currentUser?.id ?? "";
  const today = new Date().toDateString();

  const supporterStats = useMemo<SupporterStat[]>(() => {
    // Only my main tasks
    const myTasks = tasks.filter((t) => t.mainPerformerId === uid);

    // Collect sub-tasks grouped by supporter userId
    const map = new Map<string, SubEntry[]>();

    myTasks.forEach((task) => {
      (task.steps ?? []).forEach((step) => {
        (step.subTasks ?? []).forEach((sub) => {
          if (sub.userId === uid) return; // skip self
          if (!map.has(sub.userId)) map.set(sub.userId, []);
          map.get(sub.userId)!.push({
            ...sub,
            taskName: task.name,
            stepName: step.name,
          });
        });
      });
    });

    // Also add task-level stakeholders (assignee) that have no sub-tasks
    myTasks.forEach((task) => {
      (task.stakeholders ?? [])
        .filter((s) => s.role === "assignee" && s.userId !== uid)
        .forEach((s) => {
          if (!map.has(s.userId)) map.set(s.userId, []); // will show as empty donut
        });
    });

    // Build stats per supporter
    return Array.from(map.entries())
      .map(([userId, subs]) => {
        const user = users.find((u) => u.id === userId);
        if (!user) return null;

        const completed  = subs.filter(subIsDone).length;
        const inProgress = subs.filter((s) => s.status === "in_progress" && !subIsDone(s)).length;
        const pending    = subs.length - completed - inProgress;
        const overdue    = subs.filter(subIsOverdue).length;
        const rate = subs.length > 0 ? Math.round((completed / subs.length) * 100) : 0;

        return { user, subs, completed, inProgress, pending, overdue, completionRate: rate };
      })
      .filter(Boolean) as SupporterStat[];
  }, [tasks, users, uid]);

  const hasData = supporterStats.length > 0;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-[var(--foreground)]">Hỗ trợ của tôi</h3>
        <Link href="/tasks?filter=mine" className="text-[10px] text-blue-500 hover:underline">
          Xem nhiệm vụ →
        </Link>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-xs text-[var(--muted-foreground)]">
            Chưa có người hỗ trợ trong các nhiệm vụ bạn đang thực hiện chính.
          </p>
        </div>
      ) : (
        <>
          {/* Charts row */}
          <div className="flex items-stretch gap-2 flex-1 min-h-0 overflow-x-auto">
            {supporterStats.length > 1 && <SummaryDonut stats={supporterStats} />}
            {supporterStats.map((stat) => (
              <SupporterDonut key={stat.user.id} stat={stat} />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1 border-t border-slate-100 dark:border-slate-700">
            {STATUS_CONFIG.map((s) => (
              <span key={s.key} className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              <AlertTriangle className="w-2.5 h-2.5" />
              Trễ hạn
            </span>
          </div>
        </>
      )}
    </div>
  );
}
