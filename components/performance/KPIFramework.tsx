"use client";

import { useState } from "react";
import { Plus, Trash2, Save, BarChart3 } from "lucide-react";
import { saveKPIFramework } from "@/lib/firebase/firestore";
import type { KPIFramework as KPIFrameworkType } from "@/types";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  framework?: KPIFrameworkType;
  department: string;
  year: number;
  onSaved?: (fw: KPIFrameworkType) => void;
}

interface Indicator {
  id: string;
  name: string;
  weight: number;
  unit: string;
}

export default function KPIFramework({ framework, department, year, onSaved }: Props) {
  const [indicators, setIndicators] = useState<Indicator[]>(
    framework?.indicators ?? [
      { id: generateId(), name: "Chất lượng công việc", weight: 30, unit: "điểm" },
      { id: generateId(), name: "Tốc độ hoàn thành", weight: 25, unit: "điểm" },
      { id: generateId(), name: "Làm việc nhóm", weight: 20, unit: "điểm" },
      { id: generateId(), name: "Sáng kiến & chủ động", weight: 15, unit: "điểm" },
      { id: generateId(), name: "Kỹ năng giao tiếp", weight: 10, unit: "điểm" },
    ],
  );
  const [saving, setSaving] = useState(false);

  const totalWeight = indicators.reduce((s, i) => s + (i.weight || 0), 0);
  const isValid = indicators.length > 0 && Math.abs(totalWeight - 100) < 1;

  const addIndicator = () =>
    setIndicators((prev) => [...prev, { id: generateId(), name: "", weight: 0, unit: "điểm" }]);

  const removeIndicator = (id: string) =>
    setIndicators((prev) => prev.filter((i) => i.id !== id));

  const updateIndicator = (id: string, field: keyof Indicator, value: string | number) =>
    setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const fw: KPIFrameworkType = {
        id: framework?.id ?? generateId(),
        name: `KPI ${department} ${year}`,
        department,
        year,
        period: "quarterly",
        indicators,
        createdBy: "",
        createdAt: framework?.createdAt ?? new Date().toISOString(),
      };
      await saveKPIFramework(fw);
      toast.success("Đã lưu khung KPI");
      onSaved?.(fw);
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-500" />
          Khung KPI — {department} ({year})
        </h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          Math.abs(totalWeight - 100) < 1
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        }`}>
          Tổng trọng số: {totalWeight}%
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {indicators.map((ind, idx) => (
          <div key={ind.id} className="flex gap-2 items-center">
            <span className="text-xs text-[var(--muted-foreground)] w-5">{idx + 1}.</span>
            <input
              value={ind.name}
              onChange={(e) => updateIndicator(ind.id, "name", e.target.value)}
              placeholder="Tên tiêu chí..."
              className="flex-1 px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={ind.weight}
              onChange={(e) => updateIndicator(ind.id, "weight", Number(e.target.value))}
              min={0}
              max={100}
              className="w-16 px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-[var(--muted-foreground)]">%</span>
            <input
              value={ind.unit}
              onChange={(e) => updateIndicator(ind.id, "unit", e.target.value)}
              placeholder="Đơn vị"
              className="w-20 px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => removeIndicator(ind.id)}
              className="text-[var(--muted-foreground)] hover:text-red-500 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={addIndicator}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-dashed border-[var(--border)] rounded-lg text-[var(--muted-foreground)] hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> Thêm tiêu chí
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Lưu khung KPI
        </button>
      </div>
      {!isValid && indicators.length > 0 && (
        <p className="text-xs text-red-500 mt-2">Tổng trọng số phải bằng 100%</p>
      )}
    </div>
  );
}
