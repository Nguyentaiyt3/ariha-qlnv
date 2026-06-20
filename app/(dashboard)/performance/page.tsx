"use client";

import { useState, useEffect, useMemo } from "react";
import { TrendingUp, Users, Star, BarChart3, ChevronDown } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getEvaluations, getKPIFrameworks } from "@/lib/firebase/firestore";
import { calcPerformanceScore, getRank } from "@/lib/performance-score";
import type { Evaluation, KPIFramework as KPIFrameworkType } from "@/types";
import PerformanceTrend from "@/components/performance/PerformanceTrend";
import EvaluationForm from "@/components/performance/EvaluationForm";
import KPIFrameworkEditor from "@/components/performance/KPIFramework";
import { getInitials, avatarColor } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";

const CURRENT_YEAR = new Date().getFullYear();
const PERIODS = [
  `Q1/${CURRENT_YEAR}`, `Q2/${CURRENT_YEAR}`, `Q3/${CURRENT_YEAR}`, `Q4/${CURRENT_YEAR}`,
];

export default function PerformancePage() {
  const { currentUser } = useAuthStore();
  const { tasks, users } = useTaskStore();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [frameworks, setFrameworks] = useState<KPIFrameworkType[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[Math.floor((new Date().getMonth()) / 3)]);
  const [activeTab, setActiveTab] = useState<"overview" | "evaluate" | "kpi">("overview");
  const [evaluateTarget, setEvaluateTarget] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const canManageKPI = currentUser ? hasPermission(currentUser.role, "kpi:evaluate") : false;
  const canEditKPI = currentUser ? hasPermission(currentUser.role, "kpi:*") : false;

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      getEvaluations(currentUser.id),
      getKPIFrameworks(),
    ])
      .then(([evals, fws]) => {
        setEvaluations(evals);
        setFrameworks(fws);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  const periodToRange = (p: string): { start: string; end: string } => {
    const [q, y] = p.split("/");
    const qi = parseInt(q.replace("Q", "")) - 1;
    const year = parseInt(y);
    const month = qi * 3;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 3, 0);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const scores = useMemo(() => {
    const { start, end } = periodToRange(selectedPeriod);
    return users
      .filter((u) => u.isActive && u.role !== "guest")
      .map((u) =>
        calcPerformanceScore({ tasks, evaluations, userId: u.id, periodStart: start, periodEnd: end }),
      )
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [tasks, evaluations, users, selectedPeriod]);

  const trendData = PERIODS.slice(0, PERIODS.indexOf(selectedPeriod) + 1).map((p) => {
    const { start, end } = periodToRange(p);
    const myScore = calcPerformanceScore({
      tasks,
      evaluations,
      userId: currentUser?.id ?? "",
      periodStart: start,
      periodEnd: end,
    });
    return { period: p, ...myScore };
  });

  const myScore = scores.find((s) => s.userId === currentUser?.id);

  const TABS: { id: "overview" | "evaluate" | "kpi"; label: string; hidden?: boolean }[] = [
    { id: "overview", label: "Tổng quan" },
    { id: "evaluate", label: "Đánh giá", hidden: !canManageKPI },
    { id: "kpi", label: "Khung KPI", hidden: !canEditKPI },
  ];

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-blue-500" />
          Hiệu suất nhân viên
        </h1>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {TABS.filter((t) => !t.hidden).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* My score */}
          {myScore && currentUser && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white">
              <p className="text-sm text-blue-200 mb-1">Điểm của bạn — {selectedPeriod}</p>
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
            </div>
          )}

          {/* Trend */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" /> Xu hướng điểm số
            </h3>
            <PerformanceTrend data={trendData} />
          </div>

          {/* Leaderboard */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" /> Bảng xếp hạng — {selectedPeriod}
            </h3>
            <div className="space-y-2">
              {scores.slice(0, 10).map((score, i) => {
                const user = users.find((u) => u.id === score.userId);
                if (!user) return null;
                const rank = getRank(score.totalScore);
                return (
                  <div
                    key={score.userId}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      score.userId === currentUser?.id ? "bg-blue-50 border border-blue-200" : "hover:bg-[var(--muted)]"
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    }`}>
                      {i + 1}
                    </span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: avatarColor(user.name) }}
                    >
                      {getInitials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{user.department}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--foreground)]">{score.totalScore}</p>
                      <p className={`text-xs font-medium ${rank.color}`}>{rank.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Evaluate tab */}
      {activeTab === "evaluate" && canManageKPI && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Chọn nhân viên đánh giá</label>
            <select
              value={evaluateTarget}
              onChange={(e) => setEvaluateTarget(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn nhân viên --</option>
              {users
                .filter((u) => u.isActive && u.id !== currentUser?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.department}</option>
                ))}
            </select>
          </div>
          {evaluateTarget && currentUser && (
            <EvaluationForm
              targetUserId={evaluateTarget}
              evaluatorId={currentUser.id}
              type="manager"
              period={selectedPeriod}
              onDone={() => setEvaluateTarget("")}
            />
          )}
          {!evaluateTarget && currentUser && (
            <EvaluationForm
              targetUserId={currentUser.id}
              evaluatorId={currentUser.id}
              type="self"
              period={selectedPeriod}
            />
          )}
        </div>
      )}

      {/* KPI Framework tab */}
      {activeTab === "kpi" && canEditKPI && (
        <div className="space-y-5">
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
        </div>
      )}
    </div>
  );
}
