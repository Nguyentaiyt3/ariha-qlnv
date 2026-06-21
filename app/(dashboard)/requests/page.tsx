"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Clock, CheckCircle2, XCircle, Loader2,
  ChevronRight, Filter, Search, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  getRequestTemplates, subscribeRequests, saveRequest,
} from "@/lib/firebase/firestore";
import { generateId } from "@/lib/utils";
import type { RequestTemplate, RequestStatus } from "@/types";

// ── Built-in default templates (seed nếu chưa có trong Firestore) ──────────
const DEFAULT_TEMPLATES: Omit<RequestTemplate, "id" | "createdBy" | "createdAt">[] = [
  {
    name: "Đơn xin nghỉ phép",
    type: "leave",
    icon: "🏖️",
    description: "Nghỉ phép năm, nghỉ ốm, nghỉ việc riêng",
    approverRole: "teamLead",
    isActive: true,
    fields: [
      { key: "leaveType", label: "Loại nghỉ", type: "select", required: true, options: ["Nghỉ phép năm", "Nghỉ ốm", "Nghỉ việc riêng", "Nghỉ thai sản"] },
      { key: "fromDate", label: "Từ ngày", type: "date", required: true },
      { key: "toDate", label: "Đến ngày", type: "date", required: true },
      { key: "reason", label: "Lý do", type: "textarea", required: true, placeholder: "Mô tả lý do xin nghỉ..." },
      { key: "handover", label: "Người bàn giao công việc", type: "text", required: false },
    ],
  },
  {
    name: "Đăng ký tăng ca",
    type: "overtime",
    icon: "⏰",
    description: "Đăng ký làm thêm giờ ngoài giờ hành chính",
    approverRole: "teamLead",
    isActive: true,
    fields: [
      { key: "date", label: "Ngày tăng ca", type: "date", required: true },
      { key: "fromTime", label: "Từ giờ", type: "text", required: true, placeholder: "18:00" },
      { key: "toTime", label: "Đến giờ", type: "text", required: true, placeholder: "21:00" },
      { key: "reason", label: "Nội dung công việc", type: "textarea", required: true },
    ],
  },
  {
    name: "Đề nghị hoàn ứng chi phí",
    type: "expense",
    icon: "💰",
    description: "Hoàn lại chi phí công tác, tiếp khách, mua sắm",
    approverRole: "director",
    isActive: true,
    fields: [
      { key: "expenseType", label: "Loại chi phí", type: "select", required: true, options: ["Công tác phí", "Tiếp khách", "Văn phòng phẩm", "Đào tạo", "Khác"] },
      { key: "amount", label: "Số tiền (VNĐ)", type: "number", required: true },
      { key: "date", label: "Ngày phát sinh", type: "date", required: true },
      { key: "description", label: "Mô tả chi tiết", type: "textarea", required: true },
    ],
  },
  {
    name: "Đề nghị làm việc từ xa",
    type: "wfh",
    icon: "🏠",
    description: "Đăng ký làm việc tại nhà hoặc ngoài văn phòng",
    approverRole: "teamLead",
    isActive: true,
    fields: [
      { key: "fromDate", label: "Từ ngày", type: "date", required: true },
      { key: "toDate", label: "Đến ngày", type: "date", required: true },
      { key: "location", label: "Địa điểm làm việc", type: "text", required: true, placeholder: "Nhà riêng / Địa điểm khác..." },
      { key: "plan", label: "Kế hoạch công việc", type: "textarea", required: true },
    ],
  },
];

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: "Chờ duyệt",   color: "text-amber-600 bg-amber-50 border-amber-200",  Icon: Clock },
  approved:  { label: "Đã duyệt",    color: "text-green-600 bg-green-50 border-green-200",   Icon: CheckCircle2 },
  rejected:  { label: "Từ chối",     color: "text-red-600 bg-red-50 border-red-200",         Icon: XCircle },
  cancelled: { label: "Đã huỷ",      color: "text-slate-500 bg-slate-50 border-slate-200",   Icon: XCircle },
};

// ── CreateRequestModal ────────────────────────────────────────────────────────
function CreateRequestModal({
  template,
  currentUser,
  onClose,
}: {
  template: RequestTemplate;
  currentUser: { id: string; name: string; avatar?: string; department?: string };
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of template.fields) {
      if (f.required && !form[f.key]?.trim()) {
        toast.error(`Vui lòng điền "${f.label}"`);
        return;
      }
    }
    setSaving(true);
    try {
      const req: WorkRequest = {
        id: generateId("req"),
        templateId: template.id,
        templateName: template.name,
        type: template.type,
        title: `${template.name} — ${currentUser.name}`,
        submittedBy: currentUser.id,
        submittedByName: currentUser.name,
        submittedByAvatar: currentUser.avatar,
        department: currentUser.department,
        formData: form,
        status: "pending",
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveRequest(req);
      toast.success("Đã gửi đơn thành công!");
      onClose(); // subscribeRequests will update the list in real-time
    } catch {
      toast.error("Gửi đơn thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{template.icon ?? "📄"}</span>
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">{template.name}</h2>
              {template.description && <p className="text-xs text-slate-400 mt-0.5">{template.description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {template.fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-sm font-medium text-[var(--foreground)]">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  rows={3}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              ) : field.type === "select" ? (
                <select
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Chọn --</option>
                  {(field.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          ))}
        </form>

        <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition">
            Huỷ
          </button>
          <button
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Gửi đơn
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RequestsPage() {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<RequestTemplate | null>(null);
  const [tab, setTab] = useState<"mine" | "pending" | "all">("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  const canApprove = !!(currentUser && hasPermission(currentUser.role, "request:approve"));

  useEffect(() => {
    if (!currentUser) return;

    // Load templates — use defaults if Firestore is empty
    getRequestTemplates().then((fetched) => {
      if (fetched.length > 0) {
        setTemplates(fetched);
      } else {
        setTemplates(DEFAULT_TEMPLATES.map((t, i) => ({
          ...t,
          id: `default_tpl_${i}`,
          createdBy: "system",
          createdAt: new Date().toISOString(),
        })));
      }
    });

    const unsub = subscribeRequests(currentUser.id, canApprove, (reqs) => {
      setRequests(reqs);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser, canApprove]);

  const filtered = useMemo(() => {
    let result = requests;
    if (tab === "mine") result = result.filter((r) => r.submittedBy === currentUser?.id);
    if (tab === "pending") result = result.filter((r) => r.status === "pending");
    if (statusFilter !== "all") result = result.filter((r) => r.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.templateName.toLowerCase().includes(q) || r.submittedByName.toLowerCase().includes(q));
    }
    return result;
  }, [requests, tab, statusFilter, search, currentUser]);

  const pendingCount = requests.filter((r) => r.status === "pending" && canApprove && r.submittedBy !== currentUser?.id).length;

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Quản lý Đơn từ
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Tạo, theo dõi và duyệt đơn từ trực tuyến</p>
        </div>
      </div>

      {/* Template quick-select */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tạo đơn mới</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTemplate(t)}
              className="flex flex-col items-center gap-2 p-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition group text-center"
            >
              <span className="text-3xl">{t.icon ?? "📄"}</span>
              <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-blue-600 leading-tight">{t.name}</span>
            </button>
          ))}
          <button
            onClick={() => toast.info("Quản trị viên có thể tạo mẫu đơn tùy chỉnh trong Cài đặt.")}
            className="flex flex-col items-center gap-2 p-4 bg-[var(--card)] border border-dashed border-[var(--border)] rounded-2xl hover:border-blue-400 transition group text-center"
          >
            <span className="text-3xl">➕</span>
            <span className="text-xs font-medium text-slate-400 group-hover:text-blue-500">Mẫu tùy chỉnh</span>
          </button>
        </div>
      </div>

      {/* Tabs + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-[var(--muted)] rounded-xl p-1">
          {([
            { key: "mine", label: "Của tôi" },
            ...(canApprove ? [{ key: "pending", label: `Cần duyệt${pendingCount > 0 ? ` (${pendingCount})` : ""}` }] : []),
            ...(canApprove ? [{ key: "all", label: "Tất cả" }] : []),
          ] as { key: string; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={cn("px-3 py-1.5 text-sm font-medium rounded-lg transition", tab === t.key ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-500 hover:text-[var(--foreground)]")}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 relative min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm đơn..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RequestStatus | "all")}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
      </div>

      {/* Request list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
          <Inbox className="w-12 h-12" />
          <p className="font-medium">Không có đơn từ nào</p>
          <p className="text-sm">Nhấn vào mẫu đơn bên trên để tạo mới</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => {
            const cfg = STATUS_CONFIG[req.status];
            const Icon = cfg.Icon;
            return (
              <button
                key={req.id}
                onClick={() => router.push(`/requests/${req.id}`)}
                className="w-full flex items-center gap-4 p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 text-lg">
                  {templates.find((t) => t.id === req.templateId)?.icon ?? "📄"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)] truncate">{req.templateName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {req.submittedByName} · {new Date(req.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <span className={cn("flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border shrink-0", cfg.color)}>
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {activeTemplate && currentUser && (
        <CreateRequestModal
          template={activeTemplate}
          currentUser={currentUser}
          onClose={() => setActiveTemplate(null)}
        />
      )}
    </div>
  );
}
