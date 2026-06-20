"use client";

import { useState, useRef } from "react";
import {
  Plus, ChevronDown, ChevronRight, Camera, Link2, X,
  Loader2, TrendingUp, TrendingDown, Image as ImageIcon, Paperclip,
} from "lucide-react";
import { cn, generateId, formatDate, priorityLabel } from "@/lib/utils";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { Task, TaskStep, StepSubTask, User, TaskPriority, Proof } from "@/types";
import { toast } from "sonner";

interface Props {
  task: Task;
  users: User[];
  currentUser: User;
  canAssignSteps: boolean;
  onSave: (updates: Partial<Task>) => Promise<void>;
}

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  medium: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const BLANK_SUB = {
  userId: "",
  priority: "medium" as TaskPriority,
  deadline: "",
  note: "",
  amountType: "none" as "none" | "income" | "expense",
  amount: 0,
};

// ── Main component ────────────────────────────────────────────

export function StepsTab({ task, users, currentUser, canAssignSteps, onSave }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [assigningStep, setAssigningStep] = useState<string | null>(null);
  const [addSubStep, setAddSubStep] = useState<string | null>(null);
  const [subForm, setSubForm] = useState(BLANK_SUB);
  // Progress edit key: "stepId" or "stepId::subId"
  const [editKey, setEditKey] = useState<string | null>(null);
  const [progressVal, setProgressVal] = useState(0);
  // Proof panel key: "stepId" or "stepId::subId"
  const [proofKey, setProofKey] = useState<string | null>(null);
  const [proofMode, setProofMode] = useState<"link" | "image">("link");
  const [proofUrl, setProofUrl] = useState("");
  const [proofLabel, setProofLabel] = useState("");
  const [proofSaving, setProofSaving] = useState(false);

  const steps = task.steps ?? [];
  const activeUsers = users.filter((u) => u.isActive);

  // ── Helpers ──────────────────────────────────────────────────

  function patchStep(stepId: string, patch: Partial<TaskStep>): TaskStep[] {
    return steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));
  }

  function patchSubTask(stepId: string, subId: string, patch: Partial<StepSubTask>): TaskStep[] {
    return steps.map((s) => {
      if (s.id !== stepId) return s;
      return { ...s, subTasks: (s.subTasks ?? []).map((st) => (st.id === subId ? { ...st, ...patch } : st)) };
    });
  }

  function recalcProgress(updatedSteps: TaskStep[]): number {
    if (!updatedSteps.length) return 0;
    return Math.round(updatedSteps.reduce((sum, s) => sum + s.progress, 0) / updatedSteps.length);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Handlers ─────────────────────────────────────────────────

  async function handleAssignStep(stepId: string, userId: string) {
    const already = (task.stakeholders ?? []).some((s) => s.userId === userId);
    const stakeholders = already
      ? task.stakeholders
      : [...(task.stakeholders ?? []), { userId, role: "assignee" as const }];
    const updatedSteps = patchStep(stepId, { assigneeId: userId, status: "pending" });
    await onSave({ steps: updatedSteps, stakeholders });
    setAssigningStep(null);
    toast.success("Đã phân công");
  }

  async function handleAddSubTask(stepId: string) {
    if (!subForm.userId) { toast.error("Chọn người hỗ trợ"); return; }
    const step = steps.find((s) => s.id === stepId)!;
    const newSub: StepSubTask = {
      id: generateId("sub"),
      userId: subForm.userId,
      priority: subForm.priority,
      amountType: subForm.amountType,
      amount: subForm.amount,
      progress: 0,
      proofs: [],
      status: "pending",
      createdAt: new Date().toISOString(),
      ...(subForm.deadline && { deadline: subForm.deadline }),
      ...(subForm.note.trim() && { note: subForm.note.trim() }),
    };
    const subTasks = [...(step.subTasks ?? []), newSub];
    const already = (task.stakeholders ?? []).some((s) => s.userId === subForm.userId);
    const stakeholders = already
      ? task.stakeholders
      : [...(task.stakeholders ?? []), { userId: subForm.userId, role: "assignee" as const }];
    const updatedSteps = patchStep(stepId, { subTasks });
    await onSave({ steps: updatedSteps, stakeholders });
    setSubForm(BLANK_SUB);
    setAddSubStep(null);
    toast.success("Đã giao việc hỗ trợ");
  }

  async function handleRemoveSubTask(stepId: string, subId: string) {
    const step = steps.find((s) => s.id === stepId)!;
    const subTasks = (step.subTasks ?? []).filter((st) => st.id !== subId);
    await onSave({ steps: patchStep(stepId, { subTasks }) });
  }

  function startEdit(stepId: string, subId?: string, current = 0) {
    setEditKey(subId ? `${stepId}::${subId}` : stepId);
    setProgressVal(current);
    setProofKey(null);
  }

  async function saveProgress(stepId: string, subId?: string) {
    const newStatus =
      progressVal >= 100 ? "completed" : progressVal > 0 ? "in_progress" : "pending";
    let updatedSteps: TaskStep[];
    const completedAt = progressVal >= 100 ? new Date().toISOString() : undefined;
    if (subId) {
      updatedSteps = patchSubTask(stepId, subId, {
        progress: progressVal,
        status: newStatus,
        ...(completedAt && { completedAt }),
      });
    } else {
      updatedSteps = patchStep(stepId, {
        progress: progressVal,
        status: newStatus,
        ...(completedAt && { completedAt }),
      });
    }
    await onSave({ steps: updatedSteps, progress: recalcProgress(updatedSteps) });
    setEditKey(null);
    toast.success("Đã cập nhật tiến độ");
  }

  async function addProof(stepId: string, subId: string | undefined, proof: Proof) {
    let updatedSteps: TaskStep[];
    if (subId) {
      const step = steps.find((s) => s.id === stepId)!;
      const sub = (step.subTasks ?? []).find((st) => st.id === subId)!;
      updatedSteps = patchSubTask(stepId, subId, { proofs: [...(sub.proofs ?? []), proof] });
    } else {
      const step = steps.find((s) => s.id === stepId)!;
      updatedSteps = patchStep(stepId, { proofs: [...(step.proofs ?? []), proof] });
    }
    await onSave({ steps: updatedSteps });
    toast.success("Đã thêm minh chứng");
  }

  async function handleAddLink(stepId: string, subId?: string) {
    if (!proofUrl.trim()) { toast.error("Nhập URL"); return; }
    setProofSaving(true);
    await addProof(stepId, subId, {
      id: generateId("proof"),
      fileName: proofLabel.trim() || proofUrl,
      fileType: "link",
      fileUrl: proofUrl.trim(),
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser.id,
    });
    setProofUrl(""); setProofLabel(""); setProofSaving(false);
  }

  async function handleImageFile(stepId: string, subId: string | undefined, file: File) {
    setProofSaving(true);
    try {
      const dataUrl = await resizeImage(file, 800);
      await addProof(stepId, subId, {
        id: generateId("proof"),
        fileName: file.name,
        fileType: "image",
        fileUrl: dataUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser.id,
      });
    } catch { toast.error("Lỗi xử lý ảnh"); }
    finally { setProofSaving(false); }
  }

  function resizeImage(file: File, maxPx: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        img.src = ev.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── UI ───────────────────────────────────────────────────────

  if (steps.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-10">
        Chưa có bước quy trình. Chọn quy trình khi tạo nhiệm vụ để tự động thêm các bước.
      </p>
    );
  }

  const done = steps.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-3">
      {/* Workflow badge + progress summary */}
      <div className="flex items-center gap-2 text-xs">
        {task.workflowName && (
          <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full font-medium">
            {task.workflowName}
          </span>
        )}
        <span className="text-slate-400">{done}/{steps.length} bước hoàn thành</span>
      </div>

      {!task.approved && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800">
          Nhiệm vụ chưa được phê duyệt — phân công và cập nhật tiến độ sẽ khả dụng sau khi duyệt.
        </div>
      )}

      {steps.map((step, idx) => {
        const stepUser = users.find((u) => u.id === step.assigneeId);
        const isOpen = expanded.has(step.id);

        // Aggregate all proofs: step-level + sub-task level
        const allProofs = [
          ...(step.proofs ?? []),
          ...(step.subTasks ?? []).flatMap((st) => st.proofs ?? []),
        ];
        const imageProofs = allProofs.filter((p) => p.fileType === "image");
        const proofCount = allProofs.length;

        const myKey = step.id;
        const isEditingMe = editKey === myKey;
        const isProofMe = proofKey === myKey;
        const isAssigning = assigningStep === step.id;
        const isAddingSub = addSubStep === step.id;
        const canIUpdate =
          step.assigneeId === currentUser.id || canAssignSteps;

        return (
          <div
            key={step.id}
            className={cn(
              "rounded-2xl border overflow-hidden",
              step.status === "completed"
                ? "border-green-200 dark:border-green-900"
                : step.status === "in_progress"
                ? "border-blue-200 dark:border-blue-900"
                : "border-slate-200 dark:border-slate-700",
            )}
          >
            {/* ── Step header (always visible) ── */}
            <button
              onClick={() => toggleExpand(step.id)}
              className="w-full flex items-center gap-3 p-4 bg-[var(--card)] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition text-left"
            >
              <div className={cn(
                "w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold",
                step.status === "completed"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : step.status === "in_progress"
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500",
              )}>
                {step.status === "completed" ? "✓" : idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm dark:text-white truncate">{step.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {stepUser ? (
                    <UserAvatar user={stepUser} size="xs" showName namePosition="right" />
                  ) : (
                    <span className="text-xs text-slate-400 italic">Chưa phân công</span>
                  )}
                  {(step.subTasks ?? []).map((st) => {
                    const su = users.find((u) => u.id === st.userId);
                    if (!su) return null;
                    return (
                      <span key={st.id} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <UserAvatar user={su} size="xs" showName namePosition="right" />
                      </span>
                    );
                  })}
                </div>
              </div>

              <span className="text-xs text-slate-400 shrink-0">{step.progress}%</span>

              {/* Proof indicators (always visible) */}
              {proofCount > 0 && (
                <div className="flex items-center gap-1 shrink-0" title={`${proofCount} minh chứng`}>
                  {imageProofs.slice(0, 2).map((p) => (
                    <img
                      key={p.id}
                      src={p.fileUrl}
                      alt=""
                      className="w-6 h-6 rounded-md object-cover ring-1 ring-slate-200 dark:ring-slate-600"
                    />
                  ))}
                  {imageProofs.length === 0 && (
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="text-[10px] text-slate-400 font-medium">{proofCount}</span>
                </div>
              )}

              {isOpen
                ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
            </button>

            {/* Progress bar */}
            <div className="h-1 bg-slate-100 dark:bg-slate-800">
              <div
                className={cn("h-full transition-all", step.status === "completed" ? "bg-green-500" : "bg-blue-500")}
                style={{ width: `${step.progress}%` }}
              />
            </div>

            {/* ── Expanded body ── */}
            {isOpen && (
              <div className="p-4 space-y-4 bg-slate-50 dark:bg-slate-900/60">

                {/* Assign / change main assignee */}
                {task.approved && canAssignSteps && (
                  <Section label="Người thực hiện chính">
                    <div className="flex items-center gap-2 flex-wrap">
                      {stepUser && <UserAvatar user={stepUser} size="sm" showName />}
                      <button
                        onClick={() => setAssigningStep(isAssigning ? null : step.id)}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        {stepUser ? "Đổi người" : "+ Phân công"}
                      </button>
                    </div>
                    {isAssigning && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {activeUsers.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleAssignStep(step.id, u.id)}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border transition",
                              step.assigneeId === u.id
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400",
                            )}
                          >
                            <UserAvatar user={u} size="xs" />
                            {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {/* My progress + proof (for main assignee) */}
                {task.approved && canIUpdate && (
                  <Section label="Tiến độ của tôi">
                    <button
                      onClick={() => isEditingMe ? setEditKey(null) : startEdit(step.id, undefined, step.progress)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      Cập nhật
                    </button>
                    {isEditingMe && (
                      <ProgressEditor
                        value={progressVal}
                        onChange={setProgressVal}
                        onSave={() => saveProgress(step.id)}
                        onProof={() => { setProofKey(isProofMe ? null : step.id); setProofMode("link"); setProofUrl(""); setProofLabel(""); }}
                      />
                    )}
                    {isProofMe && (
                      <ProofPanel
                        mode={proofMode} setMode={setProofMode}
                        url={proofUrl} setUrl={setProofUrl}
                        label={proofLabel} setLabel={setProofLabel}
                        saving={proofSaving}
                        onLink={() => handleAddLink(step.id)}
                        onImage={(f) => handleImageFile(step.id, undefined, f)}
                        onClose={() => setProofKey(null)}
                      />
                    )}
                    <ProofList proofs={step.proofs ?? []} />
                  </Section>
                )}

                {/* Financial */}
                {(step.amountType === "income" || step.amountType === "expense") && (
                  <Section label="Tài chính">
                    <div className="flex items-center gap-2 text-sm">
                      {step.amountType === "income"
                        ? <TrendingUp className="w-4 h-4 text-green-500" />
                        : <TrendingDown className="w-4 h-4 text-red-500" />}
                      <span className="text-slate-500">{step.amountType === "income" ? "Thu" : "Chi"}:</span>
                      <span className="font-semibold">{(step.amount ?? 0).toLocaleString("vi-VN")}đ</span>
                    </div>
                  </Section>
                )}

                {/* Sub-tasks */}
                <Section
                  label={`Hỗ trợ (${(step.subTasks ?? []).length})`}
                  action={task.approved && canAssignSteps ? (
                    <button
                      onClick={() => { setAddSubStep(isAddingSub ? null : step.id); setSubForm(BLANK_SUB); }}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                    >
                      <Plus className="w-3.5 h-3.5" /> Giao việc hỗ trợ
                    </button>
                  ) : null}
                >
                  {/* Add sub-task form */}
                  {isAddingSub && (
                    <div className="mb-3 p-3 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Giao việc hỗ trợ cho bước này</p>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={subForm.userId}
                          onChange={(e) => setSubForm((f) => ({ ...f, userId: e.target.value }))}
                          className="col-span-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Chọn người hỗ trợ...</option>
                          {activeUsers.filter((u) => u.id !== step.assigneeId).map((u) => (
                            <option key={u.id} value={u.id}>{u.name}{u.department ? ` — ${u.department}` : ""}</option>
                          ))}
                        </select>
                        <select
                          value={subForm.priority}
                          onChange={(e) => setSubForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="low">Thấp</option>
                          <option value="medium">Trung bình</option>
                          <option value="high">Cao</option>
                          <option value="urgent">Khẩn cấp</option>
                        </select>
                        <input
                          type="date"
                          value={subForm.deadline}
                          onChange={(e) => setSubForm((f) => ({ ...f, deadline: e.target.value }))}
                          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          value={subForm.note}
                          onChange={(e) => setSubForm((f) => ({ ...f, note: e.target.value }))}
                          placeholder="Ghi chú công việc..."
                          className="col-span-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={subForm.amountType}
                          onChange={(e) => setSubForm((f) => ({ ...f, amountType: e.target.value as typeof subForm.amountType }))}
                          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="none">Không có thu/chi</option>
                          <option value="income">Thu tiền</option>
                          <option value="expense">Chi tiền</option>
                        </select>
                        {subForm.amountType !== "none" && (
                          <input
                            type="number" min={0}
                            value={subForm.amount || ""}
                            onChange={(e) => setSubForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                            placeholder="Số tiền (đ)"
                            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setAddSubStep(null)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Hủy</button>
                        <button
                          onClick={() => handleAddSubTask(step.id)}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl transition"
                        >
                          Giao
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub-task list */}
                  <div className="space-y-2">
                    {(step.subTasks ?? []).map((sub) => {
                      const subUser = users.find((u) => u.id === sub.userId);
                      if (!subUser) return null;
                      const subKey = `${step.id}::${sub.id}`;
                      const isEditSub = editKey === subKey;
                      const isProofSub = proofKey === subKey;
                      const canIUpdateSub = sub.userId === currentUser.id || canAssignSteps;

                      return (
                        <div key={sub.id} className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                          <div className="flex items-start gap-2">
                            <UserAvatar user={subUser} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium dark:text-white">{subUser.name}</span>
                                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", PRIORITY_COLOR[sub.priority])}>
                                  {priorityLabel(sub.priority)}
                                </span>
                                {sub.deadline && <span className="text-xs text-slate-400">Hạn: {formatDate(sub.deadline)}</span>}
                                {sub.amountType !== "none" && (
                                  <span className={cn("text-xs font-semibold", sub.amountType === "income" ? "text-green-600" : "text-red-600")}>
                                    {sub.amountType === "income" ? "+" : "−"}{sub.amount.toLocaleString("vi-VN")}đ
                                  </span>
                                )}
                              </div>
                              {sub.note && <p className="text-xs text-slate-400 mt-0.5">{sub.note}</p>}
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${sub.progress}%` }} />
                                </div>
                                <span className="text-xs text-slate-400 shrink-0">{sub.progress}%</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              {canIUpdateSub && (
                                <button
                                  onClick={() => isEditSub ? setEditKey(null) : startEdit(step.id, sub.id, sub.progress)}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-blue-50 hover:text-blue-600 text-slate-600 dark:text-slate-300 rounded-lg transition"
                                >
                                  Cập nhật
                                </button>
                              )}
                              {canAssignSteps && (
                                <button onClick={() => handleRemoveSubTask(step.id, sub.id)} className="p-1 text-red-400 hover:text-red-600">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isEditSub && (
                            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                              <ProgressEditor
                                value={progressVal}
                                onChange={setProgressVal}
                                onSave={() => saveProgress(step.id, sub.id)}
                                onProof={() => { setProofKey(isProofSub ? null : subKey); setProofMode("link"); setProofUrl(""); setProofLabel(""); }}
                              />
                            </div>
                          )}
                          {isProofSub && (
                            <div className="mt-2">
                              <ProofPanel
                                mode={proofMode} setMode={setProofMode}
                                url={proofUrl} setUrl={setProofUrl}
                                label={proofLabel} setLabel={setProofLabel}
                                saving={proofSaving}
                                onLink={() => handleAddLink(step.id, sub.id)}
                                onImage={(f) => handleImageFile(step.id, sub.id, f)}
                                onClose={() => setProofKey(null)}
                              />
                            </div>
                          )}
                          <ProofList proofs={sub.proofs ?? []} />
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function ProgressEditor({ value, onChange, onSave, onProof }: {
  value: number; onChange: (v: number) => void; onSave: () => void; onProof: () => void;
}) {
  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-3">
        <input
          type="range" min={0} max={100} step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-blue-600"
        />
        <span className="text-sm font-semibold w-10 text-right dark:text-white">{value}%</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl transition"
        >
          Lưu tiến độ
        </button>
        <button
          onClick={onProof}
          className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs rounded-xl hover:border-blue-400 transition"
        >
          <Plus className="w-3 h-3" /> Minh chứng
        </button>
      </div>
    </div>
  );
}

function ProofPanel({
  mode, setMode, url, setUrl, label, setLabel, saving, onLink, onImage, onClose,
}: {
  mode: "link" | "image"; setMode: (m: "link" | "image") => void;
  url: string; setUrl: (s: string) => void;
  label: string; setLabel: (s: string) => void;
  saving: boolean; onLink: () => void; onImage: (f: File) => void; onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  return (
    <div className="p-3 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["link", "image"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition",
                mode === m ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200",
              )}
            >
              {m === "link" ? <Link2 className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
              {m === "link" ? "Link" : "Ảnh"}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
      </div>

      {mode === "link" ? (
        <div className="space-y-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tên/mô tả (tùy chọn)"
            className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
            className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={onLink} disabled={saving || !url.trim()}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-xl transition flex items-center justify-center gap-1">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />} Thêm link
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 text-slate-500 hover:text-blue-600 text-xs rounded-xl transition">
            <ImageIcon className="w-4 h-4" /> Thư viện
          </button>
          <button onClick={() => camRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 text-slate-500 hover:text-blue-600 text-xs rounded-xl transition">
            <Camera className="w-4 h-4" /> Camera
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ""; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ""; }} />
          {saving && <div className="flex items-center px-2"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>}
        </div>
      )}
    </div>
  );
}

function ProofList({ proofs }: { proofs: Proof[] }) {
  if (!proofs.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {proofs.map((p) => (
        <a
          key={p.id}
          href={p.fileUrl.startsWith("data:") ? undefined : p.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-xs text-slate-600 dark:text-slate-300 transition"
        >
          {p.fileType === "image" && p.fileUrl.startsWith("data:") ? (
            <img src={p.fileUrl} alt="" className="w-8 h-8 object-cover rounded-lg" />
          ) : p.fileType === "image" ? (
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Link2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate max-w-[100px]">{p.fileName}</span>
        </a>
      ))}
    </div>
  );
}
