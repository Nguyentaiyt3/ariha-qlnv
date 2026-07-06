"use client";

import { useState } from "react";
import { ChevronDown, FileText, DollarSign, CheckCircle2, Clock, Edit2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateClinicalTrial } from "@/lib/firebase/firestore";
import { calculateCostItemAmount } from "@/lib/utils/costCalculator";
import type { ClinicalTrialPayment } from "@/types";

interface PaymentLedgerProps {
  payments?: ClinicalTrialPayment[];
  trialId?: string;
  onEdit?: (payment: ClinicalTrialPayment) => void;
  onPaymentsChange?: (payments: ClinicalTrialPayment[]) => void;
  onOpenHandover?: (payment: ClinicalTrialPayment) => void;
  onOpenDistribution?: (payment: ClinicalTrialPayment) => void;
}

function formatCurrency(value?: number) {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

function PaymentRow({
  payment,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onOpenHandover,
  onOpenDistribution,
}: {
  payment: ClinicalTrialPayment
  isExpanded: boolean
  onToggle: () => void
  onEdit?: (payment: ClinicalTrialPayment) => void
  onDelete?: (paymentId: string) => void
  onOpenHandover?: (payment: ClinicalTrialPayment) => void
  onOpenDistribution?: (payment: ClinicalTrialPayment) => void
}) {
  const hasCostItems = payment.costItems && payment.costItems.length > 0;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group">
        <button
          onClick={onToggle}
          className="flex-1 text-left flex items-center gap-2"
        >
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className="font-semibold text-slate-800 dark:text-white">
                {payment.paymentName || `Thanh toán ${payment.batchNo || "1"}`}
              </span>
              {payment.received ? (
                <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Đã nhận
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold">
                  <Clock className="w-4 h-4" /> Chờ nhận
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              {payment.date && <span>{new Date(payment.date).toLocaleDateString("vi-VN")}</span>}
              <span className="font-semibold text-slate-800 dark:text-white">{formatCurrency(payment.totalAmount)}</span>
            </div>
          </div>
          <ChevronDown
            className={cn("w-5 h-5 text-slate-400 transition-transform shrink-0 ml-2", isExpanded && "rotate-180")}
          />
        </button>
        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition">
          {payment.status === "approved" && onOpenHandover && (
            <button
              onClick={() => onOpenHandover(payment)}
              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition"
              title="Lập biên bản bàn giao"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {payment.handoverSelection && onOpenDistribution && (
            <button
              onClick={() => onOpenDistribution(payment)}
              className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 transition"
              title="Bàn giao cho đơn vị"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(payment)}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition"
              title="Sửa"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(payment.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition"
              title="Xoá"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 space-y-4">
          {/* Cost Items (New Model) with Selection Coloring */}
          {hasCostItems && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Phân chia chi phí</h4>
              <div className="space-y-1.5">
                {payment.costItems?.map((item) => {
                  const amount = calculateCostItemAmount(item, payment.totalAmount || 0);
                  const percentage = payment.totalAmount ? ((amount / payment.totalAmount) * 100).toFixed(1) : "0";
                  const isSelected = payment.handoverSelection?.selectedCostItemIds?.includes(item.id) ?? true;
                  const bgClass = isSelected
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
                  const textColor = isSelected
                    ? "text-green-700 dark:text-green-300"
                    : "text-amber-700 dark:text-amber-300";
                  return (
                    <div key={item.id} className={`flex items-center justify-between px-3 py-2 rounded border ${bgClass}`}>
                      <div className="flex-1">
                        <p className="text-slate-800 dark:text-slate-200 font-semibold text-sm">{item.name}</p>
                        {item.unit && (
                          <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">→ {item.unit}</p>
                        )}
                        {!isSelected && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠ Bị giữ lại (không nhận)</p>
                        )}
                      </div>
                      <div className="flex items-center gap-6 ml-4">
                        <div className="text-center">
                          <p className="text-xs text-slate-600 dark:text-slate-400">Tỷ lệ</p>
                          <p className={`text-lg font-bold ${textColor}`}>{percentage}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-600 dark:text-slate-400">Số tiền</p>
                          <p className={`text-lg font-bold ${textColor}`}>
                            {new Intl.NumberFormat("vi-VN", {
                              style: "currency",
                              currency: "VND",
                              maximumFractionDigits: 0,
                            }).format(amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Handover Distribution Status */}
          {payment.handoverDistributions && payment.handoverDistributions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Bàn giao cho đơn vị</h4>
                {payment.distributionStatus === "submitted_for_approval" && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">Chờ duyệt</span>
                )}
                {payment.distributionStatus === "approved" && (
                  <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">Đã duyệt hoàn tất</span>
                )}
              </div>
              <div className="space-y-1.5">
                {payment.handoverDistributions.map((d) => (
                  <div key={d.costItemId} className="flex items-center justify-between px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{d.unit}</p>
                      {d.documentName && (
                        <a href={d.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          📎 {d.documentName}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{formatCurrency(d.amount)}</span>
                      {d.status === "handed_over" ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Đã bàn giao
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Chưa bàn giao</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Proposer Details */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Thông tin đề nghị</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {payment.submitterName && (
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-xs mb-0.5">Người đề nghị</p>
                  <p className="text-slate-800 dark:text-white font-semibold">{payment.submitterName}</p>
                </div>
              )}
              {payment.submitterUnitName && (
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-xs mb-0.5">Đơn vị</p>
                  <p className="text-slate-800 dark:text-white font-semibold">{payment.submitterUnitName}</p>
                </div>
              )}
              {payment.submitterRole && (
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-xs mb-0.5">Chức vụ</p>
                  <p className="text-slate-800 dark:text-white font-semibold">{payment.submitterRole}</p>
                </div>
              )}
              {payment.approvedByUserId && (
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-xs mb-0.5">Người phê duyệt</p>
                  <p className="text-slate-800 dark:text-white font-semibold">{payment.approvedBy || "—"}</p>
                </div>
              )}
              {payment.approverPosition && (
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-xs mb-0.5">Chức vụ (phê duyệt)</p>
                  <p className="text-slate-800 dark:text-white font-semibold">{payment.approverPosition}</p>
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          {(payment.proposalFileUrl || payment.paymentAdviceFileUrl) && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Tài liệu</h4>
              <div className="space-y-1.5">
                {payment.proposalFileUrl && (
                  <a
                    href={payment.proposalFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                  >
                    <FileText className="w-3.5 h-3.5" /> Tờ trình
                  </a>
                )}
                {payment.paymentAdviceFileUrl && (
                  <a
                    href={payment.paymentAdviceFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                  >
                    <FileText className="w-3.5 h-3.5" /> Ủy nhiệm chi
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Note */}
          {payment.note && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Ghi chú</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">{payment.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PaymentLedger({ payments, trialId, onEdit, onPaymentsChange, onOpenHandover, onOpenDistribution }: PaymentLedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        Chưa có bản ghi thanh toán
      </div>
    );
  }

  async function handleDelete(paymentId: string) {
    if (!trialId || !payments) {
      toast.error("Không thể xoá thanh toán");
      return;
    }

    setDeleting(true);
    try {
      const updatedPayments = payments.filter(p => p.id !== paymentId);
      await updateClinicalTrial(trialId, { payments: updatedPayments });
      toast.success("Đã xoá thanh toán");
      onPaymentsChange?.(updatedPayments);
      setDeleteConfirm(null);
    } catch (error) {
      toast.error("Lỗi khi xoá thanh toán");
      console.error(error);
    } finally {
      setDeleting(false);
    }
  }

  const totalAmount = payments.reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
  const receivedAmount = payments.reduce((sum, p) => sum + (p.handoverSelection?.netAmount ?? 0), 0);
  const pendingAmount = totalAmount - receivedAmount;
  const handedOverAmount = payments.reduce(
    (sum, p) =>
      sum +
      (p.handoverDistributions || [])
        .filter((d) => d.status === "handed_over")
        .reduce((s, d) => s + d.amount, 0),
    0
  );

  // Sort by date descending
  const sortedPayments = [...payments].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-3">
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Tổng cộng</p>
          <p className="font-bold text-slate-800 dark:text-white text-base">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 p-3">
          <p className="text-xs text-green-700 dark:text-green-400 mb-1">Đã nhận</p>
          <p className="font-bold text-green-700 dark:text-green-300 text-base">{formatCurrency(receivedAmount)}</p>
        </div>
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">Số tiền Tài chính giữ lại</p>
          <p className="font-bold text-amber-700 dark:text-amber-300 text-base">{formatCurrency(pendingAmount)}</p>
        </div>
        <div className="rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-900/20 p-3">
          <p className="text-xs text-purple-700 dark:text-purple-400 mb-1">Đã bàn giao</p>
          <p className="font-bold text-purple-700 dark:text-purple-300 text-base">{formatCurrency(handedOverAmount)}</p>
        </div>
      </div>

      {/* Payment Rows */}
      <div className="space-y-2">
        {sortedPayments.map((payment) => (
          <div key={payment.id}>
            <PaymentRow
              payment={payment}
              isExpanded={expandedId === payment.id}
              onToggle={() => setExpandedId(expandedId === payment.id ? null : payment.id)}
              onEdit={onEdit}
              onDelete={() => setDeleteConfirm(payment.id)}
              onOpenHandover={onOpenHandover}
              onOpenDistribution={onOpenDistribution}
            />
            {/* Delete Confirmation */}
            {deleteConfirm === payment.id && (
              <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200 mb-2">Bạn chắc chắn muốn xoá thanh toán này?</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    Huỷ
                  </button>
                  <button
                    onClick={() => handleDelete(payment.id)}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition"
                  >
                    {deleting ? "Đang xoá..." : "Xoá"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
