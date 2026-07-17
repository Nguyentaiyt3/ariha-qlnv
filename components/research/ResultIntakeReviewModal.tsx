"use client";

import { useState, useMemo } from "react";
import {
  Loader2, FileText, Check, X,
  AlertCircle, Maximize2, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isTopicAuthor } from "@/lib/researchUtils";
import { DocxAnnotator } from "./DocxAnnotator";
import { addAnnotation, updateAnnotation, deleteAnnotation } from "@/lib/researchAnnotations";
import type { ResearchTopic } from "@/types";

// ─── Checklist — kiểm tra kết quả nghiên cứu (khác checklist đề cương GĐ1) ────

const CHECKLIST = [
  { key: "content",  label: "Nội dung đầy đủ theo đề cương đã duyệt" },
  { key: "data",     label: "Số liệu/kết quả trình bày rõ ràng, có căn cứ" },
  { key: "evidence", label: "Tài liệu minh chứng đính kèm đầy đủ" },
  { key: "format",   label: "File đúng định dạng quy định" },
] as const;

type CheckKey = (typeof CHECKLIST)[number]["key"];

/**
 * Modal "Kiểm tra & Tiếp nhận kết quả nghiên cứu" (GĐ2 — r_intake) — bố cục tái dùng từ
 * IntakeReviewModal (GĐ1) nhưng lược bớt các phần chỉ áp dụng cho form public/đề cương (đối chiếu
 * tài khoản, phân loại nhiệm vụ, dò trùng lặp) vì ở GĐ2 tác giả đã có tài khoản và đã qua các bước
 * đó từ GĐ1. Quyết định "Yêu cầu chỉnh sửa" tái dùng đúng cơ chế revisionNote/revisionCount đã có
 * (banner + mở khoá file + nút "Nộp lại" ở FinalTopicTab) — không cần field intakeStatus riêng.
 */
export function ResultIntakeReviewModal({
  topic,
  currentUserId,
  onAccept,
  onRevise,
  onReject,
  onClose,
}: {
  topic: ResearchTopic;
  currentUserId?: string;
  onAccept: (note: string) => Promise<void>;
  onRevise: (reason: string, dueDate: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    content: false, data: false, evidence: false, format: false,
  });
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [verdict, setVerdict] = useState<"accept" | "revise" | "reject" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const reviewedAtDisplay = useMemo(() => {
    const d = new Date();
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${date} · ${time}`;
  }, []);

  const fileUrl = topic.finalReportFileUrl;
  const isSelfAuthored = isTopicAuthor({ id: currentUserId }, topic);
  const checkedCount = Object.values(checks).filter(Boolean).length;
  const allChecked = checkedCount === CHECKLIST.length;
  const canSubmit = !isSelfAuthored && (verdict === "accept"
    ? allChecked
    : verdict !== null
    ? reason.trim().length > 0
    : false);

  function toggle(key: CheckKey) {
    setChecks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    if (!verdict || !canSubmit) return;
    setSubmitting(true);
    try {
      if (verdict === "accept") await onAccept(note);
      else if (verdict === "revise") await onRevise(reason, dueDate);
      else await onReject(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/70", fullscreen ? "p-0" : "p-3")}>
      <div
        className={cn(
          "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col",
          fullscreen ? "max-w-none h-full rounded-none" : "max-w-6xl rounded-2xl",
        )}
        style={fullscreen ? { height: "100vh" } : { height: "min(94vh, 780px)" }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white truncate">
              Kiểm tra & Tiếp nhận kết quả nghiên cứu
              {topic.code && <span className="ml-2 text-[11px] font-mono text-slate-400">[{topic.code}]</span>}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">{topic.title}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <button
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? "Thu nhỏ" : "Phóng to toàn màn hình"}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition"
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-column body */}
        <div className="flex-1 overflow-hidden grid divide-x divide-slate-200 dark:divide-slate-700" style={{ gridTemplateColumns: "2fr 1fr" }}>
          {/* LEFT: file viewer */}
          <div className="flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">File đề tài / báo cáo tổng kết</p>
            </div>
            <div className="flex-1 overflow-hidden">
              {fileUrl ? (
                <DocxAnnotator
                  fileUrl={fileUrl}
                  annotations={topic.annotations ?? []}
                  canAnnotate={!!currentUserId}
                  canManageAll
                  currentUserId={currentUserId}
                  onAdd={(p) => addAnnotation(topic.id, p)}
                  onUpdate={(id, patch) => updateAnnotation(topic.id, id, patch)}
                  onDelete={(id) => deleteAnnotation(topic.id, id)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                  <FileText className="w-16 h-16 opacity-30" />
                  <p className="text-sm">Chưa có file đề tài</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: checklist + decision */}
          <div className="overflow-y-auto bg-white dark:bg-slate-900 flex flex-col">
            <div className="p-4 space-y-4 flex-1">
              <div className="flex items-center justify-between text-[11px] px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                <span className="text-slate-400">Ngày &amp; giờ kiểm tra</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{reviewedAtDisplay}</span>
              </div>

              {(topic.revisionCount ?? 0) > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Đã yêu cầu chỉnh sửa {topic.revisionCount} lần
                    {topic.revisionNote && `: ${topic.revisionNote}`}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Tiêu chí tiếp nhận ({checkedCount}/{CHECKLIST.length})
                </p>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mb-3">
                  <div className="h-1.5 bg-teal-500 rounded-full transition-all" style={{ width: `${(checkedCount / CHECKLIST.length) * 100}%` }} />
                </div>
                <div className="space-y-1.5">
                  {CHECKLIST.map(item => {
                    const checked = checks[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggle(item.key)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition",
                          checked
                            ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition",
                          checked ? "bg-teal-500 border-teal-500" : "border-slate-300 dark:border-slate-600",
                        )}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={cn("text-[11px] leading-tight", checked ? "text-teal-700 dark:text-teal-300 font-medium" : "text-slate-600 dark:text-slate-300")}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nhận xét</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú của người tiếp nhận..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quyết định</p>
                <div className="space-y-1">
                  {([
                    ["accept", "Tiếp nhận",          "border-teal-400 bg-teal-50 dark:bg-teal-900/20",   "text-teal-700 dark:text-teal-300",  "bg-teal-500"],
                    ["revise", "Yêu cầu chỉnh sửa",  "border-amber-400 bg-amber-50 dark:bg-amber-900/20","text-amber-700 dark:text-amber-300", "bg-amber-500"],
                    ["reject", "Từ chối",             "border-red-400 bg-red-50 dark:bg-red-900/20",      "text-red-600 dark:text-red-400",    "bg-red-500"],
                  ] as const).map(([v, label, activeCls, textCls, dotCls]) => (
                    <label
                      key={v}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition",
                        verdict === v ? activeCls : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                      )}
                    >
                      <input type="radio" name="verdict" checked={verdict === v} onChange={() => setVerdict(v)} className="sr-only" />
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                        verdict === v ? "border-current" : "border-slate-300 dark:border-slate-600",
                      )}>
                        {verdict === v && <div className={cn("w-1.5 h-1.5 rounded-full", dotCls)} />}
                      </div>
                      <span className={cn("text-xs font-semibold", verdict === v ? textCls : "text-slate-600 dark:text-slate-300")}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>

                {(verdict === "revise" || verdict === "reject") && (
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder={verdict === "revise" ? "Nội dung cần chỉnh sửa..." : "Lý do từ chối..."}
                    className="w-full mt-2 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  />
                )}
                {verdict === "revise" && (
                  <div className="mt-2">
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Thời hạn nộp lại (tuỳ chọn)</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    {dueDate && (
                      <p className="text-[10px] text-amber-500 mt-1">Quá hạn này chưa nộp lại, đề tài sẽ tự động bị từ chối.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 space-y-2">
              {isSelfAuthored && (
                <p className="text-[11px] text-red-600 dark:text-red-400 flex items-start gap-1.5 bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  Bạn là tác giả/đồng tác giả của đề tài này — không thể tự kiểm tra, tiếp nhận.
                </p>
              )}
              {!isSelfAuthored && verdict === "accept" && !allChecked && (
                <p className="text-[11px] text-amber-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Tích đủ {CHECKLIST.length} tiêu chí
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  Huỷ
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold rounded-xl text-white transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed",
                    verdict === "accept" ? "bg-teal-600 hover:bg-teal-700"
                    : verdict === "revise" ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-red-600 hover:bg-red-700",
                  )}
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {verdict === "accept" ? "Tiếp nhận"
                  : verdict === "revise" ? "Gửi chỉnh sửa"
                  : verdict === "reject" ? "Từ chối"
                  : "Gửi kết quả"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
