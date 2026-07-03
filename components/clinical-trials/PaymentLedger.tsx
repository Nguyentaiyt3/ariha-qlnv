"use client";

import { useState } from "react";
import { ChevronDown, FileText, DollarSign, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicalTrialPayment } from "@/types";

interface PaymentLedgerProps {
  payments?: ClinicalTrialPayment[];
}

function formatCurrency(value?: number) {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

function SplitBadge({ label, percentage }: { label: string; percentage?: number }) {
  if (percentage === undefined || percentage === 0) return null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-slate-700 dark:text-slate-300">{percentage}%</span>
    </div>
  );
}

function PaymentRow({ payment, isExpanded, onToggle }: { payment: ClinicalTrialPayment; isExpanded: boolean; onToggle: () => void }) {
  const hasSplits = payment.splitAriha || payment.splitDepartment || payment.splitSubUnit1 || payment.splitSubUnit2 || payment.splitFinance || payment.splitPharmacy;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
      >
        <div className="flex-1 text-left">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-semibold text-slate-800 dark:text-white">
              {payment.paymentName || `Thanh toán ${payment.batchNo || "1"}`}
            </span>
            {payment.received ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                <CheckCircle2 className="w-3 h-3" /> Đã nhận
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                <Clock className="w-3 h-3" /> Chờ nhận
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            {payment.date && <span>{new Date(payment.date).toLocaleDateString("vi-VN")}</span>}
            <span className="font-semibold text-slate-800 dark:text-white">{formatCurrency(payment.totalAmount)}</span>
          </div>
        </div>
        <ChevronDown
          className={cn("w-5 h-5 text-slate-400 transition-transform", isExpanded && "rotate-180")}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 space-y-4">
          {/* Cost Splitting */}
          {hasSplits && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Phân chia chi phí</h4>
              <div className="grid grid-cols-2 gap-2">
                <SplitBadge label="ARiHA" percentage={payment.splitAriha} />
                <SplitBadge label="Khoa chủ trì" percentage={payment.splitDepartment} />
                <SplitBadge label="Đơn vị phụ 1" percentage={payment.splitSubUnit1} />
                <SplitBadge label="Đơn vị phụ 2" percentage={payment.splitSubUnit2} />
                <SplitBadge label="Tài chính" percentage={payment.splitFinance} />
                <SplitBadge label="Dược" percentage={payment.splitPharmacy} />
              </div>
            </div>
          )}

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

export function PaymentLedger({ payments }: PaymentLedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        Chưa có bản ghi thanh toán
      </div>
    );
  }

  const totalAmount = payments.reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
  const receivedAmount = payments
    .filter((p) => p.received)
    .reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
  const pendingAmount = totalAmount - receivedAmount;

  // Sort by date descending
  const sortedPayments = [...payments].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-3">
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Tổng cộng</p>
          <p className="font-bold text-slate-800 dark:text-white text-base">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 p-3">
          <p className="text-xs text-green-700 dark:text-green-400 mb-1">Đã nhận</p>
          <p className="font-bold text-green-700 dark:text-green-300 text-base">{formatCurrency(receivedAmount)}</p>
        </div>
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">Chờ nhận</p>
          <p className="font-bold text-amber-700 dark:text-amber-300 text-base">{formatCurrency(pendingAmount)}</p>
        </div>
      </div>

      {/* Payment Rows */}
      <div className="space-y-2">
        {sortedPayments.map((payment) => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            isExpanded={expandedId === payment.id}
            onToggle={() => setExpandedId(expandedId === payment.id ? null : payment.id)}
          />
        ))}
      </div>
    </div>
  );
}
