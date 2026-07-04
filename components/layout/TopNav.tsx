"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu, Bell, Search, Sun, Moon, Plus, Command,
  AlertTriangle, ChevronLeft, ChevronRight, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useDashboardFilter, type FilterMode } from "@/stores/useDashboardFilter";
import { PendingApprovalsDropdown } from "./PendingApprovalsDropdown";

const FILTER_MODES: { id: FilterMode; label: string }[] = [
  { id: "month",   label: "Tháng"  },
  { id: "quarter", label: "Quý"    },
  { id: "year",    label: "Năm"    },
  { id: "all",     label: "Tất cả" },
];

function DateFilterBar() {
  const { mode, setMode, prev, next, getLabel } = useDashboardFilter();
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {FILTER_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              mode === m.id
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode !== "all" && (
        <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1">
          <button
            onClick={prev}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-[76px] text-center select-none">
            {getLabel()}
          </span>
          <button
            onClick={next}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

interface TopNavProps {
  onMobileMenuToggle: () => void;
  onThemeToggle: () => void;
  isDark: boolean;
  onCommandPalette: () => void;
  onCreateTask: () => void;
}

export function TopNav({
  onMobileMenuToggle,
  onThemeToggle,
  isDark,
  onCommandPalette,
  onCreateTask,
}: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser } = useAuthStore();
  const { notifications, unreadCount, togglePanel, isPanelOpen } = useNotificationStore();
  const { tasks } = useTaskStore();
  const [search, setSearch] = useState("");

  // Show the date filter bar on dashboard, tasks, and clinical-trials pages
  const showDateFilter = pathname === "/dashboard" || pathname.startsWith("/tasks") || pathname.startsWith("/clinical-trials");

  const riskCount = tasks.filter((t) => t.riskFlag && t.status !== "done" && t.status !== "cancelled").length;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/tasks/list?search=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-700">
      {/* Date filter bar — only on dashboard and tasks */}
      {showDateFilter && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
          <DateFilterBar />
        </div>
      )}
      <div className="flex items-center h-14 px-4 gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm nhiệm vụ... (Ctrl+K)"
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white dark:placeholder:text-slate-500 transition"
            />
          </div>
        </form>

        <div className="flex items-center gap-2 ml-auto">
          {/* Risk flag badge */}
          {riskCount > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold border border-red-100 dark:border-red-800">
              <AlertTriangle className="w-3.5 h-3.5" />
              {riskCount} rủi ro
            </div>
          )}

          {/* Pending approvals dropdown */}
          <PendingApprovalsDropdown
            allowedRoles={["teamLead", "director", "hrAdmin"]}
            currentRole={currentUser?.role}
          />

          {/* Command palette */}
          <button
            onClick={onCommandPalette}
            title="Command Palette (Ctrl+K)"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Command className="w-3.5 h-3.5" />
            <span>K</span>
          </button>

          {/* Create task */}
          {currentUser && currentUser.role !== "guest" && (
            <button
              onClick={onCreateTask}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Tạo nhiệm vụ</span>
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={onThemeToggle}
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            title="Chuyển giao diện sáng/tối"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notification bell */}
          <button
            onClick={togglePanel}
            className={cn(
              "relative p-2 rounded-xl transition",
              isPanelOpen
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
