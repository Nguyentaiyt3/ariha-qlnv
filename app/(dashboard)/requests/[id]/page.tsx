"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Loader2,
  User, Calendar, MessageSquare, FileText, Paperclip, Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { getRequest, updateRequest, addNotification, getUsers } from "@/lib/firebase/firestore";
import type { WorkRequest, RequestStatus } from "@/types";

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string }> = {
  pending:   { label: "Chờ duyệt",  color: "text-amber-600 bg-amber-50 border-amber-200" },
  approved:  { label: "Đã duyệt",   color: "text-green-600 bg-green-50 border-green-200" },
  rejected:  { label: "Từ chối",    color: "text-red-600 bg-red-50 border-red-200" },
  cancelled: { label: "Đã huỷ",     color: "text-slate-500 bg-slate-50 border-slate-200" },
};

const TYPE_ICONS: Record<string, string> = {
  leave: "🏖️", overtime: "⏰", expense: "💰", equipment: "🖥️",
  training: "📚", wfh: "🏠", custom: "📄",
};

const FIELD_LABELS: Record<string, string> = {
  leaveType: "Loại nghỉ", fromDate: "Từ ngày", toDate: "Đến ngày",
  reason: "Lý do", handover: "Bàn giao cho", date: "Ngày",
  fromTime: "Từ giờ", toTime: "Đến giờ", expenseType: "Loại chi phí",
  amount: "Số tiền", description: "Mô tả", location: "Địa điểm",
  plan: "Kế hoạch công việc",
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const [request, setRequest] = useState<WorkRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  const canApprove = !!(currentUser && hasPermission(currentUser.role, "request:approve"));
  const isOwner = request?.submittedBy === currentUser?.id;
  const canReview = canApprove && !isOwner && request?.status === "pending";

  useEffect(() => {
    getRequest(id).then((r) => {
      setRequest(r);
      setLoading(false);
    });
  }, [id]);

  async function handleDecision(approved: boolean) {
    if (!request || !currentUser) return;
    setActing(true);
    try {
      const newStatus: RequestStatus = approved ? "approved" : "rejected";
      const updates: Partial<WorkRequest> = {
        status: newStatus,
        reviewedBy: currentUser.id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date().toISOString(),
        reviewComment: comment.trim() || undefined,
      };
      await updateRequest(request.id, updates);
      setRequest((r) => r ? { ...r, ...updates } : r);

      // Notify submitter
      await addNotification({
        userId: request.submittedBy,
        type: approved ? "request_approved" : "request_rejected",
        title: approved ? "Đơn từ được duyệt" : "Đơn từ bị từ chối",
        body: `"${request.templateName}" ${approved ? "đã được duyệt" : "bị từ chối"} bởi ${currentUser.name}.${comment ? ` Nhận xét: ${comment}` : ""}`,
        link: `/requests/${request.id}`,
        read: false,
        priority: "normal",
        createdAt: new Date().toISOString(),
      });

      toast.success(approved ? "Đã phê duyệt đơn." : "Đã từ chối đơn.");
      setComment("");
    } catch {
      toast.error("Thao tác thất bại.");
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    if (!request || !currentUser || !isOwner) return;
    if (!confirm("Huỷ đơn này?")) return;
    setActing(true);
    try {
      await updateRequest(request.id, { status: "cancelled" });
      setRequest((r) => r ? { ...r, status: "cancelled" } : r);
      toast.success("Đã huỷ đơn.");
    } catch {
      toast.error("Thao tác thất bại.");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }
  if (!request) {
    return <div className="text-center py-20 text-slate-400">Không tìm thấy đơn từ.</div>;
  }

  const cfg = STATUS_CONFIG[request.status];

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-[var(--foreground)] transition">
        <ArrowLeft className="w-4 h-4" /> Quay lại
      </button>

      {/* Header card */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{TYPE_ICONS[request.type] ?? "📄"}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[var(--foreground)]">{request.templateName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{request.submittedByName}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(request.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
              {request.department && <span>{request.department}</span>}
            </div>
          </div>
          <span className={cn("px-3 py-1 text-xs font-semibold rounded-full border", cfg.color)}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Form data */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" /> Nội dung đơn
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(request.formData).map(([key, val]) => (
            <div key={key} className="space-y-0.5">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{FIELD_LABELS[key] ?? key}</p>
              <p className="text-sm text-[var(--foreground)] font-medium">{String(val) || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attachments */}
      {request.attachments && request.attachments.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-blue-500" /> Minh chứng đính kèm
            <span className="text-xs font-normal text-slate-400">({request.attachments.length} file)</span>
          </h2>
          <ul className="space-y-2">
            {request.attachments.map((att) => (
              <li key={att.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="flex-1 text-sm text-[var(--foreground)] truncate">{att.name}</span>
                {att.size && (
                  <span className="text-xs text-slate-400 shrink-0">
                    {att.size < 1024 * 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                )}
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={att.name}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> Tải về
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Review result */}
      {request.status !== "pending" && (request.reviewedByName || request.reviewComment) && (
        <div className={cn("border rounded-2xl p-5 space-y-2", request.status === "approved" ? "bg-green-50 dark:bg-green-900/10 border-green-200" : "bg-red-50 dark:bg-red-900/10 border-red-200")}>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {request.status === "approved"
              ? <CheckCircle2 className="w-4 h-4 text-green-600" />
              : <XCircle className="w-4 h-4 text-red-600" />}
            {request.status === "approved" ? "Đã phê duyệt" : "Đã từ chối"}
          </h2>
          {request.reviewedByName && (
            <p className="text-xs text-slate-500">
              Bởi <strong>{request.reviewedByName}</strong> · {request.reviewedAt ? new Date(request.reviewedAt).toLocaleDateString("vi-VN") : ""}
            </p>
          )}
          {request.reviewComment && (
            <p className="text-sm text-[var(--foreground)] italic">"{request.reviewComment}"</p>
          )}
        </div>
      )}

      {/* Manager review panel */}
      {canReview && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" /> Xét duyệt
          </h2>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Nhận xét (tuỳ chọn)..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleDecision(false)}
              disabled={acting}
              className="flex-1 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Từ chối
            </button>
            <button
              onClick={() => handleDecision(true)}
              disabled={acting}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Phê duyệt
            </button>
          </div>
        </div>
      )}

      {/* Owner cancel */}
      {isOwner && request.status === "pending" && (
        <div className="flex justify-end">
          <button
            onClick={handleCancel}
            disabled={acting}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-red-300 hover:text-red-500 text-sm rounded-xl transition"
          >
            Huỷ đơn
          </button>
        </div>
      )}
    </div>
  );
}
