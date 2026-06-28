"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Microscope, Plus, Loader2, X, FlaskConical, ArrowLeft,
  Pencil, Trash2, AlertTriangle, Search, ChevronRight, ChevronDown,
  Users, BarChart2, Eye, ClipboardList, ClipboardCheck, Vote, Clock, CheckCircle2, XCircle, AlertCircle, Calendar, Upload, Lock, Mail, ShieldAlert, UserPlus,
} from "lucide-react";
import { ReviewFormModal } from "@/components/research/ReviewFormModal";
import { ImportReviewsModal } from "@/components/research/ImportReviewsModal";
import { RegisterTopicModal } from "@/components/research/RegisterTopicModal";
import { ImportTopicsModal } from "@/components/research/ImportTopicsModal";
import { TemplateUploadButton } from "@/components/research/TemplateUploadButton";
import { TopicDetailModal, FilePreviewOverlay } from "@/components/research/TopicDetailModal";
import { IntakeReviewModal } from "@/components/research/IntakeReviewModal";
import { AssignReviewersModal } from "@/components/research/AssignReviewersModal";
import { cn, generateId } from "@/lib/utils";
import { findDuplicatePairs, isTopicAuthor } from "@/lib/researchUtils";
import type { DupPair } from "@/lib/researchUtils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission, getEffectiveRole, ROLE_RANK } from "@/lib/rbac/permissions";
import { getResearchTopics, saveResearchTopic, updateResearchTopic, deleteResearchTopic } from "@/lib/firebase/firestore";
import { RESEARCH_STEPS, STAGE_LABEL, buildInitialSteps, researchProgress, stepMeta } from "@/lib/research";
import type { ResearchTopic, ResearchStage, ResearchReview, ResearchCouncilSession, IntakeLog, Task } from "@/types";
import { toast } from "sonner";

// ─── Constants ─────────────────────────────────────────────────

const STAGE_BADGE: Record<ResearchStage, string> = {
  init:        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  proposal:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  executing:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  recognition: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  completed:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  rejected:    "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

const STAGES: { value: ResearchStage | "all"; label: string }[] = [
  { value: "all",         label: "Tất cả giai đoạn" },
  { value: "init",        label: STAGE_LABEL.init },
  { value: "proposal",    label: STAGE_LABEL.proposal },
  { value: "executing",   label: STAGE_LABEL.executing },
  { value: "recognition", label: STAGE_LABEL.recognition },
  { value: "completed",   label: STAGE_LABEL.completed },
  { value: "rejected",    label: STAGE_LABEL.rejected },
];

// ─── Shared stat card ──────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  variant?: "default" | "warning" | "danger" | "success" | "info";
  active?: boolean;
  onClick?: () => void;
}

const STAT_VARIANT: Record<NonNullable<StatCardProps["variant"]>, { card: string; value: string; dot?: string }> = {
  default: { card: "bg-[var(--card)] border-[var(--border)]",                     value: "text-slate-700 dark:text-slate-200" },
  warning: { card: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700", value: "text-amber-600 dark:text-amber-400", dot: "bg-amber-400" },
  danger:  { card: "bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-700",         value: "text-red-600 dark:text-red-400",    dot: "bg-red-400" },
  success: { card: "bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-700", value: "text-green-600 dark:text-green-400" },
  info:    { card: "bg-blue-50 dark:bg-blue-900/15 border-blue-200 dark:border-blue-700",     value: "text-blue-600 dark:text-blue-400"  },
};

function StatCard({ label, value, sub, variant = "default", active = false, onClick }: StatCardProps) {
  const v = STAT_VARIANT[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition",
        v.card,
        onClick ? "hover:opacity-80 cursor-pointer" : "cursor-default",
        active && "ring-2 ring-violet-400 ring-offset-1",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        {v.dot && <span className={cn("w-2 h-2 rounded-full mt-0.5 shrink-0", v.dot)} />}
      </div>
      <p className={cn("text-2xl font-bold mt-1 leading-none", v.value)}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </button>
  );
}

// ─── Task-link helpers (shared with MonitorTab) ────────────────

const ROMAN_Q: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

function quarterFromTimeline(tl: string): number | null {
  const m = tl.match(/Quý\s+(IV|III|II|I)\b/i);
  return m ? (ROMAN_Q[m[1].toUpperCase()] ?? null) : null;
}

function quarterFromTaskName(name: string): number | null {
  const m1 = name.match(/\bQ(\d)\b/i);
  if (m1) return parseInt(m1[1]);
  const m2 = name.match(/Quý\s+(IV|III|II|I)\b/i);
  return m2 ? (ROMAN_Q[m2[1].toUpperCase()] ?? null) : null;
}

/** NCKH tasks that match a topic's year + quarter (best candidates first, rest appended). */
function filterNckhTasksForTopic(
  allNckhTasks: Task[],
  topic: ResearchTopic,
): { best: Task[]; rest: Task[] } {
  const topicQ = topic.completionTimeline ? quarterFromTimeline(topic.completionTimeline) : null;
  const best: Task[] = [];
  const rest: Task[] = [];
  for (const t of allNckhTasks) {
    const taskYear = t.deadlineBase ? new Date(t.deadlineBase).getFullYear() : null;
    const yearMatch = taskYear === null || taskYear === topic.year;
    if (!yearMatch) { rest.push(t); continue; }
    const taskQ = quarterFromTaskName(t.name ?? "");
    const qMatch = topicQ === null || taskQ === null || taskQ === topicQ;
    if (yearMatch && qMatch) best.push(t); else rest.push(t);
  }
  return { best, rest };
}

// ─── Filter bar ────────────────────────────────────────────────

interface FilterState {
  search: string;
  year: number | "all";
  stage: ResearchStage | "all";
  department: string;
}

function FilterBar({
  filters, onChange, years, departments, showDept,
}: {
  filters: FilterState;
  onChange: (f: Partial<FilterState>) => void;
  years: number[];
  departments: string[];
  showDept: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          placeholder="Tìm mã, tên đề tài..."
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white"
        />
      </div>

      {/* Year */}
      <select
        value={filters.year}
        onChange={e => onChange({ year: e.target.value === "all" ? "all" : Number(e.target.value) })}
        className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white"
      >
        <option value="all">Tất cả năm</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Stage */}
      <select
        value={filters.stage}
        onChange={e => onChange({ stage: e.target.value as ResearchStage | "all" })}
        className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white"
      >
        {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {/* Department (admin only) */}
      {showDept && departments.length > 0 && (
        <select
          value={filters.department}
          onChange={e => onChange({ department: e.target.value })}
          className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white"
        >
          <option value="">Tất cả đơn vị</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── Progress bar cell ─────────────────────────────────────────

function ProgressCell({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-violet-500" : "bg-amber-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-16 text-center">
        <FlaskConical className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">{message}</p>
      </td>
    </tr>
  );
}

// ─── Tab: "Đề tài của tôi" ─────────────────────────────────────

function MyTopicsTab({
  topics, users, currentUser, onEdit, onDelete, onView,
}: {
  topics: ResearchTopic[];
  users: { id: string; name: string }[];
  currentUser: { id: string; email?: string };
  onEdit: (t: ResearchTopic) => void;
  onDelete: (t: ResearchTopic) => void;
  onView: (t: ResearchTopic) => void;
}) {
  const [filters, setFilters] = useState<FilterState>({ search: "", year: "all", stage: "all", department: "" });

  const years = useMemo(() => [...new Set(topics.map(t => t.year))].sort((a, b) => b - a), [topics]);

  const mine = useMemo(() => {
    const email = currentUser.email?.toLowerCase();
    return topics.filter(t =>
      t.principalInvestigatorId === currentUser.id ||
      t.mainPerformerId === currentUser.id ||
      (t.memberIds ?? []).includes(currentUser.id) ||
      // Fallback: public-form submissions with matching email (before auto-claim resolves)
      (t.principalInvestigatorId === "public" && !!email && t.submitterEmail?.toLowerCase() === email)
    );
  }, [topics, currentUser.id, currentUser.email]);

  // Stats (computed from mine, not filtered)
  const stats = useMemo(() => {
    const active    = mine.filter(t => t.stage === "proposal" || t.stage === "executing" || t.stage === "recognition").length;
    const pending   = mine.filter(t => t.stage === "init").length;
    const executing = mine.filter(t => t.stage === "executing").length;
    const completed = mine.filter(t => t.stage === "completed").length;
    const rejected  = mine.filter(t => t.stage === "rejected").length;
    const needRevision = mine.filter(t => t.intakeStatus === "revision_needed").length;
    const intakeRejected = mine.filter(t => t.intakeStatus === "rejected").length;
    const needReview = mine.filter(t =>
      (t.stage === "proposal" || t.stage === "recognition") &&
      (t.reviews ?? []).some(r => r.status === "assigned")
    ).length;
    const avgProgress = mine.length
      ? Math.round(mine.reduce((s, t) => s + researchProgress(t), 0) / mine.length)
      : 0;
    return { total: mine.length, active, pending, executing, completed, rejected, needReview, avgProgress, needRevision, intakeRejected };
  }, [mine]);

  const filtered = useMemo(() => mine.filter(t => {
    if (filters.year !== "all" && t.year !== filters.year) return false;
    if (filters.stage !== "all" && t.stage !== filters.stage) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.code ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [mine, filters]);

  function myRole(t: ResearchTopic) {
    if (t.principalInvestigatorId === currentUser.id) return "Chủ nhiệm";
    if (t.principalInvestigatorId === "public" && t.submitterEmail?.toLowerCase() === currentUser.email?.toLowerCase()) return "Chủ nhiệm";
    if (t.mainPerformerId === currentUser.id) return "Thực hiện chính";
    return "Thành viên";
  }

  // Click stat card → set stage filter
  function filterByStage(stage: ResearchStage | "all") {
    setFilters(f => ({ ...f, stage }));
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard label="Tổng đề tài" value={stats.total}
          active={filters.stage === "all" && !filters.search}
          onClick={() => filterByStage("all")} />
        <StatCard label="Thẩm định ĐC" value={stats.active - stats.executing} sub="Đề cương · Nghiệm thu"
          variant={(stats.active - stats.executing) > 0 ? "info" : "default"}
          active={filters.stage === "proposal" || filters.stage === "recognition"}
          onClick={() => filterByStage("proposal")} />
        <StatCard label="Đang triển khai" value={stats.executing} sub="Thực hiện nghiên cứu"
          variant={stats.executing > 0 ? "warning" : "default"}
          active={filters.stage === "executing"}
          onClick={() => filterByStage("executing")} />
        <StatCard label="Chờ tiếp nhận" value={stats.pending}
          variant={stats.pending > 0 ? "warning" : "default"}
          active={filters.stage === "init"}
          onClick={() => filterByStage("init")} />
        <StatCard label="Cần chỉnh sửa" value={stats.needRevision}
          variant={stats.needRevision > 0 ? "danger" : "default"}
          sub={stats.intakeRejected > 0 ? `${stats.intakeRejected} bị từ chối` : undefined} />
        <StatCard label="Hoàn thành" value={stats.completed}
          variant={stats.completed > 0 ? "success" : "default"}
          active={filters.stage === "completed"}
          onClick={() => filterByStage("completed")} />
        <StatCard label="Tiến độ TB" value={`${stats.avgProgress}%`}
          variant={stats.avgProgress < 30 && stats.active > 0 ? "danger" : stats.avgProgress >= 80 ? "success" : "default"} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FilterBar filters={filters} onChange={p => setFilters(f => ({ ...f, ...p }))} years={years} departments={[]} showDept={false} />
        <span className="text-xs text-slate-400">{filtered.length} đề tài</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-8">#</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Mã đề tài</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Tên đề tài</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Vai trò</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36">Giai đoạn</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36">Bước hiện tại</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Tiến độ</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-14">Năm</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.length === 0 ? (
              <EmptyRow cols={9} message={mine.length === 0 ? "Bạn chưa đăng ký đề tài nào." : "Không có đề tài khớp bộ lọc."} />
            ) : filtered.map((t, i) => {
              const pct = researchProgress(t);
              const curLabel = stepMeta(t.currentStep)?.label ?? "—";
              const role = myRole(t);
              return (
                <tr key={t.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition cursor-pointer group"
                  onClick={() => onView(t)}>
                  <td className="px-3 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-3">
                    {t.code
                      ? <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{t.code}</span>
                      : <span className="text-slate-300 dark:text-slate-600 text-xs italic">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800 dark:text-white line-clamp-2 leading-snug max-w-xs">{t.title}</p>
                    {t.field && <p className="text-[11px] text-slate-400 mt-0.5">{t.field}</p>}
                    {t.intakeStatus === "revision_needed" && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                        <AlertCircle className="w-2.5 h-2.5" /> Yêu cầu chỉnh sửa
                      </span>
                    )}
                    {t.intakeStatus === "rejected" && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700">
                        <XCircle className="w-2.5 h-2.5" /> Từ chối tiếp nhận
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium",
                      role === "Chủ nhiệm" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : role === "Thực hiện chính" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    )}>
                      {role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", STAGE_BADGE[t.stage])}>
                      {STAGE_LABEL[t.stage]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[110px]">{curLabel}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3"><ProgressCell pct={pct} /></td>
                  <td className="px-3 py-3 text-xs text-slate-500">{t.year}</td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    {t.intakeStatus === "revision_needed" ? (
                      <div className="flex items-center gap-1">
                        {t.resubmitToken ? (
                          <a
                            href={`/resubmit/${t.resubmitToken}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition"
                            title="Mở form nộp lại (không cần đăng nhập)"
                          >
                            <Upload className="w-3 h-3" /> Nộp lại
                          </a>
                        ) : (
                          <button
                            onClick={() => onEdit(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition"
                          >
                            <Upload className="w-3 h-3" /> Nộp lại
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => onEdit(t)} title="Sửa"
                          className="p-1 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onDelete(t)} title="Xoá"
                          className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: "Phản biện của tôi" ─────────────────────────────────

const REVIEW_STATUS_META = {
  assigned:  { label: "Chưa nộp",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",  icon: Clock },
  submitted: { label: "Đã nộp",   cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
} as const;

const RECOMMENDATION_META = {
  pass:   { label: "Đạt",       cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  revise: { label: "Sửa đổi",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  fail:   { label: "Không đạt", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
} as const;

interface ReviewRow {
  topic: ResearchTopic;
  review: ResearchReview;
}

function ReviewTab({
  topics, currentUserId, onView, onSubmitReview,
}: {
  topics: ResearchTopic[];
  currentUserId: string;
  onView: (t: ResearchTopic) => void;
  onSubmitReview: (topic: ResearchTopic, review: ResearchReview) => void;
}) {
  const [stageFilter, setStageFilter] = useState<"all" | "proposal" | "recognition">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "submitted">("all");
  const [search, setSearch] = useState("");

  const rows = useMemo((): ReviewRow[] => {
    const result: ReviewRow[] = [];
    for (const topic of topics) {
      for (const review of topic.reviews ?? []) {
        if (review.reviewerId === currentUserId) {
          result.push({ topic, review });
        }
      }
    }
    return result;
  }, [topics, currentUserId]);

  const filtered = useMemo(() => rows.filter(r => {
    if (stageFilter !== "all" && r.review.stage !== stageFilter) return false;
    if (statusFilter !== "all" && r.review.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.topic.title.toLowerCase().includes(q) && !(r.topic.code ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, stageFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const pending  = rows.filter(r => r.review.status === "assigned").length;
    const overdue  = rows.filter(r => r.review.status === "assigned" && r.review.dueAt && new Date(r.review.dueAt) < now).length;
    const submitted = rows.filter(r => r.review.status === "submitted").length;
    const passed   = rows.filter(r => r.review.recommendation === "pass").length;
    return { total: rows.length, pending, overdue, submitted, passed };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng phiếu phản biện" value={stats.total}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")} />
        <StatCard label="Chưa nộp" value={stats.pending} sub="Cần hoàn thành"
          variant={stats.pending > 0 ? "warning" : "default"}
          active={statusFilter === "assigned"}
          onClick={() => setStatusFilter("assigned")} />
        <StatCard label="Quá hạn" value={stats.overdue} sub="Đã qua hạn nộp"
          variant={stats.overdue > 0 ? "danger" : "default"} />
        <StatCard label="Đã nộp" value={stats.submitted}
          variant={stats.submitted > 0 ? "success" : "default"}
          active={statusFilter === "submitted"}
          onClick={() => setStatusFilter("submitted")} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã, tên đề tài..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value as typeof stageFilter)}
          className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
          <option value="all">Tất cả giai đoạn</option>
          <option value="proposal">Thẩm định đề cương</option>
          <option value="recognition">Công nhận đề tài</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
          <option value="all">Tất cả trạng thái</option>
          <option value="assigned">Chưa nộp</option>
          <option value="submitted">Đã nộp</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} phiếu</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-8">#</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Đề tài</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-36">Giai đoạn</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Hạn nộp</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Trạng thái</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Khuyến nghị</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-16">Điểm</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center">
                <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  {rows.length === 0 ? "Bạn chưa được phân công phản biện đề tài nào." : "Không có phiếu khớp bộ lọc."}
                </p>
              </td></tr>
            ) : filtered.map(({ topic, review }, i) => {
              const statusMeta = REVIEW_STATUS_META[review.status];
              const StatusIcon = statusMeta.icon;
              const dueDate = review.dueAt ? new Date(review.dueAt) : null;
              const isOverdue = dueDate && review.status === "assigned" && dueDate < new Date();
              return (
                <tr key={review.id}
                  className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition cursor-pointer group"
                  onClick={() => onView(topic)}>
                  <td className="px-3 py-3 text-xs text-slate-400">{i + 1}</td>
                  <td className="px-3 py-3">
                    {topic.code && <span className="font-mono text-[11px] text-slate-400 block">{topic.code}</span>}
                    <p className="font-medium text-slate-800 dark:text-white line-clamp-2 max-w-xs leading-snug">{topic.title}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold",
                      review.stage === "proposal"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                    )}>
                      {review.stage === "proposal" ? "Thẩm định đề cương" : "Công nhận đề tài"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {dueDate ? (
                      <span className={cn("text-xs flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-slate-500")}>
                        <Calendar className="w-3 h-3" />
                        {dueDate.toLocaleDateString("vi-VN")}
                        {isOverdue && <span className="text-[10px]">(Quá hạn)</span>}
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold", statusMeta.cls)}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {statusMeta.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {review.recommendation ? (
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", RECOMMENDATION_META[review.recommendation].cls)}>
                        {RECOMMENDATION_META[review.recommendation].label}
                      </span>
                    ) : <span className="text-slate-300 text-xs italic">Chưa có</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {review.score != null ? review.score : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (review.status === "assigned") onSubmitReview(topic, review);
                        else onView(topic);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {review.status === "assigned" ? "Nộp phiếu" : "Xem"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: "Hội đồng KH&CN" ────────────────────────────────────

const DECISION_META = {
  passed:  { label: "Thông qua",   cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  failed:  { label: "Không thông qua", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",     icon: XCircle },
  revise:  { label: "Yêu cầu sửa", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: AlertCircle },
} as const;

const VOTE_META = {
  approve: { label: "Tán thành",   cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  reject:  { label: "Không tán thành", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  abstain: { label: "Không ý kiến", cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
} as const;

interface CouncilRow {
  topic: ResearchTopic;
  session: ResearchCouncilSession;
}

function CouncilTab({
  topics, users, currentUserId, onView,
}: {
  topics: ResearchTopic[];
  users: { id: string; name: string }[];
  currentUserId: string;
  onView: (t: ResearchTopic) => void;
}) {
  const [stageFilter, setStageFilter] = useState<"all" | "proposal" | "recognition">("all");
  const [search, setSearch] = useState("");

  const rows = useMemo((): CouncilRow[] => {
    const result: CouncilRow[] = [];
    for (const topic of topics) {
      for (const session of topic.councilSessions ?? []) {
        if ((session.memberIds ?? []).includes(currentUserId)) {
          result.push({ topic, session });
        }
      }
    }
    return result;
  }, [topics, currentUserId]);

  const filtered = useMemo(() => rows.filter(r => {
    if (stageFilter !== "all" && r.session.stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.topic.title.toLowerCase().includes(q) && !(r.topic.code ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, stageFilter, search]);

  const stats = useMemo(() => {
    const total      = rows.length;
    const concluded  = rows.filter(r => !!r.session.decision).length;
    const pending    = rows.filter(r => {
      if (r.session.decision) return false;
      if (r.session.mode === "online") {
        return !(r.session.votes ?? []).find(v => v.memberId === currentUserId);
      }
      return false;
    }).length;
    const notVoted   = rows.filter(r =>
      r.session.mode === "online" &&
      !r.session.decision &&
      !(r.session.votes ?? []).find(v => v.memberId === currentUserId)
    ).length;
    const inPerson   = rows.filter(r => r.session.mode === "in_person").length;
    const online     = rows.filter(r => r.session.mode === "online").length;
    return { total, concluded, pending, notVoted, inPerson, online };
  }, [rows, currentUserId]);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng phiên họp" value={stats.total} />
        <StatCard label="Chưa biểu quyết" value={stats.notVoted} sub="Phiên họp trực tuyến"
          variant={stats.notVoted > 0 ? "warning" : "default"} />
        <StatCard label="Chưa kết luận" value={stats.total - stats.concluded}
          variant={(stats.total - stats.concluded) > 0 ? "info" : "default"} />
        <StatCard label="Đã kết luận" value={stats.concluded}
          variant={stats.concluded > 0 ? "success" : "default"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã, tên đề tài..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value as typeof stageFilter)}
          className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
          <option value="all">Tất cả giai đoạn</option>
          <option value="proposal">Thẩm định đề cương</option>
          <option value="recognition">Công nhận đề tài</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} phiên họp</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-8">#</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Đề tài</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-36">Giai đoạn</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Hình thức</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Ngày họp</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Thành viên</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Kết luận HĐ</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Biểu quyết của tôi</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="py-16 text-center">
                <Vote className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  {rows.length === 0 ? "Bạn chưa được phân công vào hội đồng nào." : "Không có phiên họp khớp bộ lọc."}
                </p>
              </td></tr>
            ) : filtered.map(({ topic, session }, i) => {
              const myVote = (session.votes ?? []).find(v => v.memberId === currentUserId);
              const scheduledDate = session.scheduledAt ? new Date(session.scheduledAt) : null;
              const memberCount = (session.memberIds ?? []).length;
              return (
                <tr key={session.id}
                  className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition cursor-pointer group"
                  onClick={() => onView(topic)}>
                  <td className="px-3 py-3 text-xs text-slate-400">{i + 1}</td>
                  <td className="px-3 py-3">
                    {topic.code && <span className="font-mono text-[11px] text-slate-400 block">{topic.code}</span>}
                    <p className="font-medium text-slate-800 dark:text-white line-clamp-2 max-w-xs leading-snug">{topic.title}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold",
                      session.stage === "proposal"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                    )}>
                      {session.stage === "proposal" ? "Thẩm định đề cương" : "Công nhận đề tài"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold",
                      session.mode === "in_person"
                        ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                    )}>
                      {session.mode === "in_person" ? "Họp trực tiếp" : "Trực tuyến"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {scheduledDate ? (
                      <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {scheduledDate.toLocaleDateString("vi-VN")}
                      </span>
                    ) : <span className="text-xs text-slate-300 italic">Chưa ấn định</span>}
                    {session.location && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[110px]">{session.location}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Users className="w-3 h-3" /> {memberCount} người
                    </span>
                    {session.mode === "online" && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {(session.votes ?? []).length}/{memberCount} đã bỏ phiếu
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {session.decision ? (() => {
                      const dm = DECISION_META[session.decision];
                      const DIcon = dm.icon;
                      return (
                        <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold", dm.cls)}>
                          <DIcon className="w-2.5 h-2.5" /> {dm.label}
                        </span>
                      );
                    })() : <span className="text-xs text-slate-400 italic">Chưa có</span>}
                  </td>
                  <td className="px-3 py-3">
                    {session.mode === "in_person" ? (
                      <span className="text-xs text-slate-400 italic">Trực tiếp</span>
                    ) : myVote ? (
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", VOTE_META[myVote.vote].cls)}>
                        {VOTE_META[myVote.vote].label}
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        Chưa bỏ phiếu
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); onView(topic); }}
                      className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium">
                      <Eye className="w-3.5 h-3.5" />
                      {!myVote && session.mode === "online" && !session.decision ? "Biểu quyết" : "Xem"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Intake status meta ────────────────────────────────────────

const INTAKE_META = {
  awaiting:        { label: "Chờ phê duyệt",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  passed:          { label: "Đã tiếp nhận",    cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  revision_needed: { label: "Yêu cầu chỉnh sửa", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  rejected:        { label: "Từ chối",          cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
} as const;

// Helper: advance topic steps to p_intake passed + p_compile in_progress
function buildAcceptedSteps(existing: ResearchTopic["steps"]): ResearchTopic["steps"] {
  return (existing ?? []).map(s => {
    if (["create", "approve_task", "notify", "p_intake"].includes(s.key)) return { ...s, status: "passed" };
    if (s.key === "p_compile") return { ...s, status: "in_progress" };
    return s;
  });
}

// ─── TaskLinkCell ──────────────────────────────────────────────

interface TaskLinkCellProps {
  topic: ResearchTopic;
  nckhTasks: Task[];
  allTasks: Task[];
  isAssigning: boolean;
  isSaving: boolean;
  draft: string;
  onOpen: () => void;
  onClose: () => void;
  onDraftChange: (v: string) => void;
  onSave: (v: string) => void;
}

function TaskLinkCell({
  topic, nckhTasks, allTasks, isAssigning, isSaving,
  draft, onOpen, onClose, onDraftChange, onSave,
}: TaskLinkCellProps) {
  const linkedTask = allTasks.find(t => t.id === topic.taskId);
  const { best, rest } = filterNckhTasksForTopic(nckhTasks, topic);

  if (!isAssigning) {
    return linkedTask ? (
      // Linked — show task name, click to change
      <button
        onClick={onOpen}
        className="group flex items-center gap-1 max-w-[140px] text-left"
        title={`Nhiệm vụ: ${linkedTask.name} · Nhấn để thay đổi`}
      >
        <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400 truncate group-hover:underline">
          {linkedTask.name}
        </span>
      </button>
    ) : (
      // Not linked
      <button
        onClick={onOpen}
        className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
      >
        no task
      </button>
    );
  }

  // Editing mode — show combobox
  return (
    <div className="flex flex-col gap-1 min-w-[160px]" onClick={e => e.stopPropagation()}>
      <select
        autoFocus
        value={draft}
        onChange={e => onDraftChange(e.target.value)}
        className="text-xs border border-violet-300 dark:border-violet-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400 w-full"
      >
        <option value="">— Không liên kết —</option>
        {best.length > 0 && (
          <optgroup label={`✓ Khớp năm/quý (${best.length})`}>
            {best.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        )}
        {rest.length > 0 && (
          <optgroup label="Nhiệm vụ NCKH khác">
            {rest.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        )}
        {nckhTasks.length === 0 && (
          <option disabled>Không có nhiệm vụ NCKH</option>
        )}
      </select>
      <div className="flex gap-1">
        <button
          onClick={() => onSave(draft)}
          disabled={isSaving}
          className="flex-1 flex items-center justify-center gap-0.5 px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Lưu"}
        </button>
        <button
          onClick={onClose}
          className="px-2 py-0.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}

// ─── Tab: "Giám sát tiến độ" ──────────────────────────────────

function MonitorTab({
  topics, users, canManage, currentUser, onEdit, onDelete, onView, onTopicUpdate,
}: {
  topics: ResearchTopic[];
  users: { id: string; name: string; email?: string }[];
  canManage: boolean;
  currentUser: { id: string; name: string; email?: string };
  onEdit: (t: ResearchTopic) => void;
  onDelete: (t: ResearchTopic) => void;
  onView: (t: ResearchTopic) => void;
  onTopicUpdate: (id: string, updates: Partial<ResearchTopic>) => void;
}) {
  const [filters, setFilters] = useState<FilterState>({ search: "", year: "all", stage: "all", department: "" });
  const [taskLinked, setTaskLinked] = useState<"all" | "linked" | "unlinked">("all");
  const [actioning, setActioning] = useState<string | null>(null);
  const [intakeReviewTopic, setIntakeReviewTopic] = useState<ResearchTopic | null>(null);
  const [emailSending, setEmailSending] = useState<string | null>(null);
  const [emailSentIds, setEmailSentIds] = useState<Set<string>>(new Set());
  // Task-link assignment
  const [assigningId, setAssigningId]   = useState<string | null>(null);
  const [assignDraft, setAssignDraft]   = useState<Record<string, string>>({});
  const [assignSaving, setAssignSaving] = useState<string | null>(null);
  const [showDupPanel, setShowDupPanel] = useState(false);
  // Review assignment
  const [selectedForReview, setSelectedForReview] = useState<Set<string>>(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);

  const { tasks } = useTaskStore();

  const years = useMemo(() => [...new Set(topics.map(t => t.year))].sort((a, b) => b - a), [topics]);
  const departments = useMemo(() => [...new Set(topics.map(t => t.department).filter((d): d is string => !!d))].sort(), [topics]);

  // All NCKH-related tasks (for combobox)
  const nckhTasks = useMemo<Task[]>(
    () => tasks.filter(t => /NCKH/i.test(t.name) || /NCKH/i.test(t.workflowName ?? "")),
    [tasks],
  );

  // Show in intake queue: explicitly "awaiting", "revision_needed", OR
  // topics in init stage with no intakeStatus yet (submitted before the field existed)
  const awaitingTopics = useMemo(() =>
    topics.filter(t =>
      t.intakeStatus === "awaiting" ||
      t.intakeStatus === "revision_needed" ||
      (!t.intakeStatus && t.stage === "init")
    ),
  [topics]);

  // Đề tài đã tiếp nhận, đang chờ phân công phản biện (chưa đủ 2 phản biện giai đoạn proposal)
  const passedNeedingReview = useMemo(() =>
    topics.filter(t => {
      if (t.intakeStatus !== "passed") return false;
      const reviewCount = (t.reviews ?? []).filter(r => r.stage === "proposal").length;
      return reviewCount < 2;
    }),
  [topics]);

  async function sendIntakeEmail(topic: ResearchTopic, type: "accepted" | "revision", note?: string, resubmitLink?: string) {
    const author = users.find(u => u.id === topic.principalInvestigatorId);
    const authorEmail = topic.submitterEmail ?? author?.email;
    if (!authorEmail) return;

    const subject = type === "accepted"
      ? `[ARiHA] Đề cương đã được tiếp nhận: ${topic.title}`
      : `[ARiHA] Yêu cầu chỉnh sửa đề cương: ${topic.title}`;

    const body = type === "accepted"
      ? `Kính gửi ${topic.principalInvestigatorName ?? author?.name ?? "Quý tác giả"},\n\n` +
        `Đề cương nghiên cứu "${topic.title}" của bạn đã được kiểm tra và xác nhận tiếp nhận thành công.\n\n` +
        `Đề tài sẽ được chuyển sang bước tổng hợp và thẩm định. Bạn sẽ được thông báo khi có kết quả tiếp theo.\n\n` +
        `Trân trọng,\n${currentUser.name}`
      : `Kính gửi ${topic.principalInvestigatorName ?? author?.name ?? "Quý tác giả"},\n\n` +
        `Đề cương nghiên cứu "${topic.title}" của bạn chưa đáp ứng yêu cầu tiếp nhận.\n\n` +
        `Lý do: ${note ?? "Vui lòng kiểm tra lại nội dung và format theo yêu cầu."}\n\n` +
        `Vui lòng chỉnh sửa và nộp lại qua link sau (có hiệu lực 30 ngày, không cần đăng nhập):\n${resubmitLink ?? "Xem trong hệ thống ARiHA WorkHub"}\n\n` +
        `Trân trọng,\n${currentUser.name}`;

    await fetch("/api/email/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderUserId: currentUser.id,
        recipients: [{ id: author?.id ?? "", name: topic.principalInvestigatorName ?? author?.name ?? "", email: authorEmail }],
        subject,
        body,
      }),
    }).catch(() => {});
  }

  async function sendIntakeNotification(topic: ResearchTopic, type: "accepted" | "revision", note?: string, resubmitLink?: string) {
    const piId = topic.principalInvestigatorId;
    if (!piId) return;
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: piId,
        type: type === "accepted" ? "task_completed" : "task_comment",
        title: type === "accepted" ? "Đề cương đã được tiếp nhận" : "Yêu cầu chỉnh sửa đề cương",
        body: type === "accepted"
          ? `Đề cương "${topic.title}" đã được kiểm tra và xác nhận tiếp nhận thành công.`
          : `Đề cương "${topic.title}" cần chỉnh sửa: ${note ?? "Vui lòng kiểm tra lại nội dung và format."}`,
        link: resubmitLink ?? "/research",
        read: false,
        priority: type === "accepted" ? "normal" : "urgent",
        createdAt: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  async function handleIntakeAccept(
    topic: ResearchTopic,
    note: string,
    linkedTaskId: string,
    intakeLogs: ResearchTopic["intakeLogs"],
    matchedUserId?: string,
  ) {
    setActioning(topic.id);
    try {
      const resolvedTaskId = linkedTaskId.trim() || topic.taskId || undefined;
      const updates: Partial<ResearchTopic> = {
        intakeStatus: "passed",
        intakeNote: note || undefined,
        ...(resolvedTaskId ? { taskId: resolvedTaskId } : {}),
        // Link to matched system account when accepting a public submission
        ...(matchedUserId && topic.principalInvestigatorId !== matchedUserId
          ? { principalInvestigatorId: matchedUserId, createdBy: matchedUserId }
          : {}),
        stage: "proposal",
        currentStep: "p_compile",
        steps: buildAcceptedSteps(topic.steps),
        intakeLogs,
        updatedAt: new Date().toISOString(),
      };
      await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      await Promise.allSettled([
        sendIntakeEmail(topic, "accepted"),
        sendIntakeNotification(topic, "accepted"),
      ]);
      onTopicUpdate(topic.id, updates);
      setIntakeReviewTopic(null);
      toast.success(`Đã tiếp nhận: ${topic.title}`);
    } catch { toast.error("Tiếp nhận thất bại"); }
    finally { setActioning(null); }
  }

  /** Lưu phân loại nhiệm vụ độc lập (không đổi intakeStatus). */
  async function handleLinkTask(topic: ResearchTopic, linkedTaskId: string) {
    const resolvedTaskId = linkedTaskId.trim();
    if (!resolvedTaskId) return;
    const updates: Partial<ResearchTopic> = {
      taskId: resolvedTaskId,
      updatedAt: new Date().toISOString(),
    };
    const res = await fetch(`/api/research/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) { toast.error("Lưu phân loại thất bại"); throw new Error("link failed"); }
    onTopicUpdate(topic.id, updates);
    setIntakeReviewTopic(prev => prev && prev.id === topic.id ? { ...prev, ...updates } : prev);
    toast.success("Đã lưu phân loại nhiệm vụ");
  }

  async function handleIntakeRevise(
    topic: ResearchTopic,
    reason: string,
    intakeLogs: ResearchTopic["intakeLogs"],
  ) {
    setActioning(topic.id);
    try {
      // Generate a secure single-use token for the public resubmit form
      const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const resubmitLink = `${appUrl}/resubmit/${rawToken}`;

      const updates: Partial<ResearchTopic> = {
        intakeStatus: "revision_needed",
        intakeNote: reason || undefined,
        intakeRevisionCount: (topic.intakeRevisionCount ?? 0) + 1,
        intakeLogs,
        resubmitToken: rawToken,
        resubmitTokenExpiry: expiry,
        updatedAt: new Date().toISOString(),
      };
      await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      await Promise.allSettled([
        sendIntakeEmail(topic, "revision", reason, resubmitLink),
        sendIntakeNotification(topic, "revision", reason, resubmitLink),
      ]);
      onTopicUpdate(topic.id, updates);
      setIntakeReviewTopic(null);
      // Show the link so the reviewer can copy & share it
      toast.success(
        <div className="space-y-1 text-xs">
          <p className="font-semibold">Đã yêu cầu chỉnh sửa — email đã gửi</p>
          <p className="text-slate-400 break-all">{resubmitLink}</p>
          <button
            onClick={() => { navigator.clipboard.writeText(resubmitLink); toast.success("Đã sao chép link"); }}
            className="text-violet-600 font-medium hover:underline"
          >
            Sao chép link
          </button>
        </div>,
        { duration: 12000 }
      );
    } catch { toast.error("Gửi yêu cầu thất bại"); }
    finally { setActioning(null); }
  }

  async function handleIntakeReject(
    topic: ResearchTopic,
    reason: string,
    intakeLogs: ResearchTopic["intakeLogs"],
  ) {
    setActioning(topic.id);
    try {
      const updates: Partial<ResearchTopic> = {
        intakeStatus: "rejected",
        intakeNote: reason || undefined,
        intakeLogs,
        updatedAt: new Date().toISOString(),
      };
      await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      onTopicUpdate(topic.id, updates);
      setIntakeReviewTopic(null);
      toast.success("Đã từ chối đề cương");
    } catch { toast.error("Từ chối thất bại"); }
    finally { setActioning(null); }
  }

  async function handleAssignTask(topic: ResearchTopic, newTaskId: string | undefined) {
    setAssignSaving(topic.id);
    try {
      const updates: Partial<ResearchTopic> = {
        taskId: newTaskId || undefined,
        updatedAt: new Date().toISOString(),
      };
      await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      onTopicUpdate(topic.id, updates);
      toast.success(newTaskId ? "Đã liên kết nhiệm vụ" : "Đã bỏ liên kết nhiệm vụ");
      setAssigningId(null);
    } catch { toast.error("Lưu thất bại"); }
    finally { setAssignSaving(null); }
  }

  async function handleResendEmail(topic: ResearchTopic) {
    if (!topic.resubmitToken) return;
    setEmailSending(topic.id);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const resubmitLink = `${appUrl}/resubmit/${topic.resubmitToken}`;
      await sendIntakeEmail(topic, "revision", topic.intakeNote, resubmitLink);

      // Record email send in intakeLogs
      const logEntry: IntakeLog = {
        id: generateId("ilog"),
        action: "revision_requested",
        userId: currentUser.id,
        userName: currentUser.name,
        note: `Gửi lại mail yêu cầu chỉnh sửa`,
        timestamp: new Date().toISOString(),
      };
      const updatedLogs = [...(topic.intakeLogs ?? []), logEntry];
      const patch = { intakeLogs: updatedLogs, updatedAt: new Date().toISOString() };
      await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onTopicUpdate(topic.id, patch);
      setEmailSentIds(s => new Set(s).add(topic.id));
      const recipient = topic.submitterEmail ?? topic.principalInvestigatorName ?? "tác giả";
      toast.success(`Đã gửi mail nhắc chỉnh sửa đến ${recipient}`);
    } catch { toast.error("Gửi mail thất bại"); }
    finally { setEmailSending(null); }
  }

  const filtered = useMemo(() => topics.filter(t => {
    if (filters.year !== "all" && t.year !== filters.year) return false;
    if (filters.stage !== "all" && t.stage !== filters.stage) return false;
    if (filters.department && t.department !== filters.department) return false;
    if (taskLinked === "linked"   && !t.taskId) return false;
    if (taskLinked === "unlinked" &&  t.taskId) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const pi = users.find(u => u.id === t.principalInvestigatorId);
      if (!t.title.toLowerCase().includes(q) &&
          !(t.code ?? "").toLowerCase().includes(q) &&
          !(pi?.name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [topics, filters, users]);

  // Duplicate pairs — chỉ cảnh báo khi ít nhất 1 đề tài trong cặp chưa được tiếp nhận/từ chối.
  // Nếu cả hai đã "passed" hoặc "rejected" → đã xử lý xong, không cần cảnh báo nữa.
  const dupPairs = useMemo<DupPair[]>(() => {
    const done = (t: ResearchTopic) => t.intakeStatus === "passed" || t.intakeStatus === "rejected";
    return findDuplicatePairs(topics).filter(({ a, b }) => !(done(a) && done(b)));
  }, [topics]);

  // Stats
  const stats = useMemo(() => ({
    total: topics.length,
    active: topics.filter(t => t.stage === "proposal" || t.stage === "recognition").length,
    completed: topics.filter(t => t.stage === "completed").length,
    avgProgress: topics.length ? Math.round(topics.reduce((s, t) => s + researchProgress(t), 0) / topics.length) : 0,
  }), [topics]);

  return (
    <div className="space-y-4">
      {/* Template management (admin only) */}
      {canManage && <TemplateUploadButton />}

      {/* ── Duplicate-check panel ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDupPanel(p => !p)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
        >
          <ShieldAlert className={cn("w-4 h-4 shrink-0", dupPairs.length > 0 ? "text-red-500" : "text-emerald-500")} />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Kiểm tra trùng lặp
          </span>
          {dupPairs.length > 0 ? (
            <span className="ml-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-full">
              {dupPairs.length} cặp
            </span>
          ) : (
            <span className="ml-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">
              Không phát hiện trùng
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-slate-400 ml-auto transition-transform", showDupPanel && "rotate-180")} />
        </button>

        {showDupPanel && (
          <div className="border-t border-slate-200 dark:border-slate-700">
            {dupPairs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                Không phát hiện cặp đề tài nào có khả năng trùng lặp.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {dupPairs.map(({ a, b, titleSim, samePerson, reason }, idx) => (
                  <div key={`${a.id}-${b.id}`} className="px-4 py-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-1">#{idx + 1}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                        titleSim >= 0.8 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : titleSim >= 0.65 ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                        : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                      )}>
                        Tên đề tài {Math.round(titleSim * 100)}% tương đồng
                      </span>
                      {samePerson && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[10px] font-medium">
                          Cùng chủ nhiệm
                        </span>
                      )}
                      {reason === "title_and_person" && (
                        <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500 text-[10px]">
                          Cả hai dấu hiệu
                        </span>
                      )}
                    </div>

                    {/* Side-by-side topics */}
                    <div className="grid grid-cols-2 gap-2">
                      {([a, b] as const).map((t, ti) => (
                        <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 space-y-1">
                          <p className="text-[11px] font-semibold text-slate-800 dark:text-white leading-snug line-clamp-2">{t.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{t.principalInvestigatorName ?? "—"}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400">{t.year}</span>
                            {t.department && <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{t.department}</span>}
                            {t.intakeStatus && (
                              <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium",
                                t.intakeStatus === "passed" ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600"
                                : t.intakeStatus === "awaiting" ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                              )}>
                                {t.intakeStatus === "passed" ? "Đã tiếp nhận" : t.intakeStatus === "awaiting" ? "Chờ xét" : t.intakeStatus === "revision_needed" ? "Cần sửa" : t.intakeStatus}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onView(t)}
                            className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1"
                          >
                            <Eye className="w-3 h-3" /> Xem chi tiết
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Intake queue ── */}
      {awaitingTopics.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Hàng chờ tiếp nhận ({awaitingTopics.length} đề tài)
            </p>
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
              Kiểm tra nội dung, format → Xác nhận hoặc yêu cầu chỉnh sửa
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-100/60 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400">
                  <th className="text-left px-3 py-2 font-medium">Tên đề tài</th>
                  <th className="text-left px-3 py-2 font-medium">Chủ nhiệm</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Đơn vị</th>
                  <th className="text-left px-3 py-2 font-medium">Trạng thái</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Nhiệm vụ NCKH</th>
                  <th className="text-center px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 dark:divide-amber-900/30">
                {awaitingTopics.map(topic => {
                  const author = users.find(u => u.id === topic.principalInvestigatorId);
                  const piName = topic.principalInvestigatorName ?? author?.name ?? "—";
                  const isBusy = actioning === topic.id;
                  const isOwnTopic = isTopicAuthor(currentUser, topic);
                  const meta = INTAKE_META[topic.intakeStatus as keyof typeof INTAKE_META] ?? INTAKE_META.awaiting;

                  return (
                    <tr key={topic.id} className="bg-white dark:bg-slate-900/40 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-white text-xs leading-snug line-clamp-2 max-w-[220px]">{topic.title}</p>
                        {(topic.intakeRevisionCount ?? 0) > 0 && (
                          <span className="text-[10px] text-orange-500">Lần chỉnh sửa {topic.intakeRevisionCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{piName}</p>
                        {topic.submitterEmail && (
                          <p className="text-[11px] text-slate-400">{topic.submitterEmail}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 hidden sm:table-cell">{topic.department ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", meta.cls)}>
                          {meta.label}
                        </span>
                        {topic.intakeNote && (
                          <p className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate" title={topic.intakeNote}>
                            {topic.intakeNote}
                          </p>
                        )}
                      </td>
                      {/* ── Nhiệm vụ NCKH (intake queue) ── */}
                      <td className="px-3 py-2.5 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                        <TaskLinkCell
                          topic={topic}
                          nckhTasks={nckhTasks}
                          allTasks={tasks}
                          isAssigning={assigningId === topic.id}
                          isSaving={assignSaving === topic.id}
                          draft={assignDraft[topic.id] ?? topic.taskId ?? ""}
                          onOpen={() => { setAssigningId(topic.id); setAssignDraft(d => ({ ...d, [topic.id]: topic.taskId ?? "" })); }}
                          onClose={() => setAssigningId(null)}
                          onDraftChange={v => setAssignDraft(d => ({ ...d, [topic.id]: v }))}
                          onSave={v => handleAssignTask(topic, v || undefined)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {isOwnTopic ? (
                            <span
                              title="Bạn là tác giả/đồng tác giả — không thể tự kiểm tra, tiếp nhận đề cương của mình"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                            >
                              <AlertCircle className="w-3 h-3" />
                              Đề cương của bạn
                            </span>
                          ) : (
                          <button
                            onClick={() => setIntakeReviewTopic(topic)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 disabled:opacity-50 transition"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
                            Kiểm tra
                          </button>
                          )}
                          {topic.intakeStatus === "revision_needed" && topic.resubmitToken && (
                            <button
                              onClick={() => handleResendEmail(topic)}
                              disabled={emailSending === topic.id || emailSentIds.has(topic.id)}
                              title={emailSentIds.has(topic.id) ? "Đã gửi trong phiên này" : "Gửi mail kèm link chỉnh sửa cho tác giả"}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition disabled:opacity-50",
                                emailSentIds.has(topic.id)
                                  ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                                  : "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40",
                              )}
                            >
                              {emailSending === topic.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : emailSentIds.has(topic.id)
                                  ? <CheckCircle2 className="w-3 h-3" />
                                  : <Mail className="w-3 h-3" />
                              }
                              {emailSentIds.has(topic.id) ? "Đã gửi" : "Gửi mail"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Review assignment queue ── */}
      {(canManage || passedNeedingReview.some(t => t.reviewAssignment?.delegatedTo === currentUser.id)) && passedNeedingReview.length > 0 && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-200 dark:border-violet-800">
            <UserPlus className="w-4 h-4 text-violet-500 shrink-0" />
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              Hàng chờ phân biện ({passedNeedingReview.length} đề tài)
            </p>
            <span className="ml-auto text-xs text-violet-500 dark:text-violet-400 hidden sm:block">
              Chọn đề tài → Phân công phản biện
            </span>
            {selectedForReview.size > 0 && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Phân công ({selectedForReview.size})
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-violet-100/60 dark:bg-violet-900/20 text-xs text-violet-700 dark:text-violet-400">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedForReview.size === passedNeedingReview.length && passedNeedingReview.length > 0}
                      onChange={e => {
                        if (e.target.checked) setSelectedForReview(new Set(passedNeedingReview.map(t => t.id)));
                        else setSelectedForReview(new Set());
                      }}
                      className="accent-violet-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Tên đề tài</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Chủ nhiệm</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Đơn vị</th>
                  <th className="text-center px-3 py-2 font-medium">Phản biện</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Phụ trách phân công</th>
                  <th className="text-center px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100 dark:divide-violet-900/30">
                {passedNeedingReview.map(topic => {
                  const piName = topic.principalInvestigatorName ?? users.find(u => u.id === topic.principalInvestigatorId)?.name ?? "—";
                  const reviewCount = (topic.reviews ?? []).filter(r => r.stage === "proposal").length;
                  const isSelected = selectedForReview.has(topic.id);
                  const isDelegatedToMe = topic.reviewAssignment?.delegatedTo === currentUser.id;
                  const delegateName = topic.reviewAssignment?.delegatedName;

                  return (
                    <tr
                      key={topic.id}
                      className={cn(
                        "transition cursor-pointer",
                        isSelected
                          ? "bg-violet-100/70 dark:bg-violet-900/20"
                          : "bg-white dark:bg-slate-900/40 hover:bg-violet-50/40 dark:hover:bg-violet-900/10"
                      )}
                      onClick={() => setSelectedForReview(prev => {
                        const next = new Set(prev);
                        if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id);
                        return next;
                      })}
                    >
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            setSelectedForReview(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(topic.id); else next.delete(topic.id);
                              return next;
                            });
                          }}
                          className="accent-violet-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-white text-xs leading-snug line-clamp-2 max-w-[220px]">{topic.title}</p>
                        {topic.code && <span className="text-[10px] text-slate-400">{topic.code}</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{piName}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 hidden lg:table-cell">{topic.department ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          reviewCount === 0
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        )}>
                          {reviewCount}/2
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {delegateName ? (
                          <span className="text-xs text-violet-600 dark:text-violet-400">
                            {delegateName}{isDelegatedToMe && " (bạn)"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Chưa giao</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setSelectedForReview(new Set([topic.id])); setShowAssignModal(true); }}
                          disabled={!canManage && !isDelegatedToMe}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          <UserPlus className="w-3 h-3" />
                          Phân công
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AssignReviewersModal ── */}
      {showAssignModal && selectedForReview.size > 0 && (
        <AssignReviewersModal
          topics={topics.filter(t => selectedForReview.has(t.id))}
          users={users as any}
          currentUser={currentUser}
          canManage={canManage}
          onClose={() => { setShowAssignModal(false); setSelectedForReview(new Set()); }}
          onTopicUpdate={onTopicUpdate}
        />
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tổng đề tài", value: stats.total, color: "text-slate-700 dark:text-slate-200" },
          { label: "Đang triển khai", value: stats.active, color: "text-blue-600 dark:text-blue-400" },
          { label: "Hoàn thành", value: stats.completed, color: "text-green-600 dark:text-green-400" },
          { label: "Tiến độ TB", value: `${stats.avgProgress}%`, color: "text-violet-600 dark:text-violet-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">{s.label}</p>
            <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2 items-center">
          <FilterBar filters={filters} onChange={p => setFilters(f => ({ ...f, ...p }))} years={years} departments={departments} showDept={canManage} />
          {/* Task-link filter */}
          {canManage && (
            <select
              value={taskLinked}
              onChange={e => setTaskLinked(e.target.value as "all" | "linked" | "unlinked")}
              className={cn(
                "text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white",
                taskLinked === "unlinked"
                  ? "border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400"
                  : "border-slate-200 dark:border-slate-700",
              )}
            >
              <option value="all">Tất cả NV</option>
              <option value="linked">Đã liên kết NV</option>
              <option value="unlinked">⚠ Chưa liên kết NV</option>
            </select>
          )}
        </div>
        <span className="text-xs text-slate-400">{filtered.length} / {topics.length} đề tài</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-8">#</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Mã đề tài</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Tên đề tài</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-32">Chủ nhiệm</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Đơn vị</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-32">Giai đoạn</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36">Bước hiện tại</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Tiến độ</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-14">Năm</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36 hidden lg:table-cell">Nhiệm vụ</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.length === 0 ? (
              <EmptyRow cols={11} message="Không có đề tài khớp bộ lọc." />
            ) : filtered.map((t, i) => {
              const pi = users.find(u => u.id === t.principalInvestigatorId);
              const pct = researchProgress(t);
              const curLabel = stepMeta(t.currentStep)?.label ?? "—";
              const memberCount = (t.memberIds ?? []).length;
              return (
                <tr key={t.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition cursor-pointer group"
                  onClick={() => onView(t)}>
                  <td className="px-3 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-3">
                    {t.code
                      ? <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{t.code}</span>
                      : <span className="text-slate-300 dark:text-slate-600 text-xs italic">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800 dark:text-white line-clamp-2 leading-snug max-w-[260px]">{t.title}</p>
                    {t.field && <p className="text-[11px] text-slate-400 mt-0.5">{t.field}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate block max-w-[110px]">{pi?.name ?? "—"}</span>
                    {memberCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-slate-400 mt-0.5">
                        <Users className="w-2.5 h-2.5" /> {memberCount} thành viên
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate block max-w-[100px]">
                      {t.department ?? <span className="italic text-slate-300 dark:text-slate-600">—</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", STAGE_BADGE[t.stage])}>
                      {STAGE_LABEL[t.stage]}
                    </span>
                    {t.intakeStatus && t.intakeStatus !== "passed" && (
                      <span className={cn("block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium w-fit",
                        INTAKE_META[t.intakeStatus as keyof typeof INTAKE_META]?.cls)}>
                        {INTAKE_META[t.intakeStatus as keyof typeof INTAKE_META]?.label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[110px]">{curLabel}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3"><ProgressCell pct={pct} /></td>
                  <td className="px-3 py-3 text-xs text-slate-500">{t.year}</td>
                  {/* Nhiệm vụ column */}
                  <td className="px-3 py-3 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                    <TaskLinkCell
                      topic={t}
                      nckhTasks={nckhTasks}
                      allTasks={tasks}
                      isAssigning={assigningId === t.id}
                      isSaving={assignSaving === t.id}
                      draft={assignDraft[t.id] ?? t.taskId ?? ""}
                      onOpen={() => { setAssigningId(t.id); setAssignDraft(d => ({ ...d, [t.id]: t.taskId ?? "" })); }}
                      onClose={() => setAssigningId(null)}
                      onDraftChange={v => setAssignDraft(d => ({ ...d, [t.id]: v }))}
                      onSave={v => handleAssignTask(t, v || undefined)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition"
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => onView(t)} title="Xem"
                        className="p-1 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {canManage && (<>
                        <button onClick={() => onEdit(t)} title="Sửa"
                          className="p-1 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onDelete(t)} title="Xoá"
                          className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {intakeReviewTopic && (
        <IntakeReviewModal
          topic={intakeReviewTopic}
          taskId={intakeReviewTopic.taskId ?? ""}
          receiverName={currentUser.name}
          nckhTasks={nckhTasks}
          allTopics={topics}
          allUsers={users}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
          onAccept={(note, linkedTaskId, logs, matchedUserId) => handleIntakeAccept(intakeReviewTopic, note, linkedTaskId, logs, matchedUserId)}
          onRevise={(reason, logs) => handleIntakeRevise(intakeReviewTopic, reason, logs)}
          onReject={(reason, logs) => handleIntakeReject(intakeReviewTopic, reason, logs)}
          onLinkTask={(linkedTaskId) => handleLinkTask(intakeReviewTopic, linkedTaskId)}
          onClose={() => setIntakeReviewTopic(null)}
        />
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────

export default function ResearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId") ?? undefined;
  const autoCreate = searchParams.get("create") === "1";

  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();

  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTopic, setEditTopic] = useState<ResearchTopic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResearchTopic | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ topic: ResearchTopic; review: ResearchReview } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showImportTopics, setShowImportTopics] = useState(false);

  const canCreate  = !!currentUser && hasPermission(currentUser.role, "research:create");
  const canManage  = !!currentUser && hasPermission(currentUser.role, "research:manage");
  const roleCanMonitor = !!currentUser && (canManage || hasPermission(currentUser.role, "research:monitor"));
  // researchManager designation also grants monitor access (without full canManage)
  const hasResearchManagerDesig = !!(currentUser?.researchDesignations ?? []).includes("researchManager");
  const [taskAccessMonitor, setTaskAccessMonitor] = useState(false);
  const canMonitor = roleCanMonitor || hasResearchManagerDesig || taskAccessMonitor;

  // Default tab: monitors/managers start on monitor, others on my-topics
  const [activeTab, setActiveTab] = useState<"mine" | "review" | "council" | "monitor">(
    () => (roleCanMonitor || hasResearchManagerDesig) ? "monitor" : "mine"
  );

  // Check task-based monitor access for non-role users
  useEffect(() => {
    if (roleCanMonitor || !currentUser) return;
    fetch("/api/research/monitor-access")
      .then(r => r.json())
      .then((d: { canMonitor: boolean }) => {
        if (d.canMonitor) {
          setTaskAccessMonitor(true);
          setActiveTab("monitor");
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const visibleTopics = useMemo(() => {
    if (!currentUser) return topics;
    const effectiveRole = getEffectiveRole(currentUser);
    // director/hrAdmin thấy tất cả
    if (ROLE_RANK[effectiveRole] >= ROLE_RANK.director) return topics;
    // teamLead: lọc theo đơn vị (department) mình quản lý
    if (effectiveRole === "teamLead" && currentUser.positions?.length) {
      const myUnits = new Set(
        currentUser.positions
          .filter(p => p.unitName)
          .map(p => p.unitName!)
      );
      if (myUnits.size > 0) {
        return topics.filter(t => !t.department || myUnits.has(t.department));
      }
    }
    return topics;
  }, [topics, currentUser]);

  const myCount = useMemo(() => currentUser ? visibleTopics.filter(t =>
    t.principalInvestigatorId === currentUser.id ||
    t.mainPerformerId === currentUser.id ||
    (t.memberIds ?? []).includes(currentUser.id)
  ).length : 0, [visibleTopics, currentUser]);

  const reviewCount = useMemo(() => currentUser ? visibleTopics.reduce((sum, t) =>
    sum + (t.reviews ?? []).filter(r => r.reviewerId === currentUser.id).length, 0
  ) : 0, [visibleTopics, currentUser]);

  const councilCount = useMemo(() => currentUser ? visibleTopics.reduce((sum, t) =>
    sum + (t.councilSessions ?? []).filter(s => (s.memberIds ?? []).includes(currentUser.id)).length, 0
  ) : 0, [visibleTopics, currentUser]);

  useEffect(() => {
    // Always load regular topics; also merge in intake-pending no-task topics
    Promise.all([
      getResearchTopics(taskId),
      getResearchTopics(undefined, true),   // forIntake=1 → no-task submissions
    ]).then(([regular, intakePending]) => {
      const seen = new Set(regular.map(t => t.id));
      setTopics([...regular, ...intakePending.filter(t => !seen.has(t.id))]);
    }).catch(() => toast.error("Không tải được danh sách đề tài"))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    if (autoCreate && canCreate) setShowCreate(true);
  }, [autoCreate, canCreate]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteResearchTopic(deleteTarget.id);
      setTopics(prev => prev.filter(t => t.id !== deleteTarget.id));
      toast.success("Đã xoá đề tài");
      setDeleteTarget(null);
    } catch { toast.error("Xoá thất bại"); }
    finally { setDeleting(false); }
  }

  function handleTopicUpdate(id: string, updates: Partial<ResearchTopic>) {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  if (!currentUser) return null;

  const awaitingCount = visibleTopics.filter(t =>
    t.intakeStatus === "awaiting" || t.intakeStatus === "revision_needed" ||
    (!t.intakeStatus && t.stage === "init")
  ).length;

  const TABS = [
    { id: "mine"    as const, label: "Đề tài của tôi",    icon: Microscope,    count: myCount },
    { id: "review"  as const, label: "Phản biện của tôi", icon: ClipboardList, count: reviewCount },
    { id: "council" as const, label: "Hội đồng KH&CN",   icon: Vote,          count: councilCount },
    ...(canMonitor ? [{ id: "monitor" as const, label: "Giám sát tiến độ", icon: BarChart2, count: topics.length, badge: awaitingCount }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {taskId && (
        <button onClick={() => router.push(`/tasks/${taskId}`)}
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Quay lại nhiệm vụ
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <Microscope className="w-5 h-5 text-violet-500" />
            Nghiên cứu khoa học cấp cơ sở
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!canMonitor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <Lock className="w-2.5 h-2.5" />
                Chỉ hiển thị đề tài bạn tham gia
              </span>
            )}
            {taskId && (
              <p className="text-xs text-slate-400">
                Lọc theo nhiệm vụ ·{" "}
                <button onClick={() => router.push("/research")} className="underline hover:text-slate-600">Xem tất cả</button>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <button onClick={() => setShowImportTopics(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-xl transition">
                <Upload className="w-4 h-4" /> Import đề tài
              </button>
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-xl transition">
                <Upload className="w-4 h-4" /> Import phiếu PB
              </button>
            </>
          )}
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition">
              <Plus className="w-4 h-4" /> Đăng ký đề tài
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition",
              activeTab === tab.id
                ? "border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300",
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className={cn(
              "text-[11px] px-1.5 py-0.5 rounded-full font-semibold",
              activeTab === tab.id
                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
            )}>
              {tab.count}
            </span>
            {"badge" in tab && (tab.badge ?? 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500 text-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
      ) : (
        <>
          {currentUser && getEffectiveRole(currentUser) === "teamLead" && currentUser.positions?.some(p => p.unitName) && (
            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              Hiển thị đề tài của:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {(currentUser.positions ?? []).filter(p => p.unitName).map(p => p.unitName).join(", ")}
              </span>
            </div>
          )}
          {activeTab === "mine" && (
            <MyTopicsTab
              topics={visibleTopics}
              users={users}
              currentUser={currentUser}
              onEdit={setEditTopic}
              onDelete={setDeleteTarget}
              onView={t => router.push(`/research/${t.id}`)}
            />
          )}
          {activeTab === "review" && (
            <ReviewTab
              topics={visibleTopics}
              currentUserId={currentUser.id}
              onView={t => router.push(`/research/${t.id}`)}
              onSubmitReview={(topic, review) => setReviewTarget({ topic, review })}
            />
          )}
          {activeTab === "council" && (
            <CouncilTab
              topics={visibleTopics}
              users={users}
              currentUserId={currentUser.id}
              onView={t => router.push(`/research/${t.id}`)}
            />
          )}
          {activeTab === "monitor" && canMonitor && (
            <MonitorTab
              topics={visibleTopics}
              users={users}
              canManage={canManage}
              currentUser={currentUser}
              onEdit={setEditTopic}
              onDelete={setDeleteTarget}
              onView={t => router.push(`/research/${t.id}`)}
              onTopicUpdate={handleTopicUpdate}
            />
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <RegisterTopicModal
          defaultPI={currentUser.name}
          defaultDept={currentUser.department}
          defaultTaskId={taskId}
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          onClose={() => setShowCreate(false)}
          onCreated={(t) => { setTopics(prev => [t, ...prev]); setShowCreate(false); router.push(`/research/${t.id}`); }}
        />
      )}

      {showImportTopics && (
        <ImportTopicsModal
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          existingTopics={topics}
          onClose={() => setShowImportTopics(false)}
          onImported={async (newTopics) => {
            const { saveResearchTopic: save } = await import("@/lib/firebase/firestore");
            await Promise.all(newTopics.map(t => save(t)));
            setTopics(prev => [...newTopics, ...prev]);
            setShowImportTopics(false);
          }}
        />
      )}

      {editTopic && (
        <RegisterTopicModal
          initialData={editTopic}
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          onClose={() => setEditTopic(null)}
          onCreated={(updated) => {
            setTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
            setEditTopic(null);
          }}
        />
      )}

      {reviewTarget && (
        <ReviewFormModal
          topic={reviewTarget.topic}
          review={reviewTarget.review}
          onClose={() => setReviewTarget(null)}
          onSubmitted={(updatedReview) => {
            setTopics(prev => prev.map(t =>
              t.id === reviewTarget.topic.id
                ? { ...t, reviews: (t.reviews ?? []).map(r => r.id === updatedReview.id ? updatedReview : r) }
                : t
            ));
            setReviewTarget(null);
            toast.success("Đã nộp phiếu phản biện");
          }}
        />
      )}

      {showImport && (
        <ImportReviewsModal
          topics={topics}
          onClose={() => setShowImport(false)}
          onImported={async (updates) => {
            for (const { topicId, reviews } of updates) {
              await updateResearchTopic(topicId, { reviews });
            }
            setTopics(prev => prev.map(t => {
              const upd = updates.find(u => u.topicId === t.id);
              return upd ? { ...t, reviews: upd.reviews } : t;
            }));
            setShowImport(false);
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Xoá đề tài?</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{deleteTarget.title}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">Hành động này không thể hoàn tác. Toàn bộ dữ liệu phản biện, hội đồng và chứng nhận sẽ bị xoá vĩnh viễn.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Huỷ
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Xoá
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create modal ──────────────────────────────────────────────
interface CreateModalProps {
  users: { id: string; name: string }[];
  defaultPI: string;
  defaultDept?: string;
  defaultTaskId?: string;
  creatorId: string;
  creatorName: string;
  onClose: () => void;
  onCreated: (t: ResearchTopic) => void;
}

function CreateTopicModal({ users, defaultPI, defaultDept, defaultTaskId, creatorId, creatorName, onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [field, setField] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [piId, setPiId] = useState(defaultPI);
  const [department, setDepartment] = useState(defaultDept ?? "");
  const [abstract, setAbstract] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) { toast.error("Nhập tên đề tài"); return; }
    setSaving(true);
    const topic: ResearchTopic = {
      id: generateId("rsch"),
      code: code.trim() || undefined,
      title: title.trim(),
      field: field.trim() || undefined,
      principalInvestigatorId: piId,
      memberIds: [],
      department: department.trim() || undefined,
      year,
      abstract: abstract.trim() || undefined,
      stage: "init",
      currentStep: "approve_task",
      steps: buildInitialSteps(),
      reviews: [],
      councilSessions: [],
      certificates: [],
      documents: [],
      approvedToExecute: false,
      taskId: defaultTaskId || undefined,
      createdBy: creatorId,
      createdByName: creatorName,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveResearchTopic(topic);
      toast.success("Đã tạo đề tài — chờ phê duyệt cho thực hiện");
      onCreated(topic);
    } catch { toast.error("Tạo thất bại"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="font-semibold text-slate-800 dark:text-white">Tạo đề tài NCKH</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tên đề tài <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Đánh giá hiệu quả..."
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mã đề tài</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="CS-2026-01"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Năm</label>
              <input type="number" min={2020} max={2040} value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Lĩnh vực</label>
              <input value={field} onChange={e => setField(e.target.value)} placeholder="Y học..."
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Chủ nhiệm đề tài</label>
              <select value={piId} onChange={e => setPiId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500">
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Đơn vị</label>
              <input value={department} onChange={e => setDepartment(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tóm tắt</label>
            <textarea value={abstract} onChange={e => setAbstract(e.target.value)} rows={3}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
          </div>
          {defaultTaskId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg text-xs text-violet-700 dark:text-violet-300">
              <Microscope className="w-3.5 h-3.5 shrink-0" />
              Đề tài này sẽ được liên kết với nhiệm vụ hiện tại.
            </div>
          )}
          <p className="text-xs text-slate-400">
            Sau khi tạo, quản lý sẽ <strong>phê duyệt cho thực hiện</strong> và phân công người theo dõi để bắt đầu quy trình {RESEARCH_STEPS.length} bước.
          </p>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
          <button onClick={submit} disabled={saving || !title.trim()}
            className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Tạo đề tài
          </button>
        </div>
      </div>
    </div>
  );
}
