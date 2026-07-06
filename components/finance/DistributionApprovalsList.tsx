"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import type { ClinicalTrialPayment } from "@/types";

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

type PaymentWithTrial = ClinicalTrialPayment & {
  trialId: string;
  trialCode: string;
  trialName: string;
};

interface DistributionApprovalsListProps {
  onApproved?: () => void;
}

export function DistributionApprovalsList({ onApproved }: DistributionApprovalsListProps) {
  const { currentUser } = useAuthStore();
  const [payments, setPayments] = useState<PaymentWithTrial[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {
    setLoading(true);
    try {
      const response = await fetch(
        "/api/clinical-trials/payments/approvals?distributionStatus=submitted_for_approval"
      );
      if (!response.ok) throw new Error("Failed to load");
      const data = await response.json();
      setPayments(data);
    } catch (error) {
      toast.error("Lỗi khi tải danh sách chờ duyệt bàn giao");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(payment: PaymentWithTrial) {
    setApprovingId(payment.id);
    try {
      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/approve-distribution`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedBy: currentUser?.name,
            approvedByUserId: currentUser?.id,
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to approve");
      }
      toast.success("Đã duyệt hoàn tất bàn giao");
      setPayments((prev) => prev.filter((p) => p.id !== payment.id));
      onApproved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi duyệt");
      console.error(error);
    } finally {
      setApprovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (payments.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-white flex items-center gap-2">
        <Send className="w-4 h-4 text-blue-500" />
        Chờ duyệt hoàn tất bàn giao ({payments.length})
      </h3>

      <div className="space-y-3">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 bg-white dark:bg-slate-900"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white text-sm">
                  {payment.trialCode} — {payment.paymentName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {payment.submitterName} · Thực lĩnh: {vnd(payment.handoverSelection?.netAmount || 0)}
                </p>
              </div>
              <button
                onClick={() => handleApprove(payment)}
                disabled={approvingId === payment.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold transition"
              >
                {approvingId === payment.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Duyệt hoàn tất
              </button>
            </div>

            <div className="space-y-1.5">
              {(payment.handoverDistributions || []).map((d) => (
                <div
                  key={d.costItemId}
                  className="flex items-center justify-between px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-200">{d.unit}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800 dark:text-white">{vnd(d.amount)}</span>
                    {d.documentUrl && (
                      <a
                        href={d.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" /> Biên bản
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
