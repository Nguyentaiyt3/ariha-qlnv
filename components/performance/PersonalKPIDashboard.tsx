"use client";

import { useMemo, useState } from "react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  CheckCircle2, Clock, BarChart3, Star, Target,
  TrendingUp, TrendingDown, Minus, Award, ClipboardList,
  MessageSquare, Zap, Users,
} from "lucide-react";
import { calcPerformanceScore, getRank, getManagerWeights, type PerformanceResult } from "@/lib/performance-score";
import type { Task, Evaluation, KPIFramework, User } from "@/types";
import { cn, formatDate } from "@/lib/utils";

// ── Grade label / color map ───────────────────────────────────
const GRADE_CFG = {
  xuatSac:          { label: "Xuất sắc",       color: "#22C55E", bg: "bg-green-50 dark:bg-green-900/20",  text: "text-green-700 dark:text-green-400" },
  hoanThanhTot:     { label: "Hoàn thành tốt", color: "#3B82F6", bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-700 dark:text-blue-400"  },
  hoanThanh:        { label: "Hoàn thành",     color: "#F59E0B", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" },
  khongHoanThanh:   { label: "Không HT",       color: "#EF4444", bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-400"    },
};

// ── Small star row ────────────────────────────────────────────
function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <Star key={s} className={cn("w-3 h-3", s <= value ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600")} />
      ))}
    </span>
  );
}

// ── Horizontal KPI bar ────────────────────────────────────────
function KPIBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-[var(--foreground)]">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {value}<span className="font-normal text-[var(--muted-foreground)]">/{max}</span>
          {sub && <span className="ml-1 text-[10px] text-[var(--muted-foreground)] font-normal">{sub}</span>}
        </span>
      </div>
      <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Metric tile ───────────────────────────────────────────────
function MetricTile({
  icon: Icon, label, value, sub, color, pulse,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; pulse?: boolean;
}) {
  return (
    <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: `${color}10` }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className={cn("w-4 h-4", pulse && "animate-pulse")} style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold leading-none text-[var(--foreground)]">{value}</p>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{label}</p>
        {sub && <p className="text-[10px] font-semibold mt-0.5" style={{ color }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────
interface Props {
  currentUser: User;
  users?: User[];
  tasks: Task[];
  evaluations: Evaluation[];
  /** All evaluations across the org — used for team member qualitative scoring */
  allEvaluations?: Evaluation[];
  framework?: KPIFramework;
  period: string;
  trendData: Array<{ period: string } & PerformanceResult>;
  periodStart: string;
  periodEnd: string;
}

export default function PersonalKPIDashboard({
  currentUser, users, tasks, evaluations, allEvaluations, framework,
  period, trendData, periodStart, periodEnd,
}: Props) {
  // ── Core metrics ─────────────────────────────────────────
  const score = useMemo(
    () => calcPerformanceScore({
      tasks, evaluations,
      allEvaluations,
      userId: currentUser.id,
      periodStart, periodEnd,
      role: currentUser.role,
      department: currentUser.department,
      allUsers: users,
    }),
    [tasks, evaluations, allEvaluations, currentUser, periodStart, periodEnd, users],
  );

  const managerWeights = getManagerWeights(currentUser.role);

  const rank = getRank(score.totalScore);

  // Trend vs previous period
  const prevPeriod = trendData[trendData.length - 2];
  const trendDiff = prevPeriod ? score.totalScore - prevPeriod.totalScore : 0;
  const TrendIcon = trendDiff > 0 ? TrendingUp : trendDiff < 0 ? TrendingDown : Minus;
  const trendColor = trendDiff > 0 ? "#22C55E" : trendDiff < 0 ? "#EF4444" : "#94A3B8";

  // ── My tasks in period ────────────────────────────────────
  const { periodTasks, allMyActiveTasks } = useMemo(() => {
    const allMyActiveTasks = tasks.filter(
      (t) => t.mainPerformerId === currentUser.id ||
        (t.stakeholders ?? []).some((s) => s.userId === currentUser.id && s.role === "assignee"),
    );
    const periodTasks = allMyActiveTasks.filter(
      (t) => t.deadlineBase && t.deadlineBase >= periodStart.slice(0, 10) && t.deadlineBase <= periodEnd.slice(0, 10),
    );
    return { periodTasks, allMyActiveTasks };
  }, [tasks, currentUser.id, periodStart, periodEnd]);

  // ── 3T score summary ──────────────────────────────────────
  const { scored3T, avgT1, avgT2, avgT3, gradeDist } = useMemo(() => {
    const scored3T = allMyActiveTasks.filter(
      (t) => t.status === "done" && t.completionProposal?.score3T,
    );
    if (scored3T.length === 0) return { scored3T: [], avgT1: 0, avgT2: 0, avgT3: 0, gradeDist: {} };

    const avgT1 = Math.round((scored3T.reduce((s, t) => s + (t.completionProposal!.score3T!.t1), 0) / scored3T.length) * 10) / 10;
    const avgT2 = Math.round((scored3T.reduce((s, t) => s + (t.completionProposal!.score3T!.t2), 0) / scored3T.length) * 10) / 10;
    const avgT3 = Math.round((scored3T.reduce((s, t) => s + (t.completionProposal!.score3T!.t3), 0) / scored3T.length) * 10) / 10;
    const gradeDist: Record<string, number> = {};
    for (const t of scored3T) {
      const g = t.completionProposal!.score3T!.grade;
      gradeDist[g] = (gradeDist[g] ?? 0) + 1;
    }
    return { scored3T, avgT1, avgT2, avgT3, gradeDist };
  }, [allMyActiveTasks]);

  // ── Evaluations I received ────────────────────────────────
  const myEvals = useMemo(
    () => evaluations
      .filter((e) => e.evaluatedUserId === currentUser.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [evaluations, currentUser.id],
  );

  const evalByType = useMemo(() => ({
    self:    myEvals.filter((e) => e.type === "self"),
    manager: myEvals.filter((e) => e.type === "manager"),
    peer:    myEvals.filter((e) => e.type === "peer"),
  }), [myEvals]);

  // ── KPI framework indicators ──────────────────────────────
  const kpiProgress = useMemo(() => {
    if (!framework?.indicators?.length) return [];
    return framework.indicators.map((ind) => {
      const matching = allMyActiveTasks.filter(
        (t) => t.kpi?.type && (t.kpi.type === ind.id || t.kpi.type.toLowerCase().includes(ind.name.toLowerCase().slice(0, 5))),
      );
      const actual = matching.reduce((s, t) => s + (t.kpi?.current ?? 0), 0);
      const target = ind.targetPerPeriod ?? 100;
      return { ...ind, actual, target, rate: target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0 };
    });
  }, [framework, allMyActiveTasks]);


  // ── Gauge data ────────────────────────────────────────────
  const gaugeColor = score.totalScore >= 75 ? "#22C55E" : score.totalScore >= 60 ? "#3B82F6" : score.totalScore >= 45 ? "#F59E0B" : "#EF4444";
  const radialData = [{ value: score.totalScore, fill: gaugeColor }];

  // ── Sparkline for trend ───────────────────────────────────
  const sparkData = trendData.map((d) => ({ period: d.period.split("/")[0], v: d.totalScore }));

  const evalScore = (e: Evaluation) => {
    const v = e.overallScore ?? (e.scores?.overall as number);
    return v ? Math.round(v / 20) : Math.round(Object.values(e.scores ?? {}).reduce((a, b) => a + b, 0) / Object.values(e.scores ?? {}).length / 20);
  };

  return (
    <div className="space-y-5">
      {/* ── Score overview ──────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Radial gauge */}
          <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="60%" outerRadius="88%"
                data={radialData} startAngle={210} endAngle={-30} barSize={10}
              >
                <RadialBar background={{ fill: "var(--border)" }} dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black leading-none" style={{ color: gaugeColor }}>{score.totalScore}</span>
              <span className="text-[9px] text-[var(--muted-foreground)]">/100</span>
            </div>
          </div>

          {/* Score info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold", rank.color.replace("text-", "bg-").replace("600", "50"), rank.color)}>
                {rank.label}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">{period}</span>
              {prevPeriod && (
                <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: trendColor }}>
                  <TrendIcon className="w-3 h-3" />
                  {trendDiff > 0 ? "+" : ""}{trendDiff} so với kỳ trước
                </span>
              )}
            </div>

            <div className="space-y-2">
              {[
                { label: "Thực thi (60%)", value: score.executionScore, color: "#F59E0B" },
                { label: "Định tính (40%)", value: score.qualitativeScore, color: "#8B5CF6" },
                { label: "Đúng hạn", value: score.onTimeRate, color: "#22C55E", unit: "%" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--muted-foreground)] w-28 shrink-0">{item.label}</span>
                  <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${item.unit ? item.value : item.value}%`, background: item.color }}
                    />
                  </div>
                  <span className="text-[11px] font-bold w-10 text-right" style={{ color: item.color }}>
                    {item.value}{item.unit ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sparkline */}
          {sparkData.length > 1 && (
            <div className="shrink-0 hidden sm:block" style={{ width: 120, height: 60 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={gaugeColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={gaugeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke={gaugeColor} strokeWidth={2} fill="url(#sparkGrad)" dot={false} />
                  <XAxis dataKey="period" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                    formatter={(v: number) => [`${v} điểm`, "Tổng"]}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-center text-[9px] text-[var(--muted-foreground)] -mt-1">Xu hướng</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Manager unit score panel ────────────────────────── */}
      {managerWeights && score.teamMemberCount > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Hiệu suất đơn vị
            </h3>
            <span className="text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)] px-2.5 py-1 rounded-full">
              {score.teamMemberCount} thành viên ·&nbsp;
              Cá nhân {managerWeights.personal * 100}% + Đơn vị {managerWeights.team * 100}%
            </span>
          </div>

          <div className="space-y-3">
            {/* Personal component */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[var(--muted-foreground)]">
                  Cá nhân ({managerWeights.personal * 100}%) ·&nbsp;
                  <span className="font-medium text-[var(--foreground)]">
                    đóng góp {Math.round(score.personalScore * managerWeights.personal)} điểm
                  </span>
                </span>
                <span className="font-bold text-blue-600">{score.personalScore}/100</span>
              </div>
              <div className="h-2.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${score.personalScore}%` }}
                />
              </div>
            </div>

            {/* Team component */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[var(--muted-foreground)]">
                  Trung bình đơn vị ({managerWeights.team * 100}%) ·&nbsp;
                  <span className="font-medium text-[var(--foreground)]">
                    đóng góp {Math.round(score.teamScore * managerWeights.team)} điểm
                  </span>
                </span>
                <span className="font-bold text-indigo-600">{score.teamScore}/100</span>
              </div>
              <div className="h-2.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${score.teamScore}%` }}
                />
              </div>
            </div>

            {/* Combined result */}
            <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
              <div className="flex-1 h-3 bg-[var(--border)] rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${managerWeights.personal * 100}%`, opacity: 0.3 + (score.personalScore / 100) * 0.7 }}
                />
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${managerWeights.team * 100}%`, opacity: 0.3 + (score.teamScore / 100) * 0.7 }}
                />
              </div>
              <span className="text-sm font-black text-[var(--foreground)] shrink-0">{score.totalScore}/100</span>
              <span className={cn(
                "text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0",
                rank.color.replace("text-", "bg-").replace("600", "50"),
                rank.color,
              )}>
                {rank.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 4 metric tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile
          icon={CheckCircle2}
          label="Hoàn thành kỳ này"
          value={`${periodTasks.filter((t) => t.status === "done").length}/${periodTasks.length}`}
          sub={`${score.completionRate}% tỷ lệ`}
          color="#22C55E"
        />
        <MetricTile
          icon={Clock}
          label="Đúng hạn"
          value={`${score.onTimeRate}%`}
          sub={score.onTimeRate >= 80 ? "Đúng tiến độ" : "Cần cải thiện"}
          color={score.onTimeRate >= 80 ? "#22C55E" : "#F59E0B"}
        />
        <MetricTile
          icon={ClipboardList}
          label="Tổng nhiệm vụ"
          value={allMyActiveTasks.filter((t) => t.status !== "cancelled").length}
          sub={`${allMyActiveTasks.filter((t) => t.status === "in_progress").length} đang thực hiện`}
          color="#3B82F6"
        />
        <MetricTile
          icon={Star}
          label="Đánh giá nhận"
          value={myEvals.length}
          sub={myEvals.length > 0 ? `${(myEvals.reduce((s, e) => s + evalScore(e), 0) / myEvals.length).toFixed(1)}/5 sao` : "Chưa có"}
          color="#F59E0B"
        />
      </div>

      {/* ── 3T Score summary ────────────────────────────────── */}
      {scored3T.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-500" />
            Điểm 3T — {scored3T.length} nhiệm vụ đã chấm
          </h3>

          {/* T1/T2/T3 bars */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "T1 — Tiến độ", value: avgT1, color: "#3B82F6" },
              { label: "T2 — Chất lượng", value: avgT2, color: "#8B5CF6" },
              { label: "T3 — Nguồn lực", value: avgT3, color: "#06B6D4" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: `${item.color}10` }}>
                <p className="text-xl font-black" style={{ color: item.color }}>{item.value}</p>
                <p className="text-[9px] text-[var(--muted-foreground)] mt-0.5 font-medium">/10</p>
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Grade distribution */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(GRADE_CFG).map(([key, cfg]) => {
              const count = gradeDist[key] ?? 0;
              if (count === 0) return null;
              return (
                <span
                  key={key}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", cfg.bg, cfg.text)}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                  {cfg.label} × {count}
                </span>
              );
            })}
          </div>

          {/* Recent scored tasks */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
            {scored3T.slice(0, 6).map((t) => {
              const s = t.completionProposal!.score3T!;
              const cfg = GRADE_CFG[s.grade];
              return (
                <div key={t.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--foreground)] truncate">{t.name}</p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", cfg.bg, cfg.text)}>
                    {s.total}/10
                  </span>
                  <span className="text-[10px] text-[var(--muted-foreground)] shrink-0 hidden sm:block">
                    T1:{s.t1} · T2:{s.t2} · T3:{s.t3}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── KPI Framework indicators ─────────────────────────── */}
      {kpiProgress.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" />
            Chỉ số KPI — {framework!.name}
          </h3>
          <div className="space-y-3">
            {kpiProgress.map((ind, i) => {
              const colors = ["#3B82F6","#8B5CF6","#22C55E","#F59E0B","#06B6D4","#EC4899"];
              const color = colors[i % colors.length];
              return (
                <div key={ind.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs font-medium text-[var(--foreground)] truncate">{ind.name}</span>
                      <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">({ind.weight}%)</span>
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{ color }}>
                      {ind.actual}/{ind.target} {ind.unit}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${ind.rate}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Evaluations received ─────────────────────────────── */}
      {myEvals.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-500" />
              Đánh giá nhận được
            </h3>
            <div className="flex gap-2">
              {(["self","manager","peer"] as const).map((type) => {
                const count = evalByType[type].length;
                if (count === 0) return null;
                const cfg = {
                  self:    { label: "Tự đánh giá", cls: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
                  manager: { label: "Quản lý",      cls: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" },
                  peer:    { label: "Đồng nghiệp",  cls: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
                }[type];
                return (
                  <span key={type} className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", cfg.cls)}>
                    {cfg.label} ×{count}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
            {myEvals.slice(0, 8).map((ev) => {
              const star = evalScore(ev);
              const typeCfg = {
                self:    { label: "Tự đánh giá", color: "#3B82F6" },
                manager: { label: "Quản lý",      color: "#8B5CF6" },
                peer:    { label: "Đồng nghiệp",  color: "#22C55E" },
              }[ev.type] ?? { label: ev.type, color: "#94A3B8" };
              return (
                <div key={ev.id} className="p-3 bg-[var(--muted)] rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: `${typeCfg.color}15`, color: typeCfg.color }}
                      >
                        {typeCfg.label}
                      </span>
                      {ev.isAnonymous && (
                        <span className="text-[10px] text-[var(--muted-foreground)] italic">Ẩn danh</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Stars value={star} />
                      <span className="text-[10px] text-[var(--muted-foreground)]">{formatDate(ev.createdAt)}</span>
                    </div>
                  </div>
                  {ev.comment && (
                    <p className="text-xs text-[var(--muted-foreground)] line-clamp-2">{ev.comment}</p>
                  )}
                  {Object.keys(ev.scores ?? {}).filter((k) => k !== "overall").length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {Object.entries(ev.scores).filter(([k]) => k !== "overall").map(([k, v]) => (
                        <span key={k} className="text-[10px] text-[var(--muted-foreground)]">
                          {k}: <span className="font-semibold text-[var(--foreground)]">{v}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trend chart ──────────────────────────────────────── */}
      {trendData.length > 1 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            Xu hướng điểm số theo quý
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number, name: string) => [
                  `${v} điểm`,
                  name === "totalScore" ? "Tổng" : name === "executionScore" ? "Thực thi" : "Định tính",
                ]}
              />
              <Area type="monotone" dataKey="totalScore" stroke="#3B82F6" strokeWidth={2.5} fill="url(#totalGrad)" dot={{ r: 4, fill: "#3B82F6" }} />
              <Area type="monotone" dataKey="executionScore" stroke="#F59E0B" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false} />
              <Area type="monotone" dataKey="qualitativeScore" stroke="#8B5CF6" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[10px] text-[var(--muted-foreground)] justify-center">
            {[
              { color: "#3B82F6", label: "Tổng điểm" },
              { color: "#F59E0B", label: "Thực thi (60%)", dash: true },
              { color: "#8B5CF6", label: "Định tính (40%)", dash: true },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <svg width={20} height={4}>
                  <line x1="0" y1="2" x2="20" y2="2" stroke={l.color} strokeWidth={l.dash ? 1.5 : 2.5} strokeDasharray={l.dash ? "4 2" : undefined} />
                </svg>
                {l.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {allMyActiveTasks.length === 0 && myEvals.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-2xl">
          <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chưa có dữ liệu KPI trong kỳ này.</p>
          <p className="text-slate-400 text-xs mt-1">Dữ liệu sẽ xuất hiện khi bạn có nhiệm vụ hoặc đánh giá.</p>
        </div>
      )}
    </div>
  );
}
