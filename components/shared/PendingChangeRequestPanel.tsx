"use client";

import { useState } from "react";
import { AlertCircle, Check, X, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { RecordChangeRequest } from "@/types";

interface PendingChangeRequestPanelProps {
  /** Bản ghi hiện tại (topic/trial) — dùng để hiển thị giá trị "trước" khi so sánh với đề xuất. */
  currentRecord: Record<string, unknown>;
  pendingChangeRequest?: RecordChangeRequest;
  /** Người đang xem có quyền duyệt (thường: canManage hoặc trưởng nhóm cùng đơn vị). */
  canReview: boolean;
  /** Người đang xem chính là người gửi yêu cầu. */
  isRequester: boolean;
  approveUrl: string;
  rejectUrl: string;
  onChanged: () => void;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : `${v.length} mục`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function PendingChangeRequestPanel({
  currentRecord,
  pendingChangeRequest,
  canReview,
  isRequester,
  approveUrl,
  rejectUrl,
  onChanged,
}: PendingChangeRequestPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  if (!pendingChangeRequest) return null;

  if (pendingChangeRequest.status === "rejected") {
    if (!isRequester) return null;
    return (
      <div className="mb-4 flex items-start gap-3 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 rounded-xl px-4 py-3">
        <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <div className="text-sm text-red-700 dark:text-red-400">
          <p className="font-medium">
            Yêu cầu {pendingChangeRequest.type === "edit" ? "sửa" : "xoá"} đã bị từ chối
          </p>
          {pendingChangeRequest.rejectionReason && (
            <p className="mt-0.5">Lý do: {pendingChangeRequest.rejectionReason}</p>
          )}
        </div>
      </div>
    );
  }

  if (pendingChangeRequest.status !== "pending") return null;

  async function handleApprove() {
    setProcessing(true);
    try {
      const res = await fetch(approveUrl, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Đã duyệt yêu cầu");
      onChanged();
    } catch {
      toast.error("Lỗi khi duyệt yêu cầu");
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch(rejectUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Đã từ chối yêu cầu");
      setShowRejectBox(false);
      setRejectionReason("");
      onChanged();
    } catch {
      toast.error("Lỗi khi từ chối yêu cầu");
    } finally {
      setProcessing(false);
    }
  }

  const proposedEntries = Object.entries(pendingChangeRequest.proposedChanges ?? {});

  return (
    <div className="mb-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">
          {isRequester
            ? `Yêu cầu ${pendingChangeRequest.type === "edit" ? "sửa" : "xoá"} của bạn đang chờ trưởng nhóm duyệt.`
            : `${pendingChangeRequest.requestedBy} đề nghị ${pendingChangeRequest.type === "edit" ? "sửa" : "xoá"} bản ghi này.`}
        </p>
        {(proposedEntries.length > 0 || pendingChangeRequest.reason) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline shrink-0"
          >
            {expanded ? "Ẩn" : "Xem chi tiết"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-2">
          {pendingChangeRequest.type === "edit" && proposedEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {proposedEntries.map(([key, newVal]) => (
                <div key={key}>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{key}</p>
                  <p className="text-slate-400 dark:text-slate-500 line-through text-xs">
                    {formatValue(currentRecord?.[key])}
                  </p>
                  <p className="font-medium text-slate-800 dark:text-white">{formatValue(newVal)}</p>
                </div>
              ))}
            </div>
          )}
          {pendingChangeRequest.type === "delete" && pendingChangeRequest.reason && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Lý do xin xoá</p>
              <p className="text-slate-700 dark:text-slate-200">{pendingChangeRequest.reason}</p>
            </div>
          )}
        </div>
      )}

      {canReview && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleApprove}
            disabled={processing}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-xs font-medium transition"
          >
            {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Đồng ý
          </button>
          <button
            onClick={() => setShowRejectBox(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs font-medium transition"
          >
            <X className="w-3 h-3" />
            Từ chối
          </button>
        </div>
      )}

      {showRejectBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" /> Lý do từ chối yêu cầu
            </h3>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Nhập lý do từ chối..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRejectBox(false); setRejectionReason(""); }}
                className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Huỷ
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processing}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Từ chối"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
