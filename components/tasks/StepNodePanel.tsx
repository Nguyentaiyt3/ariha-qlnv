"use client";

/**
 * StepNodePanel — slide-over panel bên phải khi click một node trong sơ đồ quy trình.
 *
 * 4 section: Tiến độ (gồm cả minh chứng) | Người hỗ trợ | Tạm ứng (gồm cả tự ứng) | Email
 */

import { useEffect, useRef, useState } from "react";
import {
  X, TrendingUp, Users, CreditCard, Mail, Paperclip,
  Plus, Trash2, Send, Camera, Link2, Loader2, Check, Upload, ChevronDown, QrCode, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { VIETNAM_BANKS } from "@/lib/vietnamBanks";
import { createAdvanceRequest, subscribeAdvanceRequests } from "@/lib/firebase/finance";
import { createNotification } from "@/lib/firebase/firestore";
import { AdvanceSettlementModal } from "@/components/tasks/FinancialWidget";
import { UserAvatar } from "@/components/common/UserAvatar";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import type {
  Task, TaskStep, User, StepSubTask, Proof,
  AdvanceRequest, SpendingMode, TaskPriority,
} from "@/types";

export type PanelSection = "progress" | "helpers" | "advance" | "email" | "subworkflow";

const SECTION_TABS: { id: PanelSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "progress", label: "Tiến độ",  Icon: TrendingUp },
  { id: "helpers",  label: "Hỗ trợ",   Icon: Users },
  { id: "advance",  label: "Tạm ứng",  Icon: CreditCard },
  { id: "email",    label: "Email",    Icon: Mail },
];


// ── helpers ────────────────────────────────────────────────────
const pBarCls = (p: number) => p <= 33 ? "bg-red-500" : p <= 66 ? "bg-amber-500" : "bg-green-500";
const pTxtCls = (p: number) =>
  p <= 33 ? "text-red-600 font-semibold" : p <= 66 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold";

function resizeImage(file: File, maxPx = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Props ──────────────────────────────────────────────────────
interface Props {
  task: Task;
  stepId: string;
  section: PanelSection;
  onSectionChange: (s: PanelSection) => void;
  onClose: () => void;
  users: User[];
  currentUser: User;
  /** Danh sách user thuộc task (để giới hạn picker). */
  taskMemberIds: Set<string>;
  /** Gọi để lưu cập nhật steps lên DB. */
  onSave: (updates: Partial<Task>) => Promise<void>;
  onEmailSent?: () => void;
  /** Hiển thị inline (không fixed overlay) — dùng trong timeline view. */
  inline?: boolean;
  /** Quyền phân công người thực hiện bước (quản lý/người thực hiện chính task) — giống List mode. */
  canAssignSteps?: boolean;
}

export function StepNodePanel({
  task, stepId, section, onSectionChange, onClose,
  users, currentUser, taskMemberIds, onSave, onEmailSent,
  inline = false, canAssignSteps = false,
}: Props) {
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) return null;

  return (
    <div className={inline
      ? "flex flex-col w-80 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
      : "fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-sm bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700 overflow-hidden"
    }>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">Bước {task.steps.indexOf(step) + 1}</p>
          <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">{step.name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
        {SECTION_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onSectionChange(id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium border-b-2 transition whitespace-nowrap min-w-[52px]",
              section === id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {section === "progress" && (
          <div className="space-y-5">
            <ProgressSection step={step} task={task} users={users} currentUser={currentUser} taskMemberIds={taskMemberIds} canAssignSteps={canAssignSteps} onSave={onSave} />
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              <ProofSection step={step} task={task} currentUser={currentUser} onSave={onSave} />
            </div>
          </div>
        )}
        {section === "helpers" && <HelpersSection step={step} task={task} users={users} currentUser={currentUser} taskMemberIds={taskMemberIds} canAssignSteps={canAssignSteps} onSave={onSave} />}
        {section === "advance" && <AdvanceSection  step={step} task={task} currentUser={currentUser} />}
        {section === "email"   && <EmailSection    step={step} task={task} users={users} currentUser={currentUser} taskMemberIds={taskMemberIds} onEmailSent={onEmailSent} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Tiến độ
// ══════════════════════════════════════════════════════════════
function ProgressSection({
  step, task, users, currentUser, taskMemberIds, canAssignSteps, onSave,
}: {
  step: TaskStep; task: Task; users: User[]; currentUser: User; taskMemberIds: Set<string>;
  canAssignSteps: boolean;
  onSave: (u: Partial<Task>) => Promise<void>;
}) {
  const [val, setVal] = useState(step.progress);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [localAssigneeId, setLocalAssigneeId] = useState(step.assigneeId);

  // Giống List mode: chỉ định người thực hiện bước cần task đã duyệt + có quyền phân công; cập
  // nhật tiến độ cần task đã duyệt + (là người thực hiện bước đó hoặc có quyền phân công).
  const canAssign = task.approved && canAssignSteps;
  const canUpdateProgress = task.approved && (step.assigneeId === currentUser.id || canAssignSteps);

  // Sync when parent task updates after save resolves
  useEffect(() => { setLocalAssigneeId(step.assigneeId); }, [step.assigneeId]);

  const assignee = users.find((u) => u.id === localAssigneeId);
  const assignableUsers = users.filter(
    (u) => u.isActive && (taskMemberIds.size === 0 || taskMemberIds.has(u.id)),
  );

  function handleAssign(userId: string) {
    setLocalAssigneeId(userId);   // immediate — no waiting
    setShowPicker(false);
    toast.success("Đã phân công");
    const updatedSteps = task.steps.map((s) =>
      s.id !== step.id ? s : { ...s, assigneeId: userId }
    );
    const already = task.stakeholders.some((st) => st.userId === userId);
    const stakeholders = already
      ? task.stakeholders
      : [...task.stakeholders, { userId, role: "assignee" as const }];
    onSave({ steps: updatedSteps, stakeholders }).catch(() => {
      toast.error("Lưu thất bại — đang hoàn tác");
      setLocalAssigneeId(step.assigneeId);
    });
  }

  async function handleSave() {
    setSaving(true);
    const updatedSteps = task.steps.map((s) =>
      s.id !== step.id ? s : {
        ...s,
        progress: val,
        status: val >= 100 ? "completed" as const : val > 0 ? "in_progress" as const : "pending" as const,
        ...(val >= 100 && !s.completedAt ? { completedAt: new Date().toISOString() } : {}),
      }
    );
    const progress = Math.round(updatedSteps.reduce((sum, s) => sum + s.progress, 0) / updatedSteps.length);
    try {
      await onSave({ steps: updatedSteps, progress });
      toast.success("Đã cập nhật tiến độ");
    } catch { toast.error("Lưu thất bại"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Assignee */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Người thực hiện chính
        </p>
        <div className="flex items-center gap-2">
          {assignee
            ? <UserAvatar user={assignee} size="sm" showName />
            : <span className="text-xs text-slate-400 italic">Chưa phân công</span>
          }
          {canAssign && (
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium transition"
            >
              {assignee ? "Đổi người" : "+ Phân công"}
            </button>
          )}
        </div>
        {!task.approved && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">Nhiệm vụ chưa được phê duyệt — chưa thể phân công.</p>
        )}
        {showPicker && canAssign && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {assignableUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => handleAssign(u.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition",
                  u.id === step.assigneeId
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:text-blue-600",
                )}
              >
                <UserAvatar user={u} size="xs" />
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-center">
        <span className={cn("text-4xl font-black", pTxtCls(val))}>{val}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-300", pBarCls(val))} style={{ width: `${val}%` }} />
      </div>
      <input
        type="range" min={0} max={100} step={5} value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        disabled={!canUpdateProgress}
        className="w-full accent-blue-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-slate-400">
        {[0, 25, 50, 75, 100].map((n) => (
          <button key={n} onClick={() => setVal(n)} disabled={!canUpdateProgress}
            className={cn("font-medium hover:text-blue-600 transition disabled:opacity-50 disabled:hover:text-slate-400", val === n && "text-blue-600")}>
            {n}%
          </button>
        ))}
      </div>

      {/* Status info */}
      <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-1">
        <div className="flex justify-between">
          <span>Trạng thái sẽ là:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {val >= 100 ? "✓ Hoàn thành" : val > 0 ? "⚡ Đang thực hiện" : "○ Chờ bắt đầu"}
          </span>
        </div>
      </div>

      {!canUpdateProgress && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
          {!task.approved
            ? "Nhiệm vụ chưa được phê duyệt — chưa thể cập nhật tiến độ."
            : "Chỉ người thực hiện bước này hoặc người quản lý mới cập nhật được tiến độ."}
        </p>
      )}
      <button
        onClick={handleSave}
        disabled={saving || val === step.progress || !canUpdateProgress}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Lưu tiến độ
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Người hỗ trợ
// ══════════════════════════════════════════════════════════════
function HelpersSection({
  step, task, users, currentUser, taskMemberIds, canAssignSteps, onSave,
}: {
  step: TaskStep; task: Task; users: User[]; currentUser: User;
  taskMemberIds: Set<string>; canAssignSteps: boolean; onSave: (u: Partial<Task>) => Promise<void>;
}) {
  const canAdd = task.approved && canAssignSteps;
  const [showForm, setShowForm] = useState(false);
  const [helperUserId, setHelperUserId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [decliningSubId, setDecliningSubId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [progressVal, setProgressVal] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);

  const [proofSubId, setProofSubId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofLabel, setProofLabel] = useState("");
  const [proofSaving, setProofSaving] = useState(false);
  const proofFileRef = useRef<HTMLInputElement>(null);
  const proofCamRef  = useRef<HTMLInputElement>(null);

  const existingSubIds = new Set((step.subTasks ?? []).map((st) => st.userId));
  const candidates = users.filter(
    (u) => u.isActive && taskMemberIds.has(u.id) && u.id !== step.assigneeId && !existingSubIds.has(u.id),
  );

  async function handleAdd() {
    if (!helperUserId) { toast.error("Chọn người hỗ trợ"); return; }
    setSaving(true);
    const newSub: StepSubTask = {
      id: generateId("sub"),
      userId: helperUserId,
      priority,
      amountType: "none", amount: 0, progress: 0, proofs: [],
      status: "pending", createdAt: new Date().toISOString(),
      assignedBy: currentUser.id, assignedByName: currentUser.name, confirmStatus: "pending",
      ...(deadline && { deadline }),
      ...(note.trim() && { note: note.trim() }),
    };
    const subTasks = [...(step.subTasks ?? []), newSub];
    const updatedSteps = task.steps.map((s) => s.id === step.id ? { ...s, subTasks } : s);
    const already = task.stakeholders.some((st) => st.userId === helperUserId);
    const stakeholders = already
      ? task.stakeholders
      : [...task.stakeholders, { userId: helperUserId, role: "assignee" as const }];
    try {
      await onSave({ steps: updatedSteps, stakeholders });
      toast.success("Đã thêm người hỗ trợ");
      createNotification({
        userId: helperUserId, type: "task_assigned",
        title: "Bạn được phân công hỗ trợ một bước",
        body: `${currentUser.name} đã phân công bạn hỗ trợ bước "${step.name}" trong nhiệm vụ "${task.name}". Vui lòng xác nhận.`,
        link: `/tasks/${task.id}`, read: false, priority: "normal", taskId: task.id, actionRequired: true,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
      setHelperUserId(""); setDeadline(""); setNote("");
      setShowForm(false);
    } catch { toast.error("Lưu thất bại"); }
    finally { setSaving(false); }
  }

  async function handleRemove(subId: string) {
    const subTasks = (step.subTasks ?? []).filter((st) => st.id !== subId);
    const updatedSteps = task.steps.map((s) => s.id === step.id ? { ...s, subTasks } : s);
    await onSave({ steps: updatedSteps }).catch(() => toast.error("Xoá thất bại"));
    toast.success("Đã xoá người hỗ trợ");
  }

  async function handleConfirm(sub: StepSubTask, accept: boolean) {
    if (!accept && !declineReason.trim()) { toast.error("Nhập lý do từ chối"); return; }
    const subTasks = (step.subTasks ?? []).map((st) => st.id !== sub.id ? st : {
      ...st,
      confirmStatus: accept ? "accepted" as const : "declined" as const,
      confirmedAt: new Date().toISOString(),
      ...(accept ? {} : { declineReason: declineReason.trim() }),
    });
    const updatedSteps = task.steps.map((s) => s.id === step.id ? { ...s, subTasks } : s);
    try {
      await onSave({ steps: updatedSteps });
      toast.success(accept ? "Đã đồng ý hỗ trợ" : "Đã từ chối hỗ trợ");
      setDecliningSubId(null); setDeclineReason("");
      if (!accept && sub.assignedBy) {
        createNotification({
          userId: sub.assignedBy, type: "task_assigned",
          title: "Người hỗ trợ đã từ chối",
          body: `${currentUser.name} đã từ chối hỗ trợ bước "${step.name}" — Lý do: ${declineReason.trim()}`,
          link: `/tasks/${task.id}`, read: false, priority: "normal", taskId: task.id, actionRequired: true,
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }
    } catch { toast.error("Lưu thất bại"); }
  }

  async function handleSaveProgress(subId: string) {
    setSavingProgress(true);
    const subTasks = (step.subTasks ?? []).map((st) => st.id !== subId ? st : {
      ...st, progress: progressVal,
      status: progressVal >= 100 ? "completed" as const : progressVal > 0 ? "in_progress" as const : "pending" as const,
      ...(progressVal >= 100 && !st.completedAt ? { completedAt: new Date().toISOString() } : {}),
    });
    const updatedSteps = task.steps.map((s) => s.id === step.id ? { ...s, subTasks } : s);
    try {
      await onSave({ steps: updatedSteps });
      toast.success("Đã cập nhật tiến độ");
      setEditingSubId(null);
    } catch { toast.error("Lưu thất bại"); }
    finally { setSavingProgress(false); }
  }

  async function addHelperProof(subId: string, proof: Proof) {
    const subTasks = (step.subTasks ?? []).map((st) => st.id !== subId ? st : { ...st, proofs: [...(st.proofs ?? []), proof] });
    const updatedSteps = task.steps.map((s) => s.id === step.id ? { ...s, subTasks } : s);
    await onSave({ steps: updatedSteps });
    toast.success("Đã thêm minh chứng");
  }

  async function handleHelperProofLink(subId: string) {
    if (!proofUrl.trim()) { toast.error("Nhập URL"); return; }
    setProofSaving(true);
    try {
      await addHelperProof(subId, {
        id: generateId("proof"), fileName: proofLabel.trim() || proofUrl, fileType: "link",
        fileUrl: proofUrl.trim(), uploadedAt: new Date().toISOString(), uploadedBy: currentUser.id,
      });
      setProofUrl(""); setProofLabel("");
    } catch { toast.error("Lưu thất bại"); }
    finally { setProofSaving(false); }
  }

  async function handleHelperProofImage(subId: string, file: File) {
    setProofSaving(true);
    try {
      const dataUrl = await resizeImage(file);
      await addHelperProof(subId, {
        id: generateId("proof"), fileName: file.name, fileType: "image",
        fileUrl: dataUrl, uploadedAt: new Date().toISOString(), uploadedBy: currentUser.id,
      });
    } catch { toast.error("Lỗi xử lý ảnh"); }
    finally { setProofSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Người hỗ trợ</span>
        {canAdd && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />Thêm
          </button>
        )}
      </div>
      {!canAdd && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          {!task.approved ? "Nhiệm vụ chưa được phê duyệt — chưa thể thêm người hỗ trợ." : "Bạn không có quyền thêm người hỗ trợ cho bước này."}
        </p>
      )}

      {/* Existing helpers */}
      {(step.subTasks ?? []).length === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">Chưa có người hỗ trợ.</p>
      )}
      {(step.subTasks ?? []).map((st) => {
        const u = users.find((u) => u.id === st.userId);
        if (!u) return null;
        // Không có confirmStatus = dữ liệu cũ trước khi có bước xác nhận → coi như đã đồng ý.
        const confirmStatus = st.confirmStatus ?? "accepted";
        const isMe = st.userId === currentUser.id;
        const canUpdateThisProgress = confirmStatus === "accepted" && (isMe || canAssignSteps);
        const isEditingProgress = editingSubId === st.id;
        const isDeclining = decliningSubId === st.id;

        return (
          <div key={st.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2">
              <UserAvatar user={u} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{u.name}</p>
                {st.deadline && <p className="text-[10px] text-slate-400">Hạn: {new Date(st.deadline).toLocaleDateString("vi-VN")}</p>}
                {st.note && <p className="text-[10px] text-slate-500 truncate">{st.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                {confirmStatus === "accepted" && (
                  <span className={cn("text-[10px] font-semibold", pTxtCls(st.progress))}>{st.progress}%</span>
                )}
                {confirmStatus === "pending" && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Chờ xác nhận
                  </span>
                )}
                {confirmStatus === "declined" && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    Đã từ chối
                  </span>
                )}
                {canAssignSteps && (
                  <button onClick={() => handleRemove(st.id)} className="p-1 rounded hover:bg-red-50 hover:text-red-500 transition">
                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                  </button>
                )}
              </div>
            </div>

            {/* Xác nhận phân công — chỉ hiện cho chính người được phân công */}
            {confirmStatus === "pending" && isMe && (
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                {!isDeclining ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleConfirm(st, true)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition">
                      <ThumbsUp className="w-3.5 h-3.5" /> Đồng ý
                    </button>
                    <button onClick={() => { setDecliningSubId(st.id); setDeclineReason(""); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-semibold transition">
                      <ThumbsDown className="w-3.5 h-3.5" /> Không đồng ý
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={2}
                      placeholder="Lý do từ chối... *"
                      className="w-full text-xs rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
                    <div className="flex gap-2">
                      <button onClick={() => setDecliningSubId(null)}
                        className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 text-xs">Huỷ</button>
                      <button onClick={() => handleConfirm(st, false)}
                        className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition">
                        Gửi từ chối
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {confirmStatus === "declined" && st.declineReason && (
              <p className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1">
                Lý do: {st.declineReason}
              </p>
            )}

            {/* Cập nhật tiến độ — sau khi đã đồng ý */}
            {canUpdateThisProgress && (
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                {!isEditingProgress ? (
                  <button onClick={() => { setEditingSubId(st.id); setProgressVal(st.progress); }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                    Cập nhật tiến độ
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={100} step={5} value={progressVal}
                        onChange={(e) => setProgressVal(Number(e.target.value))}
                        className="flex-1 accent-blue-500" />
                      <span className={cn("text-xs font-semibold w-9 text-right", pTxtCls(progressVal))}>{progressVal}%</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingSubId(null)}
                        className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 text-xs">Huỷ</button>
                      <button onClick={() => handleSaveProgress(st.id)} disabled={savingProgress}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition">
                        {savingProgress ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Lưu
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Minh chứng — sau khi đã đồng ý */}
            {canUpdateThisProgress && (
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                <button onClick={() => setProofSubId(proofSubId === st.id ? null : st.id)}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                  Minh chứng{(st.proofs ?? []).length > 0 ? ` (${(st.proofs ?? []).length})` : ""}
                </button>
                {(st.proofs ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(st.proofs ?? []).map((p) => (
                      <a key={p.id} href={p.fileUrl.startsWith("data:") ? undefined : p.fileUrl}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-[10px] text-slate-600 dark:text-slate-300 transition">
                        {p.fileType === "image" && p.fileUrl.startsWith("data:") ? (
                          <img src={p.fileUrl} alt="" className="w-5 h-5 object-cover rounded" />
                        ) : p.fileType === "image" ? (
                          <Paperclip className="w-3 h-3 shrink-0" />
                        ) : (
                          <Link2 className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate max-w-[80px]">{p.fileName}</span>
                      </a>
                    ))}
                  </div>
                )}
                {proofSubId === st.id && (
                  <div className="space-y-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2">
                    <input value={proofLabel} onChange={(e) => setProofLabel(e.target.value)}
                      placeholder="Tên / mô tả"
                      className="w-full text-[11px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <div className="flex gap-1.5">
                      <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleHelperProofLink(st.id)}
                        placeholder="URL liên kết"
                        className="flex-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      <button onClick={() => handleHelperProofLink(st.id)} disabled={proofSaving}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
                        {proofSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 text-slate-600" />}
                      </button>
                      <button onClick={() => proofFileRef.current?.click()} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                      <button onClick={() => proofCamRef.current?.click()} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
                        <Camera className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                    </div>
                    <input ref={proofFileRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleHelperProofImage(st.id, f); if (proofFileRef.current) proofFileRef.current.value = ""; }} />
                    <input ref={proofCamRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleHelperProofImage(st.id, f); if (proofCamRef.current) proofCamRef.current.value = ""; }} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
          <SearchableSelect
            value={helperUserId}
            onChange={setHelperUserId}
            options={candidates.map((u) => ({ id: u.id, label: u.name, sub: u.department ?? u.role }))}
            placeholder="— Chọn người hỗ trợ —"
            emptyText="Không tìm thấy nhân viên"
            listHeight="max-h-40"
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="low">Thấp</option>
            <option value="medium">Trung bình</option>
            <option value="high">Cao</option>
            <option value="urgent">Khẩn</option>
          </select>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Hạn hoàn thành" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Ghi chú..."
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-slate-700 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-100 transition">Huỷ</button>
            <button onClick={handleAdd} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-1">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Thêm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Đề nghị chi tiêu (Tạm ứng / Tự ứng) — một luồng chung:
// Đề nghị (số tiền, lý do, hình thức) → duyệt → chi tạm ứng/ghi nhận tự ứng → nộp thanh toán/hoàn ứng → duyệt quyết toán.
// ══════════════════════════════════════════════════════════════
function buildSpendingPurpose(mode: SpendingMode, stepName: string, actorName: string, accNumber: string, bankName: string): string {
  const today = new Date().toLocaleDateString("vi-VN");
  const label = mode === "ADVANCE" ? "Tạm ứng" : "Tự ứng";
  if (mode !== "ADVANCE") return `${label}: ${stepName} - ${today} - ${actorName}`;
  const accPart  = accNumber ? ` - ${accNumber}` : "";
  const bankPart = bankName  ? ` - ${bankName}`  : "";
  return `${label}: ${stepName} - ${today} - ${actorName}${accPart}${bankPart}`;
}

function AdvanceSection({ step, task, currentUser }: { step: TaskStep; task: Task; currentUser: User }) {
  const [advances, setAdvances] = useState<AdvanceRequest[]>([]);
  useEffect(() => subscribeAdvanceRequests(task.id, setAdvances), [task.id]);

  const [settlingAdvId, setSettlingAdvId] = useState<string | null>(null);

  const stepAdvances = advances.filter((a) => a.stepId === step.id);
  const settlingAdv  = stepAdvances.find((a) => a.id === settlingAdvId);

  const STATUS_CLS: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-600",   PENDING_SETTLEMENT: "bg-blue-100 text-blue-700",
    SETTLED: "bg-slate-100 text-slate-500",
  };
  const STATUS_LBL: Record<string, string> = {
    PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối",
    PENDING_SETTLEMENT: "Chờ duyệt quyết toán", SETTLED: "Đã quyết toán",
  };

  return (
    <div className="space-y-4">
      {/* Existing requests */}
      {stepAdvances.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Đề nghị chi tiêu của bước này</p>
          {stepAdvances.map((adv) => {
            const mode = adv.mode ?? "ADVANCE";
            const settleLabel = mode === "ADVANCE" ? "Thanh toán" : "Hoàn ứng";
            return (
              <div key={adv.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0",
                        mode === "ADVANCE" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700")}>
                        {mode === "ADVANCE" ? "Tạm ứng" : "Tự ứng"}
                      </span>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{adv.amount.toLocaleString("vi-VN")}₫</p>
                    </div>
                    <p className="text-slate-400 truncate max-w-[180px]">{adv.purpose}</p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0", STATUS_CLS[adv.status])}>
                    {STATUS_LBL[adv.status]}
                  </span>
                </div>
                {adv.status === "APPROVED" && adv.requestedBy === currentUser.id && (
                  <button onClick={() => setSettlingAdvId(adv.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-[11px] font-semibold">
                    <Check className="w-3 h-3" /> {settleLabel}
                  </button>
                )}
                {adv.status === "REJECTED" && adv.rejectedReason && (
                  <p className="text-[10px] text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1">Từ chối: {adv.rejectedReason}</p>
                )}
                {adv.status === "PENDING_SETTLEMENT" && (
                  <p className="text-[10px] text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2 py-1">
                    Đã nộp {settleLabel.toLowerCase()} {adv.settlementAmountUsed?.toLocaleString("vi-VN")}đ — chờ duyệt
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {settlingAdv && (
        <AdvanceSettlementModal
          advance={settlingAdv}
          currentUser={currentUser}
          onSuccess={() => setSettlingAdvId(null)}
          onClose={() => setSettlingAdvId(null)}
        />
      )}

      <SpendingRequestForm step={step} task={task} currentUser={currentUser} />
    </div>
  );
}

// Đề nghị chi tiêu mới — chọn hình thức TRƯỚC, cần duyệt trước khi chi (cả tạm ứng lẫn tự ứng).
function SpendingRequestForm({ step, task, currentUser }: { step: TaskStep; task: Task; currentUser: User }) {
  const [mode, setMode] = useState<SpendingMode>("ADVANCE");
  const [amount, setAmount]     = useState("");
  const [purpose, setPurpose]   = useState(buildSpendingPurpose("ADVANCE", step.name, currentUser.name, "", ""));
  const [purposeTouched, setPurposeTouched] = useState(false);
  const [bankId, setBankId]     = useState((currentUser as any).bankAccount?.bankId ?? "");
  const [bankName, setBankName] = useState((currentUser as any).bankAccount?.bankName ?? "");
  const [accNum, setAccNum]     = useState((currentUser as any).bankAccount?.accountNumber ?? "");
  const [accName, setAccName]   = useState((currentUser as any).bankAccount?.accountName ?? currentUser.name);
  const [saving, setSaving]     = useState(false);

  // Đổi hình thức hoặc ngân hàng/số TK → tự cập nhật lại lý do gợi ý, trừ khi người dùng đã tự sửa tay.
  useEffect(() => {
    if (purposeTouched) return;
    setPurpose(buildSpendingPurpose(mode, step.name, currentUser.name, mode === "ADVANCE" ? accNum : "", mode === "ADVANCE" ? bankName : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accNum, bankName]);

  const qrAmount = parseFloat(amount) || 0;
  const qrReady  = mode === "ADVANCE" && qrAmount > 0 && !!bankId && !!accNum.trim();
  const qrUrl    = qrReady
    ? `https://img.vietqr.io/image/${bankId}-${accNum.trim()}-compact2.png` +
      `?amount=${qrAmount}&addInfo=${encodeURIComponent(purpose)}&accountName=${encodeURIComponent(accName)}`
    : "";

  async function handleSubmit() {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error("Nhập số tiền hợp lệ");  return; }
    if (!purpose.trim())  { toast.error("Nhập lý do chi tiêu"); return; }
    if (mode === "ADVANCE") {
      if (!accNum.trim())  { toast.error("Nhập số tài khoản nhận"); return; }
      if (!accName.trim()) { toast.error("Nhập tên chủ tài khoản"); return; }
    }
    setSaving(true);
    try {
      await createAdvanceRequest({
        taskId: task.id, stepId: step.id, stepName: step.name,
        requestedBy: currentUser.id, requestedByName: currentUser.name,
        mode, amount: num, purpose: purpose.trim(),
        ...(mode === "ADVANCE" && bankId
          ? { bankAccount: { bankId, bankName, accountNumber: accNum.trim(), accountName: accName.trim() } }
          : {}),
      });
      toast.success(mode === "ADVANCE" ? "Đã gửi đề nghị tạm ứng — chờ duyệt" : "Đã gửi đề nghị tự ứng — chờ duyệt");
      setAmount("");
    } catch (err) { toast.error((err as Error).message ?? "Gửi thất bại"); }
    finally { setSaving(false); }
  }

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Đề nghị chi tiêu mới</p>

      {/* Hình thức */}
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => setMode("ADVANCE")}
          className={cn("py-1.5 rounded-lg text-xs font-semibold border transition",
            mode === "ADVANCE" ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
          Xin tạm ứng trước
        </button>
        <button onClick={() => setMode("SELF_PAID")}
          className={cn("py-1.5 rounded-lg text-xs font-semibold border transition",
            mode === "SELF_PAID" ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
          Tự ứng (tự chi trước)
        </button>
      </div>

      <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
        placeholder="Số tiền đề nghị (VNĐ)"
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <textarea value={purpose} onChange={(e) => { setPurpose(e.target.value); setPurposeTouched(true); }} rows={2}
        placeholder="Lý do chi tiêu..."
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />

      {mode === "ADVANCE" && (
        <>
          <select value={bankId} onChange={(e) => {
            setBankId(e.target.value);
            setBankName(VIETNAM_BANKS.find((b) => b.id === e.target.value)?.name ?? "");
          }} className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">— Chọn ngân hàng —</option>
            {VIETNAM_BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input value={accNum} onChange={(e) => setAccNum(e.target.value)}
            placeholder="Số tài khoản nhận *"
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input value={accName} onChange={(e) => setAccName(e.target.value)}
            placeholder="Tên chủ tài khoản *"
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />

          {/* QR Code — hiện tự động khi đủ thông tin */}
          {qrReady && (
            <div className="flex flex-col items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 self-start">
                <QrCode className="w-3.5 h-3.5" />
                QR chuyển khoản
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="QR chuyển khoản"
                className="w-44 h-44 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                {bankName} · {accNum}<br />
                {accName}<br />
                <span className="font-semibold text-blue-600">{qrAmount.toLocaleString("vi-VN")} đ</span>
              </p>
            </div>
          )}
        </>
      )}

      <button onClick={handleSubmit} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Gửi đề nghị
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Email
// ══════════════════════════════════════════════════════════════
function EmailSection({
  step, task, users, currentUser, taskMemberIds, onEmailSent,
}: {
  step: TaskStep; task: Task; users: User[]; currentUser: User;
  taskMemberIds: Set<string>; onEmailSent?: () => void;
}) {
  const defaultIds = new Set<string>();
  if (step.assigneeId) defaultIds.add(step.assigneeId);
  (step.subTasks ?? []).forEach((st) => defaultIds.add(st.userId));

  const [toIds, setToIds]           = useState<Set<string>>(defaultIds);
  const [manualEmails, setManualEmails] = useState<string[]>([]);
  const [manualInput, setManualInput]   = useState("");
  const [addUserId, setAddUserId]       = useState("");
  const [subject, setSubject]       = useState(`[${task.name}] ${step.name}`);
  const [body, setBody]             = useState("");
  const [sending, setSending]       = useState(false);

  // Gợi ý nhanh: người liên quan trực tiếp tới bước (thành viên nhiệm vụ)
  const quickPick = users.filter((u) => taskMemberIds.has(u.id) && u.id !== currentUser.id);

  // Toàn bộ danh sách nhân viên để tìm & thêm người khác ngoài nhiệm vụ
  const directoryOptions = users
    .filter((u) => u.id !== currentUser.id && !toIds.has(u.id))
    .map((u) => ({ id: u.id, label: u.name, sub: u.email || u.department || u.role }));

  const selectedUsers = users.filter((u) => toIds.has(u.id));

  function toggleRecipient(id: string) {
    setToIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addFromDirectory(id: string) {
    if (!id) return;
    setToIds((prev) => new Set(prev).add(id));
    setAddUserId("");
  }

  function addManualEmail() {
    const email = manualInput.trim();
    if (!email) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error("Email không hợp lệ"); return; }
    if (manualEmails.includes(email)) { setManualInput(""); return; }
    setManualEmails((prev) => [...prev, email]);
    setManualInput("");
  }

  function removeManualEmail(email: string) {
    setManualEmails((prev) => prev.filter((e) => e !== email));
  }

  async function handleSend() {
    const recsFromUsers = selectedUsers
      .filter((u): u is User => !!u.email)
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));
    const recsManual = manualEmails.map((email) => ({ id: email, name: email, email }));
    const recs = [...recsFromUsers, ...recsManual];
    if (recs.length === 0)     { toast.error("Chưa chọn người nhận"); return; }
    if (!subject.trim())       { toast.error("Nhập tiêu đề"); return; }
    if (!body.trim())          { toast.error("Nhập nội dung"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/email/custom", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderUserId: currentUser.id, recipients: recs, subject, body, taskId: task.id, stepName: step.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Đã gửi tới ${recs.length} người`);
      setBody("");
      onEmailSent?.();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Gửi thất bại"); }
    finally { setSending(false); }
  }

  return (
    <div className="space-y-3">
      {/* Recipients */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Người nhận</p>

        {/* Quick-pick: người liên quan trực tiếp tới bước */}
        {quickPick.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {quickPick.map((u) => (
              <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <input type="checkbox" checked={toIds.has(u.id)} onChange={() => toggleRecipient(u.id)}
                  className="rounded accent-blue-500" />
                <UserAvatar user={u} size="xs" showName namePosition="right" />
              </label>
            ))}
          </div>
        )}

        {/* Thêm nhân viên khác từ toàn bộ danh sách */}
        <SearchableSelect
          value={addUserId}
          onChange={addFromDirectory}
          options={directoryOptions}
          placeholder="+ Thêm nhân viên khác..."
          emptyText="Không tìm thấy nhân viên"
          listHeight="max-h-40"
        />

        {/* Nhập email thủ công */}
        <div className="flex items-center gap-2">
          <input value={manualInput} onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualEmail(); } }}
            placeholder="Nhập email khác..."
            className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={addManualEmail} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
            <Plus className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>

        {/* Người đã chọn (chip) */}
        {(selectedUsers.length > 0 || manualEmails.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {selectedUsers.map((u) => (
              <span key={u.id} className="flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px]">
                <UserAvatar user={u} size="xs" />
                {u.name}
                <button onClick={() => toggleRecipient(u.id)}><X className="w-3 h-3 hover:text-red-500" /></button>
              </span>
            ))}
            {manualEmails.map((email) => (
              <span key={email} className="flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px]">
                {email}
                <button onClick={() => removeManualEmail(email)}><X className="w-3 h-3 hover:text-red-500" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <input value={subject} onChange={(e) => setSubject(e.target.value)}
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        placeholder="Tiêu đề email" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
        placeholder="Nội dung email..."
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <button onClick={handleSend} disabled={sending}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition">
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Gửi email
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Minh chứng
// ══════════════════════════════════════════════════════════════
function ProofSection({
  step, task, currentUser, onSave,
}: {
  step: TaskStep; task: Task; currentUser: User; onSave: (u: Partial<Task>) => Promise<void>;
}) {
  const [proofUrl, setProofUrl]   = useState("");
  const [proofLabel, setProofLabel] = useState("");
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef  = useRef<HTMLInputElement>(null);

  async function addProof(proof: Proof) {
    const updatedSteps = task.steps.map((s) =>
      s.id === step.id ? { ...s, proofs: [...(s.proofs ?? []), proof] } : s
    );
    await onSave({ steps: updatedSteps });
    toast.success("Đã thêm minh chứng");
  }

  async function handleLink() {
    if (!proofUrl.trim()) { toast.error("Nhập URL"); return; }
    setSaving(true);
    await addProof({ id: generateId("proof"), fileName: proofLabel.trim() || proofUrl, fileType: "link", fileUrl: proofUrl.trim(), uploadedAt: new Date().toISOString(), uploadedBy: currentUser.id });
    setProofUrl(""); setProofLabel("");
    setSaving(false);
  }

  async function handleImageFile(file: File) {
    setSaving(true);
    try {
      const dataUrl = await resizeImage(file);
      await addProof({ id: generateId("proof"), fileName: file.name, fileType: "image", fileUrl: dataUrl, uploadedAt: new Date().toISOString(), uploadedBy: currentUser.id });
    } catch { toast.error("Lỗi xử lý ảnh"); }
    finally { setSaving(false); }
  }

  const proofs = step.proofs ?? [];

  return (
    <div className="space-y-3">
      {/* List */}
      {proofs.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Chưa có minh chứng.</p>}
      {proofs.map((p) => (
        <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {p.fileType === "image" ? (
            <img src={p.fileUrl} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-slate-200" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <Paperclip className="w-4 h-4 text-slate-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{p.fileName}</p>
            <p className="text-[10px] text-slate-400">{new Date(p.uploadedAt).toLocaleDateString("vi-VN")}</p>
          </div>
          {p.fileType === "link" && (
            <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-blue-50">
              <Link2 className="w-3.5 h-3.5 text-blue-500" />
            </a>
          )}
        </div>
      ))}

      {/* Add */}
      <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
        <div className="flex gap-2">
          <input value={proofLabel} onChange={(e) => setProofLabel(e.target.value)}
            placeholder="Tên / mô tả" className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="flex gap-2">
          <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLink()}
            placeholder="URL liên kết" className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={handleLink} disabled={saving}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 text-slate-600" />}
          </button>
          <button onClick={() => fileRef.current?.click()} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"><Upload className="w-3.5 h-3.5 text-slate-600" /></button>
          <button onClick={() => camRef.current?.click()} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"><Camera className="w-3.5 h-3.5 text-slate-600" /></button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); if (fileRef.current) fileRef.current.value = ""; }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); if (camRef.current) camRef.current.value = ""; }} />
      </div>
    </div>
  );
}
