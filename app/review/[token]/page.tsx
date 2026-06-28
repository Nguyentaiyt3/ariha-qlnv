"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, ShieldCheck, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { researchFileUrl } from "@/lib/researchFileUrl";
import type { ReviewScores, ReviewVerdict, ReviewGrade } from "@/types";

// ─── Criteria ──────────────────────────────────────────────────

const CRITERIA: { key: keyof ReviewScores; label: string; desc: string }[] = [
  { key: "datvande",        label: "1. Đặt vấn đề",            desc: "Tính cấp thiết, lý do chọn đề tài, bối cảnh thực tiễn" },
  { key: "muctieu",         label: "2. Mục tiêu nghiên cứu",   desc: "Rõ ràng, đo lường được, phù hợp phạm vi đề tài" },
  { key: "ppThietke",       label: "3a. Thiết kế & đối tượng", desc: "Phương pháp nghiên cứu, đối tượng, cỡ mẫu hợp lý" },
  { key: "ppQuytrinh",      label: "3b. Thu thập & phân tích", desc: "Quy trình thu thập số liệu, công cụ phân tích phù hợp" },
  { key: "ketqua",          label: "4. Kết quả dự kiến",        desc: "Khả thi, đóng góp rõ ràng cho lĩnh vực" },
  { key: "ketluanBandluan", label: "5. Kết luận — Bàn luận",   desc: "Logic, liên kết với kết quả và mục tiêu đã đặt ra" },
  { key: "cachTrinhbay",    label: "6. Cách trình bày",         desc: "Cấu trúc, văn phong, tài liệu tham khảo" },
];

const QUALITATIVE: { key: string; label: string; placeholder: string }[] = [
  { key: "urgency",      label: "Tính cấp thiết của chủ đề",          placeholder: "Nhận xét về tính cấp thiết, ý nghĩa thực tiễn..." },
  { key: "methodFit",    label: "Sự phù hợp thiết kế & phương pháp", placeholder: "Đánh giá mức độ phù hợp của thiết kế & phương pháp..." },
  { key: "novelty",      label: "Tính mới của kết quả dự kiến",       placeholder: "Nhận xét về điểm mới, đóng góp học thuật..." },
  { key: "significance", label: "Ý nghĩa khoa học & ứng dụng",        placeholder: "Đánh giá giá trị thực tiễn, ứng dụng lâm sàng..." },
];

const EMPTY_SCORES: ReviewScores = {
  datvande: 0, muctieu: 0, ppThietke: 0, ppQuytrinh: 0,
  ketqua: 0, ketluanBandluan: 0, cachTrinhbay: 0,
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          className={cn(
            "w-7 h-7 text-lg transition",
            (hover || value) >= n ? "text-amber-400" : "text-slate-300 dark:text-slate-600",
            onChange ? "cursor-pointer hover:scale-110" : "cursor-default"
          )}
        >
          ★
        </button>
      ))}
      <span className="ml-1 text-sm text-slate-500">{value > 0 ? `${value}/5` : "Chưa chấm"}</span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────

export default function PublicReviewPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data from server
  const [topicTitle, setTopicTitle] = useState("");
  const [topicField, setTopicField] = useState("");
  const [topicYear, setTopicYear] = useState(0);
  const [topicAbstract, setTopicAbstract] = useState("");
  const [topicFileUrl, setTopicFileUrl] = useState("");
  const [completionTimeline, setCompletionTimeline] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // Form state
  const [scores, setScores] = useState<ReviewScores>({ ...EMPTY_SCORES });
  const [urgency, setUrgency] = useState("");
  const [methodFit, setMethodFit] = useState("");
  const [novelty, setNovelty] = useState("");
  const [significance, setSignificance] = useState("");
  const [revisionPoints, setRevisionPoints] = useState("");
  const [additionalComments, setAdditionalComments] = useState("");
  const [verdict, setVerdict] = useState<ReviewVerdict | "">("");
  const [grade, setGrade] = useState<ReviewGrade | "">("");
  const [needResubmit, setNeedResubmit] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/review/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        const t = data.topic;
        setTopicTitle(t.title ?? "");
        setTopicField(t.field ?? "");
        setTopicYear(t.year ?? 0);
        setTopicAbstract(t.abstract ?? "");
        setTopicFileUrl(t.proposalFileUrl ?? "");
        setCompletionTimeline(t.completionTimeline ?? "");
        const r = data.review;
        setDueAt(r.dueAt ?? null);
        if (r.status === "submitted") {
          setAlreadySubmitted(true);
          setScores(r.scores ?? { ...EMPTY_SCORES });
          setUrgency(r.urgency ?? ""); setMethodFit(r.methodFit ?? "");
          setNovelty(r.novelty ?? ""); setSignificance(r.significance ?? "");
          setRevisionPoints(r.revisionPoints ?? ""); setAdditionalComments(r.additionalComments ?? "");
          setVerdict(r.verdict ?? ""); setGrade(r.grade ?? ""); setNeedResubmit(r.needResubmit ?? false);
        }
      })
      .catch(() => setError("Không thể tải phiếu phản biện"))
      .finally(() => setLoading(false));
  }, [token]);

  const totalScore = Object.values(scores).reduce((s, v) => s + (v ?? 0), 0);
  const maxScore = CRITERIA.length * 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verdict) { toast.error("Vui lòng chọn kết luận (ĐẠT / KHÔNG ĐẠT)"); return; }
    if (Object.values(scores).some(v => !v)) { toast.error("Vui lòng chấm điểm đầy đủ các tiêu chí"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores, urgency, methodFit, novelty, significance, revisionPoints, additionalComments, verdict, grade: grade || undefined, needResubmit }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Nộp phiếu thất bại");
        return;
      }
      setSubmitted(true);
    } catch {
      toast.error("Lỗi kết nối — vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading / Error states ────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Đang tải phiếu phản biện...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-red-100 p-8 space-y-3">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Không thể truy cập</h2>
        <p className="text-sm text-slate-500">{error}</p>
        <p className="text-xs text-slate-400 mt-2">Đường dẫn này có thể đã hết hạn hoặc không hợp lệ.</p>
      </div>
    </div>
  );

  if (submitted || alreadySubmitted) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-green-100 p-8 space-y-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800">
          {submitted ? "Phiếu phản biện đã được gửi" : "Phiếu đã nộp trước đó"}
        </h2>
        <p className="text-sm text-slate-500">
          {submitted
            ? "Cảm ơn bạn đã thực hiện phản biện. Kết quả sẽ được Ban Quản lý NCKH tổng hợp và xử lý."
            : "Phiếu phản biện này đã được nộp. Mỗi token chỉ sử dụng được một lần."}
        </p>
        {alreadySubmitted && (
          <div className="mt-4 p-3 bg-slate-50 rounded-xl text-left space-y-1">
            <p className="text-xs font-semibold text-slate-600">Kết quả đã nộp:</p>
            <p className="text-sm text-slate-800">Kết luận: <span className="font-medium">
              {verdict === "pass" ? "ĐẠT" : verdict === "pass_if_revised" ? "ĐẠT (nếu chỉnh sửa)" : "KHÔNG ĐẠT"}
            </span></p>
            <p className="text-sm text-slate-800">Tổng điểm: <span className="font-medium">{totalScore}/{maxScore}</span></p>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Main form ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">Phiếu phản biện kín — NCKH cấp cơ sở</p>
              <h1 className="text-lg font-bold text-slate-900 leading-snug">{topicTitle}</h1>
              <p className="text-sm text-slate-500 mt-1">
                {topicField && <span>{topicField} · </span>}
                {topicYear > 0 && <span>Năm {topicYear}</span>}
                {completionTimeline && <span> · {completionTimeline}</span>}
              </p>
              {dueAt && (
                <p className="text-xs text-amber-600 mt-2">
                  Hạn nộp phiếu: {new Date(dueAt).toLocaleDateString("vi-VN")}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Đây là phản biện kín. Danh tính tác giả, các thành viên đề tài và thông tin nhận diện đã được ẩn.
              Kết quả phản biện của bạn cũng được giữ kín với các phản biện khác.
            </span>
          </div>
        </div>

        {/* Abstract */}
        {topicAbstract && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Tóm tắt đề cương
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{topicAbstract}</p>
          </div>
        )}

        {/* File đề cương */}
        {topicFileUrl && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-700 mb-3">File đề cương</h2>
            <a
              href={researchFileUrl(topicFileUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 hover:underline font-medium"
            >
              <ExternalLink className="w-4 h-4" /> Tải / xem file đề cương
            </a>
          </div>
        )}

        {/* Review form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <h2 className="text-base font-bold text-slate-900">Phiếu đánh giá</h2>

          {/* Tiêu chí điểm số */}
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">A. Chấm điểm tiêu chí (thang 1–5)</p>
            {CRITERIA.map(({ key, label, desc }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  <StarRating
                    value={scores[key] ?? 0}
                    onChange={v => setScores(prev => ({ ...prev, [key]: v }))}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Tổng điểm tiêu chí</span>
              <span className="font-bold text-slate-800">{totalScore} / {maxScore}</span>
            </div>
          </div>

          {/* Đánh giá định tính */}
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">B. Nhận xét định tính</p>
            {QUALITATIVE.map(({ key, label, placeholder }) => {
              const qMap: Record<string, string> = { urgency, methodFit, novelty, significance };
              const setMap: Record<string, (v: string) => void> = {
                urgency: setUrgency, methodFit: setMethodFit, novelty: setNovelty, significance: setSignificance,
              };
              return (
                <div key={key} className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">{label}</label>
                  <textarea
                    value={qMap[key] ?? ""}
                    onChange={e => setMap[key]?.(e.target.value)}
                    rows={3}
                    placeholder={placeholder}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300"
                  />
                </div>
              );
            })}
          </div>

          {/* Điểm cần chỉnh sửa */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">C. Điểm cần chỉnh sửa / bổ sung</label>
            <textarea
              value={revisionPoints}
              onChange={e => setRevisionPoints(e.target.value)}
              rows={3}
              placeholder="Liệt kê các điểm cần chỉnh sửa (nếu có)..."
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300"
            />
          </div>

          {/* Ý kiến thêm */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">D. Ý kiến khác</label>
            <textarea
              value={additionalComments}
              onChange={e => setAdditionalComments(e.target.value)}
              rows={2}
              placeholder="Nhận xét thêm, đề nghị (nếu có)..."
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300"
            />
          </div>

          {/* Xếp loại */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">E. Xếp loại</p>
            <div className="flex flex-wrap gap-2">
              {(["excellent", "good", "average", "fail"] as ReviewGrade[]).map(g => {
                const labels: Record<ReviewGrade, string> = { excellent: "Giỏi", good: "Khá", average: "Trung bình", fail: "Không đạt" };
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(prev => prev === g ? "" : g)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-lg border-2 transition font-medium",
                      grade === g
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {labels[g]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kết luận */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">F. Kết luận *</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { value: "pass" as ReviewVerdict, label: "ĐẠT", sub: "Không cần chỉnh sửa", cls: "border-green-400 bg-green-50 text-green-700" },
                { value: "pass_if_revised" as ReviewVerdict, label: "ĐẠT (nếu chỉnh sửa)", sub: "Sau khi thực hiện điều chỉnh", cls: "border-amber-400 bg-amber-50 text-amber-700" },
                { value: "fail" as ReviewVerdict, label: "KHÔNG ĐẠT", sub: "Chưa đáp ứng yêu cầu", cls: "border-red-400 bg-red-50 text-red-600" },
              ]).map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setVerdict(prev => prev === o.value ? "" : o.value)}
                  className={cn(
                    "p-3 rounded-xl border-2 text-left transition",
                    verdict === o.value ? o.cls : "border-slate-200 hover:border-slate-300 text-slate-600"
                  )}
                >
                  <p className="text-sm font-bold">{o.label}</p>
                  <p className="text-[11px] opacity-75">{o.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cần nộp lại */}
          {verdict === "pass_if_revised" && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={needResubmit} onChange={e => setNeedResubmit(e.target.checked)} className="w-4 h-4 accent-violet-600" />
              <span className="text-sm text-slate-700">Yêu cầu nộp lại đề cương sau khi chỉnh sửa</span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting || !verdict}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</> : "Gửi phiếu phản biện"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 pb-6">
          ARiHA WorkHub — Hệ thống quản lý nghiên cứu khoa học cấp cơ sở · Phản biện kín
        </p>
      </div>
    </div>
  );
}
