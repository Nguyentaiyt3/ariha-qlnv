"use client";

import { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useTaskStore } from "@/stores/useTaskStore";
import { CheckCircle2, Clock, ShieldAlert, Layers, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";
import { format, subWeeks, startOfWeek, endOfWeek, parseISO, isValid } from "date-fns";
import { vi } from "date-fns/locale";
import { useContainerWidth } from "@/hooks/useContainerWidth";

// ── Palette ──────────────────────────────────────────────────────
const P = {
  purple: "#8B5CF6", cyan: "#06B6D4", pink: "#EC4899",
  green:  "#22C55E", amber: "#F59E0B", slate: "#94A3B8",
};

const STATUS_ITEMS = [
  { key: "done",        label: "Hoàn thành",     color: P.green  },
  { key: "in_progress", label: "Đang thực hiện", color: P.purple },
  { key: "review",      label: "Xét duyệt",      color: P.cyan   },
  { key: "todo",        label: "Chờ thực hiện",  color: P.slate  },
  { key: "cancelled",   label: "Đã hủy",         color: "#CBD5E1" },
] as const;

// ── KPI card ─────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, iconColor, iconBg, compact = false }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; iconColor: string; iconBg: string; compact?: boolean;
}) {
  return (
    <div className="rounded-2xl p-3 flex items-center gap-2.5 border border-[var(--border)]" style={{ background: `${iconColor}08` }}>
      <div className={`${compact ? "w-8 h-8" : "w-9 h-9"} rounded-xl flex items-center justify-center shrink-0`} style={{ background: iconBg }}>
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <p className={`${compact ? "text-base" : "text-lg"} font-bold leading-none text-[var(--foreground)]`}>{value}</p>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">{label}</p>
        {sub && !compact && <p className="text-[10px] font-medium mt-0.5 truncate" style={{ color: iconColor }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Status donut ─────────────────────────────────────────────────
function StatusDonut({
  data, total, size = 130, compact = false,
}: {
  data: { key: string; label: string; color: string; value: number }[];
  total: number;
  size?: number;
  compact?: boolean;
}) {
  const withVal = data.filter((d) => d.value > 0);
  const display = withVal.length > 0 ? withVal : [{ key: "empty", label: "Không có", color: "#E2E8F0", value: 1 }];

  return (
    <div className={`flex ${compact ? "flex-col items-center gap-2" : "items-center gap-3"} h-full w-full`}>
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={display} cx="50%" cy="50%"
              innerRadius="40%" outerRadius="66%"
              dataKey="value" strokeWidth={2}
              stroke="var(--card, #fff)"
              startAngle={90} endAngle={-270}
              paddingAngle={withVal.length > 1 ? 3 : 0}
            >
              {display.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 10, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}
              formatter={(v: number) => [`${v} NV  (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-base font-bold leading-none text-[var(--foreground)]">{total}</span>
          <span className="text-[9px] text-[var(--muted-foreground)] mt-0.5">tổng</span>
        </div>
      </div>

      {/* Legend */}
      <div className={`flex ${compact ? "flex-row flex-wrap justify-center gap-x-3 gap-y-1" : "flex-col gap-1.5 flex-1 min-w-0"}`}>
        {data.map((d) => (
          <div key={d.key} className={`flex items-center gap-1.5 ${compact ? "" : ""}`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            {!compact && <span className="text-[11px] text-[var(--foreground)] flex-1 truncate">{d.label}</span>}
            <span className="text-[11px] font-semibold text-[var(--foreground)] shrink-0">{d.value}</span>
            {!compact && (
              <span className="text-[10px] text-[var(--muted-foreground)] w-7 text-right shrink-0">
                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Date helper ───────────────────────────────────────────────────
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "string") { const d = parseISO(v); return isValid(d) ? d : null; }
  if (typeof v === "object" && "seconds" in (v as object))
    return new Date((v as { seconds: number }).seconds * 1000);
  return null;
}

// ── Main widget ───────────────────────────────────────────────────
export default function AnalyticsSummaryWidget() {
  const { tasks } = useTaskStore();
  const { ref, width, xs, sm, md } = useContainerWidth();

  const stats = useMemo(() => {
    const active  = tasks.filter((t) => t.status !== "cancelled");
    const total   = active.length;
    const done    = active.filter((t) => t.status === "done").length;
    const inProg  = active.filter((t) => t.status === "in_progress").length;
    const review  = active.filter((t) => t.status === "review").length;
    const todo    = active.filter((t) => t.status === "todo").length;
    const cancelled = tasks.filter((t) => t.status === "cancelled").length;

    const today   = new Date().toISOString().slice(0, 10);
    const overdue = active.filter((t) => t.deadlineBase && t.deadlineBase < today && t.status !== "done").length;
    const risk    = active.filter((t) => t.riskFlag && t.status !== "done").length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avgProgress    = total > 0
      ? Math.round(active.reduce((s, t) => s + (t.progress ?? 0), 0) / total) : 0;

    const statusData = STATUS_ITEMS.map((s) => ({
      ...s, value: tasks.filter((t) => t.status === s.key).length,
    }));

    // 6-week trend
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const ws  = startOfWeek(subWeeks(new Date(), 5 - i), { weekStartsOn: 1 });
      const we  = endOfWeek(ws, { weekStartsOn: 1 });
      const lbl = format(ws, "dd/MM", { locale: vi });
      const created   = tasks.filter((t) => { const d = toDate(t.createdAt);   return d && d >= ws && d <= we; }).length;
      const completed = tasks.filter((t) => { const d = toDate(t.completedAt); return d && d >= ws && d <= we; }).length;
      return { label: lbl, created, completed };
    });

    return { total, done, inProg, review, todo, cancelled, overdue, risk, completionRate, avgProgress, statusData, weeks };
  }, [tasks]);

  // Adaptive KPI grid: 4 cols if ≥ 600px, else 2 cols
  const kpiCols = md ? "grid-cols-4" : "grid-cols-2";

  // Donut size based on available width
  const donutSize = sm ? 130 : xs ? 110 : 90;

  return (
    <div ref={ref} className="flex flex-col h-full p-3 sm:p-4 gap-2.5 sm:gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-[var(--foreground)]">Tổng quan tổ chức</h3>
        <Link href="/tasks" className="text-[10px] text-[var(--muted-foreground)] hover:text-blue-500 transition-colors">
          Xem tất cả →
        </Link>
      </div>

      {/* KPI cards */}
      <div className={`grid ${kpiCols} gap-2 shrink-0`}>
        <KpiCard icon={Layers}       label="Tổng nhiệm vụ"      value={stats.total}              sub={`${stats.done} hoàn thành`}        iconColor={P.purple} iconBg={`${P.purple}20`} compact={!xs} />
        <KpiCard icon={CheckCircle2} label="Hoàn thành"         value={`${stats.completionRate}%`} sub={`TB ${stats.avgProgress}%`}      iconColor={P.green}  iconBg={`${P.green}20`}  compact={!xs} />
        <KpiCard icon={Clock}        label="Trễ hạn"             value={stats.overdue}            sub={stats.overdue > 0 ? "Cần xử lý" : "Đúng hạn"} iconColor={stats.overdue > 0 ? P.pink : P.green} iconBg={`${stats.overdue > 0 ? P.pink : P.green}20`} compact={!xs} />
        <KpiCard icon={ShieldAlert}  label="Rủi ro"              value={stats.risk}               sub={stats.risk > 0 ? "Cần chú ý" : "Ổn định"}     iconColor={stats.risk   > 0 ? P.amber : P.green} iconBg={`${stats.risk   > 0 ? P.amber : P.green}20`} compact={!xs} />
      </div>

      {/* Charts area — layout depends on width */}
      {sm ? (
        /* ≥ 480 px: donut left + area chart right */
        <div className="flex gap-3 flex-1 min-h-0">
          <div className="flex flex-col shrink-0" style={{ width: md ? 260 : 200 }}>
            <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1.5 shrink-0">
              Phân bổ trạng thái
            </p>
            <div className="flex-1 min-h-0 flex items-center">
              <StatusDonut data={stats.statusData} total={stats.total} size={donutSize} />
            </div>
          </div>

          <div className="w-px bg-[var(--border)] shrink-0" />

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Xu hướng 6 tuần</p>
              <div className="flex gap-2">
                {[{ color: P.purple, label: "Tạo mới" }, { color: P.cyan, label: "Xong" }].map((l) => (
                  <span key={l.label} className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                    <span className="w-4 h-0.5 rounded-full inline-block" style={{ background: l.color }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.weeks} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={P.purple} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={P.purple} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={P.cyan} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={P.cyan} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} width={20} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}
                    formatter={(v: number, name: string) => [v, name === "created" ? "Tạo mới" : "Hoàn thành"]} />
                  <Area type="monotone" dataKey="created"   stroke={P.purple} strokeWidth={2} fill="url(#gC)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} name="created" />
                  <Area type="monotone" dataKey="completed" stroke={P.cyan}   strokeWidth={2} fill="url(#gD)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} name="completed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* < 480 px: donut centred, compact legend row */
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide shrink-0">Phân bổ trạng thái</p>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <StatusDonut data={stats.statusData} total={stats.total} size={donutSize} compact />
          </div>
        </div>
      )}
    </div>
  );
}
