"use client";

import { useMemo } from "react";
import { BarChart3, CheckCircle2, TrendingUp, ShieldAlert, Target } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { ResponsiveContainer, RadialBarChart, RadialBar } from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";

const P = {
  purple: "#8B5CF6",
  cyan:   "#06B6D4",
  green:  "#22C55E",
  amber:  "#F59E0B",
  pink:   "#EC4899",
};

function KpiTile({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-2 flex-1" style={{ background: `${color}12` }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold leading-none text-[var(--foreground)]">{value}</p>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{label}</p>
        {sub && <p className="text-[10px] font-medium mt-0.5" style={{ color }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function KPIWeekWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const { ref, xs } = useContainerWidth();

  const stats = useMemo(() => {
    if (!currentUser) return null;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const myTasks = tasks.filter(
      (t) => t.mainPerformerId === currentUser.id ||
        (t.stakeholders ?? []).some((s) => s.userId === currentUser.id && s.role === "assignee"),
    );
    const thisWeek = myTasks.filter((t) => t.deadlineBase && new Date(t.deadlineBase) >= weekStart);
    const done     = thisWeek.filter((t) => t.status === "done").length;
    const total    = thisWeek.length;
    const rate     = total > 0 ? Math.round((done / total) * 100) : 0;
    const risk     = myTasks.filter((t) => t.riskFlag && t.status !== "done").length;
    const urgent   = myTasks.filter((t) => t.priority === "urgent" && t.status !== "done").length;
    const avgProgress = myTasks.length > 0
      ? Math.round(myTasks.reduce((s, t) => s + t.progress, 0) / myTasks.length) : 0;

    return { done, total, rate, risk, urgent, avgProgress };
  }, [currentUser, tasks]);

  if (!stats) return null;

  const radialData = [{ value: stats.rate, fill: stats.rate >= 70 ? P.green : stats.rate >= 40 ? P.amber : P.pink }];
  const accentRate  = stats.rate >= 70 ? P.green : stats.rate >= 40 ? P.amber : P.pink;

  return (
    <div ref={ref} className="flex flex-col h-full p-3 sm:p-4 gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-[var(--foreground)] flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" style={{ color: P.purple }} />
          KPI tuần này
        </h3>
      </div>

      {/* Radial gauge — hide on very narrow */}
      {xs && (
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="58%" outerRadius="88%"
                data={radialData} startAngle={210} endAngle={-30} barSize={7}
              >
                <RadialBar background={{ fill: "var(--border)" }} dataKey="value" cornerRadius={6} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-bold leading-none" style={{ color: accentRate }}>{stats.rate}%</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--foreground)]">Tỷ lệ hoàn thành</p>
            <p className="text-[10px] text-[var(--muted-foreground)]">{stats.done}/{stats.total} nhiệm vụ tuần này</p>
          </div>
        </div>
      )}

      {/* 2×2 tile grid */}
      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
        <KpiTile icon={CheckCircle2} label="Xong tuần này" value={stats.done}              color={P.green}  sub={`/${stats.total} tổng`} />
        <KpiTile icon={Target}       label="TB tiến độ"    value={`${stats.avgProgress}%`} color={P.purple} />
        <KpiTile icon={ShieldAlert}  label="Rủi ro"        value={stats.risk}               color={stats.risk   > 0 ? P.pink  : P.green} />
        <KpiTile icon={TrendingUp}   label="Khẩn cấp"      value={stats.urgent}             color={stats.urgent > 0 ? P.amber : P.green} />
      </div>
    </div>
  );
}
