"use client";

import { useState, useEffect, useMemo } from "react";
import {
  GitBranch, Save, Plus, Trash2, ArrowUp, ArrowDown,
  Loader2, Clock, CheckCircle2, XCircle, LayoutGrid, List,
  ChevronRight, Send,
} from "lucide-react";
import {
  getWorkflows, saveWorkflow, deleteWorkflow, approveWorkflow, addNotification,
} from "@/lib/firebase/firestore";
import type { Workflow, WorkflowStep, WorkflowNode, WorkflowEdge } from "@/types";
import { generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const WorkflowBuilder = dynamic(
  () => import("@/components/tasks/WorkflowBuilder"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Đang tải sơ đồ...
      </div>
    ),
  }
);

// ── Page view states ──────────────────────────────────────────
type PageView = "list" | "form" | "visual";

export default function WorkflowPage() {
  const { currentUser } = useAuthStore();

  // Data
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingWf, setRejectingWf] = useState<{ id: string; reason: string } | null>(null);

  // Navigation
  const [pageView, setPageView] = useState<PageView>("list");
  const [selectedId, setSelectedId] = useState<string>("");  // "" = new, else = existing id
  const [draftId, setDraftId] = useState<string>("");        // stable temp id for WorkflowBuilder

  // Form state
  const [name, setName]             = useState("Quy trình mới");
  const [description, setDescription] = useState("");
  const [department, setDepartment]   = useState("");
  const [steps, setSteps]             = useState<WorkflowStep[]>([]);
  const [saving, setSaving]           = useState(false);

  const canApprove = !!(currentUser && hasPermission(currentUser.role, "workflow:approve"));
  const canCreate  = !!(currentUser && hasPermission(currentUser.role, "workflow:create"));

  const pendingWorkflows = useMemo(
    () => canApprove ? workflows.filter((w) => w.status === "pending") : [],
    [workflows, canApprove]
  );
  const publishedWorkflows = useMemo(
    () => workflows.filter((w) => w.status === "published" || w.status === undefined),
    [workflows]
  );
  const selectedWorkflow = workflows.find((w) => w.id === selectedId) ?? null;

  useEffect(() => {
    getWorkflows(canApprove)
      .then(setWorkflows)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [canApprove]);

  // ── Navigation helpers ──────────────────────────────────────
  function goList() {
    setPageView("list");
    setSelectedId("");
  }

  function startCreate(view: PageView = "form") {
    setSelectedId("");
    setDraftId(generateId("draft"));
    setName("Quy trình mới");
    setDescription("");
    setDepartment("");
    setSteps([]);
    setPageView(view);
  }

  function openEdit(wfId: string, view: PageView = "form") {
    const wf = workflows.find((w) => w.id === wfId);
    if (!wf) return;
    setSelectedId(wfId);
    setName(wf.name);
    setDescription(wf.description ?? "");
    setDepartment(wf.department ?? "");
    setSteps(wf.steps ?? []);
    setPageView(view);
  }

  // ── Steps helpers ───────────────────────────────────────────
  function addStep() {
    setSteps((prev) => [
      ...prev,
      { id: generateId("wstep"), name: `Bước ${prev.length + 1}`, order: prev.length + 1 },
    ]);
  }
  function updateStep(idx: number, patch: Partial<WorkflowStep>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeStep(idx: number) {
    setSteps((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }))
    );
  }
  function moveStep(idx: number, dir: -1 | 1) {
    const arr = [...steps];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    setSteps(arr.map((s, i) => ({ ...s, order: i + 1 })));
  }

  // ── Save form (list-based editor) ───────────────────────────
  async function handleSaveForm() {
    if (!currentUser || !name.trim()) return;
    setSaving(true);
    try {
      const isNew = !selectedId;
      const existing = workflows.find((w) => w.id === selectedId);
      const wf: Workflow = {
        id: selectedId || generateId("workflow"),
        name: name.trim(),
        description: description.trim() || undefined,
        department: department.trim() || undefined,
        steps: steps.map((s, i) => ({ ...s, order: i + 1 })),
        nodes: existing?.nodes,
        edges: existing?.edges,
        status: existing?.status === "published"
          ? "published"
          : canApprove ? "published" : "pending",
        createdBy: existing?.createdBy ?? currentUser.id,
        createdByName: existing?.createdByName ?? currentUser.name,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflow(wf);
      if (isNew) {
        setWorkflows((ws) => [wf, ...ws]);
        setSelectedId(wf.id);
        toast.success(
          canApprove ? "Đã tạo và xuất bản quy trình." : "Đã gửi đề nghị phê duyệt. Chờ quản lý duyệt."
        );
      } else {
        setWorkflows((ws) => ws.map((w) => (w.id === selectedId ? wf : w)));
        toast.success("Đã cập nhật quy trình.");
      }
    } catch {
      toast.error("Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  // ── Save visual (WorkflowBuilder callback) ──────────────────
  async function handleSaveVisual(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    if (!currentUser) return;
    if (!name.trim()) { toast.error("Vui lòng nhập tên quy trình."); return; }

    const isNew = !selectedId;
    const existing = workflows.find((w) => w.id === selectedId);
    const id = selectedId || generateId("workflow");

    const wf: Workflow = {
      id,
      name: name.trim(),
      description: description.trim() || undefined,
      department: department.trim() || undefined,
      steps: existing?.steps ?? [],
      nodes,
      edges,
      status: existing?.status === "published"
        ? "published"
        : canApprove ? "published" : "pending",
      createdBy: existing?.createdBy ?? currentUser.id,
      createdByName: existing?.createdByName ?? currentUser.name,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveWorkflow(wf);

    if (isNew) {
      setWorkflows((ws) => [wf, ...ws]);
      setSelectedId(id);
      toast.success(
        canApprove ? "Đã tạo và xuất bản quy trình." : "Đã gửi đề nghị phê duyệt. Chờ quản lý duyệt."
      );
    } else {
      setWorkflows((ws) => ws.map((w) => (w.id === id ? wf : w)));
      toast.success("Đã lưu sơ đồ quy trình.");
    }
  }

  // ── Approve / reject ────────────────────────────────────────
  async function handleApproveWorkflow(id: string, approve: boolean, reason?: string) {
    const target = workflows.find((w) => w.id === id);
    setApprovingId(id);
    try {
      await approveWorkflow(id, approve, reason);
      if (approve) {
        setWorkflows((ws) => ws.map((w) => (w.id === id ? { ...w, status: "published" as const } : w)));
      } else {
        setWorkflows((ws) => ws.filter((w) => w.id !== id));
      }
      setRejectingWf(null);
      toast.success(approve ? "Đã duyệt quy trình." : "Đã từ chối quy trình.");
      if (target && currentUser && target.createdBy !== currentUser.id) {
        await addNotification({
          userId: target.createdBy,
          type: approve ? "request_approved" : "request_rejected",
          title: approve ? "Quy trình được duyệt" : "Quy trình bị từ chối",
          body: approve
            ? `Quy trình "${target.name}" đã được ${currentUser.name} phê duyệt.`
            : `Quy trình "${target.name}" bị từ chối bởi ${currentUser.name}.${reason ? ` Lý do: ${reason}` : ""}`,
          link: "/workflow",
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      toast.error("Thao tác thất bại.");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!confirm("Xóa quy trình này?")) return;
    try {
      await deleteWorkflow(selectedId);
      setWorkflows((ws) => ws.filter((w) => w.id !== selectedId));
      goList();
      toast.success("Đã xóa quy trình.");
    } catch {
      toast.error("Xóa thất bại.");
    }
  }

  // ── The workflow object to pass to WorkflowBuilder ──────────
  const builderWorkflow: Workflow = selectedWorkflow ?? {
    id: draftId || "draft",
    name: name.trim() || "Quy trình mới",
    description: description.trim() || undefined,
    department: department.trim() || undefined,
    steps: [],
    nodes: [],
    edges: [],
    status: "pending",
    createdBy: currentUser?.id ?? "",
    createdByName: currentUser?.name ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const isNew = !selectedId;

  // ═══════════════════════════════════════════════════════════
  // VIEW: VISUAL MODE (full canvas)
  // ═══════════════════════════════════════════════════════════
  if (pageView === "visual") {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
        {/* Mini header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)] shrink-0 flex-wrap">
          {/* Back */}
          <button
            onClick={goList}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm flex items-center gap-1 transition-colors"
          >
            <List className="w-4 h-4" /> Danh sách
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--border)]" />

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-[var(--border)] p-0.5 gap-0.5">
            <button
              onClick={() => setPageView("form")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <List className="w-3 h-3" /> Chỉnh sửa
            </button>
            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white">
              <LayoutGrid className="w-3 h-3" /> Sơ đồ
            </button>
          </div>

          {/* Name / dept inputs for new, or badge for existing */}
          {isNew ? (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên quy trình *"
                className="px-2.5 py-1 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Phòng ban"
                className="px-2.5 py-1 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
              />
            </>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-medium">
              {selectedWorkflow?.name}
            </span>
          )}

          {/* Workflow switcher for existing */}
          {!isNew && publishedWorkflows.length > 1 && (
            <select
              value={selectedId}
              onChange={(e) => openEdit(e.target.value, "visual")}
              className="ml-auto px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {publishedWorkflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-h-0">
          <WorkflowBuilder
            workflow={builderWorkflow}
            allWorkflows={publishedWorkflows}
            canEdit={canCreate}
            onSave={handleSaveVisual}
          />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW: FORM MODE (create / edit)
  // ═══════════════════════════════════════════════════════════
  if (pageView === "form") {
    const saveLabel = isNew
      ? (canApprove ? "Tạo & Xuất bản" : "Gửi đề nghị phê duyệt")
      : "Cập nhật quy trình";
    const SaveIcon = isNew && !canApprove ? Send : Save;

    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={goList}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
            >
              <List className="w-4 h-4" />
              Danh sách
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--border)]" />
            <span className="font-semibold text-[var(--foreground)]">
              {isNew ? "Tạo quy trình mới" : selectedWorkflow?.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-[var(--border)] p-0.5 gap-0.5">
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white">
                <List className="w-3 h-3" /> Chỉnh sửa
              </button>
              <button
                onClick={() => setPageView("visual")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <LayoutGrid className="w-3 h-3" /> Sơ đồ
              </button>
            </div>

            {/* Delete (edit mode only) */}
            {!isNew && (
              <button
                onClick={handleDelete}
                className="p-2 text-red-500 border border-red-200 hover:bg-red-50 rounded-xl transition"
                title="Xóa quy trình"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Workflow info */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                Tên quy trình <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Quy trình ký kết hợp đồng"
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Phòng ban</label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="VD: Phòng Kinh doanh"
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Mô tả quy trình</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn về quy trình..."
              rows={2}
              className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Steps */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Các bước trong quy trình
              {steps.length > 0 && (
                <span className="ml-2 text-xs text-slate-400 font-normal">({steps.length} bước)</span>
              )}
            </h2>
            <button
              onClick={addStep}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 text-blue-600 text-sm font-medium rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Thêm bước
            </button>
          </div>

          {steps.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-[var(--border)] rounded-xl">
              Chưa có bước nào. Nhấn &quot;Thêm bước&quot; để bắt đầu,
              hoặc chuyển sang <button onClick={() => setPageView("visual")} className="text-blue-500 underline">Sơ đồ trực quan</button>.
            </div>
          ) : (
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-4 bg-[var(--background)] border border-[var(--border)] rounded-xl"
                >
                  <div className="w-7 h-7 shrink-0 bg-blue-100 dark:bg-blue-900/30 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={step.name}
                      onChange={(e) => updateStep(idx, { name: e.target.value })}
                      placeholder="Tên bước..."
                      className="sm:col-span-2 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={step.durationDays ?? ""}
                        onChange={(e) =>
                          updateStep(idx, { durationDays: e.target.value ? Number(e.target.value) : undefined })
                        }
                        placeholder="Số ngày"
                        className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-400 shrink-0">ngày</span>
                    </div>
                    <input
                      value={step.description ?? ""}
                      onChange={(e) => updateStep(idx, { description: e.target.value || undefined })}
                      placeholder="Mô tả bước (tùy chọn)..."
                      className="sm:col-span-3 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 transition">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 transition">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeStep(idx)}
                      className="p-1 text-red-400 hover:text-red-600 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSaveForm}
          disabled={saving || !name.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold transition"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <SaveIcon className="w-4 h-4" />
          )}
          {saving ? "Đang lưu..." : saveLabel}
        </button>

        {isNew && !canApprove && (
          <p className="text-xs text-center text-[var(--muted-foreground)]">
            Quy trình sẽ được gửi đến quản lý để phê duyệt trước khi công khai.
          </p>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW: LIST MODE (default)
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-blue-500" />
          Quản lý quy trình
        </h1>

        {canCreate && (
          <div className="flex gap-2">
            <button
              onClick={() => startCreate("visual")}
              className="flex items-center gap-1.5 px-4 py-2 border border-blue-200 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 text-sm font-medium rounded-xl transition"
            >
              <LayoutGrid className="w-4 h-4" /> Vẽ sơ đồ mới
            </button>
            <button
              onClick={() => startCreate("form")}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Tạo quy trình mới
            </button>
          </div>
        )}
      </div>

      {/* Pending approval — managers only */}
      {canApprove && pendingWorkflows.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Chờ phê duyệt ({pendingWorkflows.length})
          </h2>
          <div className="space-y-2">
            {pendingWorkflows.map((wf) => (
              <div key={wf.id} className="bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-800 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <GitBranch className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{wf.name}</p>
                    <p className="text-xs text-slate-400">
                      {wf.createdByName} · {wf.steps.length} bước{wf.department && ` · ${wf.department}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setRejectingWf(rejectingWf?.id === wf.id ? null : { id: wf.id, reason: "" })}
                      disabled={approvingId === wf.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-xs font-medium transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Từ chối
                    </button>
                    <button
                      onClick={() => handleApproveWorkflow(wf.id, true)}
                      disabled={approvingId === wf.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
                    >
                      {approvingId === wf.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Duyệt
                    </button>
                  </div>
                </div>
                {rejectingWf?.id === wf.id && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
                    <p className="text-xs font-medium text-red-600 pt-2">Lý do từ chối <span className="text-red-500">*</span></p>
                    <textarea
                      autoFocus rows={2}
                      value={rejectingWf.reason}
                      onChange={(e) => setRejectingWf({ ...rejectingWf, reason: e.target.value })}
                      placeholder="Nhập lý do từ chối..."
                      className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg bg-white dark:bg-slate-900 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setRejectingWf(null)}
                        className="flex-1 py-1.5 border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition">
                        Huỷ
                      </button>
                      <button
                        onClick={() => {
                          if (!rejectingWf.reason.trim()) { toast.error("Vui lòng nhập lý do từ chối."); return; }
                          handleApproveWorkflow(wf.id, false, rejectingWf.reason.trim());
                        }}
                        disabled={approvingId === wf.id}
                        className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
                      >
                        {approvingId === wf.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Xác nhận từ chối
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : publishedWorkflows.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-2xl space-y-3">
          <GitBranch className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-slate-400 text-sm">Chưa có quy trình nào.</p>
          {canCreate && (
            <button
              onClick={() => startCreate("form")}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Tạo quy trình đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {publishedWorkflows.map((wf) => (
            <div
              key={wf.id}
              className="p-4 bg-[var(--card)] border border-[var(--border)] hover:border-blue-200 dark:hover:border-blue-800 rounded-2xl transition group"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--foreground)] truncate">{wf.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {wf.department && `${wf.department} · `}
                    {wf.steps.length} bước
                    {wf.nodes?.length ? ` · ${wf.nodes.length} nút sơ đồ` : ""}
                  </p>
                  {wf.description && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-1">{wf.description}</p>
                  )}
                </div>
                <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-50 dark:bg-green-900/20 text-green-600">
                  Đang áp dụng
                </span>
              </div>

              {/* Step pills (truncated) */}
              {wf.steps.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {wf.steps.slice(0, 4).map((s) => (
                    <span key={s.id} className="px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full">
                      {s.order}. {s.name}
                    </span>
                  ))}
                  {wf.steps.length > 4 && (
                    <span className="px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full">
                      +{wf.steps.length - 4} bước
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {canCreate && (
                  <button
                    onClick={() => openEdit(wf.id, "form")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[var(--border)] hover:border-blue-300 text-[var(--foreground)] hover:text-blue-600 text-xs font-medium rounded-lg transition"
                  >
                    <List className="w-3.5 h-3.5" /> Chỉnh sửa
                  </button>
                )}
                <button
                  onClick={() => openEdit(wf.id, "visual")}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-blue-600 text-xs font-medium rounded-lg transition"
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Xem sơ đồ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
