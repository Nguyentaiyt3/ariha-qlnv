"use client";

import { useEffect, useMemo, useState } from "react";
import { ScrollText, Loader2, Search, ChevronDown, ChevronUp, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { cn, formatDateTime } from "@/lib/utils";
import { ENTITY_TYPE_LABEL, actionLabel } from "@/lib/auditLabels";
import type { SystemAuditLog } from "@/types";

function exportCsv(rows: SystemAuditLog[]) {
  const headers = ["Thời gian", "Người thực hiện", "Vai trò", "Hành động", "Loại đối tượng", "Đối tượng", "Ghi chú"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) {
    lines.push([
      formatDateTime(r.createdAt),
      r.actorName || r.actorId,
      r.actorRole || "",
      actionLabel(r.action),
      ENTITY_TYPE_LABEL[r.entityType] ?? r.entityType,
      r.entityLabel || r.entityId,
      r.note || "",
    ].map(esc).join(","));
  }
  // Thêm BOM để Excel đọc đúng ký tự tiếng Việt (UTF-8)
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nhat_ky_he_thong_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogPage() {
  const { currentUser } = useAuthStore();
  const canView = !!currentUser && hasPermission(currentUser.role, "system:auditRead");

  const [logs, setLogs] = useState<SystemAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState(365);
  const [cleaning, setCleaning] = useState(false);

  function refreshLogs() {
    return fetch("/api/audit-logs?limit=300")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []));
  }

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    refreshLogs().finally(() => setLoading(false));
  }, [canView]);

  async function handleCleanup() {
    if (retentionDays < 30) {
      toast.error("Chỉ nên dọn log cũ hơn tối thiểu 30 ngày");
      return;
    }
    if (!confirm(`Xoá vĩnh viễn mọi nhật ký cũ hơn ${retentionDays} ngày? Không thể hoàn tác.`)) return;
    setCleaning(true);
    try {
      const res = await fetch("/api/audit-logs/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: retentionDays }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Dọn log thất bại");
      }
      const { deleted } = await res.json();
      toast.success(`Đã xoá ${deleted} dòng nhật ký cũ`);
      await refreshLogs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dọn log thất bại");
    } finally {
      setCleaning(false);
    }
  }

  const entityTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.entityType))), [logs]);

  const filtered = useMemo(() => {
    let list = logs;
    if (entityTypeFilter !== "all") list = list.filter((l) => l.entityType === entityTypeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) =>
        l.actorName?.toLowerCase().includes(q) ||
        l.entityLabel?.toLowerCase().includes(q) ||
        actionLabel(l.action).toLowerCase().includes(q) ||
        l.note?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [logs, entityTypeFilter, search]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)] text-sm">
        Bạn không có quyền xem nhật ký hệ thống.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-violet-500" /> Nhật ký hệ thống
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
          Ghi lại các hành động nhạy cảm: đổi phân quyền, tạo/gộp/vô hiệu hoá nhân viên, duyệt đơn nhân sự...
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo người thực hiện, đối tượng, hành động..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">Tất cả đối tượng</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>{ENTITY_TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <button
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40 rounded-lg transition shrink-0"
        >
          <Download className="w-4 h-4" /> Xuất CSV
        </button>
      </div>

      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-[var(--muted-foreground)]">Không có nhật ký nào</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((log) => {
              const isOpen = expanded === log.id;
              const hasDiff = log.before || log.after;
              return (
                <div key={log.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--muted)] transition"
                  >
                    <span className="font-mono text-[11px] text-slate-400 shrink-0 w-[130px]">
                      {formatDateTime(log.createdAt)}
                    </span>
                    <span className="text-sm text-[var(--foreground)] flex-1 min-w-0 truncate">
                      <span className="font-semibold">{log.actorName || log.actorId}</span>
                      <span className="text-slate-400 mx-1">–</span>
                      {actionLabel(log.action)}
                      {log.entityLabel && <span className="text-slate-400"> ({log.entityLabel})</span>}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                      {ENTITY_TYPE_LABEL[log.entityType] ?? log.entityType}
                    </span>
                    {hasDiff && (isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />)}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pl-[150px] space-y-2 text-xs">
                      {log.note && <p className="text-slate-500 dark:text-slate-400">Ghi chú: {log.note}</p>}
                      {log.before && (
                        <div>
                          <p className="text-slate-400 font-medium mb-0.5">Trước:</p>
                          <pre className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 overflow-x-auto text-slate-600 dark:text-slate-300">{JSON.stringify(log.before, null, 2)}</pre>
                        </div>
                      )}
                      {log.after && (
                        <div>
                          <p className="text-slate-400 font-medium mb-0.5">Sau:</p>
                          <pre className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 overflow-x-auto text-slate-600 dark:text-slate-300">{JSON.stringify(log.after, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chính sách lưu trữ — dọn log cũ thủ công (không có cron sẵn trong dự án) */}
      <div className="border border-[var(--border)] rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <Trash2 className="w-4 h-4 text-slate-400 shrink-0" />
        <p className="text-sm text-[var(--foreground)] flex-1 min-w-[200px]">
          Dọn nhật ký cũ hơn
        </p>
        <input
          type="number"
          min={30}
          value={retentionDays}
          onChange={(e) => setRetentionDays(Number(e.target.value))}
          className="w-20 px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p className="text-sm text-[var(--foreground)]">ngày</p>
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition"
        >
          {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Dọn ngay
        </button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Thao tác thủ công — dự án chưa cấu hình cron tự động dọn log định kỳ.
      </p>
    </div>
  );
}
