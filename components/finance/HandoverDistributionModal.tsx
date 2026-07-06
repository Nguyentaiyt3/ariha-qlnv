"use client";

import { useState } from "react";
import { X, Loader2, FileText, Upload, CheckCircle2, Send, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deriveHandoverDistributions } from "@/lib/utils/costCalculator";
import { useAuthStore } from "@/stores/useAuthStore";
import type { ClinicalTrialPayment, HandoverDistribution } from "@/types";

interface HandoverDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: ClinicalTrialPayment;
  trialCode: string;
  onSuccess: () => void;
}

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);

export function HandoverDistributionModal({
  isOpen,
  onClose,
  payment,
  trialCode,
  onSuccess,
}: HandoverDistributionModalProps) {
  const { currentUser } = useAuthStore();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const distributions: HandoverDistribution[] =
    payment.handoverDistributions && payment.handoverDistributions.length > 0
      ? payment.handoverDistributions
      : deriveHandoverDistributions(payment);

  const allHandedOver =
    distributions.length > 0 && distributions.every((d) => d.status === "handed_over");
  const distributionStatus = payment.distributionStatus;
  const isReadOnly = distributionStatus === "submitted_for_approval" || distributionStatus === "approved";

  async function handleUpload(costItemId: string, file: File) {
    setUploadingId(costItemId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "handover-documents");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Lỗi khi upload file");
      }
      const { url, name } = await uploadRes.json();

      const updateRes = await fetch(
        `/api/clinical-trials/payments/${payment.id}/update-distribution`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            costItemId,
            documentUrl: url,
            documentName: name,
            handedOverBy: currentUser?.name,
          }),
        }
      );
      if (!updateRes.ok) {
        const err = await updateRes.json();
        throw new Error(err.error || "Lỗi khi cập nhật bàn giao");
      }

      toast.success("Đã lưu biên bản bàn giao");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi upload");
      console.error(error);
    } finally {
      setUploadingId(null);
    }
  }

  async function handleSubmitReport() {
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/submit-distribution-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submittedBy: currentUser?.name,
            submittedByUserId: currentUser?.id,
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Lỗi khi gửi báo cáo");
      }
      toast.success("Đã gửi báo cáo hoàn tất bàn giao cho quản lý");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi gửi báo cáo");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
              Bàn giao thanh toán cho đơn vị
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="text-sm text-slate-500 dark:text-slate-400">
          {trialCode} — {payment.paymentName}
        </div>

        {/* Status banners */}
        {distributionStatus === "submitted_for_approval" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Đã gửi báo cáo, đang chờ quản lý duyệt hoàn tất.
            </p>
          </div>
        )}
        {distributionStatus === "approved" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-300">
              Đã được quản lý duyệt hoàn tất. Số tiền Viện ARiHA đã ghi nhận vào phát sinh thu.
            </p>
          </div>
        )}

        {/* Distribution list */}
        <div className="space-y-2">
          {distributions.map((d) => {
            const isUploading = uploadingId === d.costItemId;
            const isDone = d.status === "handed_over";
            return (
              <div
                key={d.costItemId}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border",
                  isDone
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    {d.unit}
                  </p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {vnd(d.amount)}
                  </p>
                  {isDone && d.documentName && (
                    <a
                      href={d.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      📎 {d.documentName}
                    </a>
                  )}
                </div>

                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Đã bàn giao
                  </span>
                ) : isReadOnly ? (
                  <span className="text-xs text-slate-400 shrink-0">Chưa bàn giao</span>
                ) : (
                  <label
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium cursor-pointer transition shrink-0",
                      isUploading && "opacity-50 pointer-events-none"
                    )}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" /> Tải biên bản
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(d.costItemId, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        {!isReadOnly && (
          <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Đóng
            </button>
            <button
              onClick={handleSubmitReport}
              disabled={!allHandedOver || submitting}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Gửi báo cáo hoàn tất
                </>
              )}
            </button>
          </div>
        )}
        {isReadOnly && (
          <div className="flex pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
