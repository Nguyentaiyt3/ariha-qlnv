"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { CostItem, UnitDef } from "@/types";
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
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [unitSearchOpen, setUnitSearchOpen] = useState<string | null>(null);
  const [unitSearchQuery, setUnitSearchQuery] = useState("");
  const [newItemUnitSearchOpen, setNewItemUnitSearchOpen] = useState(false);

  useEffect(() => {
    async function fetchUnits() {
      try {
        const res = await fetch("/api/public/units");
        const data = await res.json();
        setUnits((data.catalog as UnitDef[]) || []);
      } catch (err) {
        console.error("Failed to fetch units:", err);
      }
    }
    fetchUnits();
  }, []);

  const unitNames = units.map((unit) => unit.name);
  const filteredUnits = unitNames.filter((unit) =>
    unit.toLowerCase().includes(unitSearchQuery.toLowerCase())
  );

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
      unit: newItem.unit || undefined,
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
      {/* Cost Items Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Tên khoản chi</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-300 w-20">
                {mode === "percentage" ? "%" : "VND"}
              </th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">Thực tế</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Đơn vị nhận</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-300 w-16">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">
                  Chưa có khoản chi
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const amount = calculateCostItemAmount(item, totalAmount);
                return (
                  <tr key={item.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateItem(item.id, "name", e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={mode === "percentage" ? item.percentage || "" : item.amount || ""}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.id,
                            mode === "percentage" ? "percentage" : "amount",
                            Number(e.target.value) || undefined
                          )
                        }
                        min="0"
                        step={mode === "percentage" ? "0.1" : "1000"}
                        max={mode === "percentage" ? "100" : undefined}
                        className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="font-semibold text-slate-700 dark:text-white">
                        {amount.toLocaleString("vi-VN")} {mode === "percentage" ? "đ" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setUnitSearchOpen(unitSearchOpen === item.id ? null : item.id)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center justify-between"
                        >
                          <span className="truncate">{item.unit || "—"}</span>
                          <ChevronDown className={`w-3 h-3 flex-shrink-0 ml-1 transition-transform ${unitSearchOpen === item.id ? "rotate-180" : ""}`} />
                        </button>

                        {unitSearchOpen === item.id && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                            <input
                              type="text"
                              placeholder="Tìm..."
                              value={unitSearchQuery}
                              onChange={(e) => setUnitSearchQuery(e.target.value)}
                              className="w-full px-2 py-1 text-xs border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                            {filteredUnits.map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => {
                                  handleUpdateItem(item.id, "unit", unit);
                                  setUnitSearchOpen(null);
                                  setUnitSearchQuery("");
                                }}
                                className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {/* Add New Row */}
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
              <td className="px-3 py-2">
                <select
                  value={newItem.name || ""}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {DEFAULT_COST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  placeholder={mode === "percentage" ? "%" : "VND"}
                  min="0"
                  step={mode === "percentage" ? "0.1" : "1000"}
                  max={mode === "percentage" ? "100" : undefined}
                  value={mode === "percentage" ? newItem.percentage || "" : newItem.amount || ""}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      [mode === "percentage" ? "percentage" : "amount"]: Number(e.target.value) || undefined,
                    })
                  }
                  className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </td>
              <td className="px-3 py-2 text-center text-slate-500">—</td>
              <td className="px-3 py-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNewItemUnitSearchOpen(!newItemUnitSearchOpen)}
                    className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span className="truncate">{newItem.unit || "Chọn đơn vị"}</span>
                    <ChevronDown className={`w-3 h-3 flex-shrink-0 ml-1 transition-transform ${newItemUnitSearchOpen ? "rotate-180" : ""}`} />
                  </button>

                  {newItemUnitSearchOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                      <input
                        type="text"
                        placeholder="Tìm..."
                        value={unitSearchQuery}
                        onChange={(e) => setUnitSearchQuery(e.target.value)}
                        className="w-full px-2 py-1 text-xs border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {filteredUnits.map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => {
                            setNewItem({ ...newItem, unit });
                            setNewItemUnitSearchOpen(false);
                            setUnitSearchQuery("");
                          }}
                          className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-center">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-xs">
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
                {mode === "percentage" ? "Tổng %:" : "Tổng tiền:"}
              </p>
              <p
                className={`font-semibold ${
                  mode === "percentage"
                    ? Math.abs(totalPercentage - 100) < 0.01
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                    : "text-slate-800 dark:text-white"
                }`}
              >
                {mode === "percentage"
                  ? `${totalPercentage.toFixed(1)}%`
                  : totalFixed.toLocaleString("vi-VN") + " đ"}
              </p>
            </div>
          </div>

          {mode === "percentage" && Math.abs(totalPercentage - 100) > 0.01 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              ⚠️ Tổng % phải = 100% (hiện tại: {totalPercentage.toFixed(1)}%)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
