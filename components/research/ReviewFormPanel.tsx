"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, FileText, Star, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { researchFileUrl } from "@/lib/researchFileUrl";
import type { ResearchReview, ResearchTopic, ReviewScores, ReviewVerdict, ReviewGrade } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CRITERIA: { key: keyof ReviewScores; label: string; desc: string }[] = [
  { key: "datvande",        label: "1. Đặt vấn đề",           desc: "Tính cấp thiết, lý do chọn đề tài, bối cảnh thực tiễn" },
  { key: "muctieu",         label: "2. Mục tiêu nghiên cứu",  desc: "Rõ ràng, đo lường được, phù hợp phạm vi đề tài" },
  { key: "ppThietke",       label: "3a. Thiết kế & đối tượng", desc: "Phương pháp nghiên cứu, đối tượng, cỡ mẫu hợp lý" },
  { key: "ppQuytrinh",      label: "3b. Thu thập & phân tích", desc: "Quy trình thu thập số liệu, công cụ phân tích phù hợp" },
  { key: "ketqua",          label: "4. Kết quả dự kiến",       desc: "Khả thi, đóng góp rõ ràng cho lĩnh vực" },
  { key: "ketluanBandluan", label: "5. Kết luận — Bàn luận",  desc: "Logic, liên kết với kết quả và mục tiêu đã đặt ra" },
  { key: "cachTrinhbay",    label: "6. Cách trình bày",        desc: "Cấu trúc, văn phong, tài liệu tham khảo" },
];

const QUALITATIVE: { key: keyof ResearchReview; label: string; placeholder: string }[] = [
  { key: "urgency",      label: "Tính cấp thiết",             placeholder: "Nhận xét về tính cấp thiết của vấn đề nghiên cứu..." },
  { key: "methodFit",    label: "Sự phù hợp thiết kế",        placeholder: "Đánh giá mức độ phù hợp của thiết kế & phương pháp..." },
  { key: "novelty",      label: "Tính mới của kết quả",       placeholder: "Nhận xét về điểm mới, đóng góp học thuật..." },
  { key: "significance", label: "Ý nghĩa khoa học & ứng dụng", placeholder: "Đánh giá giá trị thực tiễn, ứng dụng lâm sàng/cộng đồng..." },
];

const VERDICT_OPTS: { value: ReviewVerdict; label: string; color: string }[] = [
  { value: "pass",            label: "ĐẠT",                     color: "text-green-600" },
  { value: "pass_if_revised", label: "ĐẠT (nếu chỉnh sửa)",    color: "text-amber-600" },
  { value: "fail",            label: "KHÔNG ĐẠT",               color: "text-red-600"   },
];

const GRADE_OPTS: { value: ReviewGrade; label: string }[] = [
  { value: "excellent", label: "Giỏi" },
  { value: "good",      label: "Khá" },
  { value: "average",   label: "Trung bình" },
  { value: "fail",      label: "Không đạt" },
];

const EMPTY_SCORES: ReviewScores = {
  datvande: 0, muctieu: 0, ppThietke: 0, ppQuytrinh: 0,
  ketqua: 0, ketluanBandluan: 0, cachTrinhbay: 0,
};

// ─── Star rating ─────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="focus:outline-none"
        >
          <Star
            className={cn(
              "w-5 h-5 transition-colors",
              (hover || value) >= n
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-slate-300 dark:text-slate-600",
            )}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 ml-1 self-center">{value}/5</span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  review: ResearchReview;
  topic: ResearchTopic;
  onSubmit: (data: Partial<ResearchReview>) => Promise<void>;
  onCancel: () => void;
}

export function ReviewFormPanel({ review, topic, onSubmit, onCancel }: Props) {
  // Pre-fill if already partially filled
  const [scores, setScores] = useState<ReviewScores>(review.scores ?? { ...EMPTY_SCORES });
  const [urgency,       setUrgency]       = useState(review.urgency       ?? "");
  const [methodFit,     setMethodFit]     = useState(review.methodFit     ?? "");
  const [novelty,       setNovelty]       = useState(review.novelty       ?? "");
  const [significance,  setSignificance]  = useState(review.significance  ?? "");
  const [revisionPts,   setRevisionPts]   = useState(review.revisionPoints      ?? "");
  const [addComments,   setAddComments]   = useState(review.additionalComments  ?? "");
  const [verdict,       setVerdict]       = useState<ReviewVerdict | "">(review.verdict ?? "");
  const [grade,         setGrade]         = useState<ReviewGrade   | "">(review.grade   ?? "");
  const [needResubmit,  setNeedResubmit]  = useState(review.needResubmit ?? false);
  const [saving, setSaving] = useState(false);

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const maxScore   = CRITERIA.length * 5; // 35

  const filledCriteria = Object.values(scores).filter(v => v > 0).length;
  const canSubmit = filledCriteria === CRITERIA.length && verdict !== "";

  async function handleSubmit() {
    if (!canSubmit) {
      if (filledCriteria < CRITERIA.length) toast.warning("Hãy chấm điểm tất cả 7 tiêu chí");
      else toast.warning("Hãy chọn kết luận (ĐẠT / KHÔNG ĐẠT)");
      return;
    }
    setSaving(true);
    await onSubmit({
      scores,
      urgency:            urgency.trim()      || undefined,
      methodFit:          methodFit.trim()    || undefined,
      novelty:            novelty.trim()      || undefined,
      significance:       significance.trim() || undefined,
      revisionPoints:     revisionPts.trim()  || undefined,
      additionalComments: addComments.trim()  || undefined,
      verdict:            verdict as ReviewVerdict,
      grade:              grade   || undefined,
      needResubmit,
      score:              totalScore,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 dark:bg-black/60 overflow-hidden">
      <div className="relative flex flex-col lg:flex-row w-full max-w-7xl mx-auto my-4 mx-4 bg-background rounded-2xl shadow-2xl overflow-hidden">

        {/* ── LEFT: Proposal content ─────────────────────────────── */}
        <div className="lg:w-[45%] flex flex-col border-r border-border overflow-y-auto max-h-[90vh]">
          <div className="px-5 py-4 border-b border-border bg-violet-50 dark:bg-violet-900/10 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-violet-600" />
              <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Đề cương nghiên cứu</span>
            </div>
            <h2 className="text-base font-bold text-foreground leading-tight">{topic.title}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Chủ nhiệm: <strong>{topic.principalInvestigatorId}</strong>
              {topic.department && ` · ${topic.department}`} · Năm {topic.year}
            </p>
          </div>

          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* Abstract */}
            {topic.abstract && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Tóm tắt</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">{topic.abstract}</p>
              </div>
            )}

            {/* Compile note (proposal summary) */}
            {topic.compileNote ? (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Nội dung đề cương</p>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  {topic.compileNote}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">Chưa có nội dung đề cương được nộp.</p>
              </div>
            )}

            {/* Keywords / field */}
            {topic.field && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Lĩnh vực</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                  {topic.field}
                </span>
              </div>
            )}

            {/* Proposal file */}
            {(review.topicFileUrl ?? topic.proposalFileUrl) && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">File đề cương</p>
                <a
                  href={researchFileUrl(review.topicFileUrl ?? topic.proposalFileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                >
                  <FileText className="w-4 h-4" />
                  Xem file đề cương (PDF / DOC)
                </a>
              </div>
            )}

            {/* Scoring summary read-only */}
            {filledCriteria > 0 && (
              <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500">Tổng điểm hiện tại</p>
                  <span className={cn(
                    "text-lg font-bold",
                    totalScore >= 28 ? "text-green-600" : totalScore >= 21 ? "text-amber-600" : "text-red-500",
                  )}>
                    {totalScore} / {maxScore}
                  </span>
                </div>
                <div className="mt-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      totalScore >= 28 ? "bg-green-500" : totalScore >= 21 ? "bg-amber-500" : "bg-red-500",
                    )}
                    style={{ width: `${(totalScore / maxScore) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Review form ─────────────────────────────────── */}
        <div className="lg:w-[55%] flex flex-col overflow-y-auto max-h-[90vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border bg-card shrink-0 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Phiếu nhận xét kín</p>
              <h3 className="text-sm font-bold text-foreground">Thẩm định đề cương — GĐ1</h3>
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">✕</button>
          </div>

          <div className="flex-1 px-5 py-4 space-y-6 overflow-y-auto">

            {/* ── Tiêu chí chấm điểm ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground">Tiêu chí chấm điểm</h4>
                <span className="text-xs text-slate-400">Mỗi tiêu chí: 1–5 điểm · Tổng tối đa: {maxScore}</span>
              </div>
              <div className="space-y-3">
                {CRITERIA.map(c => (
                  <div key={c.key} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{c.desc}</p>
                      </div>
                      <div className="shrink-0">
                        <StarRating
                          value={scores[c.key]}
                          onChange={v => setScores(prev => ({ ...prev, [c.key]: v }))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Score bar */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      totalScore >= 28 ? "bg-green-500" : totalScore >= 21 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${(totalScore / maxScore) * 100}%` }}
                  />
                </div>
                <span className={cn("text-sm font-bold tabular-nums shrink-0",
                  totalScore >= 28 ? "text-green-600" : totalScore >= 21 ? "text-amber-600" : "text-red-500")}>
                  {totalScore}/{maxScore}
                </span>
              </div>
            </section>

            {/* ── Đánh giá định tính ── */}
            <section>
              <h4 className="text-sm font-semibold text-foreground mb-3">Đánh giá định tính</h4>
              <div className="space-y-3">
                {QUALITATIVE.map(q => (
                  <div key={q.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{q.label}</label>
                    <textarea
                      rows={2}
                      placeholder={q.placeholder}
                      value={String((
                        q.key === "urgency"      ? urgency      :
                        q.key === "methodFit"    ? methodFit    :
                        q.key === "novelty"      ? novelty      :
                                                   significance
                      ) ?? "")}
                      onChange={e => {
                        const v = e.target.value;
                        if (q.key === "urgency")      setUrgency(v);
                        else if (q.key === "methodFit")  setMethodFit(v);
                        else if (q.key === "novelty")    setNovelty(v);
                        else                             setSignificance(v);
                      }}
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* ── Ý kiến & điểm cần chỉnh sửa ── */}
            <section>
              <h4 className="text-sm font-semibold text-foreground mb-3">Nhận xét & ý kiến bổ sung</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Các điểm cần chỉnh sửa / bổ sung</label>
                  <textarea
                    rows={3}
                    placeholder="Liệt kê cụ thể các điểm cần điều chỉnh, bổ sung hoặc làm rõ..."
                    value={revisionPts}
                    onChange={e => setRevisionPts(e.target.value)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ý kiến thêm</label>
                  <textarea
                    rows={2}
                    placeholder="Các nhận xét khác, góp ý về hướng phát triển..."
                    value={addComments}
                    onChange={e => setAddComments(e.target.value)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </div>
              </div>
            </section>

            {/* ── Kết luận & xếp loại ── */}
            <section className="border-t border-slate-100 dark:border-slate-700 pt-5">
              <h4 className="text-sm font-semibold text-foreground mb-3">Kết luận & Quyết định</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Verdict */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2">Kết luận *</label>
                  <div className="space-y-1.5">
                    {VERDICT_OPTS.map(opt => (
                      <label key={opt.value} className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition",
                        verdict === opt.value
                          ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300",
                      )}>
                        <input
                          type="radio"
                          name="verdict"
                          value={opt.value}
                          checked={verdict === opt.value}
                          onChange={() => setVerdict(opt.value)}
                          className="accent-violet-600"
                        />
                        <span className={cn("text-sm font-semibold", opt.color)}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Grade + Resubmit */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2">Xếp loại</label>
                    <select
                      value={grade}
                      onChange={e => setGrade(e.target.value as ReviewGrade)}
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">— Chọn xếp loại —</option>
                      {GRADE_OPTS.map(g => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needResubmit}
                      onChange={e => setNeedResubmit(e.target.checked)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <span className="text-sm text-foreground">
                      Yêu cầu nộp lại đề cương sau chỉnh sửa
                    </span>
                  </label>
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border bg-card shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {filledCriteria < CRITERIA.length
                ? <span className="text-amber-600">⚠ Còn {CRITERIA.length - filledCriteria} tiêu chí chưa chấm điểm</span>
                : verdict === ""
                ? <span className="text-amber-600">⚠ Chưa chọn kết luận</span>
                : <span className="text-green-600">✓ Sẵn sàng nộp</span>
              }
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Huỷ
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="px-5 py-2 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Nộp phiếu thẩm định
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

