"use client";

import { useEffect, useState } from "react";
import {
  Bell, CheckCheck, AlertTriangle, Clock, MessageSquare, User,
  Filter, Plus, DollarSign, Banknote, FileCheck, FileX, CreditCard,
  Lock, Star, XCircle, TrendingUp, Trash2, X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import {
  subscribeNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, deleteAllReadNotifications, cleanupOldNotifications,
} from "@/lib/firebase/firestore";
import type { Notification, NotificationType } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

type IconEl = React.ReactNode;
type TypeCfg = { icon: IconEl; color: string; label: string };

const TYPE_CONFIG: Record<string, TypeCfg> = {
  task_created:                 { icon: <Plus className="w-4 h-4" />,            color: "text-sky-600 bg-sky-50",        label: "Tạo mới" },
  task_assigned:                { icon: <User className="w-4 h-4" />,            color: "text-blue-600 bg-blue-50",      label: "Giao việc" },
  task_overdue:                 { icon: <AlertTriangle className="w-4 h-4" />,   color: "text-red-600 bg-red-50",        label: "Quá hạn" },
  task_completed:               { icon: <CheckCheck className="w-4 h-4" />,      color: "text-green-600 bg-green-50",    label: "Hoàn thành" },
  deadline_alert:               { icon: <Clock className="w-4 h-4" />,           color: "text-amber-600 bg-amber-50",    label: "Sắp hạn" },
  status_changed:               { icon: <TrendingUp className="w-4 h-4" />,      color: "text-indigo-600 bg-indigo-50",  label: "Trạng thái" },
  risk_flag:                    { icon: <AlertTriangle className="w-4 h-4" />,   color: "text-orange-600 bg-orange-50",  label: "Rủi ro" },
  comment_mention:              { icon: <MessageSquare className="w-4 h-4" />,   color: "text-purple-600 bg-purple-50",  label: "Nhắc đến" },
  approval_request:             { icon: <CheckCheck className="w-4 h-4" />,      color: "text-violet-600 bg-violet-50",  label: "Phê duyệt" },
  advance_created:              { icon: <DollarSign className="w-4 h-4" />,      color: "text-blue-600 bg-blue-50",      label: "Tạm ứng mới" },
  advance_approved:             { icon: <FileCheck className="w-4 h-4" />,       color: "text-green-600 bg-green-50",    label: "Tạm ứng duyệt" },
  advance_rejected:             { icon: <FileX className="w-4 h-4" />,           color: "text-red-600 bg-red-50",        label: "Tạm ứng từ chối" },
  advance_settlement_submitted: { icon: <Banknote className="w-4 h-4" />,        color: "text-blue-600 bg-blue-50",      label: "Quyết toán" },
  advance_settlement_approved:  { icon: <FileCheck className="w-4 h-4" />,       color: "text-green-600 bg-green-50",    label: "Quyết toán duyệt" },
  advance_settlement_rejected:  { icon: <FileX className="w-4 h-4" />,           color: "text-red-600 bg-red-50",        label: "Quyết toán từ chối" },
  reimbursement_submitted:      { icon: <CreditCard className="w-4 h-4" />,      color: "text-blue-600 bg-blue-50",      label: "Hoàn ứng mới" },
  reimbursement_approved:       { icon: <FileCheck className="w-4 h-4" />,       color: "text-green-600 bg-green-50",    label: "Hoàn ứng duyệt" },
  reimbursement_paid:           { icon: <CheckCheck className="w-4 h-4" />,      color: "text-emerald-600 bg-emerald-50",label: "Đã chi trả" },
  node_unlocked:                { icon: <Lock className="w-4 h-4" />,            color: "text-sky-600 bg-sky-50",        label: "Node mở khóa" },
  node_submitted:               { icon: <FileCheck className="w-4 h-4" />,       color: "text-violet-600 bg-violet-50",  label: "Node nộp" },
  node_approved:                { icon: <Star className="w-4 h-4" />,            color: "text-green-600 bg-green-50",    label: "Node duyệt" },
  node_rejected:                { icon: <XCircle className="w-4 h-4" />,         color: "text-red-600 bg-red-50",        label: "Node từ chối" },
  _default:                     { icon: <Bell className="w-4 h-4" />,            color: "text-gray-600 bg-gray-100",     label: "Hệ thống" },
};

const FILTER_GROUPS: { value: string; label: string }[] = [
  { value: "all",      label: "Tất cả" },
  { value: "tasks",    label: "Nhiệm vụ" },
  { value: "finance",  label: "Tài chính" },
  { value: "worknode", label: "WorkNode" },
];

const GROUP_TYPES: Record<string, NotificationType[]> = {
  tasks: [
    "task_created", "task_assigned", "task_overdue", "task_completed",
    "deadline_alert", "status_changed", "risk_flag", "comment_mention", "approval_request",
  ],
  finance: [
    "advance_created", "advance_approved", "advance_rejected",
    "advance_settlement_submitted", "advance_settlement_approved", "advance_settlement_rejected",
    "reimbursement_submitted", "reimbursement_approved", "reimbursement_paid",
  ],
  worknode: ["node_unlocked", "node_submitted", "node_approved", "node_rejected"],
};

export default function NotificationsPage() {
  const { currentUser } = useAuthStore();
  const { notifications, setNotifications, markRead, markAllRead, removeNotification, removeAllRead } = useNotificationStore();
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeNotifications(currentUser.id, (data) => setNotifications(data));

    // Auto-cleanup thông báo cũ theo cài đặt của người dùng
    const retentionDays = currentUser.notificationPrefs?.retentionDays ?? 30;
    if (retentionDays > 0) {
      cleanupOldNotifications(currentUser.id, retentionDays).catch(() => {});
    }

    return unsub;
  }, [currentUser, setNotifications]);

  const filtered = notifications.filter((n) => {
    if (filterGroup !== "all") {
      const allowed = GROUP_TYPES[filterGroup] as string[] | undefined;
      if (allowed && !allowed.includes(n.type)) return false;
    }
    if (showUnreadOnly && n.read) return false;
    return true;
  });

  const unread = notifications.filter((n) => !n.read);
  const hasRead = notifications.some((n) => n.read);

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

  const handleDelete = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    removeNotification(n.id);
    await deleteNotification(currentUser.id, n.id);
  };

  const handleDeleteAllRead = async () => {
    if (!currentUser) return;
    removeAllRead();
    await deleteAllReadNotifications(currentUser.id);
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
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Đọc tất cả
            </button>
          )}
          {hasRead && (
            <button
              onClick={handleDeleteAllRead}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Xóa đã đọc
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
        {FILTER_GROUPS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterGroup(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterGroup === f.value
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

      {/* Count */}
      {filtered.length > 0 && (
        <p className="text-xs text-[var(--muted-foreground)] mb-3">
          {filtered.length} thông báo
        </p>
      )}

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
                className={`group relative flex gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
                  n.read
                    ? "border-[var(--border)] bg-[var(--card)]"
                    : "border-blue-200 bg-blue-50/40 dark:bg-blue-900/10"
                } hover:border-blue-300`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0 pr-8">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-snug ${n.read ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}`}>
                      {n.title}
                    </p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{n.body}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    {n.actionRequired && !n.read && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        Cần xử lý
                      </span>
                    )}
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
                {/* Nút xóa — hiện khi hover */}
                <button
                  onClick={(e) => handleDelete(n, e)}
                  className="absolute right-3 top-3 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                  title="Xóa thông báo này"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
