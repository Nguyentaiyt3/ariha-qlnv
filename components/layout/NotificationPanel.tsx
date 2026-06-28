"use client";

import { useEffect, useRef } from "react";
import {
  X, Bell, CheckCheck, AlertTriangle, Calendar, MessageSquare,
  CheckCircle2, Clock, TrendingUp, Plus, DollarSign, Banknote,
  FileCheck, FileX, CreditCard, Lock, Star, XCircle, Trash2,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { renderTextWithLinks } from "@/lib/renderLinks";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  markNotificationRead, markAllNotificationsRead,
  deleteNotification, deleteAllReadNotifications,
} from "@/lib/firebase/firestore";
import { useRouter } from "next/navigation";
import type { Notification } from "@/types";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Task
  task_created: Plus,
  task_assigned: CheckCircle2,
  task_overdue: AlertTriangle,
  task_completed: CheckCircle2,
  deadline_alert: Clock,
  status_changed: TrendingUp,
  comment_mention: MessageSquare,
  approval_request: CheckCircle2,
  calendar_change_request: Calendar,
  risk_flag: AlertTriangle,
  digest: Bell,
  // Finance — Tạm ứng
  advance_created: DollarSign,
  advance_approved: FileCheck,
  advance_rejected: FileX,
  advance_settlement_submitted: Banknote,
  advance_settlement_approved: FileCheck,
  advance_settlement_rejected: FileX,
  // Finance — Hoàn ứng
  reimbursement_submitted: CreditCard,
  reimbursement_approved: FileCheck,
  reimbursement_paid: CheckCircle2,
  // WorkNode
  node_unlocked: Lock,
  node_submitted: FileCheck,
  node_approved: Star,
  node_rejected: XCircle,
};

const TYPE_COLORS: Record<string, string> = {
  // Đỏ — lỗi / từ chối / quá hạn
  task_overdue: "text-red-500 bg-red-50 dark:bg-red-900/20",
  risk_flag: "text-red-500 bg-red-50 dark:bg-red-900/20",
  advance_rejected: "text-red-500 bg-red-50 dark:bg-red-900/20",
  advance_settlement_rejected: "text-red-500 bg-red-50 dark:bg-red-900/20",
  node_rejected: "text-red-500 bg-red-50 dark:bg-red-900/20",
  // Cam — cảnh báo / cần xử lý
  deadline_alert: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  // Xanh lam — yêu cầu hành động
  approval_request: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  advance_created: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  advance_settlement_submitted: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  reimbursement_submitted: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  node_submitted: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  // Xanh lá — hoàn thành / duyệt
  task_completed: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  advance_approved: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  advance_settlement_approved: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  reimbursement_approved: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  reimbursement_paid: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  node_approved: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  // Tím — calendar
  calendar_change_request: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
  // Mặc định
  default: "text-slate-500 bg-slate-50 dark:bg-slate-800",
};

export function NotificationPanel() {
  const { notifications, isPanelOpen, closePanel, markRead, markAllRead, removeNotification, removeAllRead } = useNotificationStore();
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

  async function handleDeleteOne(notif: Notification, e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentUser) return;
    removeNotification(notif.id);
    await deleteNotification(currentUser.id, notif.id);
  }

  async function handleDeleteAllRead() {
    if (!currentUser) return;
    removeAllRead();
    await deleteAllReadNotifications(currentUser.id);
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
              className="p-1.5 text-slate-500 hover:text-blue-600 transition"
              title="Đánh dấu tất cả đã đọc"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          {rest.length > 0 && (
            <button
              onClick={handleDeleteAllRead}
              className="p-1.5 text-slate-400 hover:text-red-500 transition"
              title="Xóa tất cả đã đọc"
            >
              <Trash2 className="w-4 h-4" />
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
                  <NotifItem
                    key={notif.id}
                    notif={notif}
                    onClick={() => handleNotifClick(notif)}
                    onDelete={(e) => handleDeleteOne(notif, e)}
                  />
                ))}
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">
                  Đã đọc
                </div>
                {rest.map((notif) => (
                  <NotifItem
                    key={notif.id}
                    notif={notif}
                    onClick={() => handleNotifClick(notif)}
                    onDelete={(e) => handleDeleteOne(notif, e)}
                  />
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

function NotifItem({
  notif,
  onClick,
  onDelete,
}: {
  notif: Notification;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const Icon = TYPE_ICONS[notif.type] ?? Bell;
  const colorClass = TYPE_COLORS[notif.type] ?? TYPE_COLORS.default;

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer",
        !notif.read && "bg-blue-50/50 dark:bg-blue-900/10"
      )}
      onClick={onClick}
    >
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug dark:text-white pr-5", !notif.read && "font-semibold")}>
          {notif.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{renderTextWithLinks(notif.body)}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-slate-400">{formatRelativeTime(notif.createdAt)}</p>
          {notif.actionRequired && !notif.read && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              Cần xử lý
            </span>
          )}
        </div>
      </div>
      {!notif.read && (
        <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2" />
      )}
      {/* Nút xóa — hiện khi hover */}
      <button
        onClick={onDelete}
        className="absolute right-3 top-3 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
        title="Xóa thông báo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
