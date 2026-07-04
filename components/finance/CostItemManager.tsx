"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";
import type { CostItem } from "@/types";
import { generateId } from "@/lib/utils";
import { calculateCostItemAmount, validateCostItems } from "@/lib/utils/costCalculator";

interface CostItemManagerProps {
  items: CostItem[];
  totalAmount: number;
  onChange: (items: CostItem[]) => void;
  mode?: "percentage" | "amount";
}

const DEFAULT_COST_TYPES = [
  "Chi phục vụ chuyên môn",
  "Chi hỗ trợ bệnh nhân",
  "Phí quản lý",
  "Thuế thu nhập doanh nghiệp",
];

export function CostItemManager({
  items,
  totalAmount,
  onChange,
  mode = "percentage",
}: CostItemManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<CostItem>>({
    name: DEFAULT_COST_TYPES[0],
  });

  function handleAddItem() {
    if (!newItem.name || !newItem.name.trim()) {
      toast.error("Tên khoản chi không được để trống");
      return;
    }

    if (mode === "percentage") {
      if (!newItem.percentage || newItem.percentage <= 0) {
        toast.error("Phần trăm phải > 0");
        return;
      }
    } else {
      if (!newItem.amount || newItem.amount <= 0) {
        toast.error("Số tiền phải > 0");
        return;
      }
    }

    const item: CostItem = {
      id: generateId("cost"),
      name: newItem.name.trim(),
      percentage: mode === "percentage" ? newItem.percentage : undefined,
      amount: mode === "amount" ? newItem.amount : undefined,
      unit: newItem.unit || "Đơn vị thực hiện",
      description: newItem.description,
    };

    const updated = [...items, item];
    const validation = validateCostItems(updated, totalAmount);

    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    onChange(updated);
    setNewItem({ name: DEFAULT_COST_TYPES[0] });
    toast.success("Thêm khoản chi thành công");
  }

  function handleRemoveItem(id: string) {
    const updated = items.filter((item) => item.id !== id);
    onChange(updated);
    toast.success("Xoá khoản chi thành công");
  }

  function handleUpdateItem(id: string, field: keyof CostItem, value: any) {
    const updated = items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    );

    const validation = validateCostItems(updated, totalAmount);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    onChange(updated);
  }

  const totalPercentage = items.reduce((sum, item) => sum + (item.percentage || 0), 0);
  const totalFixed = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Add New Item */}
      <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Thêm khoản chi</h4>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newItem.name || ""}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DEFAULT_COST_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Hoặc nhập tên tuỳ chỉnh"
            value={newItem.name === DEFAULT_COST_TYPES[0] ? "" : newItem.name || ""}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value || DEFAULT_COST_TYPES[0] })}
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {mode === "percentage" ? (
            <input
              type="number"
              placeholder="%"
              min="0"
              max="100"
              step="0.1"
              value={newItem.percentage || ""}
              onChange={(e) =>
                setNewItem({ ...newItem, percentage: Number(e.target.value) || undefined })
              }
              className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <input
              type="number"
              placeholder="Số tiền"
              min="0"
              step="1000"
              value={newItem.amount || ""}
              onChange={(e) =>
                setNewItem({ ...newItem, amount: Number(e.target.value) || undefined })
              }
              className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          <input
            type="text"
            placeholder="Đơn vị nhận"
            value={newItem.unit || ""}
            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={handleAddItem}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Thêm
          </button>
        </div>
      </div>

      {/* Cost Items List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500 py-2 text-center">Chưa có khoản chi</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <div className="grid grid-cols-12 gap-2 items-center text-xs">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => handleUpdateItem(item.id, "name", e.target.value)}
                  className="col-span-3 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {mode === "percentage" ? (
                  <input
                    type="number"
                    value={item.percentage || ""}
                    onChange={(e) =>
                      handleUpdateItem(item.id, "percentage", Number(e.target.value) || undefined)
                    }
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="%"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <input
                    type="number"
                    value={item.amount || ""}
                    onChange={(e) =>
                      handleUpdateItem(item.id, "amount", Number(e.target.value) || undefined)
                    }
                    min="0"
                    step="1000"
                    placeholder="Số tiền"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}

                <div className="col-span-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-700 rounded text-slate-700 dark:text-white font-medium">
                  {mode === "percentage"
                    ? `${calculateCostItemAmount(item, totalAmount).toLocaleString("vi-VN")} đ`
                    : item.amount?.toLocaleString("vi-VN") + " đ"}
                </div>

                <input
                  type="text"
                  value={item.unit || ""}
                  onChange={(e) => handleUpdateItem(item.id, "unit", e.target.value)}
                  placeholder="Đơn vị"
                  className="col-span-2 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="col-span-1 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                  title="Xoá"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Validation & Total */}
      {items.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>
              <p className="text-slate-600 dark:text-slate-400">Tổng cộng:</p>
              <p className="font-semibold text-slate-800 dark:text-white">
                {items
                  .reduce((sum, item) => sum + calculateCostItemAmount(item, totalAmount), 0)
                  .toLocaleString("vi-VN")}{" "}
                đ
              </p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">
                {mode === "percentage" ? "Tổng %:" : "Số tiền thanh toán:"}
              </p>
              <p className={`font-semibold ${
                mode === "percentage"
                  ? Math.abs(totalPercentage - 100) < 0.01
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400"
                  : "text-slate-800 dark:text-white"
              }`}>
                {mode === "percentage"
                  ? `${totalPercentage.toFixed(1)}%`
                  : totalAmount.toLocaleString("vi-VN") + " đ"}
              </p>
            </div>
          </div>

          {mode === "percentage" && Math.abs(totalPercentage - 100) > 0.01 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              ⚠️ Tổng % phải = 100% (hiện tại: {totalPercentage.toFixed(1)}%)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
