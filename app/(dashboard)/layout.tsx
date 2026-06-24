"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { applyPermissionOverrides } from "@/lib/rbac/permissions";
import { isTaskVisible } from "@/lib/utils";
import CommandPalette from "@/components/common/CommandPalette";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import type { Task, User } from "@/types";

async function fetchData<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, isLoading } = useAuthStore();
  const { setTasks, setUsers } = useTaskStore();
  const { setNotifications } = useNotificationStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  // Guard: redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, isLoading, router]);

  // Load data via API routes (no direct MongoDB imports in client)
  const loadData = useCallback(async () => {
    if (!currentUser) return;

    const [tasksRes, usersRes, notifsRes] = await Promise.all([
      fetchData<{ tasks: Task[] }>("/api/tasks"),
      fetchData<{ users: User[] }>("/api/users"),
      fetchData<{ notifications: Notification[] }>("/api/notifications"),
    ]);

    if (tasksRes?.tasks) {
      const seen = new Set<string>();
      const deduped = tasksRes.tasks.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      const visible = deduped.filter((t) => isTaskVisible(t, currentUser.id, currentUser.role));
      setTasks(visible);
    }

    if (usersRes?.users) {
      setUsers(usersRes.users);
    }

    if (notifsRes?.notifications) {
      setNotifications(notifsRes.notifications as unknown as import("@/types").Notification[]);
    }
  }, [currentUser, setTasks, setUsers, setNotifications]);

  useEffect(() => {
    loadData();

    // Poll every 30s for updates (replaces Firestore real-time subscriptions)
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Load permission overrides
  useEffect(() => {
    fetchData<Record<string, unknown>>("/api/config/permissions").then((overrides) => {
      if (overrides && Object.keys(overrides).length > 0) {
        applyPermissionOverrides(overrides as Parameters<typeof applyPermissionOverrides>[0]);
      }
    });
  }, []);

  // Dark mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isLoading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Đang tải WorkHub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav
          onMobileMenuToggle={() => setMobileMenuOpen(true)}
          onThemeToggle={() => setIsDark(!isDark)}
          isDark={isDark}
          onCommandPalette={() => setCommandPaletteOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
        />

        <main className="flex-1 overflow-y-auto h-full">
          {children}
        </main>
      </div>

      <NotificationPanel />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {createTaskOpen && (
        <CreateTaskModal onClose={() => setCreateTaskOpen(false)} />
      )}
    </div>
  );
}
