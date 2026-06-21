"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn, avatarColor, getInitials } from "@/lib/utils";
import Link from "next/link";
import type { StepSubTask, User } from "@/types";
import { AlertTriangle } from "lucide-react";
import { useContainerWidth } from "@/hooks/useContainerWidth";

// ── Palette ──────────────────────────────────────────────────────
const P = {
  green:  "#22C55E",
  purple: "#8B5CF6",
  cyan:   "#06B6D4",
  slate:  "#94A3B8",
  pink:   "#EC4899",
  amber:  "#F59E0B",
};

const SUB_STATUSES = [
  { key: "completed",   label: "Hoàn thành",     color: P.green  },
  { key: "in_progress", label: "Đang thực hiện", color: P.purple },
  { key: "pending",     label: "Chờ thực hiện",  color: P.slate  },
] as const;

// ── Types ─────────────────────────────────────────────────────────
interface SubEntry extends StepSubTask { taskName: string; stepName: string; }
interface SupporterStat {
  user: User;
  subs: SubEntry[];
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
  completionRate: number;
}

// ── Helpers ────────────────────────────────────────────────────────
function subIsDone(s: StepSubTask)   { return s.status === "completed" || (s.progress ?? 0) >= 100; }
function subIsOverdue(s: StepSubTask) {
  if (!s.deadline) return false;
  return new Date(s.deadline) < new Date(new Date().toDateString()) && !subIsDone(s);
}

// ── Supporter card (donut right + legend left, like mockup) ───────
function SupporterCard({ stat }: { stat: SupporterStat }) {
  const total   = stat.subs.length;
  const rate    = stat.completionRate;
  const accent  = rate >= 80 ? P.green : rate >= 50 ? P.purple : P.amber;

  const segments = SUB_STATUSES.map((s) => ({
    ...s,
    value: s.key === "completed"   ? stat.completed
         : s.key === "in_progress" ? stat.inProgress
         : stat.pending,
  }));
  const display = segments.some((d) => d.value > 0)
    ? segments.filter((d) => d.value > 0)
    : [{ key: "empty", label: "Không có", color: "#E2E8F0", value: 1 }];

  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-2.5 bg-[var(--muted)]/30 flex-1 min-h-0" style={{ minWidth: 130 }}>
      {/* Avatar + name header */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0",
            avatarColor(stat.user.name)
          )}>
            {stat.user.avatar
              ? <img src={stat.user.avatar} alt={stat.user.name} className="w-full h-full rounded-full object-cover" />
              : getInitials(stat.user.name)
            }
          </div>
          {stat.overdue > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-1.5 h-1.5 text-white" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[var(--foreground)] truncate leading-tight">{stat.user.name}</p>
          {stat.overdue > 0
            ? <p className="text-[9px] text-red-500 font-medium leading-none">{stat.overdue} trễ hạn</p>
            : <p className="text-[9px] text-[var(--muted-foreground)] leading-none">{stat.completed}/{total} xong</p>
          }
        </div>
        <span className="ml-auto text-[10px] font-bold shrink-0" style={{ color: accent }}>{rate}%</span>
      </div>

      {/* Donut + legend */}
      <div className="flex items-center gap-2 flex-1 min-h-0">
        {/* Legend */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {segments.map((s) => (
            <div key={s.key} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[9px] text-[var(--muted-foreground)] flex-1 truncate">{s.label}</span>
              <span className="text-[9px] font-semibold text-[var(--foreground)] shrink-0">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Donut */}
        <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={display}
                cx="50%" cy="50%"
                innerRadius="38%" outerRadius="65%"
                dataKey="value"
                strokeWidth={2}
                stroke="var(--card, #fff)"
                startAngle={90} endAngle={-270}
                paddingAngle={display.length > 1 ? 3 : 0}
              >
                {display.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 10, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}
                formatter={(v: number) => [`${v} việc`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[11px] font-bold leading-none" style={{ color: accent }}>{rate}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────
function SummaryCard({ stats }: { stats: SupporterStat[] }) {
  const allSubs    = stats.flatMap((s) => s.subs);
  const total      = allSubs.length;
  if (total === 0) return null;

  const completed  = allSubs.filter(subIsDone).length;
  const inProgress = allSubs.filter((s) => s.status === "in_progress" && !subIsDone(s)).length;
  const pending    = total - completed - inProgress;
  const overdueAll = stats.reduce((n, s) => n + s.overdue, 0);
  const rate       = Math.round((completed / total) * 100);
  const accent     = rate >= 80 ? P.green : rate >= 50 ? P.purple : P.amber;

  const segments = [
    { name: "Hoàn thành",     value: completed,  color: P.green  },
    { name: "Đang thực hiện", value: inProgress, color: P.purple },
    { name: "Chờ thực hiện",  value: pending,    color: P.slate  },
  ];
  const display = segments.some((d) => d.value > 0)
    ? segments.filter((d) => d.value > 0)
    : [{ name: "Không có", value: 1, color: "#E2E8F0" }];

  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-2.5 border-2 flex-1 min-h-0" style={{ minWidth: 130, borderColor: `${accent}40`, background: `${accent}08` }}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="text-[11px] font-bold text-[var(--foreground)]">Tổng hợp</p>
          <p className="text-[9px] text-[var(--muted-foreground)]">{stats.length} người · {total} việc</p>
        </div>
        <span className="text-sm font-bold" style={{ color: accent }}>{rate}%</span>
      </div>

      {/* Donut + legend */}
      <div className="flex items-center gap-2 flex-1 min-h-0">
        {/* Legend */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {segments.map((s) => (
            <div key={s.name} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[9px] text-[var(--muted-foreground)] flex-1 truncate">{s.name}</span>
              <span className="text-[9px] font-semibold text-[var(--foreground)] shrink-0">{s.value}</span>
            </div>
          ))}
          {overdueAll > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-2 h-2 text-red-500 shrink-0" />
              <span className="text-[9px] text-red-500 font-medium">{overdueAll} trễ hạn</span>
            </div>
          )}
        </div>

        {/* Donut */}
        <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={display}
                cx="50%" cy="50%"
                innerRadius="38%" outerRadius="65%"
                dataKey="value"
                strokeWidth={2}
                stroke="var(--card, #fff)"
                startAngle={90} endAngle={-270}
                paddingAngle={display.length > 1 ? 3 : 0}
              >
                {display.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[11px] font-bold leading-none" style={{ color: accent }}>{rate}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────
export default function SupportTasksWidget() {
  const { currentUser } = useAuthStore();
  const { tasks, users } = useTaskStore();
  const uid = currentUser?.id ?? "";
  const { ref, xs } = useContainerWidth();

  const supporterStats = useMemo<SupporterStat[]>(() => {
    const myTasks = tasks.filter((t) => t.mainPerformerId === uid);
    const map     = new Map<string, SubEntry[]>();

    myTasks.forEach((task) => {
      (task.steps ?? []).forEach((step) => {
        (step.subTasks ?? []).forEach((sub) => {
          if (sub.userId === uid) return;
          if (!map.has(sub.userId)) map.set(sub.userId, []);
          map.get(sub.userId)!.push({ ...sub, taskName: task.name, stepName: step.name });
        });
      });
    });

    myTasks.forEach((task) => {
      (task.stakeholders ?? [])
        .filter((s) => s.role === "assignee" && s.userId !== uid)
        .forEach((s) => { if (!map.has(s.userId)) map.set(s.userId, []); });
    });

    return Array.from(map.entries()).map(([userId, subs]) => {
      const user = users.find((u) => u.id === userId);
      if (!user) return null;
      const completed  = subs.filter(subIsDone).length;
      const inProgress = subs.filter((s) => s.status === "in_progress" && !subIsDone(s)).length;
      const pending    = subs.length - completed - inProgress;
      const overdue    = subs.filter(subIsOverdue).length;
      const rate       = subs.length > 0 ? Math.round((completed / subs.length) * 100) : 0;
      return { user, subs, completed, inProgress, pending, overdue, completionRate: rate };
    }).filter(Boolean) as SupporterStat[];
  }, [tasks, users, uid]);

  return (
    <div ref={ref} className="flex flex-col h-full p-3 sm:p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-[var(--foreground)]">Hỗ trợ của tôi</h3>
        <Link href="/tasks?filter=mine" className="text-[10px] text-[var(--muted-foreground)] hover:text-blue-500 transition-colors">
          Xem nhiệm vụ →
        </Link>
      </div>

      {supporterStats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-[var(--muted-foreground)] text-center">
            Chưa có người hỗ trợ trong các nhiệm vụ bạn đang thực hiện chính.
          </p>
        </div>
      ) : (
        <div className="flex gap-2 flex-1 min-h-0 overflow-x-auto pb-0.5">
          {supporterStats.length > 1 && <SummaryCard stats={supporterStats} />}
          {supporterStats.map((stat) => (
            <SupporterCard key={stat.user.id} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}
