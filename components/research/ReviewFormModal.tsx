"use client";

import { useState, useMemo } from "react";
import { X, Loader2, Star, CheckCircle2, AlertCircle, XCircle, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ResearchReview, ResearchTopic, ReviewScores, ReviewVerdict, ReviewGrade } from "@/types";

// ─── Criteria config ───────────────────────────────────────────

const CRITERIA: { key: keyof ReviewScores; label: string; description: string }[] = [
  {
    key: "datvande",
    label: "1. Đặt vấn đề",
    description: "Giới thiệu được vấn đề hoặc khoảng cách giữa mong muốn và thực tế",
  },
  {
    key: "muctieu",
    label: "2. Mục tiêu",
    description: "Đưa ra mục tiêu rõ ràng liên quan đến chủ đề nghiên cứu",
  },
  {
    key: "ppThietke",
    label: "3a. Phương pháp — Thiết kế",
    description: "Thiết kế và đối tượng nghiên cứu được mô tả rõ ràng, phù hợp với nội dung và đáp ứng được mục tiêu",
  },
  {
    key: "ppQuytrinh",
    label: "3b. Phương pháp — Quy trình",
    description: "Quy trình triển khai thu thập thông tin và phân tích dữ liệu được mô tả rõ ràng",
  },
  {
    key: "ketqua",
    label: "4. Kết quả",
    description: "Kết quả nghiên cứu được trình bày khoa học, đáp ứng được mục tiêu nghiên cứu",
  },
  {
    key: "ketluanBandluan",
    label: "5. Kết luận — Bàn luận",
    description: "Kết luận - bàn luận được đưa ra phù hợp với kết quả và đúng theo các mục tiêu",
  },
  {
    key: "cachTrinhbay",
    label: "6. Cách trình bày",
    description: "Nội dung được trình bày hấp dẫn và giúp cho người đọc muốn tìm hiểu thêm về vấn đề",
  },
];

const QUALITATIVE: { key: "urgency" | "methodFit" | "novelty" | "significance"; label: string; placeholder: string }[] = [
  { key: "urgency",      label: "Tính cấp thiết của chủ đề nghiên cứu",          placeholder: "Đánh giá về tính cấp thiết, ý nghĩa thực tiễn của chủ đề..." },
  { key: "methodFit",    label: "Sự phù hợp của thiết kế và phương pháp nghiên cứu", placeholder: "Thiết kế nghiên cứu và phương pháp có phù hợp với mục tiêu không..." },
  { key: "novelty",      label: "Tính mới của kết quả nghiên cứu",                placeholder: "Kết quả có giá trị mới so với các nghiên cứu trước đây..." },
  { key: "significance", label: "Ý nghĩa khoa học và ứng dụng thực tiễn",         placeholder: "Đề tài có đóng góp gì cho khoa học và thực tiễn lâm sàng..." },
];

const VERDICT_OPTIONS: { value: ReviewVerdict; label: string; sub: string; cls: string; icon: React.ReactNode }[] = [
  {
    value: "pass",
    label: "ĐẠT",
    sub: "Đề tài đạt yêu cầu, không cần chỉnh sửa",
    cls: "border-green-400 bg-green-50 dark:bg-green-900/20",
    icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  },
  {
    value: "pass_if_revised",
    label: "ĐẠT — có chỉnh sửa",
    sub: "Đạt yêu cầu sau khi thực hiện các điều chỉnh",
    cls: "border-amber-400 bg-amber-50 dark:bg-amber-900/20",
    icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
  },
  {
    value: "fail",
    label: "KHÔNG ĐẠT",
    sub: "Đề tài chưa đạt yêu cầu",
    cls: "border-red-400 bg-red-50 dark:bg-red-900/20",
    icon: <XCircle className="w-5 h-5 text-red-500" />,
  },
];

const GRADE_OPTIONS: { value: ReviewGrade; label: string; cls: string; minScore: number }[] = [
  { value: "excellent", label: "Xuất sắc",   cls: "border-violet-400 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300", minScore: 32 },
  { value: "good",      label: "Giỏi",       cls: "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",           minScore: 28 },
  { value: "average",   label: "Khá",        cls: "border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",       minScore: 21 },
  { value: "fail",      label: "KHÔNG ĐẠT",  cls: "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",                 minScore: 0 },
];

// ─── Score input (5 stars) ─────────────────────────────────────

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={cn("w-6 h-6 transition-colors",
              n <= (hover || value)
                ? "text-amber-400 fill-amber-400"
                : "text-slate-200 dark:text-slate-700"
            )}
          />
        </button>
      ))}
      <span className="ml-2 text-sm font-semibold text-slate-600 dark:text-slate-300 w-12">
        {value > 0 ? `${value}/5` : "—"}
      </span>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
      <div className="w-1 h-5 rounded-full bg-violet-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-slate-800 dark:text-white text-sm">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────

interface Props {
  topic: ResearchTopic;
  review: ResearchReview;
  onClose: () => void;
  onSubmitted: (updated: ResearchReview) => void;
}

const emptyScores = (): ReviewScores => ({
  datvande: 0, muctieu: 0, ppThietke: 0, ppQuytrinh: 0,
  ketqua: 0, ketluanBandluan: 0, cachTrinhbay: 0,
});

export function ReviewFormModal({ topic, review, onClose, onSubmitted }: Props) {
  const existing = review.scores;
  const [scores, setScores] = useState<ReviewScores>(existing ?? emptyScores());
  const [urgency,      setUrgency]      = useState(review.urgency ?? "");
  const [methodFit,    setMethodFit]    = useState(review.methodFit ?? "");
  const [novelty,      setNovelty]      = useState(review.novelty ?? "");
  const [significance, setSignificance] = useState(review.significance ?? "");
  const [revisionPoints, setRevisionPoints] = useState(review.revisionPoints ?? "");
  const [additionalComments, setAdditionalComments] = useState(review.additionalComments ?? "");
  const [verdict,  setVerdict]  = useState<ReviewVerdict | "">(review.verdict ?? "");
  const [grade,    setGrade]    = useState<ReviewGrade | "">(review.grade ?? "");
  const [needResubmit, setNeedResubmit] = useState(review.needResubmit ?? false);
  const [topicFileUrl, setTopicFileUrl] = useState(review.topicFileUrl ?? "");
  const [saving, setSaving] = useState(false);

  const totalScore = useMemo(() =>
    Object.values(scores).reduce((s, v) => s + (v || 0), 0),
  [scores]);

  const allScoresFilled = Object.values(scores).every(v => v > 0);
  const canSubmit = allScoresFilled && verdict !== "" && grade !== "";

  // Auto-suggest grade based on score
  const suggestedGrade = useMemo((): ReviewGrade => {
    if (totalScore >= 32) return "excellent";
    if (totalScore >= 28) return "good";
    if (totalScore >= 21) return "average";
    return "fail";
  }, [totalScore]);

  function setScore(key: keyof ReviewScores, val: number) {
    setScores(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    if (!canSubmit) { toast.error("Vui lòng hoàn thành đánh giá"); return; }
    setSaving(true);
    try {
      const updated: ResearchReview = {
        ...review,
        topicFileUrl: topicFileUrl.trim() || undefined,
        scores,
        urgency:      urgency.trim() || undefined,
        methodFit:    methodFit.trim() || undefined,
        novelty:      novelty.trim() || undefined,
        significance: significance.trim() || undefined,
        revisionPoints: revisionPoints.trim() || undefined,
        additionalComments: additionalComments.trim() || undefined,
        verdict:  verdict as ReviewVerdict,
        grade:    grade as ReviewGrade,
        needResubmit,
        score:    totalScore,
        recommendation: verdict === "pass" ? "pass" : verdict === "fail" ? "fail" : "revise",
        submittedAt: new Date().toISOString(),
        status: "submitted",
      };
      onSubmitted(updated);
      toast.success("Đã nộp phiếu phản biện");
    } catch { toast.error("Nộp phiếu thất bại"); }
    finally { setSaving(false); }
  }

  const pi = topic.principalInvestigatorId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4">

        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 rounded-t-2xl z-10">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 dark:text-white">Phiếu nhận xét đề tài cấp cơ sở</h2>
            <p className="text-xs text-slate-400 truncate mt-0.5">{topic.title}</p>
          </div>
          <button onClick={onClose} className="shrink-0 ml-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-7">

          {/* ── Meta info ── */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-1">Tên đề tài</p>
              <p className="font-medium text-slate-700 dark:text-slate-200 line-clamp-2">{topic.title}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Chủ nhiệm đề tài</p>
              <p className="font-medium text-slate-700 dark:text-slate-200">{pi}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">File PDF đề tài (Google Drive hoặc URL)</label>
              <div className="relative">
                <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={topicFileUrl} onChange={e => setTopicFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
              </div>
            </div>
          </div>

          {/* ── Scoring criteria ── */}
          <div className="space-y-4">
            <SectionHeader label="A. Đánh giá tiêu chí (mỗi tiêu chí 1–5 điểm)" sub={`Tổng: ${totalScore}/35 điểm`} />
            <div className="space-y-5">
              {CRITERIA.map(c => (
                <div key={c.key} className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.label}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{c.description}</p>
                    </div>
                  </div>
                  <ScoreInput value={scores[c.key]} onChange={v => setScore(c.key, v)} />
                </div>
              ))}
            </div>

            {/* Score summary bar */}
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tổng điểm</span>
                <span className={cn("text-lg font-bold",
                  totalScore >= 28 ? "text-green-600 dark:text-green-400"
                  : totalScore >= 21 ? "text-amber-600 dark:text-amber-400"
                  : totalScore > 0 ? "text-red-500" : "text-slate-400"
                )}>
                  {totalScore} / 35
                </span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500",
                  totalScore >= 28 ? "bg-green-500" : totalScore >= 21 ? "bg-amber-400" : "bg-red-400"
                )} style={{ width: `${(totalScore / 35) * 100}%` }} />
              </div>
              {totalScore > 0 && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Điểm gợi ý xếp loại:
                  <span className="font-semibold ml-1 text-slate-600 dark:text-slate-300">
                    {suggestedGrade === "excellent" ? "Xuất sắc (≥32)" : suggestedGrade === "good" ? "Giỏi (28–31)" : suggestedGrade === "average" ? "Khá (21–27)" : "Không đạt (<21)"}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* ── Qualitative assessment ── */}
          <div className="space-y-4">
            <SectionHeader label="B. Đánh giá định tính" />
            {QUALITATIVE.map(q => (
              <div key={q.key}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {q.label}
                </label>
                <textarea
                  value={{ urgency, methodFit, novelty, significance }[q.key]}
                  onChange={e => {
                    const v = e.target.value;
                    if (q.key === "urgency") setUrgency(v);
                    else if (q.key === "methodFit") setMethodFit(v);
                    else if (q.key === "novelty") setNovelty(v);
                    else setSignificance(v);
                  }}
                  rows={2}
                  placeholder={q.placeholder}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                />
              </div>
            ))}
          </div>

          {/* ── Revision points ── */}
          <div className="space-y-4">
            <SectionHeader label="C. Điểm cần chỉnh sửa" />
            <textarea
              value={revisionPoints}
              onChange={e => setRevisionPoints(e.target.value)}
              rows={3}
              placeholder="Liệt kê các điểm tác giả cần bổ sung / chỉnh sửa (nếu có)..."
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>

          {/* ── Conclusion ── */}
          <div className="space-y-4">
            <SectionHeader label="D. Kết luận" />

            {/* Verdict */}
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Kết luận chung <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {VERDICT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVerdict(opt.value)}
                    className={cn(
                      "flex items-start gap-2 p-3 rounded-xl border-2 text-left transition",
                      verdict === opt.value ? opt.cls : "border-slate-200 dark:border-slate-700 hover:border-slate-300",
                    )}
                  >
                    <div className="shrink-0 mt-0.5">{opt.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{opt.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Grade */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Xếp loại <span className="text-red-500">*</span></p>
                {totalScore > 0 && grade !== suggestedGrade && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <Info className="w-3 h-3" /> Điểm gợi ý: <strong>{GRADE_OPTIONS.find(g => g.value === suggestedGrade)?.label}</strong>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {GRADE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGrade(opt.value)}
                    className={cn(
                      "px-4 py-2 rounded-lg border-2 text-sm font-semibold transition",
                      grade === opt.value ? opt.cls : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resubmit */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={needResubmit}
                onChange={e => setNeedResubmit(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Yêu cầu tác giả nộp lại bài sau khi chỉnh sửa</span>
            </label>

            {/* Additional comments */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Ý kiến thêm (không bắt buộc)
              </label>
              <textarea
                value={additionalComments}
                onChange={e => setAdditionalComments(e.target.value)}
                rows={2}
                placeholder="Ghi chú hoặc ý kiến khác về đề tài..."
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-5 rounded-b-2xl flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Huỷ
          </button>
          <button onClick={handleSubmit} disabled={saving || !canSubmit}
            className="flex-2 px-8 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {review.status === "submitted" ? "Cập nhật phiếu" : "Nộp phiếu phản biện"}
          </button>
        </div>
      </div>
    </div>
  );
}
