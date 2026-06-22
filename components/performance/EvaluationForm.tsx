"use client";

import { useState } from "react";
import { Star, Send, EyeOff, CheckCircle2, RotateCcw } from "lucide-react";
import { saveEvaluation } from "@/lib/firebase/firestore";
import type { KPIFramework, Evaluation } from "@/types";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  targetUserId: string;
  evaluatorId: string;
  type: "self" | "manager" | "peer";
  framework?: KPIFramework;
  period: string;
  onDone?: (saved: Evaluation) => void;
}

export default function EvaluationForm({ targetUserId, evaluatorId, type, framework, period, onDone }: Props) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState<Evaluation | null>(null);

  const TYPE_LABELS = { self: "Tự đánh giá", manager: "Quản lý đánh giá", peer: "Đồng nghiệp đánh giá" };

  const indicators = framework?.indicators ?? [
    { id: "quality", name: "Chất lượng công việc", weight: 30, unit: "điểm" },
    { id: "speed", name: "Tốc độ hoàn thành", weight: 25, unit: "điểm" },
    { id: "teamwork", name: "Làm việc nhóm", weight: 20, unit: "điểm" },
    { id: "initiative", name: "Sáng kiến & chủ động", weight: 15, unit: "điểm" },
    { id: "communication", name: "Kỹ năng giao tiếp", weight: 10, unit: "điểm" },
  ];

  const setScore = (indicatorId: string, value: number) => {
    setScores((prev) => ({ ...prev, [indicatorId]: value }));
  };

  const isComplete = indicators.every((i) => scores[i.id] !== undefined);

  const totalWeight = indicators.reduce((s, i) => s + i.weight, 0) || 100;
  const overallScore = indicators.reduce(
    (sum, ind) => sum + (scores[ind.id] ?? 0) * (ind.weight / totalWeight),
    0,
  ) * 10; // scores 1-10 → weighted avg * 10 = 0-100

  const handleSubmit = async () => {
    if (!isComplete) {
      toast.error("Vui lòng đánh giá đủ tất cả tiêu chí");
      return;
    }
    setSaving(true);
    try {
      const eval_: Evaluation = {
        id: generateId(),
        evaluatedUserId: targetUserId,
        evaluatorId: isAnonymous && type === "peer" ? "anonymous" : evaluatorId,
        type,
        scores,
        comment: comment.trim(),
        isAnonymous: type === "peer" && isAnonymous,
        period,
        frameworkId: framework?.id,
        overallScore: Math.round(overallScore),
        createdAt: new Date().toISOString(),
      };
      await saveEvaluation(eval_);
      toast.success("Đã gửi đánh giá thành công");
      setSubmitted(eval_);
      onDone?.(eval_);
    } catch {
      toast.error("Gửi đánh giá thất bại");
    } finally {
      setSaving(false);
    }
  };

  function resetForm() {
    setScores({});
    setComment("");
    setIsAnonymous(false);
    setSubmitted(null);
  }

  // ── Success state ─────────────────────────────────────────
  if (submitted) {
    const stars = Math.round(submitted.overallScore! / 20);
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <div>
          <p className="text-lg font-semibold text-[var(--foreground)]">Đã gửi đánh giá!</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">Kỳ {period} · {TYPE_LABELS[type]}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-full">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className={`w-5 h-5 ${s <= stars ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
          ))}
          <span className="text-sm font-bold text-amber-600 ml-1">{submitted.overallScore}/100</span>
        </div>
        {submitted.comment && (
          <p className="text-sm text-[var(--muted-foreground)] italic">"{submitted.comment}"</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-left">
          {indicators.map((ind) => (
            <div key={ind.id} className="flex items-center justify-between px-3 py-2 bg-[var(--muted)] rounded-lg text-xs">
              <span className="text-[var(--muted-foreground)] truncate">{ind.name}</span>
              <span className="font-semibold text-[var(--foreground)] ml-2">{submitted.scores[ind.id]}/10</span>
            </div>
          ))}
        </div>
        <button
          onClick={resetForm}
          className="flex items-center gap-2 mx-auto text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
        >
          <RotateCcw className="w-4 h-4" /> Đánh giá lại
        </button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-[var(--foreground)] text-lg">{TYPE_LABELS[type]}</h3>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">Kỳ đánh giá: {period}</p>
        </div>
        {isComplete && (
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{Math.round(overallScore)}</p>
            <p className="text-xs text-[var(--muted-foreground)]">/ 100</p>
          </div>
        )}
      </div>

      <div className="space-y-5 mb-6">
        {indicators.map((indicator) => (
          <div key={indicator.id}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--foreground)]">
                {indicator.name}
                <span className="ml-1.5 text-xs text-[var(--muted-foreground)]">({indicator.weight}%)</span>
              </label>
              {scores[indicator.id] !== undefined && (
                <span className="text-sm font-semibold text-blue-600">{scores[indicator.id]}/10</span>
              )}
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <button
                  key={v}
                  onClick={() => setScore(indicator.id, v)}
                  className={`flex-1 h-8 rounded text-xs font-medium transition-colors ${
                    scores[indicator.id] === v
                      ? "bg-blue-600 text-white"
                      : scores[indicator.id] !== undefined && v <= scores[indicator.id]
                      ? "bg-blue-100 text-blue-700"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-blue-50"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Nhận xét thêm (tùy chọn)..."
        rows={3}
        className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 resize-none"
      />

      {type === "peer" && (
        <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <EyeOff className="w-4 h-4" />
          Ẩn danh (người được đánh giá sẽ không biết tên bạn)
        </label>
      )}

      <button
        onClick={handleSubmit}
        disabled={!isComplete || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Gửi đánh giá
      </button>
    </div>
  );
}
