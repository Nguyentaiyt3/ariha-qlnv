"use client";

import { cn } from "@/lib/utils";

export type PeriodFilterValue = "all" | "month" | "quarter" | "year";

interface PeriodFilterProps {
  value: PeriodFilterValue;
  onChange: (value: PeriodFilterValue) => void;
  className?: string;
}

export function PeriodFilter({ value, onChange, className }: PeriodFilterProps) {
  const options: { label: string; value: PeriodFilterValue }[] = [
    { label: "Tất cả", value: "all" },
    { label: "Tháng này", value: "month" },
    { label: "Quý này", value: "quarter" },
    { label: "Năm nay", value: "year" },
  ];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {options.map(({ label, value: val }) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={cn(
            "px-4 py-2 rounded-lg font-medium text-sm transition",
            value === val
              ? "bg-blue-600 text-white"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Hook to filter items by period
 * Expects items to have a startPeriod field in format "M/YYYY" or "Q/YYYY"
 */
export function usePeriodFilter<T extends { startPeriod?: string }>(
  items: T[],
  period: PeriodFilterValue
): T[] {
  if (period === "all") return items;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentQuarter = Math.ceil((currentMonth + 1) / 3);

  return items.filter((item) => {
    if (!item.startPeriod) return false;

    const parts = item.startPeriod.split("/");
    if (parts.length !== 2) return false;

    const periodNum = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);

    if (period === "year") {
      return year === currentYear;
    }
    if (period === "quarter") {
      const quarter = periodNum <= 4 ? periodNum : Math.ceil(periodNum / 3);
      return quarter === currentQuarter && year === currentYear;
    }
    if (period === "month") {
      if (periodNum > 12) return false;
      return periodNum === currentMonth + 1 && year === currentYear;
    }
    return true;
  });
}
