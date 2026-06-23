"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle2, Search, ChevronDown, Award,
  MessageSquare, Star, Users, Lock,
} from "lucide-react";
import type { Task, Evaluation, User } from "@/types";
import { cn } from "@/lib/utils";

// ─── Shared config ────────────────────────────────────────────

const GRADE_CFG = {
  xuatSac:        { label: "Xuất sắc",       color: "#22C55E", bg: "bg-green-50 dark:bg-green-900/20",  text: "text-green-700 dark:text-green-400" },
  hoanThanhTot:   { label: "Hoàn thành tốt", color: "#3B82F6", bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-700 dark:text-blue-400"  },
  hoanThanh:      { label: "Hoàn thành",     color: "#F59E0B", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" },
  khongHoanThanh: { label: "Không HT",       color: "#EF4444", bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-400"    },
} as const;

const STEP_STATUS_CFG = {
  pending:     { label: "Chờ",        color: "#94A3B8" },
  in_progress: { label: "Đang làm",   color: "#F59E0B" },
  completed:   { label: "Hoàn thành", color: "#22C55E" },
} as const;

type TimeFilter = "3m" | "6m" | "year" | "3y" | "all";
type GradeFilter = "all" | keyof typeof GRADE_CFG;

// ─── Props ────────────────────────────────────────────────────

interface Props {
  currentUser: User;
  users: User[];
  tasks: Task[];
  evaluations: Evaluation[];
  /** teamLead+ can view any user's completed tasks */
  canManageKPI: boolean;
}

// ─── Component ────────────────────────────────────────────────

export default function CompletedTasksTab({ currentUser, users, tasks, evaluations, canManageKPI }: Props) {
  const [viewUserId,      setViewUserId]      = useState(currentUser.id);
  const [taskSearch,      setTaskSearch]      = useState("");
  const [gradeFilter,     setGradeFilter]     = useState<GradeFilter>("all");
  const [timeFilter,      setTimeFilter]      = useState<TimeFilter>("3y");
  const [expandedTaskId,  setExpandedTaskId]  = useState<string | null>(null);

  const viewUser = users.find((u) => u.id === viewUserId) ?? currentUser;
  const isOwnView = viewUserId === currentUser.id;

  // ── All completed tasks for selected user ──────────────────
  const allCompleted = useMemo(() =>
    tasks
      .filter((t) =>
        (t.mainPerformerId === viewUserId ||
          (t.stakeholders ?? []).some((s) => s.userId === viewUserId && s.role === "assignee")) &&
        t.status === "done",
      )
      .sort((a, b) =>
        (b.completedAt ?? b.deadlineBase ?? "").localeCompare(a.completedAt ?? a.deadlineBase ?? ""),
      ),
    [tasks, viewUserId],
  );

  // ── Filtered list ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = new Date();
    const cutoffs: Record<string, Date> = {
      "3m":  new Date(now.getFullYear(), now.getMonth() - 3,  now.getDate()),
      "6m":  new Date(now.getFullYear(), now.getMonth() - 6,  now.getDate()),
      year:  new Date(now.getFullYear(), 0, 1),
      "3y":  new Date(now.getFullYear() - 3, 0, 1),
    };

    let list = allCompleted;

    if (timeFilter !== "all") {
      const since = cutoffs[timeFilter];
      list = list.filter((t) => {
        const d = t.completedAt ?? t.deadlineBase;
        return d ? new Date(d) >= since : true;
      });
    }

    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }

    if (gradeFilter !== "all") {
      list = list.filter((t) => t.completionProposal?.score3T?.grade === gradeFilter);
    }

    return list;
  }, [allCompleted, timeFilter, taskSearch, gradeFilter]);

  const evalStar = (ev: { overallScore?: number; scores?: Record<string, number> }) => {
    const raw = ev.overallScore ?? (
      Object.values(ev.scores ?? {}).reduce((a, b) => a + b, 0) /
      Math.max(1, Object.values(ev.scores ?? {}).length)
    );
    return Math.round(raw / 20);
  };

  return (
    <div className="space-y-4">
      {/* ── Permission bar ──────────────────────────────────── */}
      {canManageKPI ? (
        <div className="flex items-center gap-3 p-3 bg-[var(--muted)] rounded-xl border border-[var(--border)]">
          <Users className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-xs text-[var(--muted-foreground)] shrink-0">Xem nhiệm vụ của:</span>
          <select
            value={viewUserId}
            onChange={(e) => { setViewUserId(e.target.value); setExpandedTaskId(null); }}
            className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {users
              .filter((u) => u.isActive && u.role !== "guest")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.department ? ` — ${u.department}` : ""}{u.id === currentUser.id ? " (bạn)" : ""}
                </option>
              ))}
          </select>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400 text-sm">
          <Lock className="w-4 h-4 shrink-0" />
          Hiển thị nhiệm vụ hoàn thành của bạn
        </div>
      )}

      {/* ── Main card ───────────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">

        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              {isOwnView ? "Nhiệm vụ của bạn" : `Nhiệm vụ của ${viewUser.name}`}
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold">
                {filtered.length}
              </span>
            </h3>

            {/* Time filter */}
            <div className="flex bg-[var(--muted)] rounded-lg p-0.5">
              {([
                { key: "3m",   label: "3T" },
                { key: "6m",   label: "6T" },
                { key: "year", label: "Năm nay" },
                { key: "3y",   label: "3 năm" },
                { key: "all",  label: "Tất cả" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTimeFilter(key)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap",
                    timeFilter === key
                      ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search + grade filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Tìm tên nhiệm vụ..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-1 flex-wrap shrink-0">
              {([
                { key: "all" as const,            label: "Tất cả",   hex: "#64748B" },
                { key: "xuatSac" as const,         label: "Xuất sắc", hex: GRADE_CFG.xuatSac.color },
                { key: "hoanThanhTot" as const,    label: "HT tốt",   hex: GRADE_CFG.hoanThanhTot.color },
                { key: "hoanThanh" as const,       label: "HT",       hex: GRADE_CFG.hoanThanh.color },
                { key: "khongHoanThanh" as const,  label: "Không HT", hex: GRADE_CFG.khongHoanThanh.color },
              ]).map(({ key, label, hex }) => (
                <button
                  key={key}
                  onClick={() => setGradeFilter(gradeFilter === key ? "all" : key)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors",
                    gradeFilter === key
                      ? "border-transparent text-white"
                      : "border-[var(--border)] text-[var(--muted-foreground)] bg-[var(--muted)]",
                  )}
                  style={gradeFilter === key ? { background: hex } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Task list */}
        {allCompleted.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-[var(--muted-foreground)]">
              {isOwnView ? "Bạn chưa có nhiệm vụ hoàn thành." : `${viewUser.name} chưa có nhiệm vụ hoàn thành.`}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-[var(--muted-foreground)] py-8">
            Không có nhiệm vụ phù hợp với bộ lọc.
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
            {filtered.map((task) => {
              const s3t      = task.completionProposal?.score3T;
              const grade    = s3t ? GRADE_CFG[s3t.grade] : null;
              const taskEvals = evaluations.filter((e) => e.taskId === task.id);
              const isExpanded = expandedTaskId === task.id;
              const userStepCount = (task.steps ?? []).filter((s) => s.assigneeId === viewUserId).length;

              return (
                <div key={task.id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-[var(--muted)] transition-colors text-left"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{task.name}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)]">
                        Hạn: {task.deadlineBase}
                        {(task.steps?.length ?? 0) > 0 && ` · ${task.steps.length} bước`}
                        {userStepCount > 0 && (
                          <span className="ml-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                            ★ {userStepCount} bước phụ trách
                          </span>
                        )}
                      </p>
                    </div>

                    {/* 3T grade badge */}
                    {s3t && grade && (
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 hidden sm:inline", grade.bg, grade.text)}>
                        {s3t.total}/10 · {grade.label}
                      </span>
                    )}

                    {/* Eval stars */}
                    {taskEvals.length > 0 && (
                      <span className="flex items-center gap-0.5 shrink-0">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} className={cn("w-3 h-3",
                            s <= evalStar(taskEvals[0]) ? "fill-amber-400 text-amber-400" : "text-slate-300"
                          )} />
                        ))}
                      </span>
                    )}

                    <ChevronDown className={cn(
                      "w-4 h-4 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200",
                      isExpanded && "rotate-180",
                    )} />
                  </button>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)] pt-3 bg-[var(--muted)]/30">

                      {/* Task-level evaluations */}
                      {taskEvals.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] flex items-center gap-1.5">
                            <MessageSquare className="w-3 h-3" /> Đánh giá nhiệm vụ
                          </p>
                          {taskEvals.map((ev) => (
                            <div key={ev.id} className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border)] text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-[var(--foreground)]">
                                  {ev.type === "self" ? "Tự đánh giá" : ev.type === "manager" ? "Quản lý" : "Đồng nghiệp"}
                                </span>
                                <span className="flex gap-0.5">
                                  {[1,2,3,4,5].map((s) => (
                                    <Star key={s} className={cn("w-3 h-3", s <= evalStar(ev) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                                  ))}
                                </span>
                              </div>
                              {ev.comment && <p className="text-[var(--muted-foreground)] leading-relaxed">{ev.comment}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 3T breakdown */}
                      {s3t && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] flex items-center gap-1.5">
                            <Award className="w-3 h-3" /> Điểm 3T · {grade?.label}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { label: "T1 Tiến độ",    v: s3t.t1, c: "#3B82F6" },
                              { label: "T2 Chất lượng",  v: s3t.t2, c: "#8B5CF6" },
                              { label: "T3 Nguồn lực",   v: s3t.t3, c: "#06B6D4" },
                            ] as const).map((item) => (
                              <div key={item.label} className="rounded-lg p-2 text-center" style={{ background: `${item.c}10` }}>
                                <p className="text-sm font-black" style={{ color: item.c }}>
                                  {item.v}<span className="text-[9px] font-normal text-[var(--muted-foreground)]">/10</span>
                                </p>
                                <p className="text-[9px] text-[var(--muted-foreground)] mt-0.5">{item.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Steps */}
                      {(task.steps?.length ?? 0) > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                            Các bước trong quy trình
                          </p>
                          <div className="space-y-1">
                            {task.steps.map((step, si) => {
                              const isUserStep  = step.assigneeId === viewUserId;
                              const assigneeName = users.find((u) => u.id === step.assigneeId)?.name ?? step.assigneeId;
                              const stCfg = STEP_STATUS_CFG[step.status as keyof typeof STEP_STATUS_CFG]
                                ?? STEP_STATUS_CFG.pending;

                              return (
                                <div
                                  key={step.id}
                                  className={cn(
                                    "flex items-center gap-2.5 p-2 rounded-lg text-xs",
                                    isUserStep
                                      ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/60"
                                      : "bg-[var(--card)] border border-[var(--border)]",
                                  )}
                                >
                                  {/* Step number */}
                                  <span className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                                    isUserStep ? "bg-blue-500 text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                                  )}>{si + 1}</span>

                                  {/* Name + assignee */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      {isUserStep && (
                                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase shrink-0">
                                          {isOwnView ? "Bạn" : viewUser.name.split(" ").pop()}
                                        </span>
                                      )}
                                      <p className={cn("font-medium truncate", isUserStep ? "text-blue-700 dark:text-blue-300" : "text-[var(--foreground)]")}>
                                        {step.name}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-[var(--muted-foreground)] truncate">{assigneeName}</p>
                                  </div>

                                  {/* KPI */}
                                  {step.kpiTarget > 0 && (
                                    <span className="text-[10px] text-[var(--muted-foreground)] shrink-0 hidden md:block">
                                      {step.kpiCurrent}/{step.kpiTarget} {step.kpiUnit}
                                    </span>
                                  )}

                                  {/* Progress */}
                                  <div className="w-14 flex items-center gap-1 shrink-0">
                                    <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${step.progress}%`, background: stCfg.color }} />
                                    </div>
                                    <span className="text-[10px] font-semibold w-6 text-right" style={{ color: stCfg.color }}>
                                      {step.progress}%
                                    </span>
                                  </div>

                                  {/* Status badge */}
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                    style={{ background: `${stCfg.color}18`, color: stCfg.color }}
                                  >
                                    {stCfg.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
