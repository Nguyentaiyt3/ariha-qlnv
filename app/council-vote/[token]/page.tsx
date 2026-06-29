"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, Vote, AlertCircle, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type VoteChoice = "approve" | "reject" | "abstain";

const VOTE_OPTIONS: { value: VoteChoice; label: string; desc: string; icon: React.ElementType; cls: string }[] = [
  { value: "approve",  label: "Tán thành",         desc: "Đồng ý thông qua đề cương", icon: ThumbsUp,   cls: "border-green-400 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-600" },
  { value: "reject",   label: "Không tán thành",   desc: "Không đồng ý thông qua",    icon: ThumbsDown, cls: "border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-600" },
  { value: "abstain",  label: "Không ý kiến",      desc: "Bỏ phiếu trắng",            icon: Minus,      cls: "border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600" },
];

interface SessionInfo {
  topic: { id: string; title: string; field?: string; year?: number; abstract?: string };
  session: { id: string; stage: string; scheduledAt?: string; decision?: string };
  member: { name: string; role: string; department?: string };
  alreadyVoted: boolean;
  existingVote?: { vote: VoteChoice; comment?: string } | null;
}

export default function CouncilVotePage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/council-vote/${token}`)
      .then(r => r.json())
      .then((d: SessionInfo & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setInfo(d);
        if (d.alreadyVoted && d.existingVote) {
          setChoice(d.existingVote.vote);
          setComment(d.existingVote.comment ?? "");
          setDone(true);
        }
      })
      .catch(() => setError("Không thể tải phiếu biểu quyết"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    if (!choice) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/council-vote/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: choice, comment: comment.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { alert(d.error ?? "Có lỗi xảy ra"); return; }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Đang tải phiếu biểu quyết...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-red-100 p-8 space-y-3">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Không thể truy cập</h2>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    </div>
  );

  if (!info) return null;

  const stageLabel = info.session.stage === "recognition" ? "Nghiệm thu GĐ2" : "Thẩm định đề cương GĐ1";
  const roleLabel = { chair: "Chủ tịch HĐ", member: "Thành viên HĐ", secretary: "Thư ký HĐ" }[info.member.role] ?? info.member.role;

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-green-100 p-8 space-y-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800">Đã ghi nhận biểu quyết</h2>
        <p className="text-sm text-slate-500">Kết quả biểu quyết của bạn đã được lưu.</p>
        <div className="p-3 bg-slate-50 rounded-xl text-left space-y-1">
          <p className="text-xs text-slate-500">Đề tài: <strong className="text-slate-700">{info.topic.title}</strong></p>
          {choice && (
            <p className="text-xs text-slate-500">Biểu quyết: <strong className={
              choice === "approve" ? "text-green-600" : choice === "reject" ? "text-red-600" : "text-slate-500"
            }>{{ approve: "Tán thành", reject: "Không tán thành", abstain: "Không ý kiến" }[choice]}</strong></p>
          )}
        </div>
        <p className="text-xs text-slate-400 pt-1">ARiHA WorkHub · Hội đồng KHCN</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <Vote className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">Phiếu biểu quyết Hội đồng KHCN</p>
              <p className="text-[11px] text-slate-400">{stageLabel}</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-1">
            <p className="text-base font-bold text-slate-800">{info.topic.title}</p>
            {info.topic.field && <p className="text-xs text-slate-400">Lĩnh vực: {info.topic.field} · {info.topic.year}</p>}
            {info.topic.abstract && <p className="text-sm text-slate-600 mt-1 line-clamp-3">{info.topic.abstract}</p>}
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-xs text-slate-500">
            Thành viên: <strong className="text-slate-700">{info.member.name}</strong>
            {info.member.department && ` · ${info.member.department}`}
            <span className="ml-1.5 px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded text-[10px] font-semibold">{roleLabel}</span>
          </div>
          {info.session.decision && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
              Phiên họp này đã có kết luận — phiếu chỉ được xem lại.
            </div>
          )}
        </div>

        {/* Vote options */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 px-1">Kết quả biểu quyết <span className="text-red-500">*</span></p>
          {VOTE_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const selected = choice === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!!info.session.decision}
                onClick={() => setChoice(opt.value)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition",
                  selected ? opt.cls + " ring-2 ring-offset-1 ring-current" : "border-slate-200 bg-white hover:bg-slate-50",
                  info.session.decision && "opacity-60 cursor-default",
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-xs opacity-70">{opt.desc}</p>
                </div>
                {selected && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Comment */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700 px-1">Ý kiến (không bắt buộc)</label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            disabled={!!info.session.decision}
            rows={3}
            maxLength={2000}
            placeholder="Nhận xét, đề nghị bổ sung, điều kiện thông qua..."
            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-60"
          />
        </div>

        {/* Submit */}
        {!info.session.decision && (
          <button
            type="button"
            disabled={!choice || submitting}
            onClick={handleSubmit}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Gửi phiếu biểu quyết
          </button>
        )}

        <p className="text-center text-xs text-slate-400 pb-4">ARiHA WorkHub · Biểu quyết Hội đồng KHCN — Mỗi đường dẫn chỉ dùng một lần</p>
      </div>
    </div>
  );
}
