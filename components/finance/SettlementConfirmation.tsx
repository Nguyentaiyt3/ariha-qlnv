"use client";

import { useState, useRef } from "react";
import { Check, Upload, FileText, Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import type { ClinicalTrialPayment, SettlementConfirmation } from "@/types";

interface SettlementConfirmationProps {
  payment: ClinicalTrialPayment;
  trialId: string;
  onSettlementUpdated?: () => void;
}

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: () => void;
  loading: boolean;
  note: string;
  onNoteChange: (note: string) => void;
}

function VerificationModal({
  isOpen,
  onClose,
  onVerify,
  loading,
  note,
  onNoteChange,
}: VerificationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-white">
            Kiểm duyệt quyết toán
          </h3>
          <button onClick={onClose} className="p-1">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Ghi chú kiểm duyệt (tùy chọn)
            </span>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Nhập ghi chú về chứng từ và kết quả kiểm duyệt..."
              rows={3}
              className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Huỷ
          </button>
          <button
            onClick={onVerify}
            disabled={loading}
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              "Xác nhận"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettlementConfirmationUI({
  payment,
  trialId,
  onSettlementUpdated,
}: SettlementConfirmationProps) {
  const { currentUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const settlement = payment.settlement;
  const isFinancialApprover = ["director", "teamLead", "financeSupervisor"].includes(
    currentUser?.role || ""
  );
  const isDepartmentHead = currentUser?.id === payment.submitterDepartmentHeadId;
  const isSubmitterManager =
    payment.submitterId === currentUser?.id &&
    ["director", "teamLead"].includes(payment.submitterRole || "");
  const isApprover = isFinancialApprover || isDepartmentHead || isSubmitterManager;
  const isSubmitter = payment.submitterId === currentUser?.id;
  const isApprovalPhase = payment.status === "approved";

  async function handleConfirmReceipt() {
    if (!isApprover) {
      toast.error("Chỉ trưởng đơn vị mới có thể xác nhận");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/confirm-receipt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmedBy: currentUser?.name,
            confirmedByUserId: currentUser?.id,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to confirm");
      toast.success("Đã xác nhận nhận tiền");
      onSettlementUpdated?.();
    } catch (error) {
      toast.error("Lỗi khi xác nhận");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadHandover(file: File) {
    setLoading(true);
    try {
      // In a real app, upload file to storage (Firebase, S3, etc.)
      // For now, use a placeholder URL
      const handoverUrl = `https://storage.example.com/handover/${payment.id}/${file.name}`;

      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/submit-handover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submittedBy: currentUser?.name,
            submittedByUserId: currentUser?.id,
            handoverDocumentUrl: handoverUrl,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to submit");
      toast.success("Đã gửi biên bản giao nhận");
      onSettlementUpdated?.();
    } catch (error) {
      toast.error("Lỗi khi gửi biên bản");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySettlement() {
    if (!isApprover) {
      toast.error("Chỉ trưởng đơn vị mới có thể kiểm duyệt");
      return;
    }

    setVerifying(true);
    try {
      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/verify-settlement`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verifiedBy: currentUser?.name,
            verifiedByUserId: currentUser?.id,
            verificationNote: verificationNote.trim(),
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to verify");
      toast.success("Đã kiểm duyệt quyết toán thành công");
      setShowVerifyModal(false);
      setVerificationNote("");
      onSettlementUpdated?.();
    } catch (error) {
      toast.error("Lỗi khi kiểm duyệt");
      console.error(error);
    } finally {
      setVerifying(false);
    }
  }

  // Not approved yet
  if (!isApprovalPhase) {
    return null;
  }

  // Already verified
  if (settlement?.status === "verified") {
    return (
      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-medium text-green-700 dark:text-green-300">
              ✓ Quyết toán đã được xác nhận
            </p>
            <p className="text-sm text-green-600 dark:text-green-400">
              Phương thức: {settlement.confirmationType === "app" ? "Xác nhận qua app" : "Biên bản giao nhận"}
            </p>
            {settlement.verificationNote && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Ghi chú: {settlement.verificationNote}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Confirmed but not verified
  if (settlement?.status === "confirmed") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-300">
                Đã xác nhận nhận thanh toán
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                {settlement.confirmedBy} xác nhận lúc{" "}
                {new Date(settlement.confirmedAt!).toLocaleString("vi-VN")}
              </p>
              {settlement.handoverDocumentUrl && (
                <a
                  href={settlement.handoverDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  Xem biên bản giao nhận
                </a>
              )}
            </div>
          </div>
        </div>

        {isApprover && (
          <button
            onClick={() => setShowVerifyModal(true)}
            className="w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition"
          >
            Kiểm duyệt quyết toán
          </button>
        )}
      </div>
    );
  }

  // Pending confirmation
  return (
    <div className="space-y-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
      <p className="font-medium text-amber-700 dark:text-amber-300">
        Chọn phương thức xác nhận thanh toán
      </p>


      <div className="grid grid-cols-2 gap-3">
        {/* Option 1: App Confirmation */}
        {isApprover && (
          <button
            onClick={handleConfirmReceipt}
            disabled={loading}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition",
              loading
                ? "border-slate-300 dark:border-slate-600 opacity-50"
                : "border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            )}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            ) : (
              <Check className="w-5 h-5 text-blue-600" />
            )}
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Xác nhận trên app
            </span>
          </button>
        )}

        {/* Option 2: Document Upload */}
        {isSubmitter && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition",
              loading
                ? "border-slate-300 dark:border-slate-600 opacity-50"
                : "border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"
            )}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-green-600" />
            ) : (
              <Upload className="w-5 h-5 text-green-600" />
            )}
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Gửi biên bản
            </span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadHandover(file);
        }}
        className="hidden"
      />

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {isApprover && isSubmitter
          ? "Bạn có thể chọn một trong hai phương thức"
          : isApprover
          ? "Xác nhận rằng bạn đã nhận tiền từ tài khoản thanh toán"
          : "Gửi biên bản giao nhận khi trưởng đơn vị nhận tiền"}
      </p>

      <VerificationModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onVerify={handleVerifySettlement}
        loading={verifying}
        note={verificationNote}
        onNoteChange={setVerificationNote}
      />
    </div>
  );
}
