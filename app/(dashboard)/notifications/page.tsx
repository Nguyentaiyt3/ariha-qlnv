"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, AlertTriangle, Clock, MessageSquare, User, Filter } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { subscribeNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/firebase/firestore";
import type { Notification, NotificationType } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

const TYPE_CONFIG: Partial<Record<NotificationType, { icon: React.ReactNode; color: string; label: string }>> & { _default: { icon: React.ReactNode; color: string; label: string } } = {
  task_assigned: { icon: <User className="w-4 h-4" />, color: "text-blue-600 bg-blue-50", label: "Giao việc" },
  task_overdue: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-red-600 bg-red-50", label: "Quá hạn" },
  deadline_alert: { icon: <Clock className="w-4 h-4" />, color: "text-amber-600 bg-amber-50", label: "Sắp hạn" },
  risk_flag: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-orange-600 bg-orange-50", label: "Rủi ro" },
  comment_mention: { icon: <MessageSquare className="w-4 h-4" />, color: "text-purple-600 bg-purple-50", label: "Nhắc đến" },
  approval_request: { icon: <CheckCheck className="w-4 h-4" />, color: "text-violet-600 bg-violet-50", label: "Phê duyệt" },
  task_completed: { icon: <CheckCheck className="w-4 h-4" />, color: "text-green-600 bg-green-50", label: "Hoàn thành" },
  _default: { icon: <Bell className="w-4 h-4" />, color: "text-gray-600 bg-gray-100", label: "Hệ thống" },
};

const FILTER_TYPES: { value: NotificationType | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "task_assigned" as NotificationType, label: "Giao việc" },
  { value: "deadline_alert" as NotificationType, label: "Sắp hạn" },
  { value: "task_overdue" as NotificationType, label: "Quá hạn" },
  { value: "risk_flag" as NotificationType, label: "Rủi ro" },
  { value: "approval_request" as NotificationType, label: "Phê duyệt" },
  { value: "comment_mention" as NotificationType, label: "Nhắc đến" },
  { value: "task_completed" as NotificationType, label: "Hoàn thành" },
];

export default function NotificationsPage() {
  const { currentUser } = useAuthStore();
  const { notifications, setNotifications, markRead, markAllRead } = useNotificationStore();
  const [filterType, setFilterType] = useState<NotificationType | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeNotifications(currentUser.id, (data) => setNotifications(data));
    return unsub;
  }, [currentUser, setNotifications]);

  const filtered = notifications.filter((n) => {
    if (filterType !== "all" && n.type !== filterType) return false;
    if (showUnreadOnly && n.read) return false;
    return true;
  });

  const unread = notifications.filter((n) => !n.read);

  const handleMarkRead = async (n: Notification) => {
    if (n.read || !currentUser) return;
    await markNotificationRead(currentUser.id, n.id);
    markRead(n.id);
  };

  const handleMarkAll = async () => {
    if (!currentUser) return;
    await markAllNotificationsRead(currentUser.id);
    markAllRead();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-500" />
            Trung tâm thông báo
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {unread.length > 0 ? `${unread.length} thông báo chưa đọc` : "Tất cả đã đọc"}
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={handleMarkAll}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-[var(--muted-foreground)]" />
        {FILTER_TYPES.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterType(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterType === f.value
                ? "bg-blue-600 text-white"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setShowUnreadOnly((v) => !v)}
          className={`ml-auto px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            showUnreadOnly
              ? "bg-amber-500 text-white"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
          }`}
        >
          Chưa đọc
        </button>
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted-foreground)]">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Không có thông báo nào</p>
          </div>
        ) : (
          filtered.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG._default;
            return (
              <div
                key={n.id}
                onClick={() => handleMarkRead(n)}
                className={`flex gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
                  n.read
                    ? "border-[var(--border)] bg-[var(--card)]"
                    : "border-blue-200 bg-blue-50/40 dark:bg-blue-900/10"
                } hover:border-blue-300`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-snug ${n.read ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}`}>
                      {n.title}
                    </p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{n.body}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{formatRelativeTime(n.createdAt)}</span>
                    {n.link && (
                      <Link
                        href={n.link}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-600 hover:underline ml-auto"
                      >
                        Xem →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
