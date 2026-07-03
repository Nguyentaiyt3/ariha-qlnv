"use client";

/**
 * StepNodePanel — slide-over panel bên phải khi click một node trong sơ đồ quy trình.
 *
 * 6 section: Tiến độ | Người hỗ trợ | Tạm ứng | Thu/Chi | Email | Minh chứng
 */

import { useEffect, useRef, useState } from "react";
import {
  X, TrendingUp, Users, CreditCard, DollarSign, Mail, Paperclip,
  Plus, Trash2, Send, Camera, Link2, Loader2, Check, Upload, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { uploadFile } from "@/lib/firebase/storage";
import {
  createAdvanceRequest, subscribeAdvanceRequests, createTransaction, EXPENSE_CATEGORIES,
} from "@/lib/firebase/finance";
import { UserAvatar } from "@/components/common/UserAvatar";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import type {
  Task, TaskStep, User, StepSubTask, Proof, FinancialProof,
  AdvanceRequest, TaskPriority,
} from "@/types";

export type PanelSection = "progress" | "helpers" | "advance" | "transaction" | "email" | "proof" | "subworkflow";

const SECTION_TABS: { id: PanelSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "progress",    label: "Tiến độ",    Icon: TrendingUp },
  { id: "helpers",     label: "Hỗ trợ",     Icon: Users },
  { id: "advance",     label: "Tạm ứng",    Icon: CreditCard },
  { id: "transaction", label: "Thu/Chi",    Icon: DollarSign },
  { id: "email",       label: "Email",      Icon: Mail },
  { id: "proof",       label: "Minh chứng", Icon: Paperclip },
];

const VIETNAM_BANKS = [
  { id: "970436", name: "Vietcombank" }, { id: "970422", name: "MB Bank" },
  { id: "970407", name: "Techcombank" }, { id: "970416", name: "ACB" },
  { id: "970418", name: "BIDV" },        { id: "970405", name: "Agribank" },
  { id: "970415", name: "VietinBank" },  { id: "970432", name: "VPBank" },
  { id: "970423", name: "TPBank" },      { id: "970443", name: "SHB" },
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
}

export function StepNodePanel({
  task, stepId, section, onSectionChange, onClose,
  users, currentUser, taskMemberIds, onSave, onEmailSent,
  inline = false,
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
        {section === "progress"    && <ProgressSection    step={step} task={task} users={users} taskMemberIds={taskMemberIds} onSave={onSave} />}
        {section === "helpers"     && <HelpersSection     step={step} task={task} users={users} currentUser={currentUser} taskMemberIds={taskMemberIds} onSave={onSave} />}
        {section === "advance"     && <AdvanceSection     step={step} task={task} currentUser={currentUser} />}
        {section === "transaction" && <TransactionSection step={step} task={task} currentUser={currentUser} />}
        {section === "email"       && <EmailSection       step={step} task={task} users={users} currentUser={currentUser} taskMemberIds={taskMemberIds} onEmailSent={onEmailSent} />}
        {section === "proof"       && <ProofSection       step={step} task={task} currentUser={currentUser} onSave={onSave} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Tiến độ
// ══════════════════════════════════════════════════════════════
function ProgressSection({
  step, task, users, taskMemberIds, onSave,
}: {
  step: TaskStep; task: Task; users: User[]; taskMemberIds: Set<string>;
  onSave: (u: Partial<Task>) => Promise<void>;
}) {
  const [val, setVal] = useState(step.progress);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [localAssigneeId, setLocalAssigneeId] = useState(step.assigneeId);

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
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium transition"
          >
            {assignee ? "Đổi người" : "+ Phân công"}
          </button>
        </div>
        {showPicker && (
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
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-xs text-slate-400">
        {[0, 25, 50, 75, 100].map((n) => (
          <button key={n} onClick={() => setVal(n)}
            className={cn("font-medium hover:text-blue-600 transition", val === n && "text-blue-600")}>
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

      <button
        onClick={handleSave}
        disabled={saving || val === step.progress}
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
  step, task, users, currentUser, taskMemberIds, onSave,
}: {
  step: TaskStep; task: Task; users: User[]; currentUser: User;
  taskMemberIds: Set<string>; onSave: (u: Partial<Task>) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [helperUserId, setHelperUserId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Người hỗ trợ</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />Thêm
        </button>
      </div>

      {/* Existing helpers */}
      {(step.subTasks ?? []).length === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">Chưa có người hỗ trợ.</p>
      )}
      {(step.subTasks ?? []).map((st) => {
        const u = users.find((u) => u.id === st.userId);
        if (!u) return null;
        return (
          <div key={st.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <UserAvatar user={u} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{u.name}</p>
              {st.deadline && <p className="text-[10px] text-slate-400">Hạn: {new Date(st.deadline).toLocaleDateString("vi-VN")}</p>}
              {st.note && <p className="text-[10px] text-slate-500 truncate">{st.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] font-semibold", pTxtCls(st.progress))}>{st.progress}%</span>
              <button onClick={() => handleRemove(st.id)} className="p-1 rounded hover:bg-red-50 hover:text-red-500 transition">
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
              </button>
            </div>
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
// Section: Tạm ứng
// ══════════════════════════════════════════════════════════════
function AdvanceSection({ step, task, currentUser }: { step: TaskStep; task: Task; currentUser: User }) {
  const [advances, setAdvances] = useState<AdvanceRequest[]>([]);
  useEffect(() => subscribeAdvanceRequests(task.id, setAdvances), [task.id]);

  const [amount, setAmount]     = useState("");
  const [purpose, setPurpose]   = useState(`Tạm ứng: ${step.name}`);
  const [bankId, setBankId]     = useState((currentUser as any).bankAccount?.bankId ?? "");
  const [bankName, setBankName] = useState((currentUser as any).bankAccount?.bankName ?? "");
  const [accNum, setAccNum]     = useState((currentUser as any).bankAccount?.accountNumber ?? "");
  const [accName, setAccName]   = useState((currentUser as any).bankAccount?.accountName ?? currentUser.name);
  const [saving, setSaving]     = useState(false);

  const stepAdvances = advances.filter((a) => a.stepId === step.id);

  const ADV_CLS: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-600",   PENDING_SETTLEMENT: "bg-blue-100 text-blue-700",
    SETTLED: "bg-slate-100 text-slate-500",
  };
  const ADV_LBL: Record<string, string> = {
    PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối",
    PENDING_SETTLEMENT: "Chờ TT", SETTLED: "Quyết toán",
  };

  async function handleSubmit() {
    const num = parseFloat(amount);
    if (!num || num <= 0)        { toast.error("Nhập số tiền hợp lệ");      return; }
    if (!purpose.trim())         { toast.error("Nhập mục đích tạm ứng");    return; }
    if (!accNum.trim())          { toast.error("Nhập số tài khoản nhận");   return; }
    if (!accName.trim())         { toast.error("Nhập tên chủ tài khoản");   return; }
    setSaving(true);
    try {
      await createAdvanceRequest({
        taskId: task.id, stepId: step.id, stepName: step.name,
        requestedBy: currentUser.id, requestedByName: currentUser.name,
        amount: num, purpose: purpose.trim(),
        ...(bankId ? { bankAccount: { bankId, bankName, accountNumber: accNum.trim(), accountName: accName.trim() } } : {}),
      });
      toast.success("Đã gửi đơn tạm ứng. Chờ phê duyệt.");
      setAmount("");
    } catch (err) { toast.error((err as Error).message ?? "Gửi thất bại"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Existing advances */}
      {stepAdvances.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Đơn tạm ứng của bước này</p>
          {stepAdvances.map((adv) => (
            <div key={adv.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-200">{adv.amount.toLocaleString("vi-VN")}₫</p>
                <p className="text-slate-400 truncate max-w-[160px]">{adv.purpose}</p>
              </div>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", ADV_CLS[adv.status])}>
                {ADV_LBL[adv.status]}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Yêu cầu tạm ứng mới</p>
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Số tiền (VNĐ)"
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2}
          placeholder="Mục đích..."
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
        <button onClick={handleSubmit} disabled={saving}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Gửi đơn tạm ứng
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Section: Thu/Chi
// ══════════════════════════════════════════════════════════════
function TransactionSection({ step, task, currentUser }: { step: TaskStep; task: Task; currentUser: User }) {
  const [fundSource, setFundSource] = useState<"ADVANCE" | "OUT_OF_POCKET" | "REVENUE">("OUT_OF_POCKET");
  const [amount, setAmount]         = useState("");
  const [category, setCategory]     = useState<string>(EXPENSE_CATEGORIES[0]);
  const [desc, setDesc]             = useState("");
  const [proofs, setProofs]         = useState<FinancialProof[]>([]);
  const [proofUrl, setProofUrl]     = useState("");
  const [uploading, setUploading]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef  = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadFile(file, "proofs");
        setProofs((prev) => [...prev, {
          id: generateId("proof"), name: file.name, url, type: file.type, size: file.size,
          uploadedBy: currentUser.id, uploadedAt: new Date().toISOString(),
        }]);
      }
      toast.success(`Đã tải ${files.length} chứng từ`);
    } catch { toast.error("Tải chứng từ thất bại"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function addProofLink() {
    const url = proofUrl.trim();
    if (!url) return;
    setProofs((prev) => [...prev, { id: generateId("proof"), name: url, url, type: "link", uploadedBy: currentUser.id, uploadedAt: new Date().toISOString() }]);
    setProofUrl("");
  }

  async function handleSubmit() {
    const num = parseFloat(amount);
    if (!num || num <= 0)                              { toast.error("Nhập số tiền hợp lệ"); return; }
    if (!desc.trim())                                  { toast.error("Nhập mô tả"); return; }
    if (fundSource !== "REVENUE" && proofs.length === 0) { toast.error("Cần ít nhất 1 chứng từ"); return; }
    setSaving(true);
    try {
      await createTransaction({
        taskId: task.id, stepId: step.id,
        createdBy: currentUser.id, createdByName: currentUser.name,
        amount: num,
        direction: fundSource === "REVENUE" ? "CREDIT" : "DEBIT",
        fundSource, category, description: desc.trim(), proofs,
      });
      toast.success("Đã thêm giao dịch");
      setAmount(""); setDesc(""); setProofs([]);
    } catch (err) { toast.error((err as Error).message ?? "Thất bại"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      {/* Fund source */}
      <div className="grid grid-cols-3 gap-1.5">
        {([
          { v: "OUT_OF_POCKET", label: "Tự ứng" },
          { v: "ADVANCE",       label: "Tạm ứng" },
          { v: "REVENUE",       label: "Thu về" },
        ] as const).map(({ v, label }) => (
          <button key={v} onClick={() => setFundSource(v)}
            className={cn("py-1.5 rounded-lg text-xs font-semibold border transition",
              fundSource === v ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
            {label}
          </button>
        ))}
      </div>

      <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
        placeholder="Số tiền (VNĐ)"
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />

      <select value={category} onChange={(e) => setCategory(e.target.value)}
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
        {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>

      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
        placeholder="Mô tả giao dịch..."
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />

      {/* Proofs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProofLink()}
            placeholder="URL chứng từ" className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={addProofLink} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"><Link2 className="w-3.5 h-3.5 text-slate-600" /></button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-slate-600" />}
          </button>
          <button onClick={() => camRef.current?.click()} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"><Camera className="w-3.5 h-3.5 text-slate-600" /></button>
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
        {proofs.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
            <Paperclip className="w-3 h-3 shrink-0" />
            <span className="flex-1 truncate">{p.name}</span>
            <button onClick={() => setProofs((prev) => prev.filter((x) => x.id !== p.id))}>
              <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
            </button>
          </div>
        ))}
      </div>

      <button onClick={handleSubmit} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
        Lưu giao dịch
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

  const [toIds, setToIds]       = useState<Set<string>>(defaultIds);
  const [subject, setSubject]   = useState(`[${task.name}] ${step.name}`);
  const [body, setBody]         = useState("");
  const [sending, setSending]   = useState(false);

  const recipients = users.filter((u) => taskMemberIds.has(u.id) && u.id !== currentUser.id);

  function toggleRecipient(id: string) {
    setToIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (toIds.size === 0)      { toast.error("Chưa chọn người nhận"); return; }
    if (!subject.trim())       { toast.error("Nhập tiêu đề"); return; }
    if (!body.trim())          { toast.error("Nhập nội dung"); return; }
    const recs = Array.from(toIds)
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is User => !!u && !!u.email)
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));
    if (!recs.length) { toast.error("Người được chọn chưa có email"); return; }
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
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Người nhận</p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {recipients.map((u) => (
            <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              <input type="checkbox" checked={toIds.has(u.id)} onChange={() => toggleRecipient(u.id)}
                className="rounded accent-blue-500" />
              <UserAvatar user={u} size="xs" showName namePosition="right" />
            </label>
          ))}
        </div>
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
