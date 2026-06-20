"use client";

import { useEffect, useRef } from "react";
import { X, Bell, CheckCheck, AlertTriangle, Calendar, MessageSquare, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/firebase/firestore";
import { useRouter } from "next/navigation";
import type { Notification } from "@/types";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  task_assigned: CheckCircle2,
  task_overdue: AlertTriangle,
  deadline_alert: Clock,
  status_changed: TrendingUp,
  comment_mention: MessageSquare,
  approval_request: CheckCircle2,
  task_completed: CheckCircle2,
  calendar_change_request: Calendar,
  risk_flag: AlertTriangle,
  digest: Bell,
};

const TYPE_COLORS: Record<string, string> = {
  task_overdue: "text-red-500 bg-red-50 dark:bg-red-900/20",
  risk_flag: "text-red-500 bg-red-50 dark:bg-red-900/20",
  deadline_alert: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  approval_request: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  calendar_change_request: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
  default: "text-slate-500 bg-slate-50 dark:bg-slate-800",
};

export function NotificationPanel() {
  const { notifications, isPanelOpen, closePanel, markRead, markAllRead } = useNotificationStore();
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    }
    if (isPanelOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPanelOpen, closePanel]);

  async function handleNotifClick(notif: Notification) {
    if (!notif.read && currentUser) {
      markRead(notif.id);
      await markNotificationRead(currentUser.id, notif.id);
    }
    if (notif.link) {
      router.push(notif.link);
      closePanel();
    }
  }

  async function handleMarkAllRead() {
    if (!currentUser) return;
    markAllRead();
    await markAllNotificationsRead(currentUser.id);
  }

  if (!isPanelOpen) return null;

  const unread = notifications.filter((n) => !n.read);
  const rest = notifications.filter((n) => n.read).slice(0, 10);

  return (
    <div
      ref={panelRef}
      className="fixed right-4 top-16 z-50 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-slide-in-right"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm dark:text-white">Thông báo</span>
          {unread.length > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              {unread.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="p-1.5 text-xs text-slate-500 hover:text-blue-600 transition"
              title="Đánh dấu tất cả đã đọc"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button onClick={closePanel} className="p-1.5 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="overflow-y-auto max-h-[480px]">
        {notifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Không có thông báo</p>
          </div>
        ) : (
          <div>
            {unread.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">
                  Chưa đọc
                </div>
                {unread.map((notif) => (
                  <NotifItem key={notif.id} notif={notif} onClick={() => handleNotifClick(notif)} />
                ))}
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">
                  Đã đọc
                </div>
                {rest.map((notif) => (
                  <NotifItem key={notif.id} notif={notif} onClick={() => handleNotifClick(notif)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5">
        <button
          onClick={() => { router.push("/notifications"); closePanel(); }}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
        >
          Xem tất cả thông báo →
        </button>
      </div>
    </div>
  );
}

function NotifItem({ notif, onClick }: { notif: Notification; onClick: () => void }) {
  const Icon = TYPE_ICONS[notif.type] ?? Bell;
  const colorClass = TYPE_COLORS[notif.type] ?? TYPE_COLORS.default;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left",
        !notif.read && "bg-blue-50/50 dark:bg-blue-900/10"
      )}
    >
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug dark:text-white", !notif.read && "font-semibold")}>
          {notif.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{notif.body}</p>
        <p className="text-[10px] text-slate-400 mt-1">{formatRelativeTime(notif.createdAt)}</p>
      </div>
      {!notif.read && (
        <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2" />
      )}
    </button>
  );
}
