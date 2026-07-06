"use client";

import { useState, useEffect, useRef } from "react";
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<number | null>(null);
  const [newItem, setNewItem] = useState<Partial<CostItem>>({
    name: DEFAULT_COST_TYPES[0],
  });
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitSearchQuery, setUnitSearchQuery] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchUnits() {
      try {
        const res = await fetch("/api/units");
        if (!res.ok) throw new Error("Failed to fetch units");
        const data = await res.json();
        setUnits((data.catalog as UnitDef[]) || []);
      } catch (err) {
        console.error("Failed to fetch units catalog:", err);
        setUnits([]);
      }
    }
    fetchUnits();
  }, []);

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

  function handleDragStart(id: string, index: number) {
    setDraggingId(id);
    dragRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragRef.current === null || dragRef.current === index) return;

    const updated = [...items];
    const draggedItem = updated[dragRef.current];
    updated.splice(dragRef.current, 1);
    updated.splice(index, 0, draggedItem);
    dragRef.current = index;
    onChange(updated);
  }

  function handleDragEnd() {
    setDraggingId(null);
    dragRef.current = null;
  }

  const totalPercentage = items.reduce((sum, item) => sum + (item.percentage || 0), 0);
  const totalFixed = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Cost Items Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm" style={{ minWidth: '800px' }}>
          <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-2 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 w-8">⋮</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 min-w-48">Tên khoản chi</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 w-20">%</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 w-32">VND</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 min-w-40">Đơn vị nhận</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 w-16">Hành động</th>
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
              items.map((item, index) => {
                const amount = calculateCostItemAmount(item, totalAmount);
                return (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item.id, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`border-b border-slate-200 dark:border-slate-700 ${
                      draggingId === item.id
                        ? "bg-blue-100 dark:bg-blue-900/30 opacity-60"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    } cursor-move transition`}
                  >
                    <td className="px-2 py-2 text-center text-slate-400 dark:text-slate-500 select-none">⋮⋮</td>
                    <td className="px-4 py-3 min-w-48">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateItem(item.id, "name", e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={item.percentage || ""}
                        onChange={(e) =>
                          handleUpdateItem(item.id, "percentage", Number(e.target.value) || undefined)
                        }
                        min="0"
                        step="0.1"
                        max="100"
                        className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={item.amount || ""}
                        onChange={(e) =>
                          handleUpdateItem(item.id, "amount", Number(e.target.value) || undefined)
                        }
                        min="0"
                        step="1000"
                        className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 relative min-w-40">
                      <div className="relative w-full">
                        <input
                          type="text"
                          value={item.unit || ""}
                          onChange={(e) => {
                            handleUpdateItem(item.id, "unit", e.target.value);
                            setUnitSearchQuery({ ...unitSearchQuery, [item.id]: e.target.value });
                            setEditingUnitId(item.id);
                          }}
                          onFocus={() => setEditingUnitId(item.id)}
                          onBlur={() => setTimeout(() => setEditingUnitId(null), 200)}
                          placeholder="Chọn đơn vị"
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />

                        {editingUnitId === item.id && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                            {units
                              .filter((u) =>
                                u.name.toLowerCase().includes((unitSearchQuery[item.id] || item.unit || "").toLowerCase())
                              )
                              .slice(0, 20)
                              .map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    handleUpdateItem(item.id, "unit", u.name);
                                    setEditingUnitId(null);
                                    setUnitSearchQuery({ ...unitSearchQuery, [item.id]: "" });
                                  }}
                                  className="w-full text-left px-2 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition whitespace-nowrap"
                                >
                                  {u.name}
                                </button>
                              ))}
                            {units.filter((u) =>
                              u.name.toLowerCase().includes((unitSearchQuery[item.id] || item.unit || "").toLowerCase())
                            ).length === 0 && (
                              <div className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                                Không tìm thấy đơn vị
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                        title="Xoá"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {/* Add New Row */}
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
              <td className="px-2 py-3"></td>
              <td className="px-4 py-3 relative min-w-48">
                <select
                  value={newItem.name || ""}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {DEFAULT_COST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  placeholder="%"
                  min="0"
                  step="0.1"
                  max="100"
                  value={newItem.percentage || ""}
                  onChange={(e) => setNewItem({ ...newItem, percentage: Number(e.target.value) || undefined })}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  placeholder="VND"
                  min="0"
                  step="1000"
                  value={newItem.amount || ""}
                  onChange={(e) => setNewItem({ ...newItem, amount: Number(e.target.value) || undefined })}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </td>
              <td className="px-4 py-3 relative min-w-40">
                <div className="relative w-full">
                  <input
                    type="text"
                    value={newItem.unit || ""}
                    onChange={(e) => {
                      setNewItem({ ...newItem, unit: e.target.value });
                      setUnitSearchQuery({ ...unitSearchQuery, "new": e.target.value });
                      setEditingUnitId("new");
                    }}
                    onFocus={() => setEditingUnitId("new")}
                    onBlur={() => setTimeout(() => setEditingUnitId(null), 200)}
                    placeholder="Chọn đơn vị"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  {editingUnitId === "new" && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                      {units
                        .filter((u) =>
                          u.name.toLowerCase().includes((unitSearchQuery["new"] || newItem.unit || "").toLowerCase())
                        )
                        .slice(0, 20)
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setNewItem({ ...newItem, unit: u.name });
                              setEditingUnitId(null);
                              setUnitSearchQuery({ ...unitSearchQuery, "new": "" });
                            }}
                            className="w-full text-left px-2 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition whitespace-nowrap"
                          >
                            {u.name}
                          </button>
                        ))}
                      {units.filter((u) =>
                        u.name.toLowerCase().includes((unitSearchQuery["new"] || newItem.unit || "").toLowerCase())
                      ).length === 0 && (
                        <div className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                          Không tìm thấy đơn vị
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
                  title="Thêm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-600 dark:text-slate-400 mb-1">Tổng cộng:</p>
              <p className="font-semibold text-slate-800 dark:text-white text-base">
                {items
                  .reduce((sum, item) => sum + calculateCostItemAmount(item, totalAmount), 0)
                  .toLocaleString("vi-VN")}{" "}
                đ
              </p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400 mb-1">Tổng %:</p>
              <p
                className={`font-semibold text-base ${
                  Math.abs(totalPercentage - 100) < 0.01
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                {totalPercentage.toFixed(1)}%
              </p>
            </div>
          </div>

          {Math.abs(totalPercentage - 100) > 0.01 && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-3">
              ⚠️ Tổng % phải = 100% (hiện tại: {totalPercentage.toFixed(1)}%)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
