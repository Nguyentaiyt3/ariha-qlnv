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
  onSave?: () => void;
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
  onSave,
}: HandoverFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actualAmount, setActualAmount] = useState<number>(
    payment.settlement?.actualReceivedAmount || payment.totalAmount || 0
  );
  const [selectedCostItems, setSelectedCostItems] = useState<Record<string, boolean>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Initialize selected items from saved handover selection
  if (Object.keys(selectedCostItems).length === 0 && payment.costItems && payment.costItems.length > 0) {
    const initial: Record<string, boolean> = {};
    const selectedIds = payment.handoverSelection?.selectedCostItemIds || [];
    payment.costItems.forEach((item: CostItem) => {
      initial[item.id] = selectedIds.length > 0 ? selectedIds.includes(item.id) : true;
    });
    setSelectedCostItems(initial);
  }

  function getCostItemsForHandover(): Array<{
    id: string;
    name: string;
    unit?: string;
    amount: number;
  }> {
    if (!payment.costItems) return [];

    return payment.costItems.map((item: CostItem) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      amount: calculateCostItemAmount(item, actualAmount),
    }));
  }

  const costItemsForHandover = getCostItemsForHandover();

  // Calculate total only from SELECTED items
  const selectedTotal = costItemsForHandover
    .filter((item) => selectedCostItems[item.id] ?? true)
    .reduce((sum, item) => sum + item.amount, 0);

  async function handleSubmit() {
    if (!actualAmount || actualAmount <= 0) {
      toast.error("Vui lòng nhập số tiền thực lĩnh");
      return;
    }

    setLoading(true);
    try {
      // Get selected cost items
      const selectedItems = costItemsForHandover.filter(
        (item) => selectedCostItems[item.id] ?? true
      );

      const response = await fetch(
        `/api/clinical-trials/payments/${payment.id}/create-handover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actualReceivedAmount: actualAmount,
            selectedCostItemIds: selectedItems.map((item) => item.id),
            costItems: selectedItems,
            netAmount: selectedTotal,
          }),
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
              Xác nhận số tiền thực lĩnh
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


        {/* Cost Items - Read Only, reflecting saved selection */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Phân chia chi phí (đã lưu)
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2">
            {costItemsForHandover.map((item) => {
              const isSelected = selectedCostItems[item.id] ?? true;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    isSelected
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {item.name}
                    </p>
                    {item.unit && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        → {item.unit}
                      </p>
                    )}
                    {!isSelected && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        ⚠ Bị giữ lại (không nhận)
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isSelected
                          ? "text-green-700 dark:text-green-300"
                          : "text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {vnd(item.amount)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total Net Amount */}
        <div className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg border border-blue-300 dark:border-blue-800">
          <span className="text-base font-bold text-blue-800 dark:text-blue-300">
            Số tiền thực lĩnh
          </span>
          <span className="text-2xl font-bold text-green-700 dark:text-green-300">
            {vnd(payment.handoverSelection?.netAmount ?? selectedTotal)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
