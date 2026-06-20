"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { subscribeTasks, subscribeUsers, subscribeNotifications } from "@/lib/firebase/firestore";
import { isTaskVisible } from "@/lib/utils";
import CommandPalette from "@/components/common/CommandPalette";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import type { Task, User } from "@/types";

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

  // Realtime subscriptions
  useEffect(() => {
    if (!currentUser) return;

    const unsubTasks = subscribeTasks((allTasks: Task[]) => {
      // Deduplicate by ID (guards against Strict Mode double-fire or optimistic+server overlap)
      const seen = new Set<string>();
      const deduped = allTasks.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
      const visible = deduped.filter((t) => isTaskVisible(t, currentUser.id, currentUser.role));
      setTasks(visible);
    });
    const unsubUsers = subscribeUsers((users: User[]) => setUsers(users));
    const unsubNotifs = subscribeNotifications(currentUser.id, (notifs) => setNotifications(notifs));

    return () => {
      unsubTasks();
      unsubUsers();
      unsubNotifs();
    };
  }, [currentUser, setTasks, setUsers, setNotifications]);

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

      {/* Notification slide-over panel */}
      <NotificationPanel />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Create task modal */}
      {createTaskOpen && (
        <CreateTaskModal onClose={() => setCreateTaskOpen(false)} />
      )}
    </div>
  );
}
