"use client";

import { useState, useEffect } from "react";
import { GitBranch, Save, Plus, Trash2, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { getWorkflows, saveWorkflow, deleteWorkflow } from "@/lib/firebase/firestore";
import type { Workflow, WorkflowStep } from "@/types";
import { generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";

export default function WorkflowPage() {
  const { currentUser } = useAuthStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("Quy trình mới");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkflows()
      .then(setWorkflows)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function loadWorkflow(id: string) {
    const wf = workflows.find((w) => w.id === id);
    if (!wf) return;
    setSelectedId(id);
    setName(wf.name);
    setDescription(wf.description ?? "");
    setDepartment(wf.department ?? "");
    setSteps(wf.steps ?? []);
  }

  function newWorkflow() {
    setSelectedId("");
    setName("Quy trình mới");
    setDescription("");
    setDepartment("");
    setSteps([]);
  }

  function addStep() {
    const newStep: WorkflowStep = {
      id: generateId("wstep"),
      name: `Bước ${steps.length + 1}`,
      order: steps.length + 1,
    };
    setSteps((prev) => [...prev, newStep]);
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
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setSteps(arr.map((s, i) => ({ ...s, order: i + 1 })));
  }

  async function handleSave() {
    if (!currentUser || !name.trim()) return;
    setSaving(true);
    try {
      const existing = workflows.find((w) => w.id === selectedId);
      const wf: Workflow = {
        id: selectedId || generateId("workflow"),
        name: name.trim(),
        description: description.trim() || undefined,
        department: department.trim() || undefined,
        steps: steps.map((s, i) => ({ ...s, order: i + 1 })),
        createdBy: existing?.createdBy ?? currentUser.id,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflow(wf);
      if (selectedId) {
        setWorkflows((ws) => ws.map((w) => (w.id === selectedId ? wf : w)));
      } else {
        setWorkflows((ws) => [wf, ...ws]);
        setSelectedId(wf.id);
      }
      toast.success("Đã lưu quy trình");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!confirm("Xóa quy trình này? Các nhiệm vụ đang dùng sẽ không bị ảnh hưởng.")) return;
    try {
      await deleteWorkflow(selectedId);
      setWorkflows((ws) => ws.filter((w) => w.id !== selectedId));
      newWorkflow();
      toast.success("Đã xóa quy trình");
    } catch {
      toast.error("Xóa thất bại");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-blue-500" />
          Quản lý quy trình
        </h1>
        <div className="flex gap-2 items-center">
          <select
            value={selectedId}
            onChange={(e) => (e.target.value ? loadWorkflow(e.target.value) : newWorkflow())}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">+ Tạo quy trình mới</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {selectedId && (
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

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
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
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Phòng ban
                </label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="VD: Phòng Kinh doanh"
                  className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                Mô tả quy trình
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả ngắn về quy trình, mục đích sử dụng..."
                rows={2}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Steps editor */}
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium rounded-xl transition"
              >
                <Plus className="w-4 h-4" /> Thêm bước
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-[var(--border)] rounded-xl">
                Chưa có bước nào. Nhấn &quot;Thêm bước&quot; để bắt đầu.
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-3 p-4 bg-[var(--background)] border border-[var(--border)] rounded-xl"
                  >
                    {/* Order badge */}
                    <div className="w-7 h-7 shrink-0 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                      {idx + 1}
                    </div>

                    {/* Fields */}
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
                            updateStep(idx, {
                              durationDays: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          placeholder="Số ngày"
                          className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs text-slate-400 shrink-0">ngày</span>
                      </div>
                      <input
                        value={step.description ?? ""}
                        onChange={(e) =>
                          updateStep(idx, { description: e.target.value || undefined })
                        }
                        placeholder="Mô tả bước (tùy chọn)..."
                        className="sm:col-span-3 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Move / delete controls */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => moveStep(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25 transition"
                        title="Di chuyển lên"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25 transition"
                        title="Di chuyển xuống"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeStep(idx)}
                        className="p-1 text-red-400 hover:text-red-600 transition"
                        title="Xóa bước"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold transition"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {selectedId ? "Cập nhật quy trình" : "Tạo quy trình"}
          </button>
        </>
      )}
    </div>
  );
}
