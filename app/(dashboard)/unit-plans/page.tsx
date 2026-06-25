"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ClipboardList, Plus, ChevronDown, ChevronRight, Trash2,
  Loader2, CheckCircle2, Circle, Clock, Pencil, X, Check,
  Target, Calendar, User, MoreHorizontal, FolderPlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import type { UnitPlan, PlanItem, PlanItemStatus } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────

const STATUS_CYCLE: Record<PlanItemStatus, PlanItemStatus> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

const STATUS_META: Record<PlanItemStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  todo:  { label: "Chưa bắt đầu", icon: <Circle className="w-4 h-4" />,        cls: "text-slate-400" },
  doing: { label: "Đang thực hiện", icon: <Clock className="w-4 h-4" />,        cls: "text-blue-500" },
  done:  { label: "Hoàn thành",    icon: <CheckCircle2 className="w-4 h-4" />,  cls: "text-green-500" },
};

function getDescendantIds(items: PlanItem[], parentId: string): string[] {
  const children = items.filter(i => i.parentId === parentId);
  return children.flatMap(c => [c.id, ...getDescendantIds(items, c.id)]);
}

function countDone(items: PlanItem[], parentId: string | null): number {
  return items.filter(i => i.parentId === parentId && i.status === "done").length;
}

function countTotal(items: PlanItem[], parentId: string | null): number {
  return items.filter(i => i.parentId === parentId).length;
}

// ─── API helpers ─────────────────────────────────────────────────

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
  const meta = STATUS_META[item.status];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) onRename(item.id, trimmed);
    setEditing(false);
  }

  const doneChildren = children.filter(c => c.status === "done").length;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => children.length > 0 && onToggleExpand(item.id)}
          className={cn("shrink-0 text-slate-400", children.length === 0 && "invisible")}
        >
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
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
            className="flex-1 text-sm bg-white dark:bg-slate-800 border border-blue-400 rounded px-2 py-0.5 outline-none"
          />
        ) : (
          <span
            className={cn(
              "flex-1 text-sm",
              item.status === "done" && "line-through text-slate-400"
            )}
            onDoubleClick={() => canManage && setEditing(true)}
          >
            {item.name}
          </span>
        )}

        {/* Children progress */}
        {children.length > 0 && (
          <span className="text-xs text-slate-400 shrink-0">
            {doneChildren}/{children.length}
          </span>
        )}

        {/* Deadline */}
        {item.deadline && (
          <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
            {item.deadline}
          </span>
        )}

        {/* Actions (visible on hover) */}
        {canManage && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
              title="Thêm nhiệm vụ con"
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

// ─── New Plan Modal ──────────────────────────────────────────────

interface NewPlanModalProps {
  onClose: () => void;
  onCreated: (plan: UnitPlan) => void;
}

function NewPlanModal({ onClose, onCreated }: NewPlanModalProps) {
  const { currentUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    year: new Date().getFullYear(),
    target: 1,
    unit: "lần",
    department: currentUser?.department ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const { plan } = await apiFetch<{ plan: UnitPlan }>("/api/unit-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      onCreated(plan);
      toast.success("Tạo kế hoạch thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white">Tạo kế hoạch mới</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mô tả
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Năm
              </label>
              <input
                type="number"
                min={2020}
                max={2040}
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Chỉ tiêu
              </label>
              <input
                type="number"
                min={1}
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: Number(e.target.value) }))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Đơn vị tính
              </label>
              <input
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="lần, buổi, đề tài..."
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Phòng ban
            </label>
            <input
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              placeholder="Tên phòng ban (để trống nếu toàn đơn vị)"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Tạo kế hoạch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Plan Detail ─────────────────────────────────────────────────

interface PlanDetailProps {
  plan: UnitPlan;
  canManage: boolean;
  onUpdated: (updated: UnitPlan) => void;
  onDeleted: () => void;
}

function PlanDetail({ plan, canManage, onUpdated, onDeleted }: PlanDetailProps) {
  const [items, setItems] = useState<PlanItem[]>(plan.items ?? []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(plan.items ?? []);
    // Auto-expand top-level items
    const topIds = (plan.items ?? []).filter(i => i.parentId === null).map(i => i.id);
    setExpanded(new Set(topIds));
  }, [plan.id, plan.items]);

  async function persistItems(newItems: PlanItem[]) {
    setSaving(true);
    try {
      await apiFetch(`/api/unit-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newItems }),
      });
      onUpdated({ ...plan, items: newItems });
    } catch (err) {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
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
    persistItems(newItems);
  }

  function statusCycle(itemId: string) {
    const newItems = items.map(i =>
      i.id === itemId ? { ...i, status: STATUS_CYCLE[i.status] } : i
    );
    setItems(newItems);
    persistItems(newItems);
  }

  function deleteItem(itemId: string) {
    const toRemove = new Set([itemId, ...getDescendantIds(items, itemId)]);
    const newItems = items.filter(i => !toRemove.has(i.id));
    setItems(newItems);
    persistItems(newItems);
  }

  function renameItem(itemId: string, name: string) {
    const newItems = items.map(i => i.id === itemId ? { ...i, name } : i);
    setItems(newItems);
    persistItems(newItems);
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
  const doneTop = topItems.filter(i => i.status === "done").length;
  const progressPct = plan.target > 0 ? Math.min(100, Math.round((doneTop / plan.target) * 100)) : 0;

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
          {canManage && (
            <button
              onClick={handleDeletePlan}
              className="text-slate-400 hover:text-red-500 transition p-1 rounded"
              title="Xóa kế hoạch"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-slate-600 dark:text-slate-400">
              Tiến độ: <span className="font-semibold text-slate-800 dark:text-white">{doneTop}/{plan.target}</span> {plan.unit}
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
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {/* Add top-level item */}
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
              {canManage && (
                <p className="text-xs mt-1">Nhấn "Thêm nhiệm vụ cấp 1" để bắt đầu</p>
              )}
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
        </div>
      </div>

      {saving && (
        <div className="px-5 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Đang lưu...
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function UnitPlansPage() {
  const { currentUser } = useAuthStore();
  const [plans, setPlans] = useState<UnitPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | "all">(new Date().getFullYear());

  const canManage = !!currentUser && hasPermission(currentUser.role, "plan:manage");

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { plans: data } = await apiFetch<{ plans: UnitPlan[] }>("/api/unit-plans");
      setPlans(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch {
      toast.error("Không thể tải danh sách kế hoạch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const years = [...new Set(plans.map(p => p.year))].sort((a, b) => b - a);

  const filteredPlans = selectedYear === "all"
    ? plans
    : plans.filter(p => p.year === selectedYear);

  const selectedPlan = plans.find(p => p.id === selectedId) ?? null;

  function handleCreated(plan: UnitPlan) {
    setPlans(prev => [plan, ...prev]);
    setSelectedId(plan.id);
    setShowModal(false);
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

  if (!currentUser) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-950">
      {/* Left panel — Plan list */}
      <div className="w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
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
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  + Tạo kế hoạch đầu tiên
                </button>
              )}
            </div>
          ) : (
            filteredPlans.map(plan => {
              const topItems = (plan.items ?? []).filter(i => i.parentId === null);
              const done = topItems.filter(i => i.status === "done").length;
              const pct = plan.target > 0 ? Math.min(100, Math.round((done / plan.target) * 100)) : 0;
              const isSelected = plan.id === selectedId;

              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedId(plan.id)}
                  className={cn(
                    "w-full text-left px-3 py-3 mx-2 rounded-xl transition mb-1",
                    "border",
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
                      <span>{done}/{plan.target} {plan.unit}</span>
                      <span className={cn(
                        pct >= 100 ? "text-green-600" : pct >= 50 ? "text-blue-500" : ""
                      )}>{pct}%</span>
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

      {/* Right panel — Plan detail */}
      <div className="flex-1 overflow-hidden">
        {selectedPlan ? (
          <PlanDetail
            key={selectedPlan.id}
            plan={selectedPlan}
            canManage={canManage}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
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

      {showModal && (
        <NewPlanModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
