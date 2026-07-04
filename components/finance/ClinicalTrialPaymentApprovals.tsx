"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Check, AlertCircle, Loader2, MessageSquare, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { EditDeleteRequestsList } from "./EditDeleteRequestsList";
import { HandoverFormModal } from "./HandoverFormModal";
import type { ClinicalTrialPayment } from "@/types";

interface ClinicalTrialPaymentApprovalsProps {
  approverUserId: string;
  approverName: string;
  approverRole?: string;
  canApprove?: boolean;
  onEditPayment?: (payment: ClinicalTrialPayment & { trialId: string; trialCode: string; trialName: string }) => void;
}

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

export function ClinicalTrialPaymentApprovals({
  approverUserId,
  approverName,
  approverRole,
  canApprove = true,
  onEditPayment,
}: ClinicalTrialPaymentApprovalsProps) {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const [payments, setPayments] = useState<(ClinicalTrialPayment & {
    trialId: string
    trialCode: string
    trialName: string
    principalInvestigatorName?: string
  })[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [showNoteModal, setShowNoteModal] = useState<string | null>(null);
  const [handoverPayment, setHandoverPayment] = useState<(ClinicalTrialPayment & {
    trialId: string;
    trialCode: string;
    trialName: string;
  }) | null>(null);

  useEffect(() => {
    loadPayments();
  }, [filter]);

  async function loadPayments() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/clinical-trials/payments/approvals?status=${filter}`,
        { method: "GET" }
      );
      if (!response.ok) throw new Error("Failed to load payments");
      const data = await response.json();
      setPayments(data);
    } catch (error) {
      toast.error("Lỗi khi tải danh sách thanh toán");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(payment: any) {
    setApprovingId(payment.id);
    try {
      const response = await fetch(`/api/clinical-trials/payments/${payment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedBy: approverName,
          approvedByUserId: approverUserId,
          approverRole,
        }),
      });
      if (!response.ok) throw new Error("Failed to approve");
      toast.success("Đã phê duyệt thanh toán");
      setPayments((prev) =>
        prev.map((p) =>
          p.id === payment.id
            ? { ...p, status: "approved" }
            : p
        )
      );
    } catch (error) {
      toast.error("Lỗi khi phê duyệt");
      console.error(error);
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return;

    setApprovingId(rejectTarget);
    try {
      const response = await fetch(
        `/api/clinical-trials/payments/${rejectTarget}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rejectionReason: rejectReason.trim(),
            rejectedBy: approverName,
            rejectedByUserId: approverUserId,
            rejectorRole: approverRole,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to reject");
      toast.success("Đã từ chối thanh toán");
      setPayments((prev) =>
        prev.map((p) =>
          p.id === rejectTarget
            ? { ...p, status: "rejected", note: rejectReason }
            : p
        )
      );
      setRejectTarget(null);
      setRejectReason("");
    } catch (error) {
      toast.error("Lỗi khi từ chối");
      console.error(error);
    } finally {
      setApprovingId(null);
    }
  }

  const filteredPayments = payments.filter((p) => {
    if (filter === "all") return true;
    if (filter === "pending") return p.status === "pending" || !p.status;
    return p.status === filter;
  });

  const pendingCount = payments.filter((p) => !p.status || p.status === "pending").length;
  const approvedCount = payments.filter((p) => p.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Edit/Delete Requests Section */}
      <EditDeleteRequestsList
        payments={payments}
        onSuccess={loadPayments}
      />

      {/* Header + Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-white flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Thanh toán thử nghiệm chờ phê duyệt
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {pendingCount} chờ duyệt · {approvedCount} đã duyệt
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg font-medium transition",
              filter === f
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
          >
            {f === "pending" && `Chờ duyệt (${pendingCount})`}
            {f === "approved" && `Đã duyệt (${approvedCount})`}
            {f === "rejected" && `Từ chối`}
            {f === "all" && `Tất cả`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <p className="text-sm text-slate-400">Không có thanh toán nào</p>
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Mã TNLS</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Tên thanh toán</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Người đề nghị</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Đơn vị tài khoản</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-400">Số tiền</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">Ghi chú</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400">Trạng thái</th>
                  {canApprove && <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400">Hành động</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    <td className="px-3 py-2.5 font-medium text-blue-600 dark:text-blue-400">
                      <button
                        onClick={() => onEditPayment?.(payment)}
                        className="hover:underline transition"
                        title="Xem chi tiết đề nghị"
                      >
                        {payment.trialCode}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {payment.paymentName || `Thanh toán ${payment.batchNo || "1"}`}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {approverName || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {currentUser?.department || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {vnd(payment.totalAmount || 0)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 max-w-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowNoteModal(payment.id);
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                        title={payment.note || "Không có ghi chú"}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {payment.note ? "Xem" : "—"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {payment.status === "approved" && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          ✓ Đã duyệt
                        </span>
                      )}
                      {payment.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                          ✗ Từ chối
                        </span>
                      )}
                      {(!payment.status || payment.status === "pending") && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          ⏳ Chờ duyệt
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-center space-x-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canApprove && (!payment.status || payment.status === "pending") && (
                        <>
                          <button
                            onClick={() => handleApprove(payment)}
                            disabled={approvingId === payment.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-xs font-medium transition"
                            title="Phê duyệt"
                          >
                            {approvingId === payment.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Duyệt
                          </button>
                          <button
                            onClick={() => setRejectTarget(payment.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs font-medium transition"
                            title="Từ chối"
                          >
                            <X className="w-3 h-3" />
                            Từ chối
                          </button>
                        </>
                      )}
                      {payment.status === "approved" && currentUser?.id === payment.submitterId && (
                        <button
                          onClick={() => setHandoverPayment(payment)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition"
                          title="Lập biên bản bàn giao"
                        >
                          <FileText className="w-3 h-3" />
                          Biên bản
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-white">Ghi chú</h3>
            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg min-h-20 text-sm text-slate-600 dark:text-slate-300">
              {payments.find((p) => p.id === showNoteModal)?.note || "Không có ghi chú"}
            </div>
            <button
              onClick={() => setShowNoteModal(null)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-white">Lý do từ chối</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Huỷ
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || approvingId === rejectTarget}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition"
              >
                {approvingId === rejectTarget ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Từ chối"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover Form Modal */}
      {handoverPayment && (
        <HandoverFormModal
          isOpen={!!handoverPayment}
          onClose={() => setHandoverPayment(null)}
          payment={handoverPayment}
          trialCode={handoverPayment.trialCode}
          onSuccess={() => {
            loadPayments();
            setHandoverPayment(null);
          }}
        />
      )}
    </div>
  );
}
