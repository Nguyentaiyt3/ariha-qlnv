"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardFilter } from "@/stores/useDashboardFilter";

interface PeriodFilterBarProps {
  className?: string;
}

/**
 * Unified period filter bar used across all modules
 * Uses shared useDashboardFilter store
 */
export function PeriodFilterBar({ className }: PeriodFilterBarProps) {
  const { mode, setMode, prev, next, getLabel } = useDashboardFilter();

  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      <div className="flex items-center gap-2">
        <button
          onClick={prev}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          title="Kỳ trước"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 min-w-24 text-center">
          {getLabel()}
        </span>
        <button
          onClick={next}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          title="Kỳ tiếp"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {[
          { label: "Tất cả", value: "all" },
          { label: "Tháng", value: "month" },
          { label: "Quý", value: "quarter" },
          { label: "Năm", value: "year" },
        ].map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setMode(value as typeof mode)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition",
              mode === value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
