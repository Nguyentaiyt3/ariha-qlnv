"use client";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Star, BarChart3, ChevronLeft, Eye,
  ClipboardList, MessageSquare, User as UserIcon,
} from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getEvaluations, getAllEvaluations, getKPIFrameworks } from "@/lib/firebase/firestore";
import { calcPerformanceScore, getRank } from "@/lib/performance-score";
import type { Evaluation, KPIFramework as KPIFrameworkType, User } from "@/types";
import PerformanceTrend from "@/components/performance/PerformanceTrend";
import PersonalKPIDashboard from "@/components/performance/PersonalKPIDashboard";
import EvaluationForm from "@/components/performance/EvaluationForm";
import KPIFrameworkEditor from "@/components/performance/KPIFramework";
import { getInitials, avatarColor, formatDate } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import { cn } from "@/lib/utils";

// ─── Period helpers ───────────────────────────────────────────

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1; // 1–12
const CURRENT_Q     = Math.ceil(CURRENT_MONTH / 3); // 1–4

type FilterMode = "monthly" | "quarterly" | "yearly" | "3years";

const MODE_LABELS: Record<FilterMode, string> = {
  monthly:  "Tháng",
  quarterly: "Quý",
  yearly:   "Năm",
  "3years": "3 năm",
};

function getPeriodOptions(mode: FilterMode): string[] {
  if (mode === "monthly") {
    const opts: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(CURRENT_YEAR, CURRENT_MONTH - 1 - i, 1);
      opts.push(`T${d.getMonth() + 1}/${d.getFullYear()}`);
    }
    return opts;
  }
  if (mode === "quarterly") {
    return ["Q1", "Q2", "Q3", "Q4"].map((q) => `${q}/${CURRENT_YEAR}`);
  }
  if (mode === "yearly") {
    return [`${CURRENT_YEAR - 2}`, `${CURRENT_YEAR - 1}`, `${CURRENT_YEAR}`];
  }
  return ["3years"];
}

function defaultPeriod(mode: FilterMode): string {
  if (mode === "monthly")  return `T${CURRENT_MONTH}/${CURRENT_YEAR}`;
  if (mode === "quarterly") return `Q${CURRENT_Q}/${CURRENT_YEAR}`;
  if (mode === "yearly")   return `${CURRENT_YEAR}`;
  return "3years";
}

function periodLabel(p: string): string {
  if (p === "3years") return "3 năm gần nhất";
  if (p.startsWith("T")) {
    const [m, y] = p.split("/");
    return `Tháng ${m.replace("T", "")}/${y}`;
  }
  if (p.startsWith("Q")) return p.replace("/", " / ");
  return `Năm ${p}`;
}

function periodToRange(p: string): { start: string; end: string } {
  // Monthly: "T3/2026"
  if (p.startsWith("T")) {
    const [m, y] = p.split("/");
    const month = parseInt(m.replace("T", "")) - 1;
    const year  = parseInt(y);
    return {
      start: new Date(year, month, 1).toISOString(),
      end:   new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
    };
  }
  // Quarterly: "Q3/2026"
  if (p.startsWith("Q")) {
    const [q, y] = p.split("/");
    const qi    = parseInt(q.replace("Q", "")) - 1;
    const year  = parseInt(y);
    const month = qi * 3;
    return {
      start: new Date(year, month, 1).toISOString(),
      end:   new Date(year, month + 3, 0, 23, 59, 59).toISOString(),
    };
  }
  // 3 years rolling
  if (p === "3years") {
    return {
      start: new Date(CURRENT_YEAR - 3, 0, 1).toISOString(),
      end:   new Date().toISOString(),
    };
  }
  // Yearly: "2026"
  const year = parseInt(p);
  return {
    start: new Date(year, 0, 1).toISOString(),
    end:   new Date(year, 11, 31, 23, 59, 59).toISOString(),
  };
}

// ─── Sub-components ───────────────────────────────────────────

function StarRow({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn("w-3.5 h-3.5", s <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")}
        />
      ))}
    </span>
  );
}

function EvalTypeLabel({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    self:    { label: "Tự đánh giá", cls: "bg-blue-50 text-blue-600" },
    manager: { label: "Quản lý",     cls: "bg-purple-50 text-purple-600" },
    peer:    { label: "Đồng nghiệp", cls: "bg-green-50 text-green-600" },
  };
  const info = map[type] ?? { label: type, cls: "bg-slate-100 text-slate-600" };
  return <span className={cn("px-2 py-0.5 text-xs rounded-full font-medium", info.cls)}>{info.label}</span>;
}

interface UserDetailPanelProps {
  user: User;
  score: ReturnType<typeof calcPerformanceScore>;
  evals: Evaluation[];
  loadingEvals: boolean;
  period: string;
  canEvaluate: boolean;
  onEvaluate: () => void;
  onClose: () => void;
}

function UserDetailPanel({ user, score, evals, loadingEvals, period, canEvaluate, onEvaluate, onClose }: UserDetailPanelProps) {
  const rank = getRank(score.totalScore);
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: avatarColor(user.name) }}
          >
            {getInitials(user.name)}
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-white">{user.name}</p>
            <p className="text-xs text-slate-400">{user.department} · {user.position ?? user.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEvaluate && (
            <button
              onClick={onEvaluate}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition font-medium"
            >
              Đánh giá ngay
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Điểm tổng", value: `${score.totalScore}/100`, color: rank.color },
          { label: "Thực thi",  value: `${score.executionScore}`,   color: "text-blue-600" },
          { label: "Định tính", value: `${score.qualitativeScore}`, color: "text-purple-600" },
          { label: "Đúng hạn",  value: `${score.onTimeRate}%`,      color: "text-green-600" },
        ].map((item) => (
          <div key={item.label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
            <p className={cn("text-lg font-bold", item.color)}>{item.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          Lịch sử đánh giá — {periodLabel(period)}
        </p>
        {loadingEvals ? (
          <p className="text-xs text-slate-400 text-center py-4">Đang tải...</p>
        ) : evals.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Chưa có đánh giá nào trong kỳ này.</p>
        ) : (
          <div className="space-y-2">
            {evals.map((ev) => (
              <div key={ev.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <EvalTypeLabel type={ev.type} />
                    {ev.isAnonymous && <span className="text-xs text-slate-400 italic">Ẩn danh</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRow value={ev.overallScore ? Math.round(ev.overallScore / 20) : (ev.scores?.overall ?? 0)} />
                    <span className="text-xs text-slate-400">{formatDate(ev.createdAt)}</span>
                  </div>
                </div>
                {ev.comment && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 flex gap-1.5 mt-1">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                    {ev.comment}
                  </p>
                )}
                {Object.keys(ev.scores ?? {}).filter((k) => k !== "overall").length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(ev.scores).filter(([k]) => k !== "overall").map(([k, v]) => (
                      <span key={k} className="text-xs text-slate-500">
                        {k}: <span className="font-medium text-slate-700 dark:text-slate-300">{v}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function PerformancePage() {
  const { currentUser } = useAuthStore();
  const { tasks, users } = useTaskStore();

  const [evaluations,    setEvaluations]    = useState<Evaluation[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);
  const [frameworks,     setFrameworks]     = useState<KPIFrameworkType[]>([]);

  const [filterMode,     setFilterMode]     = useState<FilterMode>("quarterly");
  const [selectedPeriod, setSelectedPeriod] = useState(() => defaultPeriod("quarterly"));
  const [activeTab, setActiveTab] = useState<"personal" | "overview" | "history" | "evaluate" | "kpi">("personal");
  const [evaluateTarget, setEvaluateTarget] = useState("");
  const [loading, setLoading] = useState(true);

  const [drillUserId,   setDrillUserId]   = useState<string | null>(null);
  const [drillEvals,    setDrillEvals]    = useState<Evaluation[]>([]);
  const [loadingDrill,  setLoadingDrill]  = useState(false);

  const [historyUserId,   setHistoryUserId]   = useState("");
  const [historyEvals,    setHistoryEvals]    = useState<Evaluation[]>([]);
  const [loadingHistory,  setLoadingHistory]  = useState(false);

  const canManageKPI = currentUser ? hasPermission(currentUser.role, "kpi:evaluate") : false;
  const canEditKPI   = currentUser ? hasPermission(currentUser.role, "kpi:*")        : false;

  useEffect(() => {
    if (!currentUser) return;
    const fetches: Promise<unknown>[] = [
      getEvaluations(currentUser.id).then(setEvaluations),
      getKPIFrameworks().then(setFrameworks),
    ];
    if (canManageKPI) fetches.push(getAllEvaluations().then(setAllEvaluations));
    Promise.all(fetches).catch(console.error).finally(() => setLoading(false));
  }, [currentUser, canManageKPI]);

  function switchMode(mode: FilterMode) {
    setFilterMode(mode);
    setSelectedPeriod(defaultPeriod(mode));
    setDrillUserId(null);
  }

  const { start: pStart, end: pEnd } = useMemo(() => periodToRange(selectedPeriod), [selectedPeriod]);

  const evalsForPeriod = useMemo(() => {
    const src = canManageKPI ? allEvaluations : evaluations;
    return src.filter((e) => e.createdAt >= pStart && e.createdAt <= pEnd);
  }, [evaluations, allEvaluations, pStart, pEnd, canManageKPI]);

  const scores = useMemo(() => {
    const src = canManageKPI ? allEvaluations : evaluations;
    return users
      .filter((u) => u.isActive && u.role !== "guest")
      .map((u) => calcPerformanceScore({ tasks, evaluations: src, userId: u.id, periodStart: pStart, periodEnd: pEnd }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [tasks, evaluations, allEvaluations, users, pStart, pEnd, canManageKPI]);

  // Trend periods adapt to filter mode
  const trendPeriods = useMemo<string[]>(() => {
    if (filterMode === "monthly") {
      const ps: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(CURRENT_YEAR, CURRENT_MONTH - 1 - i, 1);
        ps.push(`T${d.getMonth() + 1}/${d.getFullYear()}`);
      }
      return ps;
    }
    if (filterMode === "quarterly") {
      return ["Q1", "Q2", "Q3", "Q4"].slice(0, CURRENT_Q).map((q) => `${q}/${CURRENT_YEAR}`);
    }
    // yearly / 3years → 3-year yearly trend
    return [`${CURRENT_YEAR - 2}`, `${CURRENT_YEAR - 1}`, `${CURRENT_YEAR}`];
  }, [filterMode]);

  const trendData = useMemo(() => {
    if (!currentUser) return [];
    return trendPeriods.map((p) => {
      const { start, end } = periodToRange(p);
      const s = calcPerformanceScore({ tasks, evaluations, userId: currentUser.id, periodStart: start, periodEnd: end });
      return { period: p, ...s };
    });
  }, [trendPeriods, tasks, evaluations, currentUser]);

  const myScore    = scores.find((s) => s.userId === currentUser?.id);
  const drillUser  = drillUserId ? users.find((u) => u.id === drillUserId) : null;
  const drillScore = drillUserId ? scores.find((s) => s.userId === drillUserId) : null;

  async function openDrill(userId: string) {
    if (drillUserId === userId) { setDrillUserId(null); return; }
    setDrillUserId(userId);
    setLoadingDrill(true);
    try {
      const evals = await getEvaluations(userId);
      setDrillEvals(evals.filter((e) => e.createdAt >= pStart && e.createdAt <= pEnd));
    } catch { setDrillEvals([]); }
    finally { setLoadingDrill(false); }
  }

  async function loadHistoryEvals(userId: string) {
    if (!userId) { setHistoryEvals([]); return; }
    setLoadingHistory(true);
    try { setHistoryEvals(await getEvaluations(userId)); }
    catch { setHistoryEvals([]); }
    finally { setLoadingHistory(false); }
  }

  // Tabs — "Đánh giá" visible to all (staff → self-eval only)
  const TABS: { id: typeof activeTab; label: string; hidden?: boolean }[] = [
    { id: "personal",  label: "KPI Cá nhân" },
    { id: "overview",  label: "Tổng quan tổ chức", hidden: !canManageKPI },
    { id: "history",   label: "Lịch sử đánh giá",  hidden: !canManageKPI },
    { id: "evaluate",  label: "Đánh giá" },
    { id: "kpi",       label: "Khung KPI",           hidden: !canEditKPI },
  ];

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-blue-500" />
          Hiệu suất nhân viên
        </h1>

        {/* Period filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode segmented control */}
          <div className="flex bg-[var(--muted)] rounded-lg p-0.5">
            {(Object.keys(MODE_LABELS) as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  filterMode === m
                    ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {filterMode !== "3years" ? (
            <select
              value={selectedPeriod}
              onChange={(e) => { setSelectedPeriod(e.target.value); setDrillUserId(null); }}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {getPeriodOptions(filterMode).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <span className="px-3 py-1.5 text-sm text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg bg-[var(--muted)]">
              3 năm gần nhất
            </span>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)] overflow-x-auto">
        {TABS.filter((t) => !t.hidden).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setDrillUserId(null); }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              activeTab === tab.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── KPI Cá nhân ────────────────────────────────────── */}
      {activeTab === "personal" && currentUser && (
        <PersonalKPIDashboard
          currentUser={currentUser}
          users={users}
          tasks={tasks}
          evaluations={evaluations}
          framework={frameworks.find((f) => f.department === currentUser.department && f.year === CURRENT_YEAR)}
          period={periodLabel(selectedPeriod)}
          trendData={trendData}
          periodStart={pStart}
          periodEnd={pEnd}
        />
      )}

      {/* ── Tổng quan tổ chức ──────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {myScore && currentUser && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white">
              <p className="text-sm text-blue-200 mb-1">Điểm của bạn — {periodLabel(selectedPeriod)}</p>
              <div className="flex items-end gap-4">
                <div>
                  <span className="text-5xl font-bold">{myScore.totalScore}</span>
                  <span className="text-xl text-blue-200">/100</span>
                </div>
                <div className="mb-1">
                  <p className="text-base font-semibold">{getRank(myScore.totalScore).label}</p>
                  <p className="text-xs text-blue-200">Thực thi: {myScore.executionScore} · Định tính: {myScore.qualitativeScore}</p>
                  <p className="text-xs text-blue-200">Hoàn thành đúng hạn: {myScore.onTimeRate}%</p>
                </div>
              </div>
              {evaluations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-500/40">
                  <p className="text-xs text-blue-200 mb-2">Đánh giá bạn nhận được trong kỳ này:</p>
                  <div className="flex flex-wrap gap-2">
                    {evalsForPeriod.filter((e) => e.evaluatedUserId === currentUser.id).map((ev) => (
                      <div key={ev.id} className="bg-blue-700/40 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                        <EvalTypeLabel type={ev.type} />
                        <StarRow value={ev.overallScore ? Math.round(ev.overallScore / 20) : (ev.scores?.overall ?? 0)} />
                        {ev.comment && <span className="text-blue-100 truncate max-w-[160px]">{ev.comment}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" /> Xu hướng điểm số của bạn
            </h3>
            <PerformanceTrend data={trendData} />
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" /> Bảng xếp hạng — {periodLabel(selectedPeriod)}
            </h3>
            <div className="space-y-1">
              {scores.slice(0, 15).map((score, i) => {
                const user  = users.find((u) => u.id === score.userId);
                if (!user) return null;
                const rank    = getRank(score.totalScore);
                const isMe    = score.userId === currentUser?.id;
                const isDrill = drillUserId === score.userId;
                return (
                  <div key={score.userId}>
                    <button
                      onClick={() => canManageKPI ? openDrill(score.userId) : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                        isMe    ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700" : "hover:bg-[var(--muted)]",
                        isDrill && "ring-2 ring-blue-500",
                        canManageKPI && "cursor-pointer",
                      )}
                    >
                      <span className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i === 0 ? "bg-amber-100 text-amber-700"
                          : i === 1 ? "bg-gray-100 text-gray-600"
                          : i === 2 ? "bg-orange-100 text-orange-700"
                          : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                      )}>{i + 1}</span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: avatarColor(user.name) }}
                      >{getInitials(user.name)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.name}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{user.department}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[var(--foreground)]">{score.totalScore}/100</p>
                        <p className={cn("text-xs font-medium", rank.color)}>{rank.label}</p>
                      </div>
                      {canManageKPI && (
                        <Eye className={cn("w-4 h-4 shrink-0 transition", isDrill ? "text-blue-500" : "text-slate-300")} />
                      )}
                    </button>

                    {isDrill && drillUser && drillScore && (
                      <div className="mt-1 ml-10">
                        <UserDetailPanel
                          user={drillUser}
                          score={drillScore}
                          evals={drillEvals}
                          loadingEvals={loadingDrill}
                          period={selectedPeriod}
                          canEvaluate={canManageKPI && drillUser.id !== currentUser?.id}
                          onEvaluate={() => {
                            setEvaluateTarget(drillUser.id);
                            setActiveTab("evaluate");
                            setDrillUserId(null);
                          }}
                          onClose={() => setDrillUserId(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {canManageKPI && (
              <p className="text-xs text-slate-400 mt-3 text-center">Nhấn vào nhân viên để xem chi tiết đánh giá</p>
            )}
          </div>
        </div>
      )}

      {/* ── Lịch sử đánh giá ───────────────────────────────── */}
      {activeTab === "history" && canManageKPI && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Chọn nhân viên</label>
            <select
              value={historyUserId}
              onChange={(e) => { setHistoryUserId(e.target.value); loadHistoryEvals(e.target.value); }}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn nhân viên --</option>
              {users.filter((u) => u.isActive && u.role !== "guest").map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.department}</option>
              ))}
            </select>
          </div>

          {historyUserId && (() => {
            const user  = users.find((u) => u.id === historyUserId);
            const score = scores.find((s) => s.userId === historyUserId);
            if (!user || !score) return null;
            return (
              <UserDetailPanel
                user={user}
                score={score}
                evals={historyEvals}
                loadingEvals={loadingHistory}
                period={selectedPeriod}
                canEvaluate={historyUserId !== currentUser?.id}
                onEvaluate={() => { setEvaluateTarget(historyUserId); setActiveTab("evaluate"); }}
                onClose={() => setHistoryUserId("")}
              />
            );
          })()}

          {!historyUserId && (
            <div className="text-center py-16">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Chọn nhân viên để xem toàn bộ lịch sử đánh giá.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Đánh giá (all roles) ───────────────────────────── */}
      {activeTab === "evaluate" && (
        <div className="space-y-5">
          {canManageKPI ? (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Chọn nhân viên đánh giá</label>
              <select
                value={evaluateTarget}
                onChange={(e) => setEvaluateTarget(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Tự đánh giá --</option>
                {users.filter((u) => u.isActive && u.id !== currentUser?.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.department}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm border border-blue-200 dark:border-blue-700">
              <UserIcon className="w-4 h-4 shrink-0" />
              Tự đánh giá kỳ {periodLabel(selectedPeriod)}
            </div>
          )}

          {currentUser && (
            <EvaluationForm
              targetUserId={canManageKPI ? (evaluateTarget || currentUser.id) : currentUser.id}
              evaluatorId={currentUser.id}
              type={canManageKPI && evaluateTarget ? "manager" : "self"}
              period={selectedPeriod}
              onDone={(saved) => {
                setEvaluateTarget("");
                if (canManageKPI) getAllEvaluations().then(setAllEvaluations).catch(console.error);
                if (saved.evaluatedUserId === currentUser?.id) {
                  getEvaluations(currentUser.id).then(setEvaluations).catch(console.error);
                }
              }}
            />
          )}
        </div>
      )}

      {/* ── Khung KPI ──────────────────────────────────────── */}
      {activeTab === "kpi" && canEditKPI && (
        <KPIFrameworkEditor
          department={currentUser?.department ?? "Toàn công ty"}
          year={CURRENT_YEAR}
          framework={frameworks.find((f) => f.department === currentUser?.department && f.year === CURRENT_YEAR)}
          onSaved={(fw: KPIFrameworkType) => {
            setFrameworks((prev) => {
              const idx = prev.findIndex((f) => f.id === fw.id);
              if (idx >= 0) { const copy = [...prev]; copy[idx] = fw; return copy; }
              return [...prev, fw];
            });
          }}
        />
      )}
    </div>
  );
}
