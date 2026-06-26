"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ClipboardList, Plus, ChevronDown, ChevronRight, Trash2,
  Loader2, CheckCircle2, Circle, Clock, Pencil, X,
  Target, Calendar, User, FolderPlus, Save,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import type { UnitPlan, PlanItem, PlanItemStatus, PlanMetricType, Task, TaskStatus } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────

const STATUS_CYCLE: Record<PlanItemStatus, PlanItemStatus> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

const PLAN_STATUS_META: Record<PlanItemStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  todo:  { label: "Chưa bắt đầu",  icon: <Circle className="w-4 h-4" />,       cls: "text-slate-400" },
  doing: { label: "Đang thực hiện", icon: <Clock className="w-4 h-4" />,        cls: "text-blue-500" },
  done:  { label: "Hoàn thành",    icon: <CheckCircle2 className="w-4 h-4" />, cls: "text-green-500" },
};

const TASK_STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  todo:        { label: "Chờ",      cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  in_progress: { label: "Đang làm", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  review:      { label: "Duyệt",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  done:        { label: "Xong",     cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  cancelled:   { label: "Hủy",      cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300" },
};

function getDescendantIds(items: PlanItem[], parentId: string): string[] {
  const children = items.filter(i => i.parentId === parentId);
  return children.flatMap(c => [c.id, ...getDescendantIds(items, c.id)]);
}

// ─── Cộng dồn nhiệm vụ → so chỉ tiêu kế hoạch ───────────────────

const METRIC_META: Record<PlanMetricType, { label: string; hint: string }> = {
  count:   { label: "Đếm số nhiệm vụ đạt", hint: "Mỗi nhiệm vụ hoàn thành & đạt = 1" },
  revenue: { label: "Cộng tiền thu",        hint: "Tổng thu (totalAmount) của nhiệm vụ đạt" },
  expense: { label: "Cộng tiền chi",        hint: "Tổng chi (totalExpense) của nhiệm vụ đạt" },
};

/** Nhiệm vụ được tính "đạt": đã hoàn thành + được duyệt + đánh giá 3T không phải "không hoàn thành". */
function isTaskAchieved(t: Task): boolean {
  return (
    t.status === "done" &&
    t.completionProposal?.status === "approved" &&
    t.completionProposal?.score3T?.grade !== "khongHoanThanh"
  );
}

/** Mức đóng góp của 1 nhiệm vụ vào chỉ tiêu (ưu tiên ghi đè tay). */
function taskContribution(t: Task, metric: PlanMetricType): number {
  if (typeof t.planContribution === "number") return t.planContribution;
  if (metric === "revenue") return t.totalAmount ?? 0;
  if (metric === "expense") return t.totalExpense ?? 0;
  return 1; // count
}

interface PlanAchievement {
  metric: PlanMetricType;
  planTasks: Task[];
  achievedTasks: Task[];
  achieved: number;       // tổng đã đạt (số task hoặc số tiền)
  inProgress: number;     // số nhiệm vụ chưa đạt nhưng đang chạy
  pct: number;
}

function computePlanAchievement(plan: UnitPlan, tasks: Task[]): PlanAchievement {
  const metric = plan.metricType ?? "count";
  const planTasks = tasks.filter(t => t.planId === plan.id);
  const achievedTasks = planTasks.filter(isTaskAchieved);
  const achieved = achievedTasks.reduce((sum, t) => sum + taskContribution(t, metric), 0);
  const inProgress = planTasks.filter(t => !isTaskAchieved(t) && t.status !== "cancelled").length;
  const pct = plan.target > 0 ? Math.min(100, Math.round((achieved / plan.target) * 100)) : 0;
  return { metric, planTasks, achievedTasks, achieved, inProgress, pct };
}

/** Định dạng giá trị theo loại chỉ tiêu (tiền có phân tách hàng nghìn). */
function formatMetricValue(value: number, metric: PlanMetricType): string {
  if (metric === "count") return String(value);
  return value.toLocaleString("vi-VN");
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
  return data as T;
}

// ─── Item Row ────────────────────────────────────────────────────

interface ItemRowProps {
  item: PlanItem;
  allItems: PlanItem[];
  depth: number;
  canManage: boolean;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onStatusCycle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function ItemRow({
  item, allItems, depth, canManage, expanded,
  onToggleExpand, onStatusCycle, onAddChild, onDelete, onRename,
}: ItemRowProps) {
  const children = allItems.filter(i => i.parentId === item.id);
  const isExpanded = expanded.has(item.id);
  const meta = PLAN_STATUS_META[item.status];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  const doneChildren = children.filter(c => c.status === "done").length;

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) onRename(item.id, trimmed);
    setEditing(false);
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => children.length > 0 && onToggleExpand(item.id)}
          className={cn("shrink-0 text-slate-400", children.length === 0 && "invisible")}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Status toggle */}
        <button
          onClick={() => canManage && onStatusCycle(item.id)}
          className={cn("shrink-0 transition-colors", meta.cls, !canManage && "cursor-default")}
          title={meta.label}
        >
          {meta.icon}
        </button>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setDraft(item.name); setEditing(false); }
              }}
              className="w-full text-sm bg-white dark:bg-slate-800 border border-blue-400 rounded px-2 py-0.5 outline-none"
            />
          ) : (
            <span
              className={cn(
                "text-sm",
                item.status === "done" && "line-through text-slate-400"
              )}
              onDoubleClick={() => canManage && setEditing(true)}
            >
              {item.name}
            </span>
          )}
        </div>

        {/* Children count */}
        {children.length > 0 && (
          <span className="text-xs text-slate-400 shrink-0">{doneChildren}/{children.length}</span>
        )}

        {/* Actions (hover) */}
        {canManage && !editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-slate-400 hover:text-blue-500 rounded"
              title="Đổi tên"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={() => onAddChild(item.id)}
              className="p-1 text-slate-400 hover:text-green-500 rounded"
              title="Thêm mục con"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1 text-slate-400 hover:text-red-500 rounded"
              title="Xóa"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && children
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(child => (
          <ItemRow
            key={child.id}
            item={child}
            allItems={allItems}
            depth={depth + 1}
            canManage={canManage}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onStatusCycle={onStatusCycle}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
    </div>
  );
}

// ─── Plan Form (dùng chung cho Create & Edit) ─────────────────────

interface PlanFormData {
  name: string;
  description: string;
  year: number;
  target: number;
  unit: string;
  metricType: PlanMetricType;
  department: string;
}

interface PlanFormModalProps {
  title: string;
  initial: PlanFormData;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: PlanFormData) => void;
}

function PlanFormModal({ title, initial, saving, onClose, onSubmit }: PlanFormModalProps) {
  const [form, setForm] = useState<PlanFormData>(initial);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tên kế hoạch <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="VD: Tổ chức Hội thảo khoa học"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mô tả</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Năm</label>
              <input
                type="number" min={2020} max={2040} value={form.year}
                onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Chỉ tiêu</label>
              <input
                type="number" min={1} value={form.target}
                onChange={e => setForm(f => ({ ...f, target: Number(e.target.value) }))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Đơn vị</label>
              <input
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder={form.metricType === "count" ? "lần, buổi..." : "đồng, triệu..."}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cách tính đạt chỉ tiêu</label>
            <select
              value={form.metricType}
              onChange={e => setForm(f => ({ ...f, metricType: e.target.value as PlanMetricType }))}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(METRIC_META) as PlanMetricType[]).map(m => (
                <option key={m} value={m}>{METRIC_META[m].label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">{METRIC_META[form.metricType].hint} · so với chỉ tiêu {form.target} {form.unit}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phòng ban</label>
            <input
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              placeholder="Để trống nếu toàn đơn vị"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Hủy
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Lưu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Plan Detail ─────────────────────────────────────────────────

// ─── Hàng nhiệm vụ trong kế hoạch (kèm đóng góp + ghi đè tay) ────
interface PlanTaskRowProps {
  task: Task;
  parentItem?: PlanItem;
  metric: PlanMetricType;
  canManage: boolean;
  onContribution: (taskId: string, value: number | null) => void;
}

function PlanTaskRow({ task, parentItem, metric, canManage, onContribution }: PlanTaskRowProps) {
  const achieved = isTaskAchieved(task);
  const overridden = typeof task.planContribution === "number";
  const contrib = taskContribution(task, metric);
  const meta = TASK_STATUS_META[task.status];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(contrib));

  function save() {
    const v = Number(draft.replace(/[^\d.-]/g, ""));
    onContribution(task.id, Number.isFinite(v) ? v : null);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
      <span className={cn("shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium", meta.cls)}>{meta.label}</span>
      <div className="flex-1 min-w-0">
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block"
          title={task.name}
        >
          {task.name}
        </Link>
        {parentItem && <p className="text-[10px] text-slate-400 mt-0.5 truncate">Thuộc: {parentItem.name}</p>}
      </div>

      {editing ? (
        <div className="flex items-center gap-1 shrink-0">
          <input
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-24 px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={save} title="Lưu" className="text-green-600 hover:text-green-700"><CheckCircle2 className="w-4 h-4" /></button>
          {overridden && (
            <button onClick={() => { onContribution(task.id, null); setEditing(false); }} title="Về số tự động" className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn("text-xs font-semibold", achieved ? "text-green-600 dark:text-green-400" : "text-slate-300 dark:text-slate-600")}
            title={achieved ? "Đã tính vào kế hoạch" : "Chưa đạt — không tính vào kế hoạch"}
          >
            {achieved ? `+${formatMetricValue(contrib, metric)}` : "—"}
            {overridden && <span className="ml-0.5 text-amber-500" title="Đã chỉnh tay">✎</span>}
          </span>
          {canManage && achieved && (
            <button onClick={() => { setDraft(String(contrib)); setEditing(true); }} title="Điều chỉnh mức đóng góp" className="text-slate-300 hover:text-blue-500">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface PlanDetailProps {
  plan: UnitPlan;
  allTasks: Task[];
  canManage: boolean;
  onUpdated: (updated: UnitPlan) => void;
  onDeleted: () => void;
  onTaskContribution: (taskId: string, value: number | null) => void;
}

function PlanDetail({ plan, allTasks, canManage, onUpdated, onDeleted, onTaskContribution }: PlanDetailProps) {
  const [items, setItems] = useState<PlanItem[]>(plan.items ?? []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Debounce refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PlanItem[] | null>(null);

  useEffect(() => {
    setItems(plan.items ?? []);
    const topIds = (plan.items ?? []).filter(i => i.parentId === null).map(i => i.id);
    setExpanded(new Set(topIds));
    setHasUnsaved(false);
  }, [plan.id]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingRef.current) {
        fetch(`/api/unit-plans/${plan.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: pendingRef.current }),
        });
      }
    };
  }, [plan.id]);

  async function flushSave(itemsToSave: PlanItem[]) {
    setSaving(true);
    try {
      await apiFetch(`/api/unit-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSave }),
      });
      onUpdated({ ...plan, items: itemsToSave });
      setHasUnsaved(false);
      pendingRef.current = null;
    } catch {
      toast.error("Lưu thất bại — thử lại sau");
    } finally {
      setSaving(false);
    }
  }

  // Debounced save: gộp nhiều thay đổi liên tiếp trong 1.2s thành 1 request
  function scheduleItemsSave(newItems: PlanItem[]) {
    pendingRef.current = newItems;
    setHasUnsaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (pendingRef.current) flushSave(pendingRef.current);
    }, 1200);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addItem(parentId: string | null) {
    const newItem: PlanItem = {
      id: generateId("pi"),
      parentId,
      name: "Nhiệm vụ mới",
      status: "todo",
      order: items.filter(i => i.parentId === parentId).length,
    };
    const newItems = [...items, newItem];
    setItems(newItems);
    if (parentId) setExpanded(prev => new Set([...prev, parentId]));
    scheduleItemsSave(newItems);
  }

  function statusCycle(itemId: string) {
    const newItems = items.map(i =>
      i.id === itemId ? { ...i, status: STATUS_CYCLE[i.status] } : i
    );
    setItems(newItems);
    scheduleItemsSave(newItems);
  }

  function deleteItem(itemId: string) {
    const toRemove = new Set([itemId, ...getDescendantIds(items, itemId)]);
    const newItems = items.filter(i => !toRemove.has(i.id));
    setItems(newItems);
    scheduleItemsSave(newItems);
  }

  function renameItem(itemId: string, name: string) {
    const newItems = items.map(i => i.id === itemId ? { ...i, name } : i);
    setItems(newItems);
    scheduleItemsSave(newItems);
  }

  async function handleEditPlan(data: PlanFormData) {
    setEditSaving(true);
    try {
      await apiFetch(`/api/unit-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      onUpdated({ ...plan, ...data });
      setShowEditModal(false);
      toast.success("Đã cập nhật kế hoạch");
    } catch {
      toast.error("Cập nhật thất bại");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeletePlan() {
    if (!confirm(`Xóa kế hoạch "${plan.name}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await apiFetch(`/api/unit-plans/${plan.id}`, { method: "DELETE" });
      toast.success("Đã xóa kế hoạch");
      onDeleted();
    } catch {
      toast.error("Xóa thất bại");
    }
  }

  const topItems = items.filter(i => i.parentId === null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Tiến độ thực tế: cộng dồn nhiệm vụ đạt → so chỉ tiêu
  const ach = computePlanAchievement(plan, allTasks);
  const progressPct = ach.pct;
  const metric = ach.metric;
  const planTasks = ach.planTasks;
  const [showTasks, setShowTasks] = useState(planTasks.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white truncate">{plan.name}</h2>
            {plan.description && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Năm {plan.year}
              </span>
              <span className="flex items-center gap-1">
                <Target className="w-4 h-4" />
                Chỉ tiêu: {plan.target} {plan.unit}
              </span>
              {plan.department && (
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {plan.department}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                Sửa
              </button>
              <button
                onClick={handleDeletePlan}
                className="p-1.5 text-slate-400 hover:text-red-500 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Xóa kế hoạch"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-slate-600 dark:text-slate-400">
              Tiến độ: <span className="font-semibold text-slate-800 dark:text-white">
                {formatMetricValue(ach.achieved, metric)}/{formatMetricValue(plan.target, metric)}
              </span> {plan.unit}
            </span>
            <span className={cn(
              "font-semibold",
              progressPct >= 100 ? "text-green-600" : progressPct >= 50 ? "text-blue-600" : "text-slate-500"
            )}>
              {progressPct}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressPct >= 100 ? "bg-green-500" : progressPct >= 50 ? "bg-blue-500" : "bg-blue-400"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {METRIC_META[metric].label} · {ach.achievedTasks.length} nhiệm vụ đạt
            {ach.inProgress > 0 && ` · ${ach.inProgress} đang làm`}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {canManage && (
            <button
              onClick={() => addItem(null)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium mb-3 px-1"
            >
              <FolderPlus className="w-4 h-4" />
              Thêm nhiệm vụ cấp 1
            </button>
          )}

          {topItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Chưa có nhiệm vụ nào</p>
              {canManage && <p className="text-xs mt-1">Nhấn "Thêm nhiệm vụ cấp 1" để bắt đầu</p>}
            </div>
          ) : (
            <div className="space-y-0.5">
              {topItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  allItems={items}
                  depth={0}
                  canManage={canManage}
                  expanded={expanded}
                  onToggleExpand={toggleExpand}
                  onStatusCycle={statusCycle}
                  onAddChild={addItem}
                  onDelete={deleteItem}
                  onRename={renameItem}
                />
              ))}
            </div>
          )}

          {/* Tasks from task system linked to this plan */}
          {planTasks.length > 0 && (
            <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
              <button
                onClick={() => setShowTasks(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 w-full"
              >
                {showTasks ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Nhiệm vụ hệ thống ({planTasks.length})
                <span className="text-xs font-normal text-slate-400">đã gắn từ trang Nhiệm vụ</span>
              </button>

              {showTasks && (
                <div className="space-y-1">
                  {planTasks.map(task => (
                    <PlanTaskRow
                      key={task.id}
                      task={task}
                      parentItem={task.planItemParentId ? items.find(i => i.id === task.planItemParentId) : undefined}
                      metric={metric}
                      canManage={canManage}
                      onContribution={onTaskContribution}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save status bar */}
      <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs min-h-[36px]">
        {saving ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            <span className="text-slate-400">Đang lưu...</span>
          </>
        ) : hasUnsaved ? (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-amber-600 dark:text-amber-400">Chưa lưu</span>
            <button
              onClick={() => pendingRef.current && flushSave(pendingRef.current)}
              className="ml-1 flex items-center gap-1 text-blue-500 hover:text-blue-700"
            >
              <Save className="w-3 h-3" /> Lưu ngay
            </button>
          </>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">Đã lưu</span>
        )}
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <PlanFormModal
          title="Chỉnh sửa kế hoạch"
          initial={{
            name: plan.name,
            description: plan.description ?? "",
            year: plan.year,
            target: plan.target,
            unit: plan.unit,
            metricType: plan.metricType ?? "count",
            department: plan.department ?? "",
          }}
          saving={editSaving}
          onClose={() => setShowEditModal(false)}
          onSubmit={handleEditPlan}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function UnitPlansPage() {
  const { currentUser } = useAuthStore();
  const [plans, setPlans] = useState<UnitPlan[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | "all">(new Date().getFullYear());

  const canManage = !!currentUser && hasPermission(currentUser.role, "plan:manage");

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const [plansData, tasksData] = await Promise.all([
        apiFetch<{ plans: UnitPlan[] }>("/api/unit-plans"),
        apiFetch<{ tasks: Task[] }>("/api/tasks").catch(() => ({ tasks: [] })),
      ]);
      setPlans(plansData.plans);
      setAllTasks(tasksData.tasks);
      if (plansData.plans.length > 0 && !selectedId) {
        setSelectedId(plansData.plans[0].id);
      }
    } catch {
      toast.error("Không thể tải danh sách kế hoạch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const years = [...new Set(plans.map(p => p.year))].sort((a, b) => b - a);
  const filteredPlans = selectedYear === "all" ? plans : plans.filter(p => p.year === selectedYear);
  const selectedPlan = plans.find(p => p.id === selectedId) ?? null;

  async function handleCreate(data: PlanFormData) {
    setCreateSaving(true);
    try {
      const { plan } = await apiFetch<{ plan: UnitPlan }>("/api/unit-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, items: [] }),
      });
      setPlans(prev => [plan, ...prev]);
      setSelectedId(plan.id);
      setShowModal(false);
      toast.success("Tạo kế hoạch thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo thất bại");
    } finally {
      setCreateSaving(false);
    }
  }

  function handleUpdated(updated: UnitPlan) {
    setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
  }

  function handleDeleted() {
    setPlans(prev => {
      const next = prev.filter(p => p.id !== selectedId);
      setSelectedId(next.length > 0 ? next[0].id : null);
      return next;
    });
  }

  // Ghi đè / xoá ghi đè mức đóng góp của 1 nhiệm vụ vào kế hoạch
  async function handleTaskContribution(taskId: string, value: number | null) {
    // Optimistic
    setAllTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, planContribution: value ?? undefined } : t
    ));
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planContribution: value }),
      });
      toast.success(value === null ? "Đã về số tự động" : "Đã cập nhật mức đóng góp");
    } catch {
      toast.error("Cập nhật thất bại");
      fetchPlans();
    }
  }

  if (!currentUser) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-950">
      {/* Left panel */}
      <div className="w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              Kế hoạch đơn vị
            </h1>
            {canManage && (
              <button
                onClick={() => setShowModal(true)}
                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                title="Tạo kế hoạch mới"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Year filter */}
        {years.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedYear("all")}
              className={cn(
                "text-xs px-2 py-1 rounded-full font-medium transition",
                selectedYear === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              Tất cả
            </button>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={cn(
                  "text-xs px-2 py-1 rounded-full font-medium transition",
                  selectedYear === y
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Plan list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có kế hoạch nào</p>
              {canManage && (
                <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-blue-600 hover:underline">
                  + Tạo kế hoạch đầu tiên
                </button>
              )}
            </div>
          ) : (
            filteredPlans.map(plan => {
              const cardAch = computePlanAchievement(plan, allTasks);
              const pct = cardAch.pct;
              const isSelected = plan.id === selectedId;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedId(plan.id)}
                  className={cn(
                    "w-full text-left px-3 py-3 mx-2 rounded-xl transition mb-1 border",
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700"
                      : "bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  )}
                  style={{ width: "calc(100% - 16px)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn(
                      "text-sm font-medium leading-tight line-clamp-2",
                      isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"
                    )}>
                      {plan.name}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0 mt-0.5">{plan.year}</span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span>{formatMetricValue(cardAch.achieved, cardAch.metric)}/{formatMetricValue(plan.target, cardAch.metric)} {plan.unit}</span>
                      <span className={cn(pct >= 100 ? "text-green-600" : pct >= 50 ? "text-blue-500" : "")}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-blue-300"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-hidden">
        {selectedPlan ? (
          <PlanDetail
            key={selectedPlan.id}
            plan={selectedPlan}
            allTasks={allTasks}
            canManage={canManage}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            onTaskContribution={handleTaskContribution}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <ClipboardList className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Chọn một kế hoạch để xem chi tiết</p>
            {canManage && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Tạo kế hoạch mới
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <PlanFormModal
          title="Tạo kế hoạch mới"
          initial={{
            name: "",
            description: "",
            year: new Date().getFullYear(),
            target: 1,
            unit: "lần",
            metricType: "count",
            department: currentUser?.department ?? "",
          }}
          saving={createSaving}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

// ─── Local type (reuse PlanFormData in both modals) ──────────────
interface PlanFormData {
  name: string;
  description: string;
  year: number;
  target: number;
  unit: string;
  metricType: PlanMetricType;
  department: string;
}
