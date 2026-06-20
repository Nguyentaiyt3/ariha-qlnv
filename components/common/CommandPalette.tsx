"use client";

import { useEffect, useCallback } from "react";
import { Command } from "cmdk";
import {
  LayoutDashboard, CheckSquare, Calendar, TrendingUp, Users,
  BarChart3, Bell, Settings, Search, GitBranch, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getVisibleNavItems } from "@/lib/rbac/permissions";

interface Props {
  open: boolean;
  onClose: () => void;
}

const NAV_ICON_MAP: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard className="w-4 h-4" />,
  "/tasks": <CheckSquare className="w-4 h-4" />,
  "/calendar": <Calendar className="w-4 h-4" />,
  "/performance": <TrendingUp className="w-4 h-4" />,
  "/employees": <Users className="w-4 h-4" />,
  "/workflow": <GitBranch className="w-4 h-4" />,
  "/analytics": <BarChart3 className="w-4 h-4" />,
  "/notifications": <Bell className="w-4 h-4" />,
  "/settings": <Settings className="w-4 h-4" />,
};

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const navItems = currentUser ? getVisibleNavItems(currentUser.role) : [];

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
        <Command className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-[var(--border)]">
          <div className="flex items-center px-4 py-3 gap-2">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
            <Command.Input
              placeholder="Tìm kiếm trang, nhiệm vụ..."
              className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
              autoFocus
            />
            <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="text-center text-sm text-[var(--muted-foreground)] py-6">
              Không tìm thấy kết quả
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading="Điều hướng" className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--muted-foreground)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold">
              {navItems.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.label}
                  onSelect={() => navigate(item.href)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--foreground)] cursor-pointer data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-700 hover:bg-[var(--muted)] transition-colors"
                >
                  <span className="text-[var(--muted-foreground)]">{NAV_ICON_MAP[item.href]}</span>
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Tasks */}
            {tasks.length > 0 && (
              <Command.Group heading="Nhiệm vụ gần đây" className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--muted-foreground)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold">
                {tasks.slice(0, 8).map((task) => (
                  <Command.Item
                    key={task.id}
                    value={task.name}
                    onSelect={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--foreground)] cursor-pointer data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-700 hover:bg-[var(--muted)] transition-colors"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
                    <span className="truncate">{task.name}</span>
                    {task.riskFlag && (
                      <span className="ml-auto text-xs text-red-500 flex-shrink-0">⚠ Rủi ro</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick actions */}
            <Command.Group heading="Hành động nhanh" className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--muted-foreground)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold">
              <Command.Item
                value="tùy chọn thông báo"
                onSelect={() => navigate("/settings/notifications")}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--foreground)] cursor-pointer data-[selected=true]:bg-blue-50 hover:bg-[var(--muted)] transition-colors"
              >
                <Bell className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> Tùy chọn thông báo
              </Command.Item>
              <Command.Item
                value="hồ sơ cá nhân"
                onSelect={() => navigate("/settings/profile")}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--foreground)] cursor-pointer data-[selected=true]:bg-blue-50 hover:bg-[var(--muted)] transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> Hồ sơ cá nhân
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
            <span><kbd className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs">↑↓</kbd> Di chuyển</span>
            <span><kbd className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs">↵</kbd> Chọn</span>
            <span><kbd className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs">Esc</kbd> Đóng</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
