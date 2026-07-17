"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Microscope, Plus, Loader2, X, FlaskConical, ArrowLeft,
  Pencil, Trash2, AlertTriangle, Search, ChevronRight, ChevronDown,
  Users, BarChart2, Eye, ClipboardList, ClipboardCheck, Vote, Clock, CheckCircle2, XCircle, AlertCircle, Calendar, Upload, Download, Lock, Mail, ShieldAlert, UserPlus, ExternalLink, Award,
} from "lucide-react";
import { ImportReviewsModal } from "@/components/research/ImportReviewsModal";
import { RegisterTopicModal } from "@/components/research/RegisterTopicModal";
import { ImportTopicsModal } from "@/components/research/ImportTopicsModal";
import { ImportRecognizedTopicsModal } from "@/components/research/ImportRecognizedTopicsModal";
import { TemplateUploadButton } from "@/components/research/TemplateUploadButton";
import { TopicDetailModal, FilePreviewOverlay } from "@/components/research/TopicDetailModal";
import { IntakeReviewModal } from "@/components/research/IntakeReviewModal";
import { ResultIntakeReviewModal } from "@/components/research/ResultIntakeReviewModal";
import { AssignReviewersModal } from "@/components/research/AssignReviewersModal";
import { cn, generateId } from "@/lib/utils";
import { findDuplicatePairs, isTopicAuthor, isNckhManager, isNckhFullManager } from "@/lib/researchUtils";
import { researchFileUrl } from "@/lib/researchFileUrl";
import type { DupPair } from "@/lib/researchUtils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission, getEffectiveRole, ROLE_RANK, canUserAssignReviewer } from "@/lib/rbac/permissions";
import { getResearchTopics, saveResearchTopic, updateResearchTopic, deleteResearchTopic, generateResearchTask, addNotification, updateTask } from "@/lib/firebase/firestore";
import {
  RESEARCH_STEPS, STAGE_LABEL, buildInitialSteps, researchProgress, stepMeta,
  isAwaitingRevisionResubmit, isAwaitingRevisionProcessing, buildReconfirmStepsUpdate,
  reviewersToResendForReconfirm, activeReviews, classifySynthesisOutcome, type SynthesisOutcome,
  scoreOn10, grade3TFromAvg,
} from "@/lib/research";
import { useNckhReviewCriteria } from "@/hooks/useNckhReviewCriteria";
import type { ResearchTopic, ResearchStage, ResearchReview, ResearchCouncilSession, IntakeLog, Task, ResearchDesignation, ResearchStepKey, User } from "@/types";
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
    const needRevision = mine.filter(t => t.intakeStatus === "revision_needed" || isAwaitingRevisionResubmit(t) || isAwaitingRevisionProcessing(t)).length;
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
                    {isAwaitingRevisionResubmit(t) && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                        <AlertCircle className="w-2.5 h-2.5" /> Phản biện yêu cầu sửa — chờ nộp lại
                      </span>
                    )}
                    {isAwaitingRevisionProcessing(t) && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Đã nộp lại — chờ xử lý
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

// ─── Email modal target ────────────────────────────────────────
interface ReviewEmailTarget {
  topicId: string;
  reviewId: string;
  topicTitle: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewFormUrl: string;
  isReminder: boolean;
  reminderCount?: number;
}

// ─── Modal soạn mail mời / nhắc nhở phản biện ─────────────────
function ReviewEmailModal({
  target, senderName, onClose, onSent,
}: {
  target: ReviewEmailTarget;
  senderName: string;
  onClose: () => void;
  onSent: (topicId: string, reviewId: string, isReminder: boolean) => void;
}) {
  const defaultSubject = target.isReminder
    ? "[ARiHA] Nhắc nhở hoàn thành phiếu phản biện đề cương NCKH"
    : "[ARiHA] Đề nghị phản biện đề cương nghiên cứu khoa học";

  const defaultBody = target.isReminder
    ? `Kính gửi ${target.reviewerName},\n\nChúng tôi xin nhắc nhở Quý thầy/cô hoàn thành phiếu phản biện cho đề cương:\n"${target.topicTitle}"\n\nVui lòng truy cập đường link dưới đây để nộp phiếu phản biện:\n${target.reviewFormUrl}\n\nTrân trọng cảm ơn,\n${senderName}`
    : `Kính gửi ${target.reviewerName},\n\nBan Quản lý NCKH kính đề nghị Quý thầy/cô tham gia phản biện đề cương nghiên cứu khoa học:\n"${target.topicTitle}"\n\nVui lòng truy cập đường link dưới đây để thực hiện phản biện (không cần đăng nhập hệ thống):\n${target.reviewFormUrl}\n\nLưu ý: Phản biện được thực hiện theo nguyên tắc kín — thông tin tác giả và các phản biện viên khác sẽ không được tiết lộ.\n\nTrân trọng cảm ơn sự tham gia của Quý thầy/cô,\n${senderName}`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!target.reviewerEmail) { toast.error("Phản biện viên chưa có địa chỉ email"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/email/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: [{ id: "", name: target.reviewerName, email: target.reviewerEmail }],
          subject,
          body,
        }),
      });
      if (!res.ok) { toast.error("Gửi mail thất bại"); return; }
      onSent(target.topicId, target.reviewId, target.isReminder);
      toast.success(`Đã gửi email đến ${target.reviewerEmail}`);
      onClose();
    } catch { toast.error("Lỗi kết nối"); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">
              {target.isReminder ? "Gửi mail nhắc nhở" : "Gửi mail đề nghị phản biện"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{target.reviewerName}</p>
              <p className="text-[11px] text-slate-400 truncate">{target.reviewerEmail || "Chưa có email"}</p>
            </div>
            <span className={cn(
              "ml-auto shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full",
              target.isReminder
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            )}>
              {target.isReminder ? `Nhắc lần ${(target.reminderCount ?? 0) + 1}` : "Mời lần đầu"}
            </span>
          </div>

          <div className="px-3 py-2.5 bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800">
            <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide mb-1">Link phiếu phản biện (đã nhúng trong email)</p>
            <p className="text-xs text-violet-700 dark:text-violet-300 break-all font-mono">{target.reviewFormUrl}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Tiêu đề email</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Nội dung email</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              className="w-full text-xs px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400 resize-none font-mono leading-relaxed"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Email gửi qua hệ thống ARiHA WorkHub</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              Huỷ
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !target.reviewerEmail}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Gửi email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panel quản lý phân công phản biện (dành cho Quản lý KHCN) ─
function ReviewManagementView({
  topics, currentUser, onTopicUpdate,
}: {
  topics: ResearchTopic[];
  currentUser: { id: string; name: string; email?: string };
  onTopicUpdate: (id: string, updates: Partial<ResearchTopic>) => void;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | "proposal" | "recognition">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "done">("all");
  const [emailTarget, setEmailTarget] = useState<ReviewEmailTarget | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const reviewTopics = useMemo(() =>
    topics.filter(t => (t.reviews ?? []).length > 0),
    [topics]
  );

  const stats = useMemo(() => {
    let slots = 0, emailNotSent = 0, submitted = 0, passed = 0;
    for (const t of reviewTopics) {
      for (const r of t.reviews ?? []) {
        if (stageFilter !== "all" && r.stage !== stageFilter) continue;
        slots++;
        if (!r.emailSentAt && r.status === "assigned") emailNotSent++;
        if (r.status === "submitted") {
          submitted++;
          if (r.verdict === "pass" || r.verdict === "pass_if_revised") passed++;
        }
      }
    }
    return { topics: reviewTopics.length, slots, emailNotSent, submitted, passed };
  }, [reviewTopics, stageFilter]);

  const filtered = useMemo(() => reviewTopics.filter(t => {
    const reviews = (t.reviews ?? []).filter(r => stageFilter === "all" || r.stage === stageFilter);
    if (reviews.length === 0) return false;
    if (statusFilter === "pending" && reviews.every(r => r.status === "submitted")) return false;
    if (statusFilter === "done" && reviews.some(r => r.status === "assigned")) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.code ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [reviewTopics, stageFilter, statusFilter, search]);

  async function handleEmailSent(topicId: string, reviewId: string, isReminder: boolean) {
    setSavingId(`${topicId}-${reviewId}`);
    const topic = topics.find(t => t.id === topicId);
    if (!topic) { setSavingId(null); return; }
    const now = new Date().toISOString();
    const updatedReviews = (topic.reviews ?? []).map(r => {
      if (r.id !== reviewId) return r;
      if (isReminder) return { ...r, lastReminderAt: now, reminderCount: (r.reminderCount ?? 0) + 1 };
      return { ...r, emailSentAt: now };
    });
    try {
      await fetch(`/api/research/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews: updatedReviews, updatedAt: now }),
      });
      onTopicUpdate(topicId, { reviews: updatedReviews });
    } catch { /* email sent — tracking failure is non-critical */ }
    finally { setSavingId(null); }
  }

  function openEmail(topic: ResearchTopic, review: ResearchReview) {
    setEmailTarget({
      topicId: topic.id,
      reviewId: review.id,
      topicTitle: topic.title,
      reviewerName: review.reviewerName ?? "Phản biện viên",
      reviewerEmail: review.reviewerEmail ?? "",
      reviewFormUrl: review.token ? `${appUrl}/review/${review.token}` : "",
      isReminder: !!review.emailSentAt,
      reminderCount: review.reminderCount,
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Đề tài có phản biện" value={stats.topics} />
        <StatCard label="Chưa gửi mail mời" value={stats.emailNotSent}
          variant={stats.emailNotSent > 0 ? "warning" : "default"}
          sub="Phản biện chưa nhận mail" />
        <StatCard label="Đã nộp phiếu" value={stats.submitted}
          variant={stats.submitted > 0 ? "success" : "default"} />
        <StatCard label="Kết luận ĐẠT" value={stats.passed}
          variant={stats.passed > 0 ? "success" : "default"}
          sub="ĐẠT + ĐẠT nếu sửa" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
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
          <option value="pending">Còn phiếu chưa nộp</option>
          <option value="done">Đã nộp đủ</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} đề tài</span>
      </div>

      {/* Topic cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ClipboardList className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">
              {reviewTopics.length === 0
                ? "Chưa có đề tài nào được phân công phản biện."
                : "Không có đề tài khớp bộ lọc."}
            </p>
          </div>
        ) : filtered.map(topic => {
          const visibleReviews = (topic.reviews ?? []).filter(r =>
            stageFilter === "all" || r.stage === stageFilter
          );
          return (
            <div key={topic.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              {/* Topic header */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center gap-3">
                  {topic.code && (
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">{topic.code}</span>
                  )}
                  <p className="font-semibold text-sm text-slate-800 dark:text-white line-clamp-1 flex-1">{topic.title}</p>
                  {isAwaitingRevisionResubmit(topic) && (
                    <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                      <AlertCircle className="w-2.5 h-2.5" /> Yêu cầu sửa — chờ nộp lại
                    </span>
                  )}
                  {isAwaitingRevisionProcessing(topic) && (
                    <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Đã nộp lại — chờ xử lý
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    {visibleReviews.map(r => (
                      <span key={r.id}
                        className={cn("w-2.5 h-2.5 rounded-full",
                          r.status === "submitted" ? "bg-green-400" : "bg-amber-400"
                        )}
                        title={r.status === "submitted" ? "Đã nộp" : "Chưa nộp"} />
                    ))}
                  </div>
                </div>
                {/* PI + monitor + file */}
                <div className="flex items-center gap-3 flex-wrap">
                  {topic.principalInvestigatorName && (
                    <div className="flex items-center gap-1.5">
                      <AvatarBubble name={topic.principalInvestigatorName} size={18} />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{topic.principalInvestigatorName}</span>
                    </div>
                  )}
                  {topic.reviewAssignment?.delegatedName && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span className="text-slate-300">·</span>
                      <AvatarBubble name={topic.reviewAssignment.delegatedName} size={16} />
                      <span className="truncate max-w-[100px]">{topic.reviewAssignment.delegatedName}</span>
                    </div>
                  )}
                  {topic.proposalFileUrl && (
                    <a href={researchFileUrl(topic.proposalFileUrl)} target="_blank" rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium"
                      onClick={e => e.stopPropagation()}>
                      <ExternalLink className="w-2.5 h-2.5" /> Xem file đề cương
                    </a>
                  )}
                </div>
              </div>

              {/* Reviewer cards */}
              <div className={cn(
                "p-3 grid gap-3",
                visibleReviews.length >= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
              )}>
                {visibleReviews.map((review, ri) => {
                  const isSubmitted = review.status === "submitted";
                  const emailSent = !!review.emailSentAt;
                  const hasEmail = !!review.reviewerEmail;
                  const formUrl = review.token ? `${appUrl}/review/${review.token}` : "";
                  const isSaving = savingId === `${topic.id}-${review.id}`;

                  const verdictMeta =
                    review.verdict === "pass"
                      ? { label: "ĐẠT", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" }
                      : review.verdict === "pass_if_revised"
                      ? { label: "ĐẠT (sửa)", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" }
                      : review.verdict === "fail"
                      ? { label: "KHÔNG ĐẠT", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" }
                      : null;

                  return (
                    <div key={review.id} className={cn(
                      "flex flex-col gap-2 p-3 rounded-xl border",
                      isSubmitted
                        ? "border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10"
                        : "border-slate-200 dark:border-slate-700"
                    )}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">
                            PB{ri + 1}: {review.reviewerName ?? "—"}
                          </p>
                          {review.reviewerEmail && (
                            <p className="text-[11px] text-slate-400 truncate">{review.reviewerEmail}</p>
                          )}
                          {review.reviewerOrg && (
                            <p className="text-[11px] text-slate-400 truncate">{review.reviewerOrg}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                            isSubmitted
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          )}>
                            {isSubmitted ? "Đã nộp" : "Chưa nộp"}
                          </span>
                          {verdictMeta && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", verdictMeta.cls)}>
                              {verdictMeta.label}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Email status */}
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        {emailSent ? (
                          <span className="text-green-600 dark:text-green-400">
                            Đã gửi mail {new Date(review.emailSentAt!).toLocaleDateString("vi-VN")}
                            {(review.reminderCount ?? 0) > 0 && ` · Nhắc ${review.reminderCount} lần`}
                          </span>
                        ) : (
                          <span className="text-slate-400">Chưa gửi mail mời</span>
                        )}
                      </div>

                      {/* Due / submitted date */}
                      {isSubmitted && review.submittedAt && (
                        <p className="text-[11px] text-slate-400">
                          Nộp: {new Date(review.submittedAt).toLocaleString("vi-VN", {
                            day: "2-digit", month: "2-digit", year: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      )}
                      {!isSubmitted && review.dueAt && (
                        <p className={cn(
                          "text-[11px] flex items-center gap-1",
                          new Date(review.dueAt) < new Date() ? "text-red-500 font-medium" : "text-slate-400"
                        )}>
                          <Calendar className="w-3 h-3" />
                          Hạn: {new Date(review.dueAt).toLocaleDateString("vi-VN")}
                          {new Date(review.dueAt) < new Date() && " (Quá hạn)"}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        {!isSubmitted && hasEmail && (
                          <button
                            type="button"
                            onClick={() => openEmail(topic, review)}
                            disabled={isSaving}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg transition",
                              emailSent
                                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                            )}
                          >
                            <Mail className="w-3 h-3" />
                            {emailSent ? "Nhắc nhở" : "Gửi mail mời"}
                          </button>
                        )}
                        {!hasEmail && !isSubmitted && (
                          <span className="text-[11px] text-slate-400 italic">Không có email</span>
                        )}
                        {formUrl && (
                          <>
                            <a
                              href={formUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-violet-600 hover:border-violet-300 dark:hover:border-violet-600 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Xem phiếu
                            </a>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(formUrl); toast.success("Đã sao chép link phiếu PB"); }}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-violet-600 hover:border-violet-300 dark:hover:border-violet-600 transition"
                              title="Sao chép link phiếu phản biện"
                            >
                              <ClipboardCheck className="w-3 h-3" />
                              Sao chép link
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {emailTarget && (
        <ReviewEmailModal
          target={emailTarget}
          senderName={currentUser.name}
          onClose={() => setEmailTarget(null)}
          onSent={handleEmailSent}
        />
      )}
    </div>
  );
}

// ─── Tab: "Phản biện của tôi" (dual-mode) ─────────────────────
function ReviewTab({
  topics, currentUserId, currentUser, canManage, onView, onTopicUpdate,
}: {
  topics: ResearchTopic[];
  currentUserId: string;
  currentUser: { id: string; name: string; email?: string };
  canManage: boolean;
  onView: (t: ResearchTopic) => void;
  onTopicUpdate: (id: string, updates: Partial<ResearchTopic>) => void;
}) {
  const [stageFilter, setStageFilter] = useState<"all" | "proposal" | "recognition">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "submitted">("all");
  const [search, setSearch] = useState("");

  const myEmail = currentUser.email;
  const isMyReview = (r: ResearchReview) =>
    (!!r.reviewerId && r.reviewerId === currentUserId) ||
    (!!myEmail && !!r.reviewerEmail && r.reviewerEmail.toLowerCase() === myEmail.toLowerCase());

  const myRows = useMemo((): ReviewRow[] => {
    const result: ReviewRow[] = [];
    for (const topic of topics) {
      for (const review of topic.reviews ?? []) {
        if (isMyReview(review)) result.push({ topic, review });
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, currentUserId, myEmail]);

  // Lazy init: managers with no personal reviews start on management tab.
  // Computed synchronously so there's no async flicker.
  const [subTab, setSubTab] = useState<"my" | "manage">(() => {
    if (!canManage) return "my";
    const hasMyReviews = topics.some(t =>
      (t.reviews ?? []).some(r => isMyReview(r))
    );
    return hasMyReviews ? "my" : "manage";
  });

  const filtered = useMemo(() => myRows.filter(r => {
    if (stageFilter !== "all" && r.review.stage !== stageFilter) return false;
    if (statusFilter !== "all" && r.review.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.topic.title.toLowerCase().includes(q) && !(r.topic.code ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [myRows, stageFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const pending   = myRows.filter(r => r.review.status === "assigned").length;
    const overdue   = myRows.filter(r => r.review.status === "assigned" && r.review.dueAt && new Date(r.review.dueAt) < now).length;
    const submitted = myRows.filter(r => r.review.status === "submitted").length;
    return { total: myRows.length, pending, overdue, submitted };
  }, [myRows]);

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      {canManage && (
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setSubTab("my")}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition",
              subTab === "my"
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            )}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Phiếu của tôi
            {myRows.length > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                subTab === "my"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              )}>{myRows.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSubTab("manage")}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition",
              subTab === "manage"
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Quản lý phân công
          </button>
        </div>
      )}

      {/* My reviews sub-tab */}
      {subTab === "my" && (
        <div className="space-y-4">
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
                      {myRows.length === 0 ? "Bạn chưa được phân công phản biện đề tài nào." : "Không có phiếu khớp bộ lọc."}
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
                        {topic.principalInvestigatorName && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <div className="flex items-center gap-1">
                              <AvatarBubble name={topic.principalInvestigatorName} size={16} />
                              <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{topic.principalInvestigatorName}</span>
                            </div>
                          </div>
                        )}
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
                      <td className="px-3 py-2.5">
                        {review.token ? (
                          <a
                            href={`/review/${review.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition",
                              review.status === "assigned"
                                ? "bg-violet-600 hover:bg-violet-700 text-white"
                                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300",
                            )}
                          >
                            <ExternalLink className="w-3 h-3" />
                            {review.status === "assigned" ? "Mở phiếu PB" : "Xem phiếu"}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-300 italic">Chưa có link</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Management sub-tab */}
      {subTab === "manage" && canManage && (
        <ReviewManagementView
          topics={topics}
          currentUser={currentUser}
          onTopicUpdate={onTopicUpdate}
        />
      )}
    </div>
  );
}

// ─── Tab: "Hội đồng KH&CN" ────────────────────────────────────

const DECISION_META = {
  passed:  { label: "Thông qua",       cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  failed:  { label: "Không thông qua", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",         icon: XCircle },
  revise:  { label: "Yêu cầu sửa",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: AlertCircle },
} as const;

const VOTE_META = {
  approve: { label: "Tán thành",       cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  reject:  { label: "Không tán thành", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  abstain: { label: "Không ý kiến",    cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
} as const;

// Small avatar helper — initials in a colored circle
function AvatarBubble({ name, size = 22 }: { name?: string; size?: number }) {
  if (!name) return null;
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(-2).join("").toUpperCase();
  const colors = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500"];
  const color = colors[(name.charCodeAt(0) ?? 0) % colors.length];
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full text-white font-bold shrink-0", color)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={name}>
      {initials}
    </span>
  );
}

/**
 * Gửi phiếu xác nhận rút gọn (mode "confirm") cho đúng (các) phản biện cần xem lại bản chỉnh sửa
 * tác giả vừa nộp lại — dùng khi người phụ trách bấm "Xác nhận đã nhận" ở bảng Tổng hợp kết quả
 * (khớp sendReconfirmReviews ở trang chi tiết đề tài).
 */
async function sendReconfirmReviews(
  topicId: string, stage: "proposal" | "recognition", priorReviews: ResearchReview[], topicTitle: string,
) {
  const stamp = new Date().toISOString();
  for (const r of priorReviews) {
    await fetch(`/api/research/${topicId}/reviews`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage, mode: "confirm",
        reviewerType: r.reviewerType, reviewerId: r.reviewerId, reviewerName: r.reviewerName,
        reviewerEmail: r.reviewerEmail, reviewerOrg: r.reviewerOrg,
      }),
    }).catch(() => {});
    if (r.reviewerId) {
      await addNotification({
        userId: r.reviewerId, type: "approval_request", title: "Cần xác nhận bản chỉnh sửa",
        body: `Đề tài "${topicTitle}" đã nộp lại theo yêu cầu của bạn — vui lòng xác nhận Đồng ý/Không đồng ý.`,
        link: `/research/${topicId}`, read: false, priority: "normal", createdAt: stamp,
      }).catch(() => {});
    }
  }
}

function CouncilTab({
  topics, users, currentUser, canManage, canMonitor, onView, onTopicUpdate,
}: {
  topics: ResearchTopic[];
  users: { id: string; name: string; email?: string }[];
  currentUser: { id: string; name: string; researchDesignations?: ResearchDesignation[] };
  canManage: boolean;
  canMonitor: boolean;
  onView: (t: ResearchTopic) => void;
  onTopicUpdate: (id: string, updates: Partial<ResearchTopic>) => void;
}) {
  const [subTab, setSubTab] = useState<"synthesis" | "vote">("synthesis");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [councilSelected, setCouncilSelected] = useState<Set<string>>(new Set());
  const [advancing, setAdvancing] = useState(false);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [synthSearch, setSynthSearch] = useState("");
  const [synthQuarterFilter, setSynthQuarterFilter] = useState<string>("all");

  // Batch action modal for council steps
  type BatchAction = "council_decision" | "ethics" | "proceed" | "recognize";
  const [batchModal, setBatchModal] = useState<BatchAction | null>(null);
  const [batchDecision, setBatchDecision] = useState<"passed" | "failed" | "revise">("passed");
  const [batchNote, setBatchNote] = useState("");
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchSaving, setBatchSaving] = useState(false);
  // Quyết định công nhận GĐ2 (r_recognize) hàng loạt — 1 Quyết định/chứng nhận có thể công nhận
  // nhiều đề tài cùng lúc, nên số chứng nhận/ngày cấp/đơn vị cấp dùng chung cho cả batch đã chọn.
  const [batchCertNo, setBatchCertNo] = useState("");
  const [batchCertScope, setBatchCertScope] = useState("");
  const [batchCertIssuedAt, setBatchCertIssuedAt] = useState("");
  const [batchCertIssuedBy, setBatchCertIssuedBy] = useState("");
  const reviewCriteria = useNckhReviewCriteria();

  // ── Modal gửi phiếu biểu quyết qua email ──
  const [tokenModal, setTokenModal] = useState<{ topicId: string; sessionId: string; tokens: { name: string; email?: string; link: string }[] } | null>(null);
  const [sendingTokens, setSendingTokens] = useState<string | null>(null); // sessionId being processed

  // ── Xử lý từng đề tài theo xếp loại tổng hợp: từ chối / yêu cầu sửa (có hoặc không cần PB xác nhận lại) ──
  type RowAction = "reject" | "revise_no_reconfirm" | "revise_reconfirm";
  const [rowActionModal, setRowActionModal] = useState<{ topicId: string; action: RowAction } | null>(null);
  const [rowActionNote, setRowActionNote] = useState("");
  const [rowActionSubject, setRowActionSubject] = useState("");
  const [rowActionDueDate, setRowActionDueDate] = useState(""); // yyyy-mm-dd, thời hạn nộp lại
  const [rowActioning, setRowActioning] = useState(false);

  // Gợi ý sẵn nội dung cần sửa từ chính các phiếu phản biện "ĐẠT nếu chỉnh sửa" — người phụ trách
  // không phải tự gõ lại những gì phản biện đã viết.
  function buildSuggestedRevisionBody(reviews: ResearchReview[]): string {
    const lines = reviews
      .filter(r => r.verdict === "pass_if_revised" && (r.revisionPoints || r.additionalComments))
      .map((r, i) => {
        const parts: string[] = [];
        if (r.revisionPoints) parts.push(`Điểm cần sửa: ${r.revisionPoints}`);
        if (r.additionalComments) parts.push(`Ý kiến thêm: ${r.additionalComments}`);
        return `Phản biện ${i + 1} — ${parts.join(". ")}`;
      });
    return lines.join("\n");
  }

  const isCouncilMember = (currentUser?.researchDesignations ?? []).some(d =>
    ["councilMember", "councilChair", "councilSecretary"].includes(d)
  );


  // Sub-tab 1: đề tài (GĐ1 hoặc GĐ2) đã đủ 2 phiếu thẩm định vòng hiện tại, chưa vào Hội đồng —
  // chờ người phụ trách xếp loại & xử lý (Đạt / Không đạt / Đạt cần sửa...).
  const synthesisTopics = useMemo(() => {
    const base = topics.filter(t => {
      // Đã nộp lại sau "Yêu cầu sửa đổi" (currentStep quay lại p_compile/r_intake, chờ người phụ
      // trách "Xác nhận đã nhận") — hiện luôn ở đây, không cần đợi đủ 2 phiếu mới (dùng lại đúng 2
      // phiếu vòng trước để xác nhận/gửi PB xác nhận lại).
      // NHƯNG: chỉ áp dụng khi đây THỰC SỰ là vòng đã từng qua thẩm định (đã có phiếu phản biện nộp
      // ở giai đoạn này, dù vòng nào) — "Xác nhận" ở Tổng hợp kết quả mặc định coi thẩm định vòng
      // trước đã xong (nhánh "skip" nhảy thẳng Hội đồng, bỏ qua thẩm định). Với GĐ2, "Yêu cầu chỉnh
      // sửa" ngay tại bước TIẾP NHẬN (handleResultIntakeRevise) cũng dùng chung revisionCount/
      // revisionResubmittedAt nhưng CHƯA từng qua thẩm định — nếu không loại trừ, "Xác nhận" ở đây
      // sẽ nhảy thẳng Hội đồng mà bỏ qua hẳn bước 2 phản biện kín. Trường hợp này phải quay lại xử
      // lý bình thường ở "Hàng chờ tiếp nhận" (đã tự động đúng nhờ điều kiện tương tự ở awaitingResultTopics).
      if (isAwaitingRevisionProcessing(t)) {
        const stage: "proposal" | "recognition" = t.currentStep === "r_intake" ? "recognition" : "proposal";
        const everReviewed = (t.reviews ?? []).some(r => r.stage === stage && r.status === "submitted");
        if (everReviewed) return true;
      }
      const stage: "proposal" | "recognition" | null =
        t.currentStep === "p_review" ? "proposal" : t.currentStep === "r_review" ? "recognition" : null;
      if (!stage) return false;
      const reviews = activeReviews(t, stage).filter(r => r.status === "submitted");
      return reviews.length >= 2;
    });
    if (!canManage && !canMonitor) {
      return base.filter(t => t.reviewAssignment?.delegatedTo === currentUser.id);
    }
    return base;
  }, [topics, canManage, canMonitor, currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function synthesisStageOf(t: ResearchTopic): "proposal" | "recognition" {
    return (t.currentStep === "r_review" || t.currentStep === "r_intake") ? "recognition" : "proposal";
  }

  const synthesisYears = useMemo(() => {
    const yrs = [...new Set(synthesisTopics.map(t => t.year).filter(Boolean))].sort((a, b) => b! - a!);
    return yrs as number[];
  }, [synthesisTopics]);

  const filteredSynthesis = useMemo(() => {
    const sq = synthSearch.toLowerCase();
    return synthesisTopics.filter(t => {
      if (yearFilter !== "all" && String(t.year) !== yearFilter) return false;
      if (synthQuarterFilter !== "all") {
        const reviews = (t.reviews ?? []).filter(r => r.stage === "proposal" && r.status === "submitted");
        const lastSubmit = reviews.map(r => r.submittedAt ?? "").filter(Boolean).sort().reverse()[0];
        if (lastSubmit) {
          const qNum = Math.floor(new Date(lastSubmit).getMonth() / 3) + 1;
          if (String(qNum) !== synthQuarterFilter) return false;
        }
      }
      if (!sq) return true;
      return t.title.toLowerCase().includes(sq) ||
        (t.code ?? "").toLowerCase().includes(sq) ||
        (t.principalInvestigatorName ?? "").toLowerCase().includes(sq) ||
        (t.reviewAssignment?.delegatedName ?? "").toLowerCase().includes(sq);
    });
  }, [synthesisTopics, yearFilter, synthSearch, synthQuarterFilter]);

  // Sub-tab 2: topics at p_council/p_ethics/p_agree (GĐ1) hoặc r_council/r_recognize (GĐ2 — không
  // có bước y đức riêng, "Ghi kết quả HĐ" chuyển thẳng sang r_recognize để gán Quyết định công
  // nhận ở trang chi tiết đề tài, xem RRecognizePanel).
  const POST_COUNCIL_STEPS = new Set<ResearchStepKey>(["p_council", "p_ethics", "p_agree", "r_council", "r_recognize"]);
  const councilTopics = useMemo(() => {
    const all = topics.filter(t => POST_COUNCIL_STEPS.has(t.currentStep));
    if (!canManage && !canMonitor) {
      return all.filter(t =>
        (t.councilSessions ?? []).some(s =>
          (s.members ?? []).some(m => m.userId === currentUser.id)
        )
      );
    }
    return all;
  }, [topics, canManage, canMonitor, currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCouncil = useMemo(() => {
    if (!search) return councilTopics;
    const q = search.toLowerCase();
    return councilTopics.filter(t =>
      t.title.toLowerCase().includes(q) || (t.code ?? "").toLowerCase().includes(q)
    );
  }, [councilTopics, search]);

  // Batch action for council step advancement
  async function handleBatchCouncilAction() {
    if (!batchModal || councilSelected.size === 0) return;
    if (batchModal === "recognize" && !batchCertNo.trim()) {
      toast.error("Nhập số chứng nhận công nhận");
      return;
    }
    if (batchModal === "ethics" && !batchCertNo.trim()) {
      toast.error("Nhập số chứng nhận y đức");
      return;
    }
    setBatchSaving(true);
    const now = new Date().toISOString();
    let ok = 0;
    try {
      for (const id of councilSelected) {
        const topic = councilTopics.find(t => t.id === id);
        if (!topic) continue;
        let updates: Partial<ResearchTopic> = { updatedAt: now };
        if (batchModal === "council_decision" && (topic.currentStep === "p_council" || topic.currentStep === "r_council")) {
          // GĐ1: chuyển sang p_ethics (chứng nhận y đức). GĐ2 không có bước y đức riêng — chuyển
          // thẳng sang r_recognize để gán Quyết định công nhận ở trang chi tiết (RRecognizePanel).
          const stage: "proposal" | "recognition" = topic.currentStep === "r_council" ? "recognition" : "proposal";
          const nextStep = stage === "recognition" ? "r_recognize" : "p_ethics";
          const sessionIdx = (topic.councilSessions ?? []).findIndex(s => s.stage === stage);
          const sessions = [...(topic.councilSessions ?? [])];
          if (sessionIdx >= 0) {
            sessions[sessionIdx] = {
              ...sessions[sessionIdx],
              decision: batchDecision,
              scheduledAt: sessions[sessionIdx].scheduledAt || batchDate,
              conclusion: batchNote.trim() || sessions[sessionIdx].conclusion,
            };
          } else {
            // Ghi nhanh kết luận — không có danh sách thành viên (khác với 1 hội đồng thật sự lập
            // qua PCouncilPanel), nên server chấp nhận ngay không cần Director/teamLead duyệt.
            sessions.push({
              id: generateId("council"),
              stage,
              mode: "in_person",
              scheduledAt: batchDate,
              decision: batchDecision,
              conclusion: batchNote.trim() || undefined,
              createdAt: now,
            });
          }
          updates = { ...updates, councilSessions: sessions, currentStep: nextStep };
        } else if (batchModal === "ethics" && topic.currentStep === "p_ethics") {
          const cert = batchCertNo.trim()
            ? [{ type: "ethics" as const, number: batchCertNo.trim(), issuedAt: batchCertIssuedAt || undefined, issuedBy: batchCertIssuedBy || undefined }]
            : [];
          updates = { ...updates, currentStep: "p_agree", certificates: [...(topic.certificates ?? []), ...cert] };
        } else if (batchModal === "proceed" && topic.currentStep === "p_agree") {
          // "Đồng ý cho thực hiện" hàng loạt — tự gán người thực hiện chính (mặc định = chủ
          // nhiệm) nếu chưa có, khớp đúng luồng single-topic (PAgreePanel), rồi mới sinh Task
          // triển khai. Không còn qua bước "Phê duyệt thực hiện & gán người" thủ công riêng nữa.
          const steps = topic.steps.map(s =>
            s.key === "p_agree" ? { ...s, status: "passed" as const, completedAt: now }
            : s.key === "exec_start" ? { ...s, status: "in_progress" as const }
            : s
          );
          const cert = batchCertNo.trim()
            ? [{ type: "agreement" as const, number: batchCertNo.trim(), issuedAt: batchCertIssuedAt || undefined, issuedBy: batchCertIssuedBy || undefined }]
            : [];
          updates = {
            ...updates,
            steps,
            stage: "executing",
            currentStep: "exec_start",
            mainPerformerId: topic.mainPerformerId || topic.principalInvestigatorId,
            certificates: [...(topic.certificates ?? []), ...cert],
          };
        } else if (batchModal === "recognize" && topic.currentStep === "r_recognize") {
          // Quyết định công nhận GĐ2 hàng loạt — cùng 1 số chứng nhận/ngày cấp/đơn vị cấp áp dụng
          // cho mọi đề tài đã chọn (1 Quyết định công nhận nhiều đề tài cùng lúc), khớp đúng
          // logic single-topic ở RRecognizePanel (trang chi tiết đề tài).
          const cert = {
            type: "recognition" as const,
            number: batchCertNo.trim(),
            scope: batchCertScope.trim() || undefined,
            issuedAt: batchCertIssuedAt || undefined,
            issuedBy: batchCertIssuedBy || undefined,
          };
          const steps = topic.steps.map(s =>
            s.key === "r_recognize" ? { ...s, status: "passed" as const, completedAt: now } : s
          );
          updates = {
            ...updates,
            steps,
            stage: "completed",
            certificates: [...(topic.certificates ?? []), cert],
          };
        } else {
          continue; // skip topics not in the expected step
        }
        await fetch(`/api/research/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        onTopicUpdate(id, updates);
        if (batchModal === "proceed") {
          try {
            const res = await generateResearchTask(id);
            if (res?.taskId) {
              await updateResearchTopic(id, { executionTaskId: res.taskId });
              onTopicUpdate(id, { executionTaskId: res.taskId });
            }
          } catch { /* sinh task không thành công — không chặn luồng nghiệp vụ */ }
        }
        if (batchModal === "recognize" && topic.executionTaskId) {
          // Khoá kết quả vào Task liên kết → tính Kế hoạch NCKH + Hiệu suất (3T), khớp RRecognizePanel.
          const recReviews = activeReviews(topic, "recognition").filter(r => r.status === "submitted");
          const scores = recReviews.map(r => r.score).filter((s): s is number => typeof s === "number");
          const maxScore = reviewCriteria.recognition.length * 5;
          const avg35 = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          const avg10 = avg35 != null ? Math.round((avg35 / maxScore) * 100) / 10 : null;
          const t10 = avg10 ?? 8;
          const rating5 = Math.max(1, Math.min(5, Math.round(t10 / 2)));
          await updateTask(topic.executionTaskId, {
            status: "done",
            progress: 100,
            evaluation: "Đề tài NCKH được Hội đồng công nhận phạm vi ảnh hưởng cấp cơ sở.",
            evaluationRating: rating5,
            completionProposal: {
              submittedBy: topic.mainPerformerId || topic.principalInvestigatorId || currentUser?.id || "",
              submittedAt: now,
              summary: "Đề tài hoàn thành & được Hội đồng KHCN công nhận.",
              status: "approved",
              reviewedBy: currentUser?.id,
              reviewedAt: now,
              reviewRating: rating5,
              score3T: { t1: t10, t2: t10, t3: t10, total: t10, grade: grade3TFromAvg(t10), computedAt: now },
            },
          }).catch(() => {});
          const notifyIds = [topic.principalInvestigatorId, topic.mainPerformerId].filter(Boolean) as string[];
          await Promise.all(notifyIds.filter(uid => uid !== currentUser?.id).map(uid =>
            addNotification({
              userId: uid, type: "request_approved", title: "Đề tài được công nhận",
              body: `Đề tài "${topic.title}" đã được Hội đồng KHCN công nhận phạm vi ảnh hưởng cấp cơ sở.`,
              link: `/research/${topic.id}`, read: false, priority: "normal", createdAt: now,
            }).catch(() => {})
          ));
        }
        ok++;
      }
      setCouncilSelected(new Set());
      setBatchModal(null);
      setBatchNote("");
      setBatchCertNo(""); setBatchCertScope(""); setBatchCertIssuedAt(""); setBatchCertIssuedBy("");
      toast.success(`Đã cập nhật ${ok} đề tài`);
    } catch { toast.error("Có lỗi xảy ra"); }
    finally { setBatchSaving(false); }
  }

  // Export Excel for synthesis tab
  async function handleSynthesisExport(topicsToExport: ResearchTopic[]) {
    try {
      const { utils, writeFile } = await import("xlsx");
      const rows = topicsToExport.map(t => {
        const stage = synthesisStageOf(t);
        const reviews = activeReviews(t, stage).filter(r => r.status === "submitted");
        const outcome = classifySynthesisOutcome(reviews);
        const OUTCOME_LABEL: Record<SynthesisOutcome, string> = {
          pass: "Đạt", fail: "Không đạt",
          revise_no_reconfirm: "Đạt, cần sửa (không cần PB xác nhận)",
          revise_reconfirm: "Đạt, cần sửa (cần PB xác nhận lại)",
        };
        const piName = t.principalInvestigatorName ?? users.find(u => u.id === t.principalInvestigatorId)?.name ?? "";
        const monitorName = t.reviewAssignment?.delegatedName ?? users.find(u => u.id === t.reviewAssignment?.delegatedTo)?.name ?? "";
        const lastSubmit = reviews.map(r => r.submittedAt ?? "").filter(Boolean).sort().reverse()[0];
        const verdictLabel = (r?: ResearchReview) => !r ? "" : r.verdict === "pass" ? "ĐẠT" : r.verdict === "fail" ? "KHÔNG ĐẠT" : "ĐẠT (sửa)";
        return {
          "Mã đề tài":      t.code ?? "",
          "Tên đề tài":     t.title,
          "Giai đoạn":      stage === "recognition" ? "GĐ2" : "GĐ1",
          "Đơn vị":         t.department ?? "",
          "Năm":            t.year ?? "",
          "Chủ nhiệm":      piName,
          "Người theo dõi": monitorName,
          "Thành viên":     (t.memberNames ?? "").split("\n").filter(Boolean).join("; "),
          "PB1 kết quả":    verdictLabel(reviews[0]),
          "PB1 điểm":       reviews[0]?.score ?? "",
          "PB2 kết quả":    verdictLabel(reviews[1]),
          "PB2 điểm":       reviews[1]?.score ?? "",
          "Xếp loại":       outcome ? OUTCOME_LABEL[outcome] : "",
          "Ngày nộp":       lastSubmit ? new Date(lastSubmit).toLocaleDateString("vi-VN") : "",
          "Nhiệm vụ":       t.taskId ?? "",
        };
      });
      const ws = utils.json_to_sheet(rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Tổng hợp PB");
      writeFile(wb, `TongHopPhanBien-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Đã xuất Excel");
    } catch { toast.error("Xuất Excel thất bại"); }
  }

  // Export Excel for council tab selected (or all)
  async function handleCouncilExport(topicsToExport: ResearchTopic[]) {
    try {
      const { utils, writeFile } = await import("xlsx");
      const STEP_LABEL: Record<string, string> = {
        p_council: "Hội đồng thông qua", p_ethics: "Y đức", p_agree: "Quyết định triển khai",
        r_council: "Hội đồng thông qua", r_recognize: "Chờ quyết định công nhận",
      };
      const rows = topicsToExport.map(t => {
        const stage: "proposal" | "recognition" = t.currentStep.startsWith("r_") ? "recognition" : "proposal";
        const pi = users.find(u => u.id === t.principalInvestigatorId);
        const monitor = t.reviewAssignment?.delegatedTo ? users.find(u => u.id === t.reviewAssignment!.delegatedTo) : undefined;
        const session = (t.councilSessions ?? []).find(s => s.stage === stage);
        const reviews = (t.reviews ?? []).filter(r => r.stage === stage && r.status === "submitted");
        const reviewerNames = reviews.map((r, i) =>
          `PB${i + 1}: ${r.reviewerName ?? users.find(u => u.id === r.reviewerId)?.name ?? ""}`
        ).join("; ");
        return {
          "Mã đề tài":       t.code ?? "",
          "Tên đề tài":      t.title,
          "Giai đoạn":       stage === "recognition" ? "GĐ2" : "GĐ1",
          "Đơn vị":          t.department ?? "",
          "Lĩnh vực":        t.field ?? "",
          "Năm":             t.year ?? "",
          "Chủ nhiệm":       t.principalInvestigatorName ?? pi?.name ?? "",
          "Người theo dõi":  monitor?.name ?? t.reviewAssignment?.delegatedName ?? "",
          "Thành viên":      (t.memberNames ?? "").split("\n").filter(Boolean).join("; "),
          "Phản biện":       reviewerNames,
          "Bước":            STEP_LABEL[t.currentStep] ?? t.currentStep,
          "Kết luận HĐ":    session?.decision ? { passed: "Thông qua", failed: "Không thông qua", revise: "Yêu cầu sửa" }[session.decision] ?? session.decision : "",
          "Nhiệm vụ":        t.taskId ?? "",
          "File đính kèm":   (stage === "recognition" ? t.finalReportFileUrl : t.proposalFileUrl) ?? "",
        };
      });
      const ws = utils.json_to_sheet(rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Hội đồng KHCN");
      writeFile(wb, `HDKHCN-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Đã xuất Excel");
    } catch { toast.error("Xuất Excel thất bại"); }
  }

  // Batch advance các đề tài đã xếp loại "Đạt" (cả GĐ1 lẫn GĐ2) sang bước Hội đồng thông qua
  async function handleBatchAdvance() {
    if (selected.size === 0) return;
    setAdvancing(true);
    const now = new Date().toISOString();
    let ok = 0;
    try {
      for (const id of selected) {
        const topic = synthesisTopics.find(t => t.id === id);
        if (!topic) continue;
        const stage = synthesisStageOf(topic);
        const reviewKey = stage === "recognition" ? "r_review" : "p_review";
        const councilKey = stage === "recognition" ? "r_council" : "p_council";
        const steps = (topic.steps ?? []).map(s =>
          s.key === reviewKey  ? { ...s, status: "passed" as const, completedAt: now }
          : s.key === councilKey ? { ...s, status: "in_progress" as const }
          : s
        );
        const updates: Partial<ResearchTopic> = { steps, currentStep: councilKey, updatedAt: now };
        await fetch(`/api/research/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        onTopicUpdate(id, updates);
        ok++;
      }
      setSelected(new Set());
      toast.success(`Đã chuyển ${ok} đề tài sang Hội đồng thông qua`);
    } catch { toast.error("Có lỗi khi chuyển bước"); }
    finally { setAdvancing(false); }
  }

  // Từ chối đề tài (xếp loại "Không đạt")
  async function handleRowReject(topic: ResearchTopic, reason: string) {
    const stamp = new Date().toISOString();
    const updates: Partial<ResearchTopic> = { stage: "rejected", rejectionReason: reason || undefined, updatedAt: stamp };
    await fetch(`/api/research/${topic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
    });
    onTopicUpdate(topic.id, updates);
  }

  /**
   * Thông báo chủ nhiệm khi phản biện yêu cầu chỉnh sửa — gửi cả thông báo trong ứng dụng lẫn
   * email theo đúng tiêu đề/nội dung đã soạn ở modal "Yêu cầu sửa đổi" (subject/body có thể sửa
   * tự do, đã gợi ý sẵn từ ý kiến phản biện). Trước đây việc xếp loại "cần sửa" chỉ đổi trạng
   * thái trong DB, không hề báo cho chủ nhiệm biết.
   */
  async function sendReviseNotice(
    topic: ResearchTopic, subject: string, body: string, dueDate: string, stage: "proposal" | "recognition",
  ) {
    const author = users.find(u => u.id === topic.principalInvestigatorId);
    const authorEmail = topic.submitterEmail ?? author?.email;
    const label = stage === "recognition" ? "kết quả nghiên cứu" : "đề cương";
    const stamp = new Date().toISOString();
    const dueLine = dueDate ? `\n\nThời hạn nộp lại: ${new Date(dueDate).toLocaleDateString("vi-VN")}. Quá thời hạn này mà chưa nộp lại, đề tài sẽ tự động bị từ chối.` : "";

    const notifyIds = [...new Set([topic.principalInvestigatorId, topic.mainPerformerId].filter(Boolean))] as string[];
    await Promise.all(notifyIds.map(uid =>
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          type: "approval_request",
          title: subject || `Phản biện yêu cầu chỉnh sửa ${label}`,
          body: `${body || `Đề tài "${topic.title}" cần chỉnh sửa ${label}.`}${dueLine}`,
          link: `/research/${topic.id}`,
          read: false,
          priority: "urgent",
          createdAt: stamp,
        }),
      }).catch(() => {})
    ));

    if (authorEmail) {
      const fullSubject = subject || `[ARiHA] Yêu cầu chỉnh sửa ${label}: ${topic.title}`;
      const fullBody =
        `Kính gửi ${topic.principalInvestigatorName ?? author?.name ?? "Quý tác giả"},\n\n` +
        `Phản biện đã yêu cầu chỉnh sửa ${label} của đề tài "${topic.title}".\n\n` +
        `Nội dung cần chỉnh sửa:\n${body || "Xem chi tiết trong hệ thống ARiHA WorkHub."}` +
        dueLine +
        `\n\nVui lòng đăng nhập hệ thống để cập nhật và nộp lại.\n\n` +
        `Trân trọng,\n${currentUser.name}`;
      await fetch("/api/email/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUserId: currentUser.id,
          recipients: [{ id: author?.id ?? "", name: topic.principalInvestigatorName ?? author?.name ?? "", email: authorEmail }],
          subject: fullSubject,
          body: fullBody,
        }),
      }).catch(() => {});
    }
  }

  // Yêu cầu sửa đổi (reset về bước tổng hợp/tiếp nhận của giai đoạn tương ứng, tăng revisionCount)
  // — dùng chung cho cả 2 trường hợp "không cần PB xác nhận lại" và "cần PB xác nhận lại". Chỉ
  // đánh dấu round cần xử lý gì (skipReviewRound / needsReviewerReconfirmRound) — KHÔNG tạo phiếu
  // xác nhận ngay ở đây, vì tác giả chưa nộp lại nên phản biện chưa có bản mới để xem. Phiếu xác
  // nhận chỉ được tạo khi người phụ trách bấm "Xác nhận đã nhận" sau khi tác giả nộp lại (xem
  // RIntakePanel/ProposalTab ở trang chi tiết đề tài). Ngay khi xếp loại xong, gửi luôn thông báo
  // + email cho chủ nhiệm — không cần thao tác gửi riêng nữa. Nếu có đặt thời hạn nộp lại
  // (dueDate), lưu vào revisionDueAt để cron research-revision-deadline tự từ chối khi quá hạn.
  async function handleRowRevise(
    topic: ResearchTopic, subject: string, body: string, dueDate: string, needsReconfirm: boolean,
  ) {
    const stamp = new Date().toISOString();
    const stage = synthesisStageOf(topic);
    const resetTo = stage === "recognition" ? "r_intake" : "p_compile";
    const loopKeys = stage === "recognition"
      ? ["r_intake", "r_review", "r_council", "r_recognize"]
      : ["p_compile", "p_assign", "p_review", "p_council", "p_ethics", "p_agree"];
    const newRound = (topic.revisionCount ?? 0) + 1;
    const steps = (topic.steps ?? []).map(s =>
      s.key === resetTo ? { ...s, status: "in_progress" as const, completedAt: undefined }
      : loopKeys.includes(s.key) ? { ...s, status: "pending" as const, completedAt: undefined }
      : s
    );
    const updates: Partial<ResearchTopic> = {
      steps,
      currentStep: resetTo,
      revisionNote: body || undefined,
      revisionDueAt: dueDate ? new Date(dueDate).toISOString() : undefined,
      revisionCount: newRound,
      revisionResubmittedAt: null,
      reconfirmLoopActive: false,
      updatedAt: stamp,
      ...(needsReconfirm ? { needsReviewerReconfirmRound: newRound } : { skipReviewRound: newRound }),
    };
    await fetch(`/api/research/${topic.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
    });
    onTopicUpdate(topic.id, updates);
    await sendReviseNotice(topic, subject, body, dueDate, stage);
  }

  // Tác giả đã nộp lại sau "Yêu cầu sửa đổi" (isAwaitingRevisionProcessing) — người phụ trách xác
  // nhận đã nhận ngay tại bảng Tổng hợp kết quả, không cần mở từng đề tài: rẽ theo đúng xếp loại
  // đã chọn lúc "Yêu cầu sửa" (skipReviewRound → chuyển thẳng Hội đồng; needsReviewerReconfirmRound
  // → gửi lại đúng phản biện cũ 1 phiếu xác nhận rút gọn), khớp RIntakePanel/ProposalTab ở trang
  // chi tiết đề tài.
  const [confirmingResubmitId, setConfirmingResubmitId] = useState<string | null>(null);
  async function handleConfirmResubmit(topic: ResearchTopic) {
    setConfirmingResubmitId(topic.id);
    try {
      const stage: "proposal" | "recognition" = topic.currentStep === "r_intake" ? "recognition" : "proposal";
      const needsReconfirm = topic.needsReviewerReconfirmRound === (topic.revisionCount ?? 0);
      const mode: "skip" | "reconfirm" = needsReconfirm ? "reconfirm" : "skip";
      const stepUpdate = buildReconfirmStepsUpdate(topic, stage, mode);
      await fetch(`/api/research/${topic.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stepUpdate),
      });
      onTopicUpdate(topic.id, stepUpdate);
      if (mode === "reconfirm") {
        const priorRound = (topic.revisionCount ?? 1) - 1;
        const priorReviews = reviewersToResendForReconfirm(
          (topic.reviews ?? []).filter(r => r.stage === stage && (r.round ?? 0) === priorRound)
        );
        await sendReconfirmReviews(topic.id, stage, priorReviews, topic.title);
        toast.success("Đã xác nhận — gửi lại phản biện xác nhận bản chỉnh sửa");
      } else {
        toast.success("Đã xác nhận — chuyển thẳng sang Hội đồng thông qua");
      }
    } catch { toast.error("Có lỗi xảy ra"); }
    finally { setConfirmingResubmitId(null); }
  }

  async function submitRowAction() {
    if (!rowActionModal) return;
    const topic = synthesisTopics.find(t => t.id === rowActionModal.topicId);
    if (!topic) { setRowActionModal(null); return; }
    setRowActioning(true);
    try {
      if (rowActionModal.action === "reject") await handleRowReject(topic, rowActionNote);
      else await handleRowRevise(topic, rowActionSubject, rowActionNote, rowActionDueDate, rowActionModal.action === "revise_reconfirm");
      toast.success(
        rowActionModal.action === "reject" ? "Đã từ chối đề tài"
        : rowActionModal.action === "revise_reconfirm" ? "Đã yêu cầu sửa đổi, gửi thông báo + email cho chủ nhiệm — sẽ gửi lại phản biện xác nhận sau khi nộp lại"
        : "Đã yêu cầu sửa đổi, gửi thông báo + email cho chủ nhiệm — chuyển thẳng Hội đồng sau khi nộp lại"
      );
      setSelected(prev => { const n = new Set(prev); n.delete(rowActionModal.topicId); return n; });
    } catch { toast.error("Có lỗi xảy ra"); }
    finally {
      setRowActioning(false);
      setRowActionModal(null);
      setRowActionNote("");
      setRowActionSubject("");
      setRowActionDueDate("");
    }
  }

  // Generate vote tokens + send email for a session
  async function handleSendVoteLinks(topicId: string, sessionId: string) {
    setSendingTokens(sessionId);
    try {
      const res = await fetch(`/api/research/${topicId}/council-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json() as { tokens?: { name: string; email?: string; link: string }[]; emailErrors?: string[]; error?: string };
      if (!res.ok) { alert(data.error ?? "Có lỗi xảy ra"); return; }
      setTokenModal({ topicId, sessionId, tokens: data.tokens ?? [] });
    } finally {
      setSendingTokens(null);
    }
  }

  const canSeeCouncil = canManage || canMonitor || isCouncilMember;

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {(canManage || canMonitor) && (
          <button
            onClick={() => setSubTab("synthesis")}
            className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition",
              subTab === "synthesis" ? "bg-white dark:bg-slate-700 shadow-sm text-violet-700 dark:text-violet-300" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Tổng hợp kết quả
            {synthesisTopics.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">{synthesisTopics.length}</span>
            )}
          </button>
        )}
        {canSeeCouncil && (
          <button
            onClick={() => setSubTab("vote")}
            className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition",
              subTab === "vote" ? "bg-white dark:bg-slate-700 shadow-sm text-violet-700 dark:text-violet-300" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Hội đồng thông qua
            {councilTopics.filter(t => !(t.councilSessions ?? []).some(s => s.decision)).length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full">
                {councilTopics.filter(t => !(t.councilSessions ?? []).some(s => s.decision)).length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Sub-tab 1: Tổng hợp kết quả thẩm định ── */}
      {subTab === "synthesis" && (canManage || canMonitor) && (
        <div className="space-y-3">
          {/* Header + filters */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Tổng hợp kết quả thẩm định (GĐ1 · GĐ2)
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Đã đủ 2 phiếu phản biện — xếp loại Đạt / Không đạt / Đạt cần sửa cho từng đề tài. Đề tài "Đạt" có thể chọn nhiều để chuyển thẳng sang Hội đồng thông qua.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={synthSearch} onChange={e => { setSynthSearch(e.target.value); setSelected(new Set()); }}
                  placeholder="Tên đề tài, tác giả..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
              </div>
              {/* Year */}
              <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); setSelected(new Set()); }}
                className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
                <option value="all">Tất cả năm</option>
                {synthesisYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              {/* Quarter */}
              <select value={synthQuarterFilter} onChange={e => { setSynthQuarterFilter(e.target.value); setSelected(new Set()); }}
                className="text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
                <option value="all">Tất cả quý</option>
                <option value="1">Quý I</option>
                <option value="2">Quý II</option>
                <option value="3">Quý III</option>
                <option value="4">Quý IV</option>
              </select>
              {/* Export */}
              {filteredSynthesis.length > 0 && (
                <button
                  onClick={() => handleSynthesisExport(selected.size > 0 ? filteredSynthesis.filter(t => selected.has(t.id)) : filteredSynthesis)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300 rounded-lg transition">
                  <Download className="w-3.5 h-3.5" /> Xuất Excel{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              )}
              {selected.size > 0 && (
                <button
                  onClick={handleBatchAdvance}
                  disabled={advancing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
                >
                  {advancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Vote className="w-3.5 h-3.5" />}
                  Chuyển sang Hội đồng ({selected.size})
                </button>
              )}
            </div>
          </div>

          {synthesisTopics.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Không có đề tài nào đang chờ tổng hợp.</p>
            </div>
          ) : filteredSynthesis.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-sm">Không có đề tài nào khớp bộ lọc.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox"
                        checked={(() => {
                          const selectable = filteredSynthesis.filter(t => classifySynthesisOutcome(activeReviews(t, synthesisStageOf(t)).filter(r => r.status === "submitted")) === "pass");
                          return selectable.length > 0 && selectable.every(t => selected.has(t.id));
                        })()}
                        onChange={e => {
                          const selectable = filteredSynthesis.filter(t => classifySynthesisOutcome(activeReviews(t, synthesisStageOf(t)).filter(r => r.status === "submitted")) === "pass");
                          setSelected(e.target.checked ? new Set(selectable.map(t => t.id)) : new Set());
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Đề tài</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-20">Giai đoạn</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Chủ nhiệm</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Theo dõi</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">PB1</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">PB2</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Xếp loại</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-40">Xử lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredSynthesis.map(topic => {
                    const stage = synthesisStageOf(topic);
                    const isProcessing = isAwaitingRevisionProcessing(topic);
                    // Đã nộp lại, chờ xác nhận — chưa có phiếu nào của vòng MỚI (round = revisionCount)
                    // nên hiện lại 2 phiếu của vòng TRƯỚC (đã dẫn tới quyết định "Yêu cầu sửa") để có
                    // ngữ cảnh, thay vì activeReviews (luôn rỗng ở trạng thái này).
                    const priorRound = (topic.revisionCount ?? 1) - 1;
                    const reviews = isProcessing
                      ? (topic.reviews ?? []).filter(r => r.stage === stage && (r.round ?? 0) === priorRound && r.status === "submitted")
                      : activeReviews(topic, stage).filter(r => r.status === "submitted");
                    const outcome = isProcessing ? null : classifySynthesisOutcome(reviews);
                    const needsReconfirm = topic.needsReviewerReconfirmRound === (topic.revisionCount ?? 0);
                    const isChecked = selected.has(topic.id);
                    const lastSubmit = isProcessing
                      ? topic.revisionResubmittedAt
                      : reviews.map(r => r.submittedAt ?? "").sort().reverse()[0];
                    const piName = topic.principalInvestigatorName ?? users.find(u => u.id === topic.principalInvestigatorId)?.name;
                    const monitorName = topic.reviewAssignment?.delegatedName ?? users.find(u => u.id === topic.reviewAssignment?.delegatedTo)?.name;
                    const fileUrl = stage === "recognition"
                      ? (topic.finalReportFileUrl ? researchFileUrl(topic.finalReportFileUrl) : "")
                      : (topic.proposalFileUrl ? researchFileUrl(topic.proposalFileUrl) : "");
                    const canSelect = !isProcessing && outcome === "pass";
                    const OUTCOME_META: Record<SynthesisOutcome, { label: string; title: string; cls: string }> = {
                      pass:                 { label: "Đạt",             title: "Đạt",                                                cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                      fail:                 { label: "Không đạt",       title: "Không đạt",                                          cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
                      revise_no_reconfirm:  { label: "Đạt, cần sửa",    title: "Đạt, cần sửa — không cần phản biện xác nhận lại",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
                      revise_reconfirm:     { label: "Đạt, cần sửa*",   title: "Đạt, cần sửa — cần phản biện xác nhận lại bản sửa", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
                    };
                    return (
                      <tr key={topic.id}
                        className={cn("transition", canSelect && "cursor-pointer", isChecked ? "bg-violet-50/60 dark:bg-violet-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40")}
                        onClick={() => { if (canSelect) setSelected(prev => { const n = new Set(prev); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; }); }}
                      >
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} disabled={!canSelect}
                            onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(topic.id) : n.delete(topic.id); return n; })}
                            className="rounded disabled:opacity-30" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {topic.code && <span className="font-mono text-[11px] text-slate-400">{topic.code}</span>}
                            {fileUrl && (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium border border-blue-100 flex items-center gap-0.5">
                                <ExternalLink className="w-2.5 h-2.5" /> {stage === "recognition" ? "Đề tài" : "Đề cương"}
                              </a>
                            )}
                          </div>
                          <p className="font-medium text-slate-800 dark:text-white leading-snug">{topic.title}</p>
                          {topic.field && <p className="text-[11px] text-slate-400">{topic.field}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold",
                            stage === "recognition" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700")}>
                            {stage === "recognition" ? "GĐ2" : "GĐ1"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {piName && (
                            <div className="flex items-center gap-1.5">
                              <AvatarBubble name={piName} size={20} />
                              <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[80px]">{piName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {monitorName && (
                            <div className="flex items-center gap-1.5">
                              <AvatarBubble name={monitorName} size={18} />
                              <span className="text-[11px] text-slate-500 truncate max-w-[80px]">{monitorName}</span>
                            </div>
                          )}
                        </td>
                        {[0, 1].map(i => {
                          const r = reviews[i];
                          return (
                            <td key={i} className="px-3 py-3">
                              {r && (
                                <>
                                  <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full font-semibold block w-fit",
                                    r.verdict === "pass" ? "bg-green-100 text-green-700"
                                    : r.verdict === "fail" ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-700"
                                  )}>
                                    {r.verdict === "pass" ? "ĐẠT" : r.verdict === "fail" ? "KHÔNG ĐẠT" : "ĐẠT (sửa)"}
                                  </span>
                                  {typeof r.score === "number" && (
                                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                                      {r.scores ? `${scoreOn10(r.score, Object.keys(r.scores).length * 5).toFixed(1)}/10` : `${r.score}/?`}
                                    </span>
                                  )}
                                  {r.verdict === "pass_if_revised" && (
                                    <span className="text-[10px] text-slate-400 block">{r.needResubmit ? "Cần PB xác nhận" : "Không cần xác nhận"}</span>
                                  )}
                                </>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3">
                          {isProcessing ? (
                            <span title="Tác giả đã nộp lại bản chỉnh sửa theo yêu cầu — chờ xác nhận"
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold block w-fit cursor-help bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              Đã nộp lại (lần {topic.revisionCount})
                            </span>
                          ) : outcome && (
                            <span title={OUTCOME_META[outcome].title}
                              className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold block w-fit cursor-help", OUTCOME_META[outcome].cls)}>
                              {OUTCOME_META[outcome].label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isProcessing && (
                            <button
                              title={needsReconfirm ? "Xác nhận đã nhận — gửi lại phản biện xác nhận bản chỉnh sửa" : "Xác nhận đã nhận — chuyển thẳng sang Hội đồng"}
                              onClick={() => handleConfirmResubmit(topic)}
                              disabled={confirmingResubmitId === topic.id}
                              className="text-[11px] px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1">
                              {confirmingResubmitId === topic.id && <Loader2 className="w-3 h-3 animate-spin" />}
                              {needsReconfirm ? "Xác nhận — gửi PB xác nhận" : "Xác nhận — chuyển Hội đồng"}
                            </button>
                          )}
                          {!isProcessing && outcome === "fail" && (
                            <button onClick={() => {
                              setRowActionModal({ topicId: topic.id, action: "reject" });
                              setRowActionNote(""); setRowActionSubject(""); setRowActionDueDate("");
                            }}
                              className="text-[11px] px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition">
                              Từ chối
                            </button>
                          )}
                          {(outcome === "revise_no_reconfirm" || outcome === "revise_reconfirm") && (
                            <button
                              title={outcome === "revise_reconfirm" ? "Yêu cầu sửa đổi — cần phản biện xác nhận lại bản sửa" : "Yêu cầu sửa đổi"}
                              onClick={() => {
                                setRowActionModal({ topicId: topic.id, action: outcome });
                                setRowActionNote(buildSuggestedRevisionBody(reviews));
                                setRowActionSubject(`Yêu cầu chỉnh sửa ${stage === "recognition" ? "kết quả nghiên cứu" : "đề cương"}: ${topic.title}`);
                                setRowActionDueDate("");
                              }}
                              className={cn("text-[11px] px-2.5 py-1 rounded-lg font-medium transition",
                                outcome === "revise_reconfirm"
                                  ? "bg-orange-100 hover:bg-orange-200 text-orange-700"
                                  : "bg-amber-100 hover:bg-amber-200 text-amber-700")}>
                              {outcome === "revise_reconfirm" ? "Sửa + PB xác nhận" : "Yêu cầu sửa"}
                            </button>
                          )}
                          {lastSubmit && <p className="text-[10px] text-slate-400 mt-1">Nộp: {new Date(lastSubmit).toLocaleDateString("vi-VN")}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: từ chối / yêu cầu sửa đổi cho 1 đề tài ── */}
      {rowActionModal && (() => {
        const topic = synthesisTopics.find(t => t.id === rowActionModal.topicId);
        if (!topic) return null;
        const isReject = rowActionModal.action === "reject";
        const author = users.find(u => u.id === topic.principalInvestigatorId);
        const authorEmail = topic.submitterEmail ?? author?.email;
        const authorName = topic.principalInvestigatorName ?? author?.name ?? "chủ nhiệm đề tài";
        const todayStr = new Date().toISOString().slice(0, 10);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                {isReject ? "Từ chối đề tài" : "Yêu cầu sửa đổi"}
              </h3>
              <p className="text-sm text-slate-500 line-clamp-2">{topic.title}</p>
              {rowActionModal.action === "revise_reconfirm" && (
                <p className="text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-lg p-2">
                  Sau khi tác giả nộp lại, hệ thống sẽ tự gửi lại đúng phản biện cũ một phiếu xác nhận rút gọn (Đồng ý/Không đồng ý) trước khi được chuyển Hội đồng.
                </p>
              )}

              {!isReject && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Tiêu đề email</label>
                    <input
                      value={rowActionSubject} onChange={e => setRowActionSubject(e.target.value)}
                      placeholder="Tiêu đề email gửi tác giả..."
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Thời hạn nộp lại (tuỳ chọn)</label>
                    <input
                      type="date" value={rowActionDueDate} min={todayStr}
                      onChange={e => setRowActionDueDate(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    {rowActionDueDate && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Quá hạn mà chưa nộp lại, hệ thống sẽ tự động chuyển đề tài sang trạng thái "Từ chối" và báo cho chủ nhiệm.
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                {!isReject && <label className="block text-xs font-medium text-slate-500 mb-1">Nội dung</label>}
                <textarea
                  value={rowActionNote} onChange={e => setRowActionNote(e.target.value)} rows={5}
                  placeholder={isReject ? "Lý do từ chối đề tài..." : "Nội dung cần chỉnh sửa cho tác giả — đã gợi ý từ ý kiến phản biện, có thể chỉnh sửa thêm..."}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>

              {!isReject && (
                <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
                  {authorEmail
                    ? <span>Sẽ tự động gửi thông báo + email nội dung trên đến <strong className="text-slate-700 dark:text-slate-300">{authorName}</strong> ({authorEmail}).</span>
                    : <span className="text-amber-600 dark:text-amber-400">Không tìm thấy email của {authorName} — chỉ gửi được thông báo trong ứng dụng, không gửi email.</span>}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setRowActionModal(null); setRowActionNote(""); setRowActionSubject(""); setRowActionDueDate(""); }}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">Hủy</button>
                <button onClick={submitRowAction} disabled={rowActioning}
                  className={cn("px-4 py-1.5 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-60 transition",
                    isReject ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600")}>
                  {rowActioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sub-tab 2: Hội đồng thông qua ── */}
      {subTab === "vote" && canSeeCouncil && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm mã, tên đề tài..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
            </div>
            {councilSelected.size > 0 && (canManage || canMonitor) && (
              <>
                {[...councilSelected].some(id => {
                  const cs = councilTopics.find(t => t.id === id)?.currentStep;
                  return cs === "p_council" || cs === "r_council";
                }) && (
                  <button onClick={() => { setBatchDecision("passed"); setBatchModal("council_decision"); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition">
                    <Vote className="w-3.5 h-3.5" /> Ghi kết quả HĐ
                  </button>
                )}
                {[...councilSelected].some(id => councilTopics.find(t => t.id === id)?.currentStep === "p_ethics") && (
                  <button onClick={() => setBatchModal("ethics")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Chứng nhận y đức
                  </button>
                )}
                {[...councilSelected].some(id => councilTopics.find(t => t.id === id)?.currentStep === "p_agree") && (
                  <button onClick={() => setBatchModal("proceed")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                    <ChevronRight className="w-3.5 h-3.5" /> Quyết định triển khai
                  </button>
                )}
                {[...councilSelected].some(id => councilTopics.find(t => t.id === id)?.currentStep === "r_recognize") && (
                  <button onClick={() => setBatchModal("recognize")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition">
                    <Award className="w-3.5 h-3.5" /> Quyết định công nhận
                  </button>
                )}
                <button onClick={() => handleCouncilExport([...councilSelected].map(id => councilTopics.find(t => t.id === id)!).filter(Boolean))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-lg transition">
                  <Download className="w-3.5 h-3.5" /> Xuất Excel ({councilSelected.size})
                </button>
              </>
            )}
            {councilSelected.size === 0 && (canManage || canMonitor) && filteredCouncil.length > 0 && (
              <button onClick={() => handleCouncilExport(filteredCouncil)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300 rounded-lg transition ml-auto">
                <Download className="w-3.5 h-3.5" /> Xuất Excel
              </button>
            )}
            <span className="text-xs text-slate-400 ml-auto">{filteredCouncil.length} đề tài</span>
          </div>

          {filteredCouncil.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Vote className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">{councilTopics.length === 0 ? "Chưa có đề tài nào chờ Hội đồng thông qua." : "Không có đề tài khớp bộ lọc."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                    <th className="px-3 py-2.5 w-8">
                      {(canManage || canMonitor) && (
                        <input type="checkbox"
                          checked={councilSelected.size === filteredCouncil.length && filteredCouncil.length > 0}
                          onChange={e => setCouncilSelected(e.target.checked ? new Set(filteredCouncil.map(t => t.id)) : new Set())}
                          className="rounded" />
                      )}
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Đề tài</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">Đơn vị</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Chủ nhiệm</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Theo dõi</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Thành viên</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Phản biện</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Bước</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Kết luận HĐ</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Số QĐ công nhận</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredCouncil.map(topic => {
                    const stage: "proposal" | "recognition" = topic.currentStep.startsWith("r_") ? "recognition" : "proposal";
                    const session = (topic.councilSessions ?? []).find(s => s.stage === stage);
                    const voteCount = session ? (session.votes ?? []).length : 0;
                    const memberCount = session ? (session.members ?? []).length : 0;
                    const reviews = (topic.reviews ?? []).filter(r => r.stage === stage && r.status === "submitted");
                    const piName = topic.principalInvestigatorName ?? users.find(u => u.id === topic.principalInvestigatorId)?.name;
                    const monitorName = topic.reviewAssignment?.delegatedName ?? users.find(u => u.id === topic.reviewAssignment?.delegatedTo)?.name;
                    const isChecked = councilSelected.has(topic.id);
                    const fileUrl = stage === "recognition"
                      ? (topic.finalReportFileUrl ? researchFileUrl(topic.finalReportFileUrl) : "")
                      : (topic.proposalFileUrl ? researchFileUrl(topic.proposalFileUrl) : "");
                    const STEP_INFO: Record<string, { label: string; cls: string }> = {
                      p_council:  { label: "Hội đồng thông qua", cls: "bg-violet-100 text-violet-700" },
                      p_ethics:   { label: "Chứng nhận y đức",  cls: "bg-emerald-100 text-emerald-700" },
                      p_agree:    { label: "Quyết định triển khai", cls: "bg-blue-100 text-blue-700" },
                      r_council:  { label: "Hội đồng thông qua", cls: "bg-violet-100 text-violet-700" },
                      r_recognize: { label: "Chờ quyết định công nhận", cls: "bg-teal-100 text-teal-700" },
                    };
                    const stepInfo = STEP_INFO[topic.currentStep] ?? { label: topic.currentStep, cls: "bg-slate-100 text-slate-500" };
                    return (
                      <tr key={topic.id}
                        className={cn("transition cursor-pointer group", isChecked ? "bg-violet-50/60 dark:bg-violet-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40")}
                        onClick={() => setCouncilSelected(prev => { const n = new Set(prev); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; })}
                      >
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {(canManage || canMonitor) && (
                            <input type="checkbox" checked={isChecked}
                              onChange={e => setCouncilSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(topic.id) : n.delete(topic.id); return n; })}
                              className="rounded" />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {topic.code && <span className="font-mono text-[11px] text-slate-400">{topic.code}</span>}
                            {fileUrl && (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium border border-blue-100 flex items-center gap-0.5">
                                <ExternalLink className="w-2.5 h-2.5" /> {stage === "recognition" ? "Đề tài" : "Đề cương"}
                              </a>
                            )}
                          </div>
                          <p className="font-medium text-slate-800 dark:text-white leading-snug">{topic.title}</p>
                          <p className="text-[11px] text-slate-400">{topic.field}{topic.year ? ` · ${topic.year}` : ""}</p>
                          {session && memberCount > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Users className="w-2.5 h-2.5" />
                              {voteCount}/{memberCount} biểu quyết
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-500">{topic.department ?? "—"}</td>
                        <td className="px-3 py-3">
                          {piName && (
                            <div className="flex items-center gap-1.5">
                              <AvatarBubble name={piName} size={20} />
                              <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[80px]">{piName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {monitorName && (
                            <div className="flex items-center gap-1.5">
                              <AvatarBubble name={monitorName} size={18} />
                              <span className="text-[11px] text-slate-500 truncate max-w-[80px]">{monitorName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-0.5">
                            {(topic.memberNames ?? "").split("\n").filter(Boolean).map((name, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <AvatarBubble name={name.trim()} size={16} />
                                <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{name.trim()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-0.5">
                            {reviews.map((r, i) => (
                              <span key={i} className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold w-fit",
                                r.verdict === "pass" ? "bg-green-100 text-green-700" :
                                r.verdict === "pass_if_revised" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                              )}>
                                PB{i + 1}: {r.verdict === "pass" ? "ĐẠT" : r.verdict === "pass_if_revised" ? "ĐẠT(sửa)" : "KHÔNG ĐẠT"}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", stepInfo.cls)}>
                            {stepInfo.label}
                          </span>
                          {session?.scheduledAt && (
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5">
                              <Calendar className="w-2.5 h-2.5" />
                              {new Date(session.scheduledAt).toLocaleDateString("vi-VN")}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {session?.decision ? (() => {
                            const dm = DECISION_META[session.decision];
                            const DIcon = dm.icon;
                            return (
                              <>
                                <span className={cn("inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit", dm.cls)}>
                                  <DIcon className="w-2.5 h-2.5" /> {dm.label}
                                </span>
                                {session.scheduledAt && (
                                  <p className="text-[10px] text-slate-400 mt-1">{new Date(session.scheduledAt).toLocaleDateString("vi-VN")}</p>
                                )}
                              </>
                            );
                          })() : (
                            (topic.currentStep === "p_council" || topic.currentStep === "r_council")
                              ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Chờ kết luận</span>
                              : <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {(() => {
                            const cert = (topic.certificates ?? []).find(c => c.type === "recognition");
                            return cert
                              ? <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300">{cert.number}</span>
                              : <span className="text-[10px] text-slate-400">—</span>;
                          })()}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={e => { e.stopPropagation(); onView(topic); }}
                            className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium">
                            <Eye className="w-3.5 h-3.5" /> Chi tiết
                          </button>
                          {session && !session.decision && (canManage || canMonitor) && (
                            <button
                              onClick={e => { e.stopPropagation(); handleSendVoteLinks(topic.id, session.id); }}
                              disabled={sendingTokens === session.id}
                              className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-500 mt-1 disabled:opacity-30">
                              {sendingTokens === session.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Mail className="w-2.5 h-2.5" />}
                              Gửi email
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: batch council actions ── */}
      {batchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBatchModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white">
                {batchModal === "council_decision" && "Ghi kết quả Hội đồng"}
                {batchModal === "ethics" && "Chứng nhận y đức"}
                {batchModal === "proceed" && "Quyết định cho triển khai"}
                {batchModal === "recognize" && "Quyết định công nhận"}
              </h3>
              <button onClick={() => setBatchModal(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-400">
              Áp dụng cho {councilSelected.size} đề tài đã chọn phù hợp với bước này.
            </p>
            {batchModal === "council_decision" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Kết luận Hội đồng</p>
                {(["passed", "revise", "failed"] as const).map(d => (
                  <label key={d} className={cn("flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition",
                    batchDecision === d ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}>
                    <input type="radio" name="decision" value={d} checked={batchDecision === d}
                      onChange={() => setBatchDecision(d)} className="accent-violet-600" />
                    <span className="text-sm font-medium">
                      {d === "passed" ? "✅ Thông qua" : d === "revise" ? "⚠️ Yêu cầu sửa đổi" : "❌ Không thông qua"}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {batchModal === "council_decision" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Ngày họp</label>
                  <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Ghi chú (tùy chọn)</label>
                  <textarea value={batchNote} onChange={e => setBatchNote(e.target.value)} rows={2}
                    placeholder="Nhập ghi chú..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
                </div>
              </>
            )}
            {(batchModal === "ethics" || batchModal === "proceed" || batchModal === "recognize") && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {batchModal === "ethics" ? "Số chứng nhận y đức" : batchModal === "proceed" ? "Số quyết định" : "Số chứng nhận"}
                    {batchModal === "recognize" && <span className="text-red-500"> *</span>}
                    {batchModal !== "recognize" && " (tuỳ chọn)"}
                  </label>
                  <input value={batchCertNo} onChange={e => setBatchCertNo(e.target.value)}
                    placeholder={batchModal === "ethics" ? "YĐ-2026-001" : batchModal === "proceed" ? "QĐ-2026-001" : "CN-2026-001"}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                {batchModal === "recognize" && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Phạm vi công nhận (tuỳ chọn)</label>
                    <input value={batchCertScope} onChange={e => setBatchCertScope(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Ngày cấp</label>
                    <input type="date" value={batchCertIssuedAt} onChange={e => setBatchCertIssuedAt(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Đơn vị cấp</label>
                    <input value={batchCertIssuedBy} onChange={e => setBatchCertIssuedBy(e.target.value)} placeholder="Hội đồng KHCN..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">Cùng 1 số áp dụng cho tất cả đề tài đã chọn.</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setBatchModal(null)}
                className="flex-1 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Hủy
              </button>
              <button onClick={handleBatchCouncilAction} disabled={batchSaving}
                className="flex-1 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-1.5">
                {batchSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: link biểu quyết qua email ── */}
      {tokenModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTokenModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white">Link biểu quyết</h3>
              <button onClick={() => setTokenModal(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-400">Mỗi link chỉ dùng được 1 lần. Email đã được gửi tới thành viên có email.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tokenModal.tokens.map((t, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{t.name}</p>
                    {t.email && <p className="text-[11px] text-slate-400 truncate">{t.email}</p>}
                    <p className="text-[10px] font-mono text-violet-600 truncate mt-0.5">{t.link}</p>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(t.link).catch(() => {}); }}
                    className="shrink-0 text-[10px] text-slate-500 hover:text-violet-600 border border-slate-200 rounded px-1.5 py-0.5"
                  >Copy</button>
                </div>
              ))}
            </div>
            <button onClick={() => setTokenModal(null)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sm font-medium rounded-lg transition">Đóng</button>
          </div>
        </div>
      )}
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

// ─── Tab: "Đề tài đã công nhận" ───────────────────────────────
// Danh mục lưu trữ các đề tài đã hoàn tất (stage "completed") — tra cứu nhanh số quyết định/chứng
// nhận đã cấp qua từng giai đoạn (triển khai, y đức, công nhận), không có thao tác chỉnh sửa.

function RecognizedTopicsTab({
  topics, users,
}: {
  topics: ResearchTopic[];
  users: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const recognizedTopics = useMemo(() => topics.filter(t => t.stage === "completed"), [topics]);

  const years = useMemo(() =>
    [...new Set(recognizedTopics.map(t => t.year).filter((y): y is number => !!y))].sort((a, b) => b - a),
  [recognizedTopics]);

  const depts = useMemo(() =>
    [...new Set(recognizedTopics.map(t => t.department).filter((d): d is string => !!d))].sort(),
  [recognizedTopics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recognizedTopics.filter(t => {
      if (yearFilter !== "all" && String(t.year) !== yearFilter) return false;
      if (deptFilter !== "all" && t.department !== deptFilter) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) ||
        (t.code ?? "").toLowerCase().includes(q) ||
        (t.principalInvestigatorName ?? "").toLowerCase().includes(q);
    });
  }, [recognizedTopics, search, yearFilter, deptFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã, tên đề tài, chủ nhiệm..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
        </div>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="text-sm px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
          <option value="all">Tất cả năm</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="text-sm px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
          <option value="all">Tất cả đơn vị</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} đề tài</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Award className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">{recognizedTopics.length === 0 ? "Chưa có đề tài nào được công nhận." : "Không có đề tài khớp bộ lọc."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Tên đề tài</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Chủ nhiệm</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-32">Thành viên</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">Đơn vị</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Số QĐ triển khai</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Chứng nhận y đức</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-28">Số QĐ công nhận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map(t => {
                const piName = t.principalInvestigatorName ?? users.find(u => u.id === t.principalInvestigatorId)?.name;
                const agreeCert = (t.certificates ?? []).find(c => c.type === "agreement");
                const ethicsCert = (t.certificates ?? []).find(c => c.type === "ethics");
                const recognitionCert = (t.certificates ?? []).find(c => c.type === "recognition");
                return (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {t.code && <span className="font-mono text-[11px] text-slate-400">{t.code}</span>}
                      </div>
                      <p className="font-medium text-slate-800 dark:text-white leading-snug">{t.title}</p>
                      <p className="text-[11px] text-slate-400">{t.field}{t.year ? ` · ${t.year}` : ""}</p>
                    </td>
                    <td className="px-3 py-3">
                      {piName && (
                        <div className="flex items-center gap-1.5">
                          <AvatarBubble name={piName} size={20} />
                          <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[80px]">{piName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-0.5">
                        {(t.memberNames ?? "").split("\n").filter(Boolean).map((name, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <AvatarBubble name={name.trim()} size={16} />
                            <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{name.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-slate-500">{t.department ?? "—"}</td>
                    <td className="px-3 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">{agreeCert?.number ?? "—"}</td>
                    <td className="px-3 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">{ethicsCert?.number ?? "—"}</td>
                    <td className="px-3 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">{recognitionCert?.number ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: "Giám sát tiến độ" ──────────────────────────────────

function MonitorTab({
  topics, users, canManage, canAssignReviewer, currentUser, onEdit, onDelete, onView, onTopicUpdate,
}: {
  topics: ResearchTopic[];
  users: User[];
  canManage: boolean;
  canAssignReviewer: boolean;
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
  const [resultIntakeReviewTopic, setResultIntakeReviewTopic] = useState<ResearchTopic | null>(null);
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

  // All NCKH-related tasks (for combobox) — loại Task tự sinh làm hub đồng bộ ngầm cho từng đề tài
  // (hiddenFromTaskList), vì nó cũng khớp regex /NCKH/i nhưng không phải Task "ô" chung theo quý.
  const nckhTasks = useMemo<Task[]>(
    () => tasks.filter(t => !t.hiddenFromTaskList && (/NCKH/i.test(t.name) || /NCKH/i.test(t.workflowName ?? ""))),
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

  // Hàng chờ tiếp nhận KẾT QUẢ nghiên cứu (GĐ2 — r_intake), song song với awaitingTopics ở trên
  // nhưng KHÔNG dùng field intakeStatus riêng — tác giả GĐ2 đã có tài khoản (không phải form
  // public), nên "Yêu cầu chỉnh sửa" tái dùng thẳng cơ chế revisionNote/revisionCount đã có (banner
  // + mở khoá file + nút "Nộp lại" ở FinalTopicTab), "Từ chối" tái dùng stage="rejected" chung.
  //
  // LƯU Ý: currentStep cũng quay lại "r_intake" khi Quản lý NCKH bấm "Yêu cầu sửa" ở tab TỔNG HỢP
  // KẾT QUẢ (sau khi phản biện đã chấm, xem handleRowRevise) — trường hợp này đã có luồng xử lý
  // riêng ngay tại Tổng hợp kết quả ("Đã nộp lại (lần N)" → "Xác nhận — gửi PB xác nhận"/"chuyển
  // Hội đồng"), KHÔNG được lặp lại ở đây kẻo trùng 2 nơi xử lý cho cùng 1 đề tài. handleRowRevise
  // luôn gắn needsReviewerReconfirmRound/skipReviewRound = revisionCount của vòng đó để đánh dấu,
  // còn "Yêu cầu chỉnh sửa" ngay tại bước tiếp nhận (handleResultIntakeRevise) thì không — dùng đó
  // làm dấu hiệu phân biệt 2 nguồn gốc revisionCount > 0.
  const awaitingResultTopics = useMemo(() =>
    topics.filter(t =>
      t.currentStep === "r_intake" &&
      (t.steps ?? []).find(s => s.key === "r_intake")?.status !== "passed" &&
      (t.needsReviewerReconfirmRound ?? -1) !== (t.revisionCount ?? 0) &&
      (t.skipReviewRound ?? -1) !== (t.revisionCount ?? 0)
    ),
  [topics]);

  // Đề tài đang chờ phân công phản biện — GĐ1 (đã tiếp nhận đề cương, currentStep p_review) HOẶC
  // GĐ2 (đã tiếp nhận kết quả, currentStep r_review), chưa đủ 2 phản biện của đúng vòng hiện tại.
  const passedNeedingReview = useMemo(() =>
    topics.filter(t => {
      const stage: "proposal" | "recognition" | null =
        t.currentStep === "p_review" ? "proposal" : t.currentStep === "r_review" ? "recognition" : null;
      if (!stage) return false;
      const round = t.revisionCount ?? 0;
      const reviewCount = (t.reviews ?? []).filter(r => r.stage === stage && (r.round ?? 0) === round).length;
      return reviewCount < 2;
    }),
  [topics]);

  // Nút "Phân công (N)" hàng loạt: cùng thẩm quyền như nút từng dòng — chỉ bật khi được phép chỉ
  // định trực tiếp, hoặc TẤT CẢ đề tài đã chọn đều đang được giao riêng cho chính mình VÀ (nếu là
  // GĐ2 mang theo người phụ trách từ GĐ1) đã được Trưởng nhóm Quản lý NCKH "Duyệt" cho vòng GĐ2.
  const canBulkAssignSelected = useMemo(() => {
    if (canAssignReviewer) return true;
    const selected = passedNeedingReview.filter(t => selectedForReview.has(t.id));
    return selected.length > 0 && selected.every(t => {
      if (t.reviewAssignment?.delegatedTo !== currentUser.id) return false;
      const stage: "proposal" | "recognition" = t.currentStep === "r_review" ? "recognition" : "proposal";
      if (stage === "recognition" && t.reviewAssignment?.confirmedForStage !== "recognition") return false;
      return true;
    });
  }, [canAssignReviewer, passedNeedingReview, selectedForReview, currentUser.id]);

  // Bộ lọc riêng cho bảng "Hàng chờ phân biện" — Giai đoạn / Đơn vị / Phụ trách phân công.
  const [reviewQueueStage, setReviewQueueStage] = useState<"all" | "proposal" | "recognition">("all");
  const [reviewQueueDept, setReviewQueueDept] = useState<string>("all");
  const [reviewQueueDelegate, setReviewQueueDelegate] = useState<string>("all"); // "all" | "unassigned" | delegatedTo userId

  const reviewQueueDepts = useMemo(() =>
    [...new Set(passedNeedingReview.map(t => t.department).filter((d): d is string => !!d))].sort(),
  [passedNeedingReview]);

  const reviewQueueDelegates = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of passedNeedingReview) {
      const id = t.reviewAssignment?.delegatedTo;
      const name = t.reviewAssignment?.delegatedName;
      if (id && name && !seen.has(id)) seen.set(id, name);
    }
    return [...seen.entries()];
  }, [passedNeedingReview]);

  const filteredPassedNeedingReview = useMemo(() => passedNeedingReview.filter(t => {
    const stage: "proposal" | "recognition" = t.currentStep === "r_review" ? "recognition" : "proposal";
    if (reviewQueueStage !== "all" && stage !== reviewQueueStage) return false;
    if (reviewQueueDept !== "all" && (t.department ?? "") !== reviewQueueDept) return false;
    if (reviewQueueDelegate === "unassigned" && t.reviewAssignment?.delegatedTo) return false;
    if (reviewQueueDelegate !== "all" && reviewQueueDelegate !== "unassigned" && t.reviewAssignment?.delegatedTo !== reviewQueueDelegate) return false;
    return true;
  }), [passedNeedingReview, reviewQueueStage, reviewQueueDept, reviewQueueDelegate]);

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
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Tiếp nhận thất bại");
      }
      await Promise.allSettled([
        sendIntakeEmail(topic, "accepted"),
        sendIntakeNotification(topic, "accepted"),
      ]);
      onTopicUpdate(topic.id, updates);
      setIntakeReviewTopic(null);
      toast.success(`Đã tiếp nhận: ${topic.title}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Tiếp nhận thất bại"); }
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
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Gửi yêu cầu thất bại");
      }
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
    } catch (err) { toast.error(err instanceof Error ? err.message : "Gửi yêu cầu thất bại"); }
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
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Từ chối thất bại");
      }
      onTopicUpdate(topic.id, updates);
      setIntakeReviewTopic(null);
      toast.success("Đã từ chối đề cương");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Từ chối thất bại"); }
    finally { setActioning(null); }
  }

  // ── Hàng chờ tiếp nhận KẾT QUẢ nghiên cứu (GĐ2 — r_intake) ─────────────────

  async function sendResultIntakeEmail(topic: ResearchTopic, type: "accepted" | "revision" | "rejected", note?: string, dueDate?: string) {
    const author = users.find(u => u.id === topic.principalInvestigatorId);
    const authorEmail = topic.submitterEmail ?? author?.email;
    if (!authorEmail) return;
    const dueLine = dueDate ? `\n\nThời hạn nộp lại: ${new Date(dueDate).toLocaleDateString("vi-VN")}. Quá thời hạn này mà chưa nộp lại, đề tài sẽ tự động bị từ chối.` : "";
    const subject = type === "accepted"
      ? `[ARiHA] Kết quả nghiên cứu đã được tiếp nhận: ${topic.title}`
      : type === "revision"
      ? `[ARiHA] Yêu cầu chỉnh sửa kết quả nghiên cứu: ${topic.title}`
      : `[ARiHA] Đề tài bị từ chối ở bước tiếp nhận kết quả: ${topic.title}`;
    const body = type === "accepted"
      ? `Kính gửi ${topic.principalInvestigatorName ?? author?.name ?? "Quý tác giả"},\n\n` +
        `Kết quả nghiên cứu của đề tài "${topic.title}" đã được kiểm tra và xác nhận tiếp nhận thành công.\n\n` +
        `Đề tài sẽ được chuyển sang bước thẩm định nghiệm thu (2 phản biện kín).\n\n` +
        `Trân trọng,\n${currentUser.name}`
      : type === "revision"
      ? `Kính gửi ${topic.principalInvestigatorName ?? author?.name ?? "Quý tác giả"},\n\n` +
        `Kết quả nghiên cứu của đề tài "${topic.title}" chưa đáp ứng yêu cầu tiếp nhận.\n\n` +
        `Lý do: ${note ?? "Vui lòng kiểm tra lại nội dung và định dạng theo yêu cầu."}` + dueLine +
        `\n\nVui lòng đăng nhập hệ thống, cập nhật file ở tab "Đề tài" và nộp lại.\n\n` +
        `Trân trọng,\n${currentUser.name}`
      : `Kính gửi ${topic.principalInvestigatorName ?? author?.name ?? "Quý tác giả"},\n\n` +
        `Đề tài "${topic.title}" đã bị từ chối ở bước tiếp nhận kết quả nghiên cứu.\n\n` +
        `Lý do: ${note ?? "Xem chi tiết trong hệ thống ARiHA WorkHub."}\n\n` +
        `Trân trọng,\n${currentUser.name}`;
    await fetch("/api/email/custom", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderUserId: currentUser.id,
        recipients: [{ id: author?.id ?? "", name: topic.principalInvestigatorName ?? author?.name ?? "", email: authorEmail }],
        subject, body,
      }),
    }).catch(() => {});
  }

  async function sendResultIntakeNotification(topic: ResearchTopic, type: "accepted" | "revision" | "rejected", note?: string) {
    const piId = topic.principalInvestigatorId;
    if (!piId) return;
    await fetch("/api/notifications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: piId,
        type: "approval_request",
        title: type === "accepted" ? "Kết quả nghiên cứu đã được tiếp nhận"
          : type === "revision" ? "Yêu cầu chỉnh sửa kết quả nghiên cứu"
          : "Đề tài bị từ chối ở bước tiếp nhận kết quả",
        body: type === "accepted"
          ? `Kết quả nghiên cứu "${topic.title}" đã được kiểm tra và xác nhận tiếp nhận thành công.`
          : type === "revision"
          ? `Kết quả nghiên cứu "${topic.title}" cần chỉnh sửa: ${note ?? "Vui lòng kiểm tra lại nội dung và định dạng."}`
          : `Đề tài "${topic.title}" đã bị từ chối ở bước tiếp nhận kết quả nghiên cứu.`,
        link: `/research/${topic.id}`,
        read: false,
        priority: type === "accepted" ? "normal" : "urgent",
        createdAt: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  async function handleResultIntakeAccept(topic: ResearchTopic, note: string) {
    setActioning(topic.id);
    try {
      const stamp = new Date().toISOString();
      const steps = (topic.steps ?? []).map(s =>
        s.key === "r_intake" ? { ...s, status: "passed" as const, completedAt: stamp }
        : s.key === "r_review" ? { ...s, status: "in_progress" as const }
        : s
      );
      // Giữ nguyên reviewAssignment (phụ trách phân công) mang theo từ GĐ1 sang GĐ2 — người đó vẫn
      // được quyền chỉ định phản biện trực tiếp cho GĐ2 theo đúng nguyên tắc như GĐ1, KHÔNG cần
      // phân công lại từ đầu. Trưởng nhóm Quản lý NCKH vẫn có thể thay người phụ trách khác bất cứ
      // lúc nào qua tab "Giao nhân viên phụ trách" ở modal Phân công phản biện.
      const updates: Partial<ResearchTopic> = { steps, currentStep: "r_review", updatedAt: stamp };
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Tiếp nhận thất bại");
      }
      await Promise.allSettled([
        sendResultIntakeEmail(topic, "accepted", note),
        sendResultIntakeNotification(topic, "accepted", note),
      ]);
      onTopicUpdate(topic.id, updates);
      setResultIntakeReviewTopic(null);
      toast.success(`Đã tiếp nhận kết quả: ${topic.title}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Tiếp nhận thất bại"); }
    finally { setActioning(null); }
  }

  async function handleResultIntakeRevise(topic: ResearchTopic, reason: string, dueDate: string) {
    setActioning(topic.id);
    try {
      const stamp = new Date().toISOString();
      const updates: Partial<ResearchTopic> = {
        revisionNote: reason || undefined,
        revisionDueAt: dueDate ? new Date(dueDate).toISOString() : undefined,
        revisionCount: (topic.revisionCount ?? 0) + 1,
        revisionResubmittedAt: null,
        updatedAt: stamp,
      };
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Gửi yêu cầu thất bại");
      }
      await Promise.allSettled([
        sendResultIntakeEmail(topic, "revision", reason, dueDate),
        sendResultIntakeNotification(topic, "revision", reason),
      ]);
      onTopicUpdate(topic.id, updates);
      setResultIntakeReviewTopic(null);
      toast.success("Đã yêu cầu chỉnh sửa — gửi thông báo + email cho chủ nhiệm");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Gửi yêu cầu thất bại"); }
    finally { setActioning(null); }
  }

  async function handleResultIntakeReject(topic: ResearchTopic, reason: string) {
    setActioning(topic.id);
    try {
      const updates: Partial<ResearchTopic> = {
        stage: "rejected",
        rejectionReason: reason || undefined,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Từ chối thất bại");
      }
      await Promise.allSettled([
        sendResultIntakeEmail(topic, "rejected", reason),
        sendResultIntakeNotification(topic, "rejected", reason),
      ]);
      onTopicUpdate(topic.id, updates);
      setResultIntakeReviewTopic(null);
      toast.success("Đã từ chối đề tài");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Từ chối thất bại"); }
    finally { setActioning(null); }
  }

  // Trưởng nhóm Quản lý NCKH xác nhận cho người phụ trách phân công mang theo từ GĐ1 (hoặc đã có
  // sẵn) tiếp tục chỉ định phản biện trực tiếp cho GĐ2 — không đổi người, chỉ đánh dấu đã duyệt.
  async function handleConfirmDelegate(topic: ResearchTopic) {
    setAssignSaving(topic.id);
    try {
      const updates: Partial<ResearchTopic> = {
        reviewAssignment: { ...topic.reviewAssignment, confirmedForStage: "recognition" },
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Duyệt thất bại");
      }
      onTopicUpdate(topic.id, updates);
      if (topic.reviewAssignment?.delegatedTo) {
        await fetch("/api/notifications", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: topic.reviewAssignment.delegatedTo,
            type: "approval_request",
            title: "Đã duyệt phân công phản biện GĐ2",
            body: `Bạn tiếp tục được giao phụ trách chỉ định phản biện GĐ2 cho đề tài "${topic.title}".`,
            link: `/research/${topic.id}`,
            read: false, priority: "normal", createdAt: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
      toast.success("Đã duyệt phân công phụ trách cho GĐ2");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Duyệt thất bại"); }
    finally { setAssignSaving(null); }
  }

  async function handleAssignTask(topic: ResearchTopic, newTaskId: string | undefined) {
    setAssignSaving(topic.id);
    try {
      const updates: Partial<ResearchTopic> = {
        taskId: newTaskId || undefined,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`/api/research/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Lưu thất bại");
      }
      onTopicUpdate(topic.id, updates);
      toast.success(newTaskId ? "Đã liên kết nhiệm vụ" : "Đã bỏ liên kết nhiệm vụ");
      setAssigningId(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Lưu thất bại"); }
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

      {/* ── Hàng chờ tiếp nhận KẾT QUẢ nghiên cứu (GĐ2 — r_intake) ── */}
      {awaitingResultTopics.length > 0 && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-200 dark:border-teal-800">
            <AlertCircle className="w-4 h-4 text-teal-500 shrink-0" />
            <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">
              Hàng chờ tiếp nhận kết quả nghiên cứu — GĐ2 ({awaitingResultTopics.length} đề tài)
            </p>
            <span className="ml-auto text-xs text-teal-600 dark:text-teal-400">
              Kiểm tra nội dung, format → Tiếp nhận / Yêu cầu chỉnh sửa / Từ chối
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-100/60 dark:bg-teal-900/20 text-xs text-teal-700 dark:text-teal-400">
                  <th className="text-left px-3 py-2 font-medium">Tên đề tài</th>
                  <th className="text-left px-3 py-2 font-medium">Chủ nhiệm</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Đơn vị</th>
                  <th className="text-left px-3 py-2 font-medium">Trạng thái</th>
                  <th className="text-center px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-100 dark:divide-teal-900/30">
                {awaitingResultTopics.map(topic => {
                  const author = users.find(u => u.id === topic.principalInvestigatorId);
                  const piName = topic.principalInvestigatorName ?? author?.name ?? "—";
                  const isBusy = actioning === topic.id;
                  const isOwnTopic = isTopicAuthor(currentUser, topic);
                  const isResubmit = !!topic.revisionResubmittedAt;
                  return (
                    <tr key={topic.id} className="bg-white dark:bg-slate-900/40 hover:bg-teal-50/40 dark:hover:bg-teal-900/10 transition">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-white text-xs leading-snug line-clamp-2 max-w-[220px]">{topic.title}</p>
                        {(topic.revisionCount ?? 0) > 0 && (
                          <span className="text-[10px] text-orange-500">Lần chỉnh sửa {topic.revisionCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{piName}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 hidden sm:table-cell">{topic.department ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          isResubmit ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                        )}>
                          {isResubmit ? "Đã nộp lại" : "Chờ tiếp nhận"}
                        </span>
                        {topic.revisionNote && (
                          <p className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate" title={topic.revisionNote}>
                            {topic.revisionNote}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isOwnTopic ? (
                          <span
                            title="Bạn là tác giả/đồng tác giả — không thể tự kiểm tra, tiếp nhận kết quả của mình"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Đề tài của bạn
                          </span>
                        ) : (
                          <button
                            onClick={() => setResultIntakeReviewTopic(topic)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 disabled:opacity-50 transition"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
                            Kiểm tra
                          </button>
                        )}
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
                disabled={!canBulkAssignSelected}
                title={!canBulkAssignSelected ? "Bạn không có quyền chỉ định phản biện cho (một số) đề tài đã chọn" : undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Phân công ({selectedForReview.size})
              </button>
            )}
          </div>

          {/* Bộ lọc: Giai đoạn / Đơn vị / Phụ trách phân công */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-900/5">
            <select value={reviewQueueStage} onChange={e => setReviewQueueStage(e.target.value as typeof reviewQueueStage)}
              className="text-xs px-2 py-1.5 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
              <option value="all">Tất cả giai đoạn</option>
              <option value="proposal">GĐ1</option>
              <option value="recognition">GĐ2</option>
            </select>
            <select value={reviewQueueDept} onChange={e => setReviewQueueDept(e.target.value)}
              className="text-xs px-2 py-1.5 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
              <option value="all">Tất cả đơn vị</option>
              {reviewQueueDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={reviewQueueDelegate} onChange={e => setReviewQueueDelegate(e.target.value)}
              className="text-xs px-2 py-1.5 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white">
              <option value="all">Tất cả phụ trách</option>
              <option value="unassigned">Chưa giao</option>
              {reviewQueueDelegates.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            {(reviewQueueStage !== "all" || reviewQueueDept !== "all" || reviewQueueDelegate !== "all") && (
              <button
                onClick={() => { setReviewQueueStage("all"); setReviewQueueDept("all"); setReviewQueueDelegate("all"); }}
                className="text-xs text-violet-500 hover:underline"
              >
                Xoá lọc
              </button>
            )}
            <span className="ml-auto text-[11px] text-violet-400">{filteredPassedNeedingReview.length}/{passedNeedingReview.length} đề tài</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-violet-100/60 dark:bg-violet-900/20 text-xs text-violet-700 dark:text-violet-400">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedForReview.size === filteredPassedNeedingReview.length && filteredPassedNeedingReview.length > 0}
                      onChange={e => {
                        if (e.target.checked) setSelectedForReview(new Set(filteredPassedNeedingReview.map(t => t.id)));
                        else setSelectedForReview(new Set());
                      }}
                      className="accent-violet-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Tên đề tài</th>
                  <th className="text-center px-3 py-2 font-medium">Giai đoạn</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Chủ nhiệm</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Đơn vị</th>
                  <th className="text-center px-3 py-2 font-medium">Phản biện</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Phụ trách phân công</th>
                  <th className="text-center px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100 dark:divide-violet-900/30">
                {filteredPassedNeedingReview.map(topic => {
                  const piName = topic.principalInvestigatorName ?? users.find(u => u.id === topic.principalInvestigatorId)?.name ?? "—";
                  const reviewStage: "proposal" | "recognition" = topic.currentStep === "r_review" ? "recognition" : "proposal";
                  const reviewRound = topic.revisionCount ?? 0;
                  const reviewCount = (topic.reviews ?? []).filter(r => r.stage === reviewStage && (r.round ?? 0) === reviewRound).length;
                  const isSelected = selectedForReview.has(topic.id);
                  const isDelegatedToMe = topic.reviewAssignment?.delegatedTo === currentUser.id;
                  const delegateName = topic.reviewAssignment?.delegatedName;
                  const isOwnTopic = topic.principalInvestigatorId === currentUser.id ||
                    (topic.memberIds ?? []).includes(currentUser.id);

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
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          reviewStage === "recognition" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                        )}>
                          {reviewStage === "recognition" ? "GĐ2" : "GĐ1"}
                        </span>
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
                        <div className="flex items-center justify-center gap-1.5">
                          {/* GĐ2 + đã có người phụ trách mang theo từ GĐ1, chưa được Trưởng nhóm
                              duyệt riêng cho vòng GĐ2 — cho phép duyệt ngay (giữ nguyên người cũ). */}
                          {reviewStage === "recognition" && topic.reviewAssignment?.delegatedTo &&
                            topic.reviewAssignment?.confirmedForStage !== "recognition" && canAssignReviewer && (
                            <button
                              onClick={() => handleConfirmDelegate(topic)}
                              disabled={assignSaving === topic.id}
                              title="Duyệt cho người phụ trách hiện tại tiếp tục chỉ định phản biện GĐ2"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-40 transition"
                            >
                              {assignSaving === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                              Duyệt
                            </button>
                          )}
                          {(() => {
                            // GĐ2 + có người phụ trách mang theo + Trưởng nhóm CHƯA duyệt riêng cho
                            // GĐ2 — người phụ trách (không phải Trưởng nhóm thật) chưa được dùng nút
                            // này, phải chờ Trưởng nhóm bấm "Duyệt" (hoặc "Phân công lại" cho người
                            // khác — hành động đó tự xác nhận luôn, không cần Duyệt thêm).
                            const gd2NotYetConfirmed = reviewStage === "recognition" &&
                              !!topic.reviewAssignment?.delegatedTo &&
                              topic.reviewAssignment?.confirmedForStage !== "recognition";
                            const disabled = isOwnTopic
                              ? !canAssignReviewer
                              : (!canAssignReviewer && (!isDelegatedToMe || gd2NotYetConfirmed));
                            const title = isOwnTopic
                              ? "Đề tài của bạn — chỉ được giao người khác theo dõi chỉ định phản biện, không tự chỉ định trực tiếp"
                              : (!canAssignReviewer && isDelegatedToMe && gd2NotYetConfirmed)
                              ? "Chờ Trưởng nhóm Quản lý NCKH duyệt phân công cho GĐ2"
                              : undefined;
                            // "Phân công lại" chỉ hiện với Trưởng nhóm thật (canAssignReviewer) — người
                            // chỉ được giao phụ trách luôn thấy "Phân công" (họ không "giao lại" ai cả).
                            const label = canAssignReviewer && reviewStage === "recognition" && topic.reviewAssignment?.delegatedTo
                              ? "Phân công lại" : "Phân công";
                            return (
                              <button
                                onClick={() => { setSelectedForReview(new Set([topic.id])); setShowAssignModal(true); }}
                                disabled={disabled}
                                title={title}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
                              >
                                <UserPlus className="w-3 h-3" />
                                {label}
                              </button>
                            );
                          })()}
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

      {/* ── AssignReviewersModal ── */}
      {showAssignModal && selectedForReview.size > 0 && (
        <AssignReviewersModal
          topics={topics.filter(t => selectedForReview.has(t.id))}
          users={users}
          currentUser={currentUser}
          canManage={canManage}
          canAssignReviewer={canAssignReviewer}
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
                    {isAwaitingRevisionResubmit(t) && (
                      <span className="flex items-center gap-1 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium w-fit bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        <AlertCircle className="w-2.5 h-2.5 shrink-0" /> Yêu cầu chỉnh sửa
                      </span>
                    )}
                    {isAwaitingRevisionProcessing(t) && (
                      <span className="flex items-center gap-1 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium w-fit bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> Đã nộp lại
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

      {resultIntakeReviewTopic && (
        <ResultIntakeReviewModal
          topic={resultIntakeReviewTopic}
          currentUserId={currentUser.id}
          onAccept={(note) => handleResultIntakeAccept(resultIntakeReviewTopic, note)}
          onRevise={(reason, dueDate) => handleResultIntakeRevise(resultIntakeReviewTopic, reason, dueDate)}
          onReject={(reason) => handleResultIntakeReject(resultIntakeReviewTopic, reason)}
          onClose={() => setResultIntakeReviewTopic(null)}
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
  const [deleteReason, setDeleteReason] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showImportTopics, setShowImportTopics] = useState(false);
  const [showImportRecognized, setShowImportRecognized] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canCreate         = !!currentUser && hasPermission(currentUser.role, "research:create");
  // Không dựa vào permission "research:manage" đơn thuần — permission này có thể bị tổ chức cấp
  // rộng cho vai trò thấp hơn qua trang Phân quyền (đã gây lộ danh tính phản biện + hiện nhầm nút
  // quản lý cho nhân viên trước đây). Nguồn thẩm quyền thật: hrAdmin, "Quản lý NCKH", hoặc director.
  const canManage         = !!currentUser && isNckhFullManager(currentUser);
  // Không dựa vào permission "research:assignReviewer" đơn thuần (teamLead có sẵn theo mặc định)
  // — chỉ Director/hrAdmin hoặc "Trưởng nhóm Quản lý NCKH" (teamLead + chỉ định Quản lý NCKH)
  // mới được chỉ định phản biện trực tiếp, khớp đúng quy tắc đã áp dụng ở trang chi tiết đề tài.
  const canAssignReviewer = !!currentUser && canUserAssignReviewer(currentUser);
  // Tương tự canManage — không dựa vào permission "research:monitor" đơn thuần, vì tổ chức có thể
  // cấp rộng permission này cho vai trò "staff" qua trang Phân quyền (đã xác nhận trực tiếp trong DB
  // — đây chính là nguyên nhân tài khoản chỉ có vai trò Phản biện vẫn nhìn thấy tab Hội đồng KH&CN).
  // Chỉ teamLead (vai trò hệ thống thật) mới có quyền theo dõi mặc định, khớp quy ước đã áp dụng ở
  // app/api/research/route.ts và app/api/research/[id]/route.ts.
  const roleCanMonitor = !!currentUser && (canManage || getEffectiveRole(currentUser) === "teamLead");
  // researchManager designation also grants monitor access (without full canManage) — used for
  // the Hội đồng KH&CN tab's existing broader admin-action visibility (unchanged behavior).
  const hasResearchManagerDesig = !!(currentUser?.researchDesignations ?? []).includes("researchManager");
  const [taskAccessMonitor, setTaskAccessMonitor] = useState(false);
  const canMonitor = roleCanMonitor || hasResearchManagerDesig || taskAccessMonitor;

  // Chỉ hrAdmin (quyền "*" toàn hệ thống) hoặc người có chỉ định "Quản lý NCKH" mới được theo
  // dõi/quản lý quy trình THẨM ĐỊNH đề cương (tab "Giám sát tiến độ" — hàng chờ tiếp nhận, kiểm
  // tra trùng lặp, upload file mẫu). Tách riêng khỏi `canMonitor` ở trên (dùng cho Hội đồng
  // KH&CN) vì đây là 2 quyền khác nhau — vai trò hệ thống khác (kể cả director/teamLead) KHÔNG
  // tự động có quyền này nếu chưa được gán chỉ định.
  const canMonitorIntake = isNckhManager(currentUser);

  // "Phản biện của tôi" / "Hội đồng KH&CN": chỉ hiện cho người thật sự có vai trò liên quan —
  // nhân viên thường (không phải phản biện, không có chỉ định Quản lý NCKH, không phải quản lý)
  // không cần thấy 2 tab này (trước đây luôn hiện cho tất cả mọi người, kể cả không dùng được gì).
  const hasReviewerDesig = !!(currentUser?.researchDesignations ?? []).includes("reviewer");
  const isCouncilMemberTop = (currentUser?.researchDesignations ?? []).some(d =>
    ["councilMember", "councilChair", "councilSecretary"].includes(d)
  );

  // Default tab: research managers start on monitor, others on my-topics
  const [activeTab, setActiveTab] = useState<"mine" | "review" | "council" | "monitor" | "recognized">(
    () => canMonitorIntake ? "monitor" : "mine"
  );

  // Check task-based monitor access for non-role users (Hội đồng KH&CN tab only)
  useEffect(() => {
    if (roleCanMonitor || !currentUser) return;
    fetch("/api/research/monitor-access")
      .then(r => r.json())
      .then((d: { canMonitor: boolean }) => {
        if (d.canMonitor) setTaskAccessMonitor(true);
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

  const councilCount = useMemo(() => {
    if (!currentUser) return 0;
    const pastReviewSteps = new Set(["p_council", "p_ethics", "p_agree", "exec_start", "exec_midterm", "exec_submit", "r_intake", "r_review", "r_council", "r_recognize"]);
    const pendingSynthesis = visibleTopics.filter(t => {
      if (pastReviewSteps.has(t.currentStep)) return false;
      const reviews = (t.reviews ?? []).filter(r => r.stage === "proposal" && r.status === "submitted");
      return reviews.length >= 2 && reviews.every(r => r.verdict === "pass" || r.verdict === "pass_if_revised");
    }).length;
    const pendingCouncil = visibleTopics.filter(t =>
      t.currentStep === "p_council" && !(t.councilSessions ?? []).some(s => s.decision)
    ).length;
    return pendingSynthesis + pendingCouncil;
  }, [visibleTopics, currentUser]);

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

  async function handleExportExcel() {
    setExporting(true);
    try {
      const { utils, writeFile } = await import("xlsx");
      const rows = visibleTopics.map(t => {
        const performer = users.find(u => u.id === t.mainPerformerId);
        const cert = t.certificates?.find(c => c.type === "recognition");
        return {
          "Mã đề tài":            t.code ?? "",
          "Tên đề tài":           t.title,
          "Chủ nhiệm":            t.principalInvestigatorName ?? "",
          "Người thực hiện chính": performer?.name ?? t.mainPerformerId ?? "",
          "Đơn vị":               t.department ?? "",
          "Nhóm":                 t.groupName ?? "",
          "Giai đoạn":            STAGE_LABEL[t.stage] ?? t.stage,
          "Bước hiện tại":        t.currentStep,
          "Tiến độ (%)":          researchProgress(t),
          "Phạm vi ảnh hưởng":    cert?.scope ?? "",
          "Thời gian hoàn thành": t.completionTimeline ?? "",
          "Ngày tạo":             t.createdAt ? t.createdAt.slice(0, 10) : "",
          "Ngày cập nhật":        t.updatedAt ? t.updatedAt.slice(0, 10) : "",
        };
      });
      const ws = utils.json_to_sheet(rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Đề tài NCKH");
      writeFile(wb, `NCKH-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Đã xuất Excel");
    } catch {
      toast.error("Xuất Excel thất bại");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteResearchTopic(deleteTarget.id, deleteReason.trim() || undefined);
      if (res?.pending) {
        toast.success("Đã gửi yêu cầu xoá — chờ trưởng nhóm cùng đơn vị duyệt");
      } else {
        setTopics(prev => prev.filter(t => t.id !== deleteTarget.id));
        toast.success("Đã xoá đề tài");
      }
      setDeleteTarget(null);
      setDeleteReason("");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xoá thất bại"); }
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

  const canSeeReviewTab = canManage || canMonitor || hasReviewerDesig || reviewCount > 0;
  const canSeeCouncilTab = canManage || canMonitor || isCouncilMemberTop;
  const recognizedCount = visibleTopics.filter(t => t.stage === "completed").length;

  // Nếu tab đang chọn vừa mất quyền xem (vd. tải lại trang sau khi vai trò thay đổi), chuyển về
  // "Đề tài của tôi" thay vì để trống nội dung.
  useEffect(() => {
    if (activeTab === "review" && !canSeeReviewTab) setActiveTab("mine");
    if (activeTab === "council" && !canSeeCouncilTab) setActiveTab("mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeReviewTab, canSeeCouncilTab]);

  const TABS = [
    { id: "mine"    as const, label: "Đề tài của tôi",    icon: Microscope,    count: myCount },
    ...(canSeeReviewTab ? [{ id: "review" as const, label: "Phản biện của tôi", icon: ClipboardList, count: reviewCount }] : []),
    ...(canSeeCouncilTab ? [{ id: "council" as const, label: "Hội đồng KH&CN", icon: Vote, count: councilCount }] : []),
    ...(canMonitorIntake ? [{ id: "monitor" as const, label: "Giám sát tiến độ", icon: BarChart2, count: topics.length, badge: awaitingCount }] : []),
    { id: "recognized" as const, label: "Đề tài đã công nhận", icon: Award, count: recognizedCount },
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
              <button onClick={() => setShowImportRecognized(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-xl transition">
                <Upload className="w-4 h-4" /> Nhập đề tài đã công nhận
              </button>
              <button onClick={handleExportExcel} disabled={exporting || visibleTopics.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-xl transition disabled:opacity-50">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Xuất Excel
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
              currentUser={currentUser}
              canManage={canManage}
              onView={t => router.push(`/research/${t.id}`)}
              onTopicUpdate={handleTopicUpdate}
            />
          )}
          {activeTab === "council" && (
            <CouncilTab
              topics={visibleTopics}
              users={users}
              currentUser={currentUser}
              canManage={canManage}
              canMonitor={canMonitor}
              onView={t => router.push(`/research/${t.id}`)}
              onTopicUpdate={handleTopicUpdate}
            />
          )}
          {activeTab === "monitor" && canMonitorIntake && (
            <MonitorTab
              topics={visibleTopics}
              users={users}
              canManage={canMonitorIntake}
              canAssignReviewer={canAssignReviewer}
              currentUser={currentUser}
              onEdit={setEditTopic}
              onDelete={setDeleteTarget}
              onView={t => router.push(`/research/${t.id}`)}
              onTopicUpdate={handleTopicUpdate}
            />
          )}
          {activeTab === "recognized" && (
            <RecognizedTopicsTab topics={visibleTopics} users={users} />
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

      {showImportRecognized && (
        <ImportRecognizedTopicsModal
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          existingTopics={topics}
          users={users}
          onClose={() => setShowImportRecognized(false)}
          onImported={async (newTopics) => {
            const { saveResearchTopic: save } = await import("@/lib/firebase/firestore");
            await Promise.all(newTopics.map(t => save(t)));
            setTopics(prev => [...newTopics, ...prev]);
            setShowImportRecognized(false);
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
            <p className="text-sm text-slate-500">
              {canManage
                ? "Hành động này không thể hoàn tác. Toàn bộ dữ liệu phản biện, hội đồng và chứng nhận sẽ bị xoá vĩnh viễn."
                : "Bạn không có quyền xoá trực tiếp — yêu cầu sẽ được gửi cho trưởng nhóm cùng đơn vị duyệt."}
            </p>
            {!canManage && (
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Lý do xin xoá (bắt buộc)..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setDeleteTarget(null); setDeleteReason(""); }}
                className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Huỷ
              </button>
              <button onClick={handleDelete} disabled={deleting || (!canManage && !deleteReason.trim())}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} {canManage ? "Xoá" : "Gửi yêu cầu"}
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
