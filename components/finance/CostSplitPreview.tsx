"use client";

import type { CostItem } from "@/types";
import { calculateCostItemAmount } from "@/lib/utils/costCalculator";

interface CostSplitPreviewProps {
  items: CostItem[];
  totalAmount: number;
  mode?: "percentage" | "amount";
}

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);

export function CostSplitPreview({ items, totalAmount, mode = "percentage" }: CostSplitPreviewProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-4 text-slate-400 text-xs">
        Chưa có khoản chi phí
      </div>
    );
  }

  const totalDisbursed = items.reduce(
    (sum, item) => sum + calculateCostItemAmount(item, totalAmount),
    0
  );

  const remaining = totalAmount - totalDisbursed;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        Phân chia chi phí
      </h4>

      <div className="space-y-2">
        {items.map((item) => {
          const amount = calculateCostItemAmount(item, totalAmount);
          const percentage = (amount / totalAmount) * 100;

          return (
            <div
              key={item.id}
              className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {item.name}
                  </p>
                  {item.unit && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      → {item.unit}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-800 dark:text-white">
                    {vnd(amount)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {percentage.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-slate-600 dark:text-slate-400">Đã phân chia</p>
            <p className="font-semibold text-slate-800 dark:text-white">
              {vnd(totalDisbursed)}
            </p>
          </div>

          <div>
            <p className="text-slate-600 dark:text-slate-400">Còn lại</p>
            <p
              className={`font-semibold ${
                remaining > 0
                  ? "text-orange-700 dark:text-orange-400"
                  : "text-green-700 dark:text-green-400"
              }`}
            >
              {vnd(Math.abs(remaining))}
            </p>
          </div>

          <div>
            <p className="text-slate-600 dark:text-slate-400">Tổng</p>
            <p className="font-semibold text-slate-800 dark:text-white">
              {vnd(totalAmount)}
            </p>
          </div>
        </div>

        {remaining > 0.01 && (
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
            ⚠️ Còn {vnd(remaining)} chưa được phân chia
          </p>
        )}

        {remaining < -0.01 && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            ⚠️ Vượt quá {vnd(Math.abs(remaining))}
          </p>
        )}
      </div>
    </div>
  );
}
