"use client";

import { useState } from "react";
import { X, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { calculateCostItemAmount } from "@/lib/utils/costCalculator";
import type { ClinicalTrialPayment, CostItem } from "@/types";

interface HandoverFormModalProps {
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

export function HandoverFormModal({
  isOpen,
  onClose,
  payment,
  trialCode,
  onSuccess,
}: HandoverFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [actualAmount, setActualAmount] = useState<number>(
    payment.settlement?.actualReceivedAmount || payment.totalAmount || 0
  );

  // Use new costItems if available, otherwise fall back to legacy splits
  const useCostItems = payment.costItems && payment.costItems.length > 0;
  const isPercentage = payment.splitMode === "percentage";

  function getCostItemsForHandover(): Array<{
    id: string;
    name: string;
    unit?: string;
    amount: number;
  }> {
    if (!useCostItems || !payment.costItems) return [];

    return payment.costItems.map((item: CostItem) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      amount: calculateCostItemAmount(item, actualAmount),
    }));
  }

  function getLegacySplits() {
    if (isPercentage) {
      return {
        ariha: (actualAmount * (payment.splitAriha || 0)) / 100,
        department: (actualAmount * (payment.splitDepartment || 0)) / 100,
        subUnit1: (actualAmount * (payment.splitSubUnit1 || 0)) / 100,
        subUnit2: (actualAmount * (payment.splitSubUnit2 || 0)) / 100,
        finance: (actualAmount * (payment.splitFinance || 0)) / 100,
        pharmacy: (actualAmount * (payment.splitPharmacy || 0)) / 100,
      };
    }
    const ratio = (payment.totalAmount || 1) / (actualAmount || 1);
    return {
      ariha: (payment.splitAriha || 0) / ratio,
      department: (payment.splitDepartment || 0) / ratio,
      subUnit1: (payment.splitSubUnit1 || 0) / ratio,
      subUnit2: (payment.splitSubUnit2 || 0) / ratio,
      finance: (payment.splitFinance || 0) / ratio,
      pharmacy: (payment.splitPharmacy || 0) / ratio,
    };
  }

  const costItemsForHandover = getCostItemsForHandover();
  const splits = useCostItems ? null : getLegacySplits();
  const total = useCostItems
    ? costItemsForHandover.reduce((sum, item) => sum + item.amount, 0)
    : Object.values(splits || {}).reduce((a, b) => a + b, 0);

  async function handleSubmit() {
    if (!actualAmount || actualAmount <= 0) {
      toast.error("Vui lòng nhập số tiền thực lĩnh");
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        actualReceivedAmount: actualAmount,
      };

      if (useCostItems) {
        payload.costItems = costItemsForHandover;
      } else {
        payload.splits = splits;
      }

      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/create-handover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error("Failed to create handover");
      toast.success("Đã lập biên bản bàn giao");
      onClose();
      onSuccess();
    } catch (error) {
      toast.error("Lỗi khi lập biên bản");
      console.error(error);
    } finally {
      setLoading(false);
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
              Lập biên bản bàn giao thanh toán
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Payment Info */}
        <div className="space-y-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Mã TNLS</p>
              <p className="font-medium text-slate-700 dark:text-white">
                {trialCode}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">
                Tên thanh toán
              </p>
              <p className="font-medium text-slate-700 dark:text-white">
                {payment.paymentName}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">
                Số tiền đề xuất
              </p>
              <p className="font-medium text-slate-700 dark:text-white">
                {vnd(payment.totalAmount || 0)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Ngày</p>
              <p className="font-medium text-slate-700 dark:text-white">
                {new Date(payment.date || "").toLocaleDateString("vi-VN")}
              </p>
            </div>
          </div>
        </div>

        {/* Actual Amount Input */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Số tiền thực lĩnh <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={actualAmount}
              onChange={(e) => setActualAmount(Number(e.target.value) || 0)}
              placeholder="Nhập số tiền thực tế nhận được"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 py-2 px-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
              {vnd(actualAmount)}
            </div>
          </div>
          {actualAmount !== (payment.totalAmount || 0) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Khác {vnd(payment.totalAmount || 0)} — Tài chính giữ lại{" "}
              {vnd(Math.abs((payment.totalAmount || 0) - actualAmount))}
            </p>
          )}
        </div>

        {/* Cost Split Preview */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Phân chia chi phí
          </h4>
          <div className="space-y-2">
            {useCostItems ? (
              <>
                {costItemsForHandover.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm"
                  >
                    <div>
                      <p className="text-slate-600 dark:text-slate-400">{item.name}</p>
                      {item.unit && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          → {item.unit}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-white">
                      {vnd(item.amount)}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <>
                {payment.splitAriha !== undefined && payment.splitAriha > 0 && (
                  <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                    <span className="text-slate-600 dark:text-slate-400">
                      ARiHA
                      {isPercentage ? ` (${payment.splitAriha}%)` : ""}
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-white">
                      {vnd(splits?.ariha || 0)}
                    </span>
                  </div>
                )}
                {payment.splitDepartment !== undefined && payment.splitDepartment > 0 && (
                  <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                    <span className="text-slate-600 dark:text-slate-400">
                      Khoa chủ trì
                      {isPercentage ? ` (${payment.splitDepartment}%)` : ""}
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-white">
                      {vnd(splits?.department || 0)}
                    </span>
                  </div>
                )}
                {payment.splitFinance !== undefined && payment.splitFinance > 0 && (
                  <div className="flex justify-between items-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm border border-amber-200 dark:border-amber-800">
                    <span className="text-amber-700 dark:text-amber-300">
                      Tài chính (có thể giữ lại)
                      {isPercentage ? ` (${payment.splitFinance}%)` : ""}
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      {vnd(splits?.finance || 0)}
                    </span>
                  </div>
                )}
                {payment.splitPharmacy !== undefined && payment.splitPharmacy > 0 && (
                  <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                    <span className="text-slate-600 dark:text-slate-400">
                      Khoa Dược
                      {isPercentage ? ` (${payment.splitPharmacy}%)` : ""}
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-white">
                      {vnd(splits?.pharmacy || 0)}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <span className="font-semibold text-blue-700 dark:text-blue-300">
                Tổng cộng
              </span>
              <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                {vnd(total)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Huỷ
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !actualAmount}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Lập biên bản
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
