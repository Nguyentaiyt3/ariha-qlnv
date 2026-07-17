"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, CheckCircle2, ShieldCheck, Maximize2, Minimize2,
  ChevronDown, ChevronUp, StickyNote, ClipboardList, FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { DocxAnnotator } from "@/components/research/DocxAnnotator";
import { scoreOn10 } from "@/lib/research";
import type { ReviewScores, ReviewVerdict, ReviewGrade, ResearchAnnotation, NckhReviewCriterionItem, ResearchStage } from "@/types";

interface ReviewDoc { id: string; name: string; url: string; type: "file" | "link" }

/** Gợi ý xếp loại dựa trên điểm trung bình quy đổi thang 10 — chỉ là gợi ý, phản biện viên vẫn
    chọn thủ công ở mục E. */
function suggestGrade(scoreRatio: number): ReviewGrade {
  if (scoreRatio >= 0.8) return "excellent";
  if (scoreRatio >= 0.6) return "good";
  if (scoreRatio >= 0.4) return "average";
  return "fail";
}

// ─── Criteria ──────────────────────────────────────────────────────────────────
// Bộ tiêu chí chấm điểm được nạp động từ GET /api/review/[token] (Admin cấu hình được),
// không còn hardcode — vì phiếu GĐ1 (đề cương) và GĐ2 (nghiệm thu) dùng bộ tiêu chí khác nhau.

const QUALITATIVE: { key: string; label: string; placeholder: string }[] = [
  { key: "urgency",      label: "Tính cấp thiết của chủ đề",          placeholder: "Nhận xét về tính cấp thiết, ý nghĩa thực tiễn..." },
  { key: "methodFit",    label: "Sự phù hợp thiết kế & phương pháp", placeholder: "Đánh giá mức độ phù hợp của thiết kế & phương pháp..." },
  { key: "novelty",      label: "Tính mới của kết quả dự kiến",        placeholder: "Nhận xét về điểm mới, đóng góp học thuật..." },
  { key: "significance", label: "Ý nghĩa khoa học & ứng dụng",         placeholder: "Đánh giá giá trị thực tiễn, ứng dụng lâm sàng..." },
];

// ─── StarRating ────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          className={cn(
            "w-6 h-6 text-base transition",
            (hover || value) >= n ? "text-amber-400" : "text-slate-200",
            onChange ? "cursor-pointer hover:scale-110" : "cursor-default",
          )}
        >
          ★
        </button>
      ))}
      <span className="ml-1 text-[11px] text-slate-400 tabular-nums">
        {value > 0 ? `${value}/5` : "—"}
      </span>
    </div>
  );
}

// ─── Collapsible section header ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, open, onToggle, badge }: {
  icon: React.ElementType; label: string; open: boolean; onToggle: () => void; badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition sticky top-0 z-10"
    >
      <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        {label}
        {badge && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-[9px] font-bold normal-case">
            {badge}
          </span>
        )}
      </span>
      {open
        ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      }
    </button>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PublicReviewPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [requireLogin, setRequireLogin] = useState(false);
  const [reviewerEmail, setReviewerEmail] = useState<string | null>(null);
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // Blinded topic data
  const [topicId, setTopicId]                   = useState("");
  const [topicTitle, setTopicTitle]             = useState("");
  const [topicField, setTopicField]             = useState("");
  const [topicYear, setTopicYear]               = useState(0);
  const [topicAbstract, setTopicAbstract]       = useState("");
  const [topicFileUrl, setTopicFileUrl]         = useState("");
  const [topicDocuments, setTopicDocuments]     = useState<ReviewDoc[]>([]);
  const [reviewStage, setReviewStage]           = useState<ResearchStage>("proposal");
  const [completionTimeline, setCompletionTimeline] = useState("");
  const [dueAt, setDueAt]                       = useState<string | null>(null);

  // Bộ tiêu chí chấm điểm — nạp động theo giai đoạn phiếu (proposal/recognition) từ API
  const [criteria, setCriteria] = useState<NckhReviewCriterionItem[]>([]);

  // Tab xem file: null = file chính (đề cương/báo cáo kết quả), khác null = minh chứng đính kèm
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Layout
  const [fullscreen, setFullscreen] = useState(false);
  const [showInfo, setShowInfo]     = useState(true);
  const [showNotes, setShowNotes]   = useState(false);
  const [showForm, setShowForm]     = useState(true);

  // Reviewer-local annotations (private to this reviewer, stored in memory)
  const [annotations, setAnnotations] = useState<ResearchAnnotation[]>([]);

  // Form state
  const [scores, setScores]                     = useState<ReviewScores>({});
  const [urgency, setUrgency]                   = useState("");
  const [methodFit, setMethodFit]               = useState("");
  const [novelty, setNovelty]                   = useState("");
  const [significance, setSignificance]         = useState("");
  const [revisionPoints, setRevisionPoints]     = useState("");
  const [additionalComments, setAdditionalComments] = useState("");
  const [reviewerNotes, setReviewerNotes]       = useState("");
  const [verdict, setVerdict]                   = useState<ReviewVerdict | "">("");
  const [grade, setGrade]                       = useState<ReviewGrade | "">("");
  const [needResubmit, setNeedResubmit]         = useState(false);

  // Draft persistence via localStorage
  useEffect(() => {
    if (!token) return;
    try {
      const raw = localStorage.getItem(`rev_draft_${token}`);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (d.scores)              setScores(d.scores as ReviewScores);
      if (d.urgency)             setUrgency(d.urgency as string);
      if (d.methodFit)           setMethodFit(d.methodFit as string);
      if (d.novelty)             setNovelty(d.novelty as string);
      if (d.significance)        setSignificance(d.significance as string);
      if (d.revisionPoints)      setRevisionPoints(d.revisionPoints as string);
      if (d.additionalComments)  setAdditionalComments(d.additionalComments as string);
      if (d.reviewerNotes)       setReviewerNotes(d.reviewerNotes as string);
      if (d.verdict)             setVerdict(d.verdict as ReviewVerdict);
      if (d.grade)               setGrade(d.grade as ReviewGrade);
      if (d.needResubmit)        setNeedResubmit(d.needResubmit as boolean);
      if (Array.isArray(d.annotations)) setAnnotations(d.annotations as ResearchAnnotation[]);
    } catch { /* ignore */ }
  }, [token]);

  const saveDraft = useCallback(() => {
    if (!token) return;
    try {
      localStorage.setItem(`rev_draft_${token}`, JSON.stringify({
        scores, urgency, methodFit, novelty, significance,
        revisionPoints, additionalComments, reviewerNotes,
        verdict, grade, needResubmit, annotations,
      }));
    } catch { /* ignore */ }
  }, [token, scores, urgency, methodFit, novelty, significance,
      revisionPoints, additionalComments, reviewerNotes,
      verdict, grade, needResubmit, annotations]);

  // Auto-save draft whenever any form state changes (debounced)
  useEffect(() => {
    const t = setTimeout(saveDraft, 600);
    return () => clearTimeout(t);
  }, [saveDraft]);

  // ── Fetch review data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`/api/review/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.requireLogin) { setRequireLogin(true); setReviewerEmail(data.reviewerEmail ?? null); return; }
        if (data.error) { setError(data.error); return; }
        const t = data.topic;
        setTopicId(t.id ?? "");
        setTopicTitle(t.title ?? "");
        setTopicField(t.field ?? "");
        setTopicYear(t.year ?? 0);
        setTopicAbstract(t.abstract ?? "");
        setCompletionTimeline(t.completionTimeline ?? "");

        const r = data.review;
        setReviewStage(r.stage ?? "proposal");
        setTopicFileUrl((r.stage === "recognition" ? t.finalReportFileUrl : t.proposalFileUrl) || t.proposalFileUrl || "");
        if (Array.isArray(t.documents)) setTopicDocuments(t.documents);
        if (Array.isArray(data.criteria)) setCriteria(data.criteria);
        setDueAt(r.dueAt ?? null);

        if (r.status === "submitted") {
          setAlreadySubmitted(true);
          setScores(r.scores ?? {});
          setUrgency(r.urgency ?? "");
          setMethodFit(r.methodFit ?? "");
          setNovelty(r.novelty ?? "");
          setSignificance(r.significance ?? "");
          setRevisionPoints(r.revisionPoints ?? "");
          setAdditionalComments(r.additionalComments ?? "");
          setReviewerNotes(r.reviewerNotes ?? "");
          setVerdict(r.verdict ?? "");
          setGrade(r.grade ?? "");
          setNeedResubmit(r.needResubmit ?? false);
          if (Array.isArray(r.reviewerAnnotations)) setAnnotations(r.reviewerAnnotations);
        }
      })
      .catch(() => setError("Không thể tải phiếu phản biện"))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Annotation handlers (local state — not persisted to topic.annotations) ────
  const handleAddAnnotation = useCallback(async (payload: Omit<ResearchAnnotation, "id" | "authorId" | "authorName" | "createdAt">) => {
    const ann: ResearchAnnotation = {
      ...payload,
      id: generateId("rann"),
      authorId: "reviewer",
      authorName: "Phản biện",
      createdAt: new Date().toISOString(),
    };
    setAnnotations(prev => {
      const next = [...prev, ann];
      try { localStorage.setItem(`rev_draft_${token}`, JSON.stringify({ annotations: next })); } catch { /* ignore */ }
      return next;
    });
    return ann;
  }, [token]);

  const handleUpdateAnnotation = useCallback(async (id: string, patch: { note?: string; color?: ResearchAnnotation["color"] }) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a));
  }, []);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const totalScore = criteria.reduce((s, c) => s + (scores[c.key] ?? 0), 0);
  const maxScore = criteria.length * 5;
  const scoreRatio = maxScore > 0 ? totalScore / maxScore : 0;
  const filledCriteria = criteria.filter(c => (scores[c.key] ?? 0) > 0).length;
  const suggestedGrade = filledCriteria > 0 ? suggestGrade(scoreRatio) : null;

  // File chính đúng theo giai đoạn phiếu (đề cương GĐ1 / báo cáo kết quả GĐ2), hoặc tab minh chứng
  const mainFileLabel = reviewStage === "recognition" ? "File báo cáo kết quả" : "File đề cương";
  const activeDoc = activeDocId ? topicDocuments.find(d => d.id === activeDocId) : undefined;
  const activeFileUrl = activeDoc?.url ?? topicFileUrl;
  const activeFileLabel = activeDoc?.name ?? mainFileLabel;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verdict) { toast.error("Vui lòng chọn kết luận (ĐẠT / KHÔNG ĐẠT)"); return; }
    if (filledCriteria !== criteria.length) { toast.error(`Vui lòng chấm điểm đầy đủ ${criteria.length} tiêu chí`); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scores, urgency, methodFit, novelty, significance,
          revisionPoints, additionalComments, reviewerNotes,
          verdict, grade: grade || undefined, needResubmit,
          reviewerAnnotations: annotations,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? "Nộp phiếu thất bại");
        return;
      }
      localStorage.removeItem(`rev_draft_${token}`);
      setSubmitted(true);
    } catch {
      toast.error("Lỗi kết nối — vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / Error / Done ────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Đang tải phiếu phản biện...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-red-100 dark:border-red-900 p-8 space-y-3">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Không thể truy cập</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <p className="text-xs text-slate-400 mt-2">Đường dẫn này có thể đã hết hạn hoặc không hợp lệ.</p>
      </div>
    </div>
  );

  if (requireLogin) {
    const redirectParam = encodeURIComponent(`/review/${token}`);
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6 text-violet-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Yêu cầu đăng nhập</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Phiếu phản biện này chỉ dành cho tài khoản nội bộ được phân công.
          </p>
          {reviewerEmail && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-left">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Đăng nhập bằng email được thông báo:</p>
              <p className="text-sm font-mono text-amber-800 dark:text-amber-300 break-all">{reviewerEmail}</p>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <a
              href={`/login?redirect=${redirectParam}${reviewerEmail ? `&email=${encodeURIComponent(reviewerEmail)}` : ""}`}
              className="block px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition text-center"
            >
              Đăng nhập
            </a>
            <a
              href={`/login?redirect=${redirectParam}&mode=register${reviewerEmail ? `&email=${encodeURIComponent(reviewerEmail)}` : ""}`}
              className="block px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-amber-900 text-sm font-semibold rounded-lg transition text-center shadow-sm"
            >
              Chưa có tài khoản? Đăng ký ngay
            </a>
          </div>
          {reviewerEmail && (
            <p className="text-xs text-slate-400">
              Đăng ký bằng đúng email <span className="font-medium">{reviewerEmail}</span> để hệ thống tự nhận diện bạn là phản biện viên được phân công.
            </p>
          )}
          <p className="text-xs text-slate-400 pt-1">ARiHA WorkHub · Phản biện kín NCKH cấp cơ sở</p>
        </div>
      </div>
    );
  }

  if (submitted || alreadySubmitted) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-green-100 dark:border-green-900 p-8 space-y-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          {submitted ? "Phiếu phản biện đã được gửi" : "Phiếu đã nộp trước đó"}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {submitted
            ? "Cảm ơn bạn đã thực hiện phản biện. Kết quả sẽ được Ban Quản lý NCKH tổng hợp và xử lý."
            : "Phiếu phản biện này đã được nộp. Mỗi đường dẫn chỉ sử dụng được một lần."}
        </p>
        {alreadySubmitted && verdict && (
          <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-left space-y-1">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Kết quả đã nộp:</p>
            <p className="text-sm text-slate-800 dark:text-white">Kết luận: <span className="font-medium">
              {verdict === "pass" ? "ĐẠT" : verdict === "pass_if_revised" ? "ĐẠT (nếu chỉnh sửa)" : "KHÔNG ĐẠT"}
            </span></p>
            <p className="text-sm text-slate-800 dark:text-white">Tổng điểm: <span className="font-medium">{scoreOn10(totalScore, maxScore).toFixed(1)}/10</span></p>
          </div>
        )}
        <p className="text-xs text-slate-400 pt-2">ARiHA WorkHub · Phản biện kín NCKH cấp cơ sở</p>
      </div>
    </div>
  );

  // ── Main 2-column layout ──────────────────────────────────────────────────────
  const isReadOnly = alreadySubmitted;

  return (
    <div className={cn("fixed inset-0 flex flex-col bg-white dark:bg-slate-900 overflow-hidden", !fullscreen && "")}>

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
              Phiếu phản biện kín — NCKH cấp cơ sở
            </p>
            <h1 className="text-sm font-semibold text-slate-800 dark:text-white truncate leading-snug">
              {topicTitle || "Đang tải..."}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {dueAt && (
            <span className="hidden sm:inline text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              Hạn: {new Date(dueAt).toLocaleDateString("vi-VN")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(f => !f)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title={fullscreen ? "Thu nhỏ" : "Phóng to"}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Blind review notice ── */}
      <div className="shrink-0 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" />
        <span>Phản biện kín — danh tính tác giả, thành viên và các phản biện viên khác đã được ẩn hoàn toàn.</span>
      </div>

      {/* ── 2-column body ── */}
      <div
        className="flex-1 overflow-hidden grid divide-x divide-slate-200 dark:divide-slate-700"
        style={{ gridTemplateColumns: "2fr 1fr" }}
      >

        {/* ── LEFT 2/3 — File preview + annotations ── */}
        <div className="flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="flex items-center gap-1 overflow-x-auto">
              {topicFileUrl && (
                <button
                  type="button"
                  onClick={() => setActiveDocId(null)}
                  className={cn(
                    "shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full transition uppercase tracking-wide",
                    activeDocId === null
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                  )}
                >
                  {mainFileLabel}
                </button>
              )}
              {topicDocuments.map(doc => (
                <button
                  type="button"
                  key={doc.id}
                  onClick={() => setActiveDocId(doc.id)}
                  title={doc.name}
                  className={cn(
                    "shrink-0 max-w-[140px] truncate text-[11px] font-semibold px-2.5 py-1 rounded-full transition",
                    activeDocId === doc.id
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                  )}
                >
                  {doc.name}
                </button>
              ))}
            </div>
            {!isReadOnly && annotations.length > 0 && (
              <span className="ml-auto shrink-0 text-[10px] text-violet-500 font-medium">{annotations.length} ghi chú</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {activeFileUrl ? (
              <DocxAnnotator
                key={activeFileUrl}
                fileUrl={activeFileUrl}
                annotations={activeDocId === null ? annotations : []}
                canAnnotate={!isReadOnly && activeDocId === null}
                canManageAll={false}
                currentUserId="reviewer"
                onAdd={handleAddAnnotation}
                onUpdate={handleUpdateAnnotation}
                onDelete={handleDeleteAnnotation}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 dark:text-slate-600">
                <FileText className="w-16 h-16 opacity-20" />
                <p className="text-sm">Chưa có {activeFileLabel.toLowerCase()}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT 1/3 — Form ── */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto bg-white dark:bg-slate-900 flex flex-col"
        >

          {/* ──────── SECTION 1: THÔNG TIN ĐỀ TÀI ──────── */}
          <SectionHeader icon={ShieldCheck} label="Thông tin đề tài" open={showInfo} onToggle={() => setShowInfo(v => !v)} />

          <div className={cn("p-4 space-y-2 border-b-4 border-slate-100 dark:border-slate-800", !showInfo && "hidden")}>
            <div className="text-[11px] space-y-0.5">
              <p className="text-slate-400 dark:text-slate-500">Tên đề tài</p>
              <p className="font-semibold text-slate-800 dark:text-white leading-snug">{topicTitle}</p>
            </div>
            {topicField && (
              <div className="flex gap-2 text-[11px]">
                <span className="text-slate-400 shrink-0 w-20">Lĩnh vực</span>
                <span className="text-slate-700 dark:text-slate-200">{topicField}</span>
              </div>
            )}
            {topicYear > 0 && (
              <div className="flex gap-2 text-[11px]">
                <span className="text-slate-400 shrink-0 w-20">Năm / Quý</span>
                <span className="text-slate-700 dark:text-slate-200">
                  {topicYear}{completionTimeline ? ` · ${completionTimeline}` : ""}
                </span>
              </div>
            )}
            {dueAt && (
              <div className="flex gap-2 text-[11px]">
                <span className="text-slate-400 shrink-0 w-20">Hạn nộp PB</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {new Date(dueAt).toLocaleDateString("vi-VN")}
                </span>
              </div>
            )}
            {topicAbstract && (
              <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 space-y-1 mt-1">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Tóm tắt</p>
                <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                  {topicAbstract}
                </p>
              </div>
            )}
          </div>

          {/* ──────── SECTION 2: GHI CHÚ CÁ NHÂN ──────── */}
          <SectionHeader
            icon={StickyNote}
            label="Ghi chú cá nhân"
            open={showNotes}
            onToggle={() => setShowNotes(v => !v)}
            badge={reviewerNotes.trim() ? "Có nội dung" : undefined}
          />

          <div className={cn("p-4 border-b-4 border-slate-100 dark:border-slate-800", !showNotes && "hidden")}>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
              Ghi chú riêng trong khi đọc — chỉ bạn nhìn thấy, không ảnh hưởng đến kết quả phản biện.
            </p>
            <textarea
              value={reviewerNotes}
              onChange={e => setReviewerNotes(e.target.value)}
              disabled={isReadOnly}
              rows={5}
              placeholder="Ghi chú trong khi đọc đề cương, câu hỏi cần làm rõ..."
              className="w-full text-xs px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none disabled:opacity-60"
            />
            {!isReadOnly && annotations.length > 0 && (
              <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-1.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                Có {annotations.length} highlight trên file sẽ được lưu cùng phiếu
              </p>
            )}
          </div>

          {/* ──────── SECTION 3: PHIẾU THẨM ĐỊNH ──────── */}
          <SectionHeader
            icon={ClipboardList}
            label="Phiếu thẩm định"
            open={showForm}
            onToggle={() => setShowForm(v => !v)}
            badge={verdict ? (verdict === "pass" ? "ĐẠT" : verdict === "pass_if_revised" ? "ĐẠT—sửa" : "KHÔNG ĐẠT") : undefined}
          />

          <div className={cn("p-4 space-y-5 flex-1", !showForm && "hidden")}>

            {/* A — Điểm tiêu chí */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  A. Chấm điểm tiêu chí (1–5 mỗi tiêu chí)
                </p>
                <span className={cn(
                  "text-xs font-bold tabular-nums",
                  scoreRatio >= 0.8 ? "text-green-600 dark:text-green-400"
                  : scoreRatio >= 0.6 ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-500",
                )}>
                  {scoreOn10(totalScore, maxScore).toFixed(1)}/10
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", scoreRatio >= 0.8 ? "bg-green-500" : scoreRatio >= 0.6 ? "bg-amber-400" : "bg-slate-300")}
                  style={{ width: `${scoreRatio * 100}%` }}
                />
              </div>

              {criteria.map(({ key, label, desc }) => (
                <div key={key} className="space-y-1 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{label}</p>
                  {desc && <p className="text-[10px] text-slate-400 leading-snug">{desc}</p>}
                  <StarRating
                    value={scores[key] ?? 0}
                    onChange={isReadOnly ? undefined : v => setScores(prev => ({ ...prev, [key]: v }))}
                  />
                </div>
              ))}
            </div>

            {/* B — Nhận xét định tính */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                B. Nhận xét định tính
              </p>
              {QUALITATIVE.map(({ key, label, placeholder }) => {
                const qMap: Record<string, string> = { urgency, methodFit, novelty, significance };
                const setMap: Record<string, (v: string) => void> = {
                  urgency: setUrgency, methodFit: setMethodFit,
                  novelty: setNovelty, significance: setSignificance,
                };
                return (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>
                    <textarea
                      value={qMap[key] ?? ""}
                      onChange={e => setMap[key]?.(e.target.value)}
                      disabled={isReadOnly}
                      rows={2}
                      placeholder={placeholder}
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 disabled:opacity-60"
                    />
                  </div>
                );
              })}
            </div>

            {/* C — Điểm cần chỉnh sửa */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                C. Điểm cần chỉnh sửa / bổ sung
              </p>
              <textarea
                value={revisionPoints}
                onChange={e => setRevisionPoints(e.target.value)}
                disabled={isReadOnly}
                rows={3}
                placeholder="Liệt kê các điểm cần chỉnh sửa (nếu có)..."
                className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 disabled:opacity-60"
              />
            </div>

            {/* D — Ý kiến thêm */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                D. Ý kiến khác
              </p>
              <textarea
                value={additionalComments}
                onChange={e => setAdditionalComments(e.target.value)}
                disabled={isReadOnly}
                rows={2}
                placeholder="Nhận xét thêm, đề nghị (nếu có)..."
                className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 disabled:opacity-60"
              />
            </div>

            {/* E — Xếp loại */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">E. Xếp loại</p>
              <div className="flex flex-wrap gap-1.5">
                {(["excellent", "good", "average", "fail"] as ReviewGrade[]).map(g => {
                  const labels: Record<ReviewGrade, string> = { excellent: "Giỏi", good: "Khá", average: "Trung bình", fail: "Không đạt" };
                  return (
                    <button
                      key={g}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setGrade(prev => prev === g ? "" : g)}
                      className={cn(
                        "px-3 py-1 text-xs rounded-lg border-2 transition font-medium",
                        grade === g
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600",
                        isReadOnly && "opacity-60 cursor-default",
                      )}
                    >
                      {labels[g]}
                    </button>
                  );
                })}
              </div>
              {!isReadOnly && suggestedGrade && suggestedGrade !== grade && (
                <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  Gợi ý theo điểm trung bình:{" "}
                  <strong className="text-violet-600 dark:text-violet-400">
                    {{ excellent: "Giỏi", good: "Khá", average: "Trung bình", fail: "Không đạt" }[suggestedGrade]}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setGrade(suggestedGrade)}
                    className="text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-800"
                  >
                    Dùng gợi ý
                  </button>
                </p>
              )}
            </div>

            {/* F — Kết luận */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">F. Kết luận *</p>
              <div className="space-y-1.5">
                {([
                  { value: "pass" as ReviewVerdict,            label: "ĐẠT",              sub: "Không cần chỉnh sửa",           cls: "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"  },
                  { value: "pass_if_revised" as ReviewVerdict, label: "ĐẠT (nếu chỉnh sửa)", sub: "Sau khi thực hiện điều chỉnh", cls: "border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"  },
                  { value: "fail" as ReviewVerdict,            label: "KHÔNG ĐẠT",         sub: "Chưa đáp ứng yêu cầu",          cls: "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"           },
                ]).map(o => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setVerdict(prev => prev === o.value ? "" : o.value)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition text-left",
                      verdict === o.value ? o.cls : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300",
                      isReadOnly && "cursor-default opacity-75",
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                      verdict === o.value ? "border-current" : "border-slate-300 dark:border-slate-600",
                    )}>
                      {verdict === o.value && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold">{o.label}</p>
                      <p className="text-[10px] opacity-70">{o.sub}</p>
                    </div>
                  </button>
                ))}
              </div>

              {verdict === "pass_if_revised" && (
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={needResubmit}
                    onChange={e => !isReadOnly && setNeedResubmit(e.target.checked)}
                    disabled={isReadOnly}
                    className="w-3.5 h-3.5 accent-violet-600"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300">Yêu cầu nộp lại đề cương sau khi chỉnh sửa</span>
                </label>
              )}
            </div>
          </div>

          {/* ── Sticky footer ── */}
          {!isReadOnly && (
            <div className="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2">
              {!verdict && (
                <p className="text-[11px] text-amber-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Chọn kết luận để nộp phiếu
                </p>
              )}
              {filledCriteria !== criteria.length && (
                <p className="text-[11px] text-amber-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Chấm điểm đủ {criteria.length} tiêu chí
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !verdict || filledCriteria !== criteria.length}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</>
                  : "Nộp phiếu phản biện"
                }
              </button>
              <p className="text-[10px] text-slate-400 text-center">
                Phiếu chỉ nộp được một lần · Dữ liệu được lưu nháp tự động
              </p>
            </div>
          )}

          {isReadOnly && (
            <div className="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/10">
              <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-2 justify-center">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Phiếu phản biện đã nộp — chỉ đọc
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
