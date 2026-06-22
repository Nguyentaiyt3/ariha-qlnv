"use client";

import { create } from "zustand";

export type FilterMode = "all" | "month" | "quarter" | "year";

const now = new Date();
const MONTH_LABELS = ["Th.1","Th.2","Th.3","Th.4","Th.5","Th.6","Th.7","Th.8","Th.9","Th.10","Th.11","Th.12"];

interface DashboardFilterState {
  mode: FilterMode;
  year: number;
  month: number;   // 0–11
  quarter: number; // 1–4
  setMode: (mode: FilterMode) => void;
  prev: () => void;
  next: () => void;
  // Returns ISO date range or null when mode === "all"
  getRange: () => { start: string; end: string } | null;
  getLabel: () => string;
}

export const useDashboardFilter = create<DashboardFilterState>()((set, get) => ({
  mode: "month",
  year: now.getFullYear(),
  month: now.getMonth(),
  quarter: Math.floor(now.getMonth() / 3) + 1,

  setMode: (mode) => {
    // Reset to "current" period when switching modes
    const n = new Date();
    set({
      mode,
      year: n.getFullYear(),
      month: n.getMonth(),
      quarter: Math.floor(n.getMonth() / 3) + 1,
    });
  },

  prev: () => {
    const { mode, year, month, quarter } = get();
    if (mode === "month") {
      month === 0
        ? set({ month: 11, year: year - 1 })
        : set({ month: month - 1 });
    } else if (mode === "quarter") {
      quarter === 1
        ? set({ quarter: 4, year: year - 1 })
        : set({ quarter: quarter - 1 });
    } else if (mode === "year") {
      set({ year: year - 1 });
    }
  },

  next: () => {
    const { mode, year, month, quarter } = get();
    if (mode === "month") {
      month === 11
        ? set({ month: 0, year: year + 1 })
        : set({ month: month + 1 });
    } else if (mode === "quarter") {
      quarter === 4
        ? set({ quarter: 1, year: year + 1 })
        : set({ quarter: quarter + 1 });
    } else if (mode === "year") {
      set({ year: year + 1 });
    }
  },

  getRange: () => {
    const { mode, year, month, quarter } = get();
    if (mode === "all") return null;
    let start: Date, end: Date;
    if (mode === "month") {
      start = new Date(year, month, 1);
      end   = new Date(year, month + 1, 0, 23, 59, 59);
    } else if (mode === "quarter") {
      const sm = (quarter - 1) * 3;
      start = new Date(year, sm, 1);
      end   = new Date(year, sm + 3, 0, 23, 59, 59);
    } else {
      start = new Date(year, 0, 1);
      end   = new Date(year, 11, 31, 23, 59, 59);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  },

  getLabel: () => {
    const { mode, year, month, quarter } = get();
    if (mode === "all")     return "Tất cả";
    if (mode === "month")   return `${MONTH_LABELS[month]}/${year}`;
    if (mode === "quarter") return `Q${quarter}/${year}`;
    return `${year}`;
  },
}));
