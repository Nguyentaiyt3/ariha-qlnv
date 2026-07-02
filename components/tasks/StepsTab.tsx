"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus, ChevronDown, ChevronRight, Camera, Link2, X,
  Loader2, TrendingUp, TrendingDown, Image as ImageIcon, Paperclip, AlertTriangle,
  Mail, Send, CreditCard, Check, QrCode, DollarSign, List, GitBranch,
} from "lucide-react";
import { cn, generateId, formatDate, priorityLabel } from "@/lib/utils";
import {
  computeInputState, computeOutputState, computeStepEval3T, STEP_EVAL_LABEL,
  nodesToTaskSteps, updateStepById,
} from "@/lib/workflow-engine";
import { canAssignTo } from "@/lib/rbac/permissions";
import { uploadFile } from "@/lib/firebase/storage";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { Task, TaskStep, StepSubTask, User, TaskPriority, Proof, AdvanceRequest, FinancialProof, ChangeRequest, Workflow, WorkflowNode, WorkflowEdge } from "@/types";
import {
  createAdvanceRequest, subscribeAdvanceRequests,
  createTransaction, EXPENSE_CATEGORIES,
} from "@/lib/firebase/finance";
import { StepFlowDiagram, type PanelSection } from "@/components/tasks/StepFlowDiagram";
import { StepTimelineView } from "@/components/tasks/StepTimelineView";
import { StepNodePanel } from "@/components/tasks/StepNodePanel";
import WorkflowBuilder from "@/components/tasks/WorkflowBuilder";
import { ResearchStepPanel } from "@/components/tasks/ResearchStepPanel";
import { toast } from "sonner";

interface Props {
  task: Task;
  users: User[];
  currentUser: User;
  canAssignSteps: boolean;
  canApprove?: boolean;
  onSave: (updates: Partial<Task>) => Promise<void>;
  onEmailSent?: () => void;
}

const VIETNAM_BANKS = [
  { id: "970436", name: "Vietcombank (VCB)" },
  { id: "970422", name: "MB Bank" },
  { id: "970407", name: "Techcombank (TCB)" },
  { id: "970416", name: "ACB" },
  { id: "970418", name: "BIDV" },
  { id: "970405", name: "Agribank" },
  { id: "970415", name: "VietinBank (CTG)" },
  { id: "970432", name: "VPBank" },
  { id: "970423", name: "TPBank" },
  { id: "970443", name: "SHB" },
  { id: "970448", name: "OCB" },
  { id: "970412", name: "PVcomBank" },
  { id: "970454", name: "Tiên Phong Bank" },
  { id: "970449", name: "LPBank" },
  { id: "970462", name: "SeABank" },
  { id: "970441", name: "VIB" },
  { id: "970457", name: "Sacombank" },
  { id: "970403", name: "Eximbank" },
  { id: "970426", name: "MSB" },
  { id: "970431", name: "Shinhan Bank" },
  { id: "970453", name: "ABBANK" },
  { id: "970433", name: "Kienlongbank" },
];

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
};

// ── Main component ────────────────────────────────────────────

export function StepsTab({ task, users, currentUser, canAssignSteps, canApprove = false, onSave, onEmailSent }: Props) {
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
  // Advance requests realtime
  const [taskAdvances, setTaskAdvances] = useState<AdvanceRequest[]>([]);
  useEffect(() => subscribeAdvanceRequests(task.id, setTaskAdvances), [task.id]);

  // Advance request panel
  const [advanceStepId,     setAdvanceStepId]     = useState<string | null>(null);
  const [advanceAmount,     setAdvanceAmount]      = useState("");
  const [advancePurpose,    setAdvancePurpose]     = useState("");
  const [advanceBankId,     setAdvanceBankId]      = useState("");
  const [advanceBankName,   setAdvanceBankName]    = useState("");
  const [advanceAccNumber,  setAdvanceAccNumber]   = useState("");
  const [advanceAccName,    setAdvanceAccName]     = useState("");
  const [advanceSaving,     setAdvanceSaving]      = useState(false);

  // Thêm thu/chi (transaction) panel
  const [txStepId,     setTxStepId]     = useState<string | null>(null);
  const [txFundSource, setTxFundSource] = useState<"ADVANCE" | "OUT_OF_POCKET" | "REVENUE">("OUT_OF_POCKET");
  const [txAmount,     setTxAmount]     = useState("");
  const [txCategory,   setTxCategory]   = useState<string>(EXPENSE_CATEGORIES[0]);
  const [txDesc,       setTxDesc]       = useState("");
  const [txProofs,     setTxProofs]     = useState<FinancialProof[]>([]);
  const [txProofUrl,   setTxProofUrl]   = useState("");
  const [txUploading,  setTxUploading]  = useState(false);
  const [txSaving,     setTxSaving]     = useState(false);
  const [txAdvanceId,  setTxAdvanceId]  = useState("");
  const txFileRef   = useRef<HTMLInputElement>(null);
  const txCameraRef = useRef<HTMLInputElement>(null);

  // Email compose panel
  const [emailStepId, setEmailStepId] = useState<string | null>(null);
  const [emailToIds, setEmailToIds] = useState<Set<string>>(new Set());
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  // View mode: list (default), diagram (timeline infographic), or flow (ReactFlow DAG)
  const [viewMode, setViewMode] = useState<"list" | "diagram" | "flow">("list");
  // Panel state for diagram node click
  const [panelStepId,  setPanelStepId]  = useState<string | null>(null);
  const [panelSection, setPanelSection] = useState<PanelSection>("progress");
  // Sub-workflow editor overlay
  const [editSubWfStep, setEditSubWfStep] = useState<TaskStep | null>(null);

  // Optimistic local copy — updates instantly on action, syncs when subscription fires.
  const [localSteps, setLocalSteps] = useState<TaskStep[]>(task.steps ?? []);
  useEffect(() => { setLocalSteps(task.steps ?? []); }, [task.steps]);
  const steps = localSteps;

  // Chỉ hiển thị người đã thuộc task (stakeholder + mainPerformer), cùng cấp trở xuống.
  const taskMemberIds = new Set([
    task.mainPerformerId,
    ...(task.stakeholders ?? []).map((s) => s.userId),
  ].filter(Boolean));
  const assignableUsers = users.filter(
    (u) => u.isActive && taskMemberIds.has(u.id) && canAssignTo(currentUser.role, u.role)
  );

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

  // Normalize step statuses to match progress before writing to Firestore
  function normalizeSteps(ss: TaskStep[]): TaskStep[] {
    return ss.map((s) => {
      const p = s.progress ?? 0;
      const correctStatus =
        p >= 100 ? "completed" : p > 0 ? "in_progress" : "pending";
      if (s.status === correctStatus) return s;
      return {
        ...s,
        status: correctStatus as TaskStep["status"],
        ...(correctStatus === "completed" && !s.completedAt
          ? { completedAt: new Date().toISOString() }
          : {}),
      };
    });
  }

  // A step is considered done if status="completed" OR progress reached 100
  // (handles stale data where progress was set to 100 before auto-flip existed)
  function isStepDone(s: TaskStep): boolean {
    return s.status === "completed" || (s.progress ?? 0) >= 100;
  }

  // Auto-heal: fix steps where progress=100 but status was never flipped to "completed"
  useEffect(() => {
    if (!task.approved) return;
    const stale = steps.filter((s) => (s.progress ?? 0) >= 100 && s.status !== "completed");
    if (stale.length === 0) return;
    const healed = steps.map((s) =>
      (s.progress ?? 0) >= 100 && s.status !== "completed"
        ? { ...s, status: "completed" as const, completedAt: s.completedAt ?? new Date().toISOString() }
        : s
    );
    onSave({ steps: healed });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Sub-workflow helpers ──────────────────────────────────────
  function buildSubWorkflow(step: TaskStep): Workflow {
    const childSteps = step.childSteps ?? [];
    const nodes: WorkflowNode[] = childSteps.map((cs, i) => ({
      id: cs.id,
      name: cs.name,
      description: cs.description,
      department: cs.department,
      status: (cs.status === "completed" ? "done" : cs.status === "in_progress" ? "in_progress" : "todo") as any,
      position: cs.position ?? { x: (i % 3) * 260 + 40, y: Math.floor(i / 3) * 160 + 80 },
      assigneeId: cs.assigneeId,
      deadline: cs.deadline,
      kpiTarget: cs.kpiTarget,
      kpiUnit: cs.kpiUnit,
    }));
    const edges: WorkflowEdge[] = step.childEdges ?? [];
    return {
      id: `sub-${step.id}`, name: `Quy trình con: ${step.name}`,
      nodes, edges, steps: [], status: "published" as const,
      createdBy: "", createdByName: "", createdAt: "", updatedAt: "",
    };
  }

  async function handleSubWorkflowSave(newNodes: WorkflowNode[], newEdges: WorkflowEdge[]) {
    if (!editSubWfStep) return;
    const newChildSteps = nodesToTaskSteps(newNodes, newEdges);
    const updatedSteps = updateStepById(localSteps, editSubWfStep.id, {
      childSteps: newChildSteps, childEdges: newEdges,
    });
    setLocalSteps(updatedSteps);
    setEditSubWfStep(null);
    try {
      await onSave({ steps: updatedSteps });
      toast.success("Đã lưu quy trình con.");
    } catch {
      toast.error("Lưu quy trình con thất bại");
      setLocalSteps(task.steps ?? []);
    }
  }

  function handleSubWorkflowConfirm(newNodes: WorkflowNode[], newEdges: WorkflowEdge[]) {
    if (!editSubWfStep) return;
    const isFirstSetup = !(editSubWfStep.childSteps?.length);
    const newChildSteps = nodesToTaskSteps(newNodes, newEdges);
    if (isFirstSetup || canApprove) {
      // Direct apply: initial setup or approver
      handleSubWorkflowSave(newNodes, newEdges);
    } else {
      // Create change request for post-setup modification
      const cr: ChangeRequest = {
        type: "subworkflow_change",
        reason: `Đề xuất sửa quy trình con "${editSubWfStep.name}"`,
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        requestedAt: new Date().toISOString(),
        previousStatus: task.status,
        status: "pending",
        changedFields: {
          subWorkflowChange: {
            stepId: editSubWfStep.id,
            stepName: editSubWfStep.name,
            proposedChildSteps: newChildSteps,
            proposedChildEdges: newEdges,
          },
        },
      };
      onSave({ status: "review" as const, changeRequests: [...(task?.changeRequests ?? []), cr] }).catch(console.error);
      toast.info("Đã gửi đề xuất sửa quy trình con — chờ quản lý phê duyệt.");
      setEditSubWfStep(null);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────

  async function handleAssignStep(stepId: string, userId: string) {
    const already = (task.stakeholders ?? []).some((s) => s.userId === userId);
    const stakeholders = already
      ? task.stakeholders
      : [...(task.stakeholders ?? []), { userId, role: "assignee" as const }];
    const updatedSteps = patchStep(stepId, { assigneeId: userId, status: "pending" });
    // Optimistic: close picker + show new assignee immediately
    setLocalSteps(updatedSteps);
    setAssigningStep(null);
    toast.success("Đã phân công");
    onSave({ steps: updatedSteps, stakeholders }).catch(() => {
      toast.error("Lưu thất bại — đang hoàn tác");
      setLocalSteps(task.steps ?? []);
    });
  }

  async function handleAddSubTask(stepId: string) {
    if (!subForm.userId) { toast.error("Chọn người hỗ trợ"); return; }
    const step = steps.find((s) => s.id === stepId)!;
    const newSub: StepSubTask = {
      id: generateId("sub"),
      userId: subForm.userId,
      priority: subForm.priority,
      amountType: "none",
      amount: 0,
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
    setLocalSteps(updatedSteps);
    setSubForm(BLANK_SUB);
    setAddSubStep(null);
    toast.success("Đã giao việc hỗ trợ");
    onSave({ steps: updatedSteps, stakeholders }).catch(() => {
      toast.error("Lưu thất bại — đang hoàn tác");
      setLocalSteps(task.steps ?? []);
    });
  }

  async function handleRemoveSubTask(stepId: string, subId: string) {
    const step = steps.find((s) => s.id === stepId)!;
    const subTasks = (step.subTasks ?? []).filter((st) => st.id !== subId);
    const updatedSteps = patchStep(stepId, { subTasks });
    setLocalSteps(updatedSteps);
    onSave({ steps: updatedSteps }).catch(() => setLocalSteps(task.steps ?? []));
  }

  function startEdit(stepId: string, subId?: string, current = 0) {
    setEditKey(subId ? `${stepId}::${subId}` : stepId);
    setProgressVal(current);
    setProofKey(null);
  }

  async function saveProgress(stepId: string, subId?: string) {
    let updatedSteps: TaskStep[];
    if (subId) {
      updatedSteps = patchSubTask(stepId, subId, { progress: progressVal });
    } else {
      updatedSteps = patchStep(stepId, { progress: progressVal });
    }
    const normalized = normalizeSteps(updatedSteps);
    // Optimistic: close editor immediately
    setLocalSteps(normalized);
    setEditKey(null);
    toast.success("Đã cập nhật tiến độ");
    onSave({ steps: normalized, progress: recalcProgress(normalized) }).catch(() => {
      toast.error("Lưu thất bại — đang hoàn tác");
      setLocalSteps(task.steps ?? []);
    });
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
    setLocalSteps(updatedSteps);
    toast.success("Đã thêm minh chứng");
    onSave({ steps: updatedSteps }).catch(() => {
      toast.error("Lưu minh chứng thất bại");
      setLocalSteps(task.steps ?? []);
    });
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

  function buildPurpose(stepName: string, accNumber: string, bankName: string) {
    const today = new Date().toLocaleDateString("vi-VN");
    const accPart  = accNumber ? ` - ${accNumber}` : "";
    const bankPart = bankName  ? ` - ${bankName}`  : "";
    return `Tạm ứng: ${stepName} - ${today} - ${currentUser.name}${accPart}${bankPart}`;
  }

  function openAdvancePanel(step: TaskStep) {
    setAdvanceStepId(step.id);
    setAdvanceAmount("");
    const ba = (currentUser as { bankAccount?: { bankId: string; bankName: string; accountNumber: string; accountName: string } }).bankAccount;
    const accNum  = ba?.accountNumber ?? "";
    const bankNm  = ba?.bankName      ?? "";
    setAdvanceBankId(ba?.bankId ?? "");
    setAdvanceBankName(bankNm);
    setAdvanceAccNumber(accNum);
    setAdvanceAccName(ba?.accountName ?? currentUser.name);
    setAdvancePurpose(buildPurpose(step.name, accNum, bankNm));
    setEditKey(null);
    setProofKey(null);
    setEmailStepId(null);
  }

  async function handleAdvanceRequest(step: TaskStep) {
    const num = parseFloat(advanceAmount);
    if (!num || num <= 0)       { toast.error("Nhập số tiền hợp lệ.");     return; }
    if (!advancePurpose.trim()) { toast.error("Nhập mục đích tạm ứng.");   return; }
    if (!advanceAccNumber.trim()) { toast.error("Nhập số tài khoản nhận."); return; }
    if (!advanceAccName.trim())   { toast.error("Nhập tên chủ tài khoản."); return; }
    setAdvanceSaving(true);
    try {
      await createAdvanceRequest({
        taskId:          task.id,
        stepId:          step.id,
        stepName:        step.name,
        requestedBy:     currentUser.id,
        requestedByName: currentUser.name,
        amount:          num,
        purpose:         advancePurpose.trim(),
        bankAccount: advanceBankId ? {
          bankId:        advanceBankId,
          bankName:      advanceBankName,
          accountNumber: advanceAccNumber.trim(),
          accountName:   advanceAccName.trim(),
        } : undefined,
      });
      toast.success("Đã gửi đơn tạm ứng. Chờ phê duyệt.");
      setAdvanceStepId(null);
    } catch (err) {
      toast.error((err as Error).message ?? "Gửi đơn thất bại.");
    } finally {
      setAdvanceSaving(false);
    }
  }

  function openTxPanel(step: TaskStep) {
    setTxStepId(step.id);
    setTxFundSource("OUT_OF_POCKET");
    setTxAmount("");
    setTxCategory(EXPENSE_CATEGORIES[0]);
    setTxDesc("");
    setTxProofs([]);
    setTxProofUrl("");
    setTxAdvanceId("");
    setAdvanceStepId(null);
    setEmailStepId(null);
  }

  async function handleTxFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setTxUploading(true);
    try {
      for (const file of files) {
        const url = await uploadFile(file, "proofs");
        setTxProofs((prev) => [
          ...prev,
          { id: generateId("proof"), name: file.name, url, type: file.type, size: file.size,
            uploadedBy: currentUser.id, uploadedAt: new Date().toISOString() },
        ]);
      }
      toast.success(`Đã tải ${files.length} chứng từ.`);
    } catch { toast.error("Tải chứng từ thất bại."); }
    finally {
      setTxUploading(false);
      if (txFileRef.current) txFileRef.current.value = "";
      if (txCameraRef.current) txCameraRef.current.value = "";
    }
  }

  function addTxProofLink() {
    const url = txProofUrl.trim();
    if (!url) return;
    setTxProofs((prev) => [
      ...prev,
      { id: generateId("proof"), name: url, url, type: "link",
        uploadedBy: currentUser.id, uploadedAt: new Date().toISOString() },
    ]);
    setTxProofUrl("");
  }

  async function handleTxSubmit(step: TaskStep) {
    const num = parseFloat(txAmount);
    if (!num || num <= 0) { toast.error("Nhập số tiền hợp lệ."); return; }
    if (!txDesc.trim()) { toast.error("Nhập mô tả."); return; }
    if (txFundSource !== "REVENUE" && txProofs.length === 0) { toast.error("Cần ít nhất 1 chứng từ."); return; }
    setTxSaving(true);
    try {
      await createTransaction({
        taskId: task.id,
        stepId: step.id,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        amount: num,
        direction: txFundSource === "REVENUE" ? "CREDIT" : "DEBIT",
        fundSource: txFundSource,
        category: txCategory,
        description: txDesc.trim(),
        proofs: txProofs,
        ...(txFundSource === "ADVANCE" && txAdvanceId ? { advanceRequestId: txAdvanceId } : {}),
      });
      toast.success("Đã thêm giao dịch.");
      setTxStepId(null);
    } catch (err) {
      toast.error((err as Error).message ?? "Thất bại.");
    } finally {
      setTxSaving(false);
    }
  }

  function openEmailPanel(step: TaskStep) {
    const ids = new Set<string>();
    if (step.assigneeId) ids.add(step.assigneeId);
    (step.subTasks ?? []).forEach((st) => ids.add(st.userId));
    setEmailStepId(step.id);
    setEmailToIds(ids);
    setEmailSubject(`[${task.name}] ${step.name}`);
    setEmailBody("");
    setEditKey(null);
    setProofKey(null);
    setAssigningStep(null);
    setAddSubStep(null);
  }

  async function handleSendEmail(step: TaskStep) {
    if (emailToIds.size === 0) { toast.error("Chưa chọn người nhận"); return; }
    if (!emailSubject.trim()) { toast.error("Nhập tiêu đề email"); return; }
    if (!emailBody.trim()) { toast.error("Nhập nội dung email"); return; }

    const recipients = Array.from(emailToIds)
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is User => !!u && !!u.email)
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));

    if (recipients.length === 0) { toast.error("Người được chọn chưa có email"); return; }

    setEmailSending(true);
    try {
      const res = await fetch("/api/email/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUserId: currentUser.id,
          recipients,
          subject: emailSubject,
          body: emailBody,
          taskId: task.id,
          stepName: step.name,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Đã gửi email tới ${recipients.length} người`);
      setEmailStepId(null);
      onEmailSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gửi thất bại");
    } finally {
      setEmailSending(false);
    }
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

  const pCls = (p: number) =>
    p <= 33 ? "text-red-600 dark:text-red-400 font-semibold"
    : p <= 66 ? "text-amber-600 dark:text-amber-400 font-semibold"
    : "text-green-600 dark:text-green-400 font-semibold";
  const pBar = (p: number) =>
    p <= 33 ? "bg-red-500" : p <= 66 ? "bg-amber-500" : "bg-green-500";

  if (steps.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-10">
        Chưa có bước quy trình. Chọn quy trình khi tạo nhiệm vụ để tự động thêm các bước.
      </p>
    );
  }

  const done = steps.filter(isStepDone).length;

  return (
    <div className="space-y-3">
      {/* Workflow badge + progress summary + view toggle */}
      <div className="flex items-center gap-2 text-xs">
        {task.workflowName && (
          <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full font-medium">
            {task.workflowName}
          </span>
        )}
        <span className="text-slate-400">{done}/{steps.length} bước hoàn thành</span>
        <div className="ml-auto flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition",
              viewMode === "list" ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            <List className="w-3 h-3" />Danh sách
          </button>
          <button
            onClick={() => setViewMode("diagram")}
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition",
              viewMode === "diagram" ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            <GitBranch className="w-3 h-3" />Sơ đồ
          </button>
          <button
            onClick={() => setViewMode("flow")}
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition",
              viewMode === "flow" ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            <GitBranch className="w-3 h-3" />DAG
          </button>
        </div>
      </div>

      {/* ── Timeline / infographic mode ── */}
      {viewMode === "diagram" && (
        <>
          <StepTimelineView
            steps={steps}
            users={users}
            onStepClick={(stepId) => {
              setPanelStepId(stepId);
              setPanelSection("progress");
            }}
          />
          {panelStepId && (
            <StepNodePanel
              task={{ ...task, steps }}
              stepId={panelStepId}
              section={panelSection}
              onSectionChange={setPanelSection}
              onClose={() => setPanelStepId(null)}
              users={users}
              currentUser={currentUser}
              taskMemberIds={taskMemberIds}
              onSave={onSave}
              onEmailSent={onEmailSent}
            />
          )}
        </>
      )}

      {/* ── DAG / ReactFlow mode ── */}
      {viewMode === "flow" && (
        <>
          <StepFlowDiagram
            task={{ ...task, steps }}
            steps={steps}
            users={users}
            currentUser={currentUser}
            canAssignSteps={canAssignSteps}
            onNodeClick={(stepId, section) => {
              if (section === "subworkflow") return;
              setPanelStepId(stepId);
              setPanelSection(section);
            }}
            onEditSubWorkflow={(stepId) => {
              const step = localSteps.find((s) => s.id === stepId);
              if (step) setEditSubWfStep(step);
            }}
          />
          {panelStepId && (
            <StepNodePanel
              task={{ ...task, steps }}
              stepId={panelStepId}
              section={panelSection}
              onSectionChange={setPanelSection}
              onClose={() => setPanelStepId(null)}
              users={users}
              currentUser={currentUser}
              taskMemberIds={taskMemberIds}
              onSave={onSave}
              onEmailSent={onEmailSent}
            />
          )}
        </>
      )}

      {/* ── List mode ── */}
      {viewMode === "list" && !task.approved && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800">
          Nhiệm vụ chưa được phê duyệt — phân công và cập nhật tiến độ sẽ khả dụng sau khi duyệt.
        </div>
      )}

      {/* ── Sub-workflow editor overlay ── */}
      {editSubWfStep && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--background, #fff)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "var(--card, #fff)" }}>
            <GitBranch style={{ width: 16, height: 16, color: "#8B5CF6", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground, #0f172a)", margin: 0 }}>
                Quy trình con: {editSubWfStep.name}
              </p>
              {!canApprove && (editSubWfStep.childSteps?.length ?? 0) > 0 && (
                <p style={{ fontSize: 11, color: "#D97706", margin: "2px 0 0" }}>
                  Đã có quy trình con — thay đổi sẽ gửi đề xuất cho quản lý phê duyệt
                </p>
              )}
            </div>
            <button
              onClick={() => setEditSubWfStep(null)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >
              Đóng
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <WorkflowBuilder
              workflow={buildSubWorkflow(editSubWfStep)}
              allWorkflows={[]}
              canEdit={canAssignSteps}
              canApprove={canApprove || !(editSubWfStep.childSteps?.length)}
              onSave={async (nodes, edges) => { handleSubWorkflowConfirm(nodes, edges); }}
              onCancelDraft={() => setEditSubWfStep(null)}
            />
          </div>
        </div>
      )}

      {viewMode === "list" && steps.map((step, idx) => {
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
        // Sub-task members in this step also get read access to research panels
        const isStepMember = canIUpdate ||
          (step.subTasks ?? []).some(st => st.userId === currentUser.id);
        const myRole: "assignee" | "helper" | null =
          step.assigneeId === currentUser.id ? "assignee"
          : (step.helpers ?? []).includes(currentUser.id) ? "helper"
          : null;

        const isActive = step.status === "in_progress";
        return (
          <div
            key={step.id}
            className={cn(
              "rounded-2xl border overflow-hidden",
              isStepDone(step)
                ? "border-green-200 dark:border-green-900"
                : isActive
                ? "border-blue-400 dark:border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900/60 shadow-md"
                : "border-slate-200 dark:border-slate-700",
            )}
          >
            {/* ── Step header (always visible) ── */}
            <button
              onClick={() => toggleExpand(step.id)}
              className={cn(
                "w-full flex items-center gap-3 p-4 transition text-left",
                isActive
                  ? "bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/60"
                  : "bg-[var(--card)] hover:bg-slate-50 dark:hover:bg-slate-800/40",
              )}
            >
              <div className={cn(
                "w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold",
                isStepDone(step)
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : step.status === "in_progress"
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500",
              )}>
                {isStepDone(step) ? "✓" : idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                {/* Tên bước + badge tạm ứng cùng hàng */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={cn("font-medium text-sm truncate", isActive ? "text-blue-700 dark:text-blue-300" : "dark:text-white")}>{step.name}</p>
                  {isActive && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-500 text-white animate-pulse">
                      ● Đang thực hiện
                    </span>
                  )}
                  {myRole && (
                    <span className={cn(
                      "shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                      myRole === "assignee"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
                    )}>
                      {myRole === "assignee" ? "Thực hiện chính" : "Cộng tác"}
                    </span>
                  )}
                  {taskAdvances.filter((a) => a.stepId === step.id).map((adv) => {
                    const ADV_CLS: Record<string, string> = {
                      PENDING:             "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                      APPROVED:            "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      REJECTED:            "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                      PENDING_SETTLEMENT:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      SETTLED:             "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                    };
                    const ADV_LBL: Record<string, string> = {
                      PENDING: "Chờ duyệt", APPROVED: "Đã duyệt",
                      REJECTED: "Từ chối",  PENDING_SETTLEMENT: "Chờ TT", SETTLED: "Quyết toán",
                    };
                    return (
                      <span key={adv.id} className={cn("inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium", ADV_CLS[adv.status] ?? ADV_CLS.PENDING)}>
                        <CreditCard className="w-2.5 h-2.5" />
                        {adv.amount.toLocaleString("vi-VN")}đ
                        <span className="opacity-70">({ADV_LBL[adv.status]})</span>
                      </span>
                    );
                  })}
                </div>
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

              <span className={cn("text-xs shrink-0", pCls(step.progress))}>{step.progress}%</span>

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
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800">
              <div
                className={cn("h-full transition-all duration-300", pBar(step.progress))}
                style={{ width: `${step.progress}%` }}
              />
            </div>

            {/* ── Expanded body ── */}
            {isOpen && (
              <div className="p-4 space-y-4 bg-slate-50 dark:bg-slate-900/60">

                {/* Đầu vào / Đầu ra / Đánh giá 3T — chuỗi quy trình liền mạch */}
                <StepFlowBanner step={step} allSteps={steps} />

                {/* B01 / B02 research workflow action panels */}
                <ResearchStepPanel
                  task={task}
                  step={step}
                  users={users}
                  currentUser={currentUser}
                  canView={isStepMember}
                  canUpdate={canIUpdate}
                />

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
                        {assignableUsers.map((u) => (
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
                          {assignableUsers.filter((u) => u.id !== step.assigneeId).map((u) => (
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

                      const isSubUrgent = sub.priority === "urgent";
                      const isSubOverdue = !!sub.deadline && new Date(sub.deadline) < new Date(new Date().toDateString());
                      const isSubAlert = (isSubUrgent || isSubOverdue) && sub.status !== "completed" && (sub.progress ?? 0) < 100;
                      const isMySub = sub.userId === currentUser.id;

                      return (
                        <div
                          key={sub.id}
                          className={cn(
                            "p-3 bg-white dark:bg-slate-800 border rounded-xl",
                            isSubAlert && isSubUrgent
                              ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-900/10"
                              : isSubAlert
                              ? "border-orange-300 dark:border-orange-700 bg-orange-50/40 dark:bg-orange-900/10"
                              : "border-slate-200 dark:border-slate-700"
                          )}
                        >
                          {/* Alert banner — shown when urgent or overdue */}
                          {isSubAlert && (
                            <div className={cn(
                              "flex items-center gap-1.5 text-xs font-semibold mb-2 px-2.5 py-1.5 rounded-lg",
                              isSubUrgent
                                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                            )}>
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {isSubUrgent && isSubOverdue
                                ? `Khẩn cấp · Trễ hạn${isMySub ? " — Cần hành động ngay!" : ""}`
                                : isSubUrgent
                                ? `Nhiệm vụ khẩn cấp${isMySub ? " — Ưu tiên xử lý!" : ""}`
                                : `Trễ hạn${isMySub ? " — Cần cập nhật tiến độ!" : ""}`
                              }
                            </div>
                          )}

                          <div className="flex items-start gap-2">
                            <UserAvatar user={subUser} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium dark:text-white">{subUser.name}</span>
                                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", PRIORITY_COLOR[sub.priority])}>
                                  {priorityLabel(sub.priority)}
                                </span>
                                {sub.deadline && (
                                  <span className={cn(
                                    "text-xs",
                                    isSubOverdue && isSubAlert ? "text-orange-600 dark:text-orange-400 font-semibold" : "text-slate-400"
                                  )}>
                                    Hạn: {formatDate(sub.deadline)}
                                    {isSubOverdue && isSubAlert && " (Trễ)"}
                                  </span>
                                )}
                                {sub.amountType !== "none" && (
                                  <span className={cn("text-xs font-semibold", sub.amountType === "income" ? "text-green-600" : "text-red-600")}>
                                    {sub.amountType === "income" ? "+" : "−"}{sub.amount.toLocaleString("vi-VN")}đ
                                  </span>
                                )}
                              </div>
                              {sub.note && <p className="text-xs text-slate-400 mt-0.5">{sub.note}</p>}
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className={cn("h-full rounded-full transition-all duration-300", pBar(sub.progress))} style={{ width: `${sub.progress}%` }} />
                                </div>
                                <span className={cn("text-xs shrink-0", pCls(sub.progress))}>{sub.progress}%</span>
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

                {/* ── Danh sách tạm ứng đã nộp của bước này ── */}
                {(() => {
                  const stepAdvs = taskAdvances.filter((a) => (a as { stepId?: string }).stepId === step.id);
                  if (!stepAdvs.length) return null;
                  const ADV_LABEL: Record<string, { label: string; cls: string }> = {
                    PENDING:  { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                    APPROVED: { label: "Đã duyệt",  cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                    REJECTED: { label: "Từ chối",   cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
                    SETTLED:  { label: "Quyết toán",cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                  };
                  return (
                    <div className="space-y-1 mb-1">
                      {stepAdvs.map((adv) => {
                        const b = ADV_LABEL[adv.status] ?? ADV_LABEL.PENDING;
                        return (
                          <div key={adv.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl text-xs">
                            <CreditCard className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0", b.cls)}>{b.label}</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200 shrink-0">
                              {adv.amount.toLocaleString("vi-VN")} đ
                            </span>
                            <span className="text-slate-400 truncate">{adv.purpose}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── Advance + Email buttons (cùng hàng) ── */}
                {(() => {
                  const isAdvOpen    = advanceStepId === step.id;
                  const isTxOpen     = txStepId === step.id;
                  const hasAssignees = !!step.assigneeId || (step.subTasks ?? []).length > 0;
                  const isEmailOpen  = emailStepId === step.id;

                  // VietQR URL
                  const qrAmount = parseFloat(advanceAmount) || 0;
                  const qrReady  = isAdvOpen && qrAmount > 0 && advanceBankId && advanceAccNumber;
                  const qrUrl    = qrReady
                    ? `https://img.vietqr.io/image/${advanceBankId}-${advanceAccNumber}-compact2.png` +
                      `?amount=${qrAmount}&addInfo=${encodeURIComponent(advancePurpose)}&accountName=${encodeURIComponent(advanceAccName)}`
                    : "";

                  return (
                    <div className="pt-1 space-y-2">
                      {/* Hàng nút */}
                      <div className="flex justify-end gap-2 flex-wrap">
                        {/* Tạm ứng */}
                        <button
                          onClick={() => isAdvOpen ? setAdvanceStepId(null) : openAdvancePanel(step)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition",
                            isAdvOpen
                              ? "bg-amber-500 text-white border-amber-500"
                              : "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20",
                          )}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Tạm ứng
                        </button>
                        {/* Thêm thu/chi */}
                        <button
                          onClick={() => isTxOpen ? setTxStepId(null) : openTxPanel(step)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition",
                            isTxOpen
                              ? "bg-green-600 text-white border-green-600"
                              : "text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 bg-white dark:bg-slate-800 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20",
                          )}
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Thêm thu/chi
                        </button>

                        {hasAssignees && (
                          <button
                            onClick={() => isEmailOpen ? setEmailStepId(null) : openEmailPanel(step)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition",
                              isEmailOpen
                                ? "bg-blue-600 text-white border-blue-600"
                                : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 hover:text-blue-600",
                            )}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Gửi mail
                          </button>
                        )}
                      </div>

                      {/* Form tạm ứng */}
                      {isAdvOpen && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5" />
                            Đề nghị tạm ứng — {step.name}
                          </p>

                          {/* Số tiền */}
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Số tiền (VNĐ) *</label>
                            <input
                              type="number" min={1} step={1}
                              value={advanceAmount}
                              onChange={(e) => setAdvanceAmount(e.target.value)}
                              placeholder="VD: 2000000"
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                            {advanceAmount && parseFloat(advanceAmount) > 0 && (
                              <p className="text-[10px] text-amber-600 mt-0.5">= {parseFloat(advanceAmount).toLocaleString("vi-VN")} đ</p>
                            )}
                          </div>

                          {/* Mục đích */}
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Nội dung chuyển khoản *</label>
                            <input
                              value={advancePurpose}
                              onChange={(e) => setAdvancePurpose(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                          </div>

                          {/* Tài khoản ngân hàng */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block">Tài khoản nhận tiền *</label>

                            {/* Ngân hàng */}
                            <select
                              value={advanceBankId}
                              onChange={(e) => {
                                const opt = e.target.options[e.target.selectedIndex];
                                const newBankName = opt.value ? opt.text : "";
                                setAdvanceBankId(e.target.value);
                                setAdvanceBankName(newBankName);
                                setAdvancePurpose(buildPurpose(step.name, advanceAccNumber, newBankName));
                              }}
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                              <option value="">-- Chọn ngân hàng --</option>
                              {VIETNAM_BANKS.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={advanceAccNumber}
                                onChange={(e) => {
                                  setAdvanceAccNumber(e.target.value);
                                  setAdvancePurpose(buildPurpose(step.name, e.target.value, advanceBankName));
                                }}
                                placeholder="Số tài khoản *"
                                className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                              />
                              <input
                                value={advanceAccName}
                                onChange={(e) => setAdvanceAccName(e.target.value)}
                                placeholder="Tên chủ TK *"
                                className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </div>
                          </div>

                          {/* QR Code — hiện tự động khi đủ thông tin */}
                          {qrReady && (
                            <div className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
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
                                {advanceBankName} · {advanceAccNumber}<br/>
                                {advanceAccName}<br/>
                                <span className="font-semibold text-amber-600">{parseFloat(advanceAmount).toLocaleString("vi-VN")} đ</span>
                              </p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setAdvanceStepId(null)}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 transition">
                              Hủy
                            </button>
                            <button
                              onClick={() => handleAdvanceRequest(step)}
                              disabled={advanceSaving}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs rounded-xl transition"
                            >
                              {advanceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Gửi đơn
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Form thêm thu/chi */}
                      {isTxOpen && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl space-y-3">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5" />
                            Thêm thu/chi — {step.name}
                          </p>

                          {/* Nguồn tiền */}
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Nguồn tiền *</label>
                            <select
                              value={txFundSource}
                              onChange={(e) => setTxFundSource(e.target.value as "ADVANCE" | "OUT_OF_POCKET" | "REVENUE")}
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                            >
                              <option value="OUT_OF_POCKET">Tự ứng tiền túi</option>
                              <option value="ADVANCE">Từ tạm ứng</option>
                              <option value="REVENUE">Thu về</option>
                            </select>
                          </div>

                          {/* Chọn đơn tạm ứng nếu chọn ADVANCE */}
                          {txFundSource === "ADVANCE" && (
                            <div>
                              <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Đơn tạm ứng</label>
                              <select
                                value={txAdvanceId}
                                onChange={(e) => setTxAdvanceId(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                              >
                                <option value="">-- Chọn đơn tạm ứng --</option>
                                {taskAdvances.filter((a) => a.stepId === step.id && a.status === "APPROVED").map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.amount.toLocaleString("vi-VN")}đ — {a.purpose}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Số tiền */}
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Số tiền (VNĐ) *</label>
                            <input
                              type="number" min={1} step={1}
                              value={txAmount}
                              onChange={(e) => setTxAmount(e.target.value)}
                              placeholder="VD: 500000"
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            {txAmount && parseFloat(txAmount) > 0 && (
                              <p className="text-[10px] text-green-600 mt-0.5">= {parseFloat(txAmount).toLocaleString("vi-VN")} đ</p>
                            )}
                          </div>

                          {/* Danh mục (ẩn nếu REVENUE) */}
                          {txFundSource !== "REVENUE" && (
                            <div>
                              <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Danh mục chi *</label>
                              <select
                                value={txCategory}
                                onChange={(e) => setTxCategory(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                              >
                                {EXPENSE_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Mô tả */}
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Mô tả *</label>
                            <textarea
                              value={txDesc}
                              onChange={(e) => setTxDesc(e.target.value)}
                              rows={2}
                              placeholder="Mô tả giao dịch..."
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                            />
                          </div>

                          {/* Chứng từ */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block">
                              Chứng từ{txFundSource !== "REVENUE" ? " * (≥1)" : ""}
                            </label>

                            {/* URL input */}
                            <div className="flex gap-1.5">
                              <input
                                value={txProofUrl}
                                onChange={(e) => setTxProofUrl(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTxProofLink(); } }}
                                placeholder="Dán link chứng từ..."
                                className="flex-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                              <button
                                onClick={addTxProofLink}
                                disabled={!txProofUrl.trim()}
                                className="px-2.5 py-1.5 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-xl hover:bg-green-200 dark:hover:bg-green-900/60 disabled:opacity-40 transition flex items-center gap-1"
                              >
                                <Link2 className="w-3 h-3" /> Thêm link
                              </button>
                            </div>

                            {/* File + Camera buttons */}
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => txFileRef.current?.click()}
                                disabled={txUploading}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white hover:border-green-400 hover:text-green-600 transition disabled:opacity-50"
                              >
                                <Paperclip className="w-3 h-3" />
                                {txUploading ? "Đang tải..." : "Tải file / PDF"}
                              </button>
                              <button
                                onClick={() => txCameraRef.current?.click()}
                                disabled={txUploading}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white hover:border-green-400 hover:text-green-600 transition disabled:opacity-50"
                              >
                                <Camera className="w-3 h-3" />
                                Camera
                              </button>
                            </div>

                            {/* Hidden inputs */}
                            <input ref={txFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleTxFileUpload} />
                            <input ref={txCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleTxFileUpload} />

                            {/* Proof list */}
                            {txProofs.length > 0 && (
                              <ul className="space-y-1">
                                {txProofs.map((p, i) => (
                                  <li key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                    <Link2 className="w-3 h-3 shrink-0 text-green-500" />
                                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline text-green-600 dark:text-green-400">{p.name || p.url}</a>
                                    <button onClick={() => setTxProofs(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 transition">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setTxStepId(null)}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 transition">
                              Hủy
                            </button>
                            <button
                              onClick={() => handleTxSubmit(step)}
                              disabled={txSaving || txUploading}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-xl transition"
                            >
                              {txSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Ghi giao dịch
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Email compose panel */}
                      {hasAssignees && isEmailOpen && (
                        <EmailComposePanel
                          step={step}
                          users={users}
                          emailToIds={emailToIds}
                          setEmailToIds={setEmailToIds}
                          subject={emailSubject}
                          setSubject={setEmailSubject}
                          body={emailBody}
                          setBody={setEmailBody}
                          sending={emailSending}
                          onSend={() => handleSendEmail(step)}
                          onClose={() => setEmailStepId(null)}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────

// Đầu vào / Đầu ra / Đánh giá 3T — tự động suy ra từ chuỗi quy trình (DAG).
function StepFlowBanner({ step, allSteps }: { step: TaskStep; allSteps: TaskStep[] }) {
  const input = computeInputState(step, allSteps);
  const output = computeOutputState(step);
  const eval3T = computeStepEval3T(step);

  const hasDeps = (step.dependsOn?.length ?? 0) > 0;
  const evalCls: Record<string, string> = {
    tot: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    trung_binh: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    te: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {/* Đầu vào */}
      <div className={cn(
        "rounded-xl p-2.5 border text-xs",
        !hasDeps
          ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          : input.ready
          ? "border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-900/10"
          : "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10",
      )}>
        <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5">Đầu vào</p>
        {!hasDeps ? (
          <p className="text-slate-500 dark:text-slate-400">Không phụ thuộc — sẵn sàng</p>
        ) : input.ready ? (
          <p className="text-green-700 dark:text-green-400 font-medium">
            Sẵn sàng ({input.doneCount}/{input.totalCount} bước trước xong)
          </p>
        ) : (
          <p className="text-amber-700 dark:text-amber-400 font-medium">
            Chờ: {input.pendingNames.join(", ")}
          </p>
        )}
      </div>

      {/* Đầu ra */}
      <div className={cn(
        "rounded-xl p-2.5 border text-xs",
        output.delivered
          ? "border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-900/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
      )}>
        <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5">Đầu ra</p>
        <p className={cn("font-medium", output.delivered ? "text-green-700 dark:text-green-400" : "text-slate-600 dark:text-slate-300")}>
          {output.text}
        </p>
      </div>

      {/* Đánh giá 3T tự động */}
      <div className="rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
        <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5">Đánh giá 3T (auto)</p>
        {eval3T ? (
          <span className={cn("inline-block px-2 py-0.5 rounded-full font-semibold", evalCls[eval3T])}>
            {STEP_EVAL_LABEL[eval3T]}
          </span>
        ) : (
          <p className="text-slate-400">Đang thực hiện — chưa kết luận</p>
        )}
      </div>
    </div>
  );
}

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

// ── Email Compose Panel ───────────────────────────────────────

function EmailComposePanel({
  step, users, emailToIds, setEmailToIds,
  subject, setSubject, body, setBody,
  sending, onSend, onClose,
}: {
  step: TaskStep;
  users: User[];
  emailToIds: Set<string>;
  setEmailToIds: (s: Set<string>) => void;
  subject: string;
  setSubject: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  sending: boolean;
  onSend: () => void;
  onClose: () => void;
}) {
  // Collect all potential recipients: step assignee + sub-task assignees
  const candidateIds = new Set<string>();
  if (step.assigneeId) candidateIds.add(step.assigneeId);
  (step.subTasks ?? []).forEach((st) => candidateIds.add(st.userId));

  const candidates = Array.from(candidateIds)
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u);

  function toggleRecipient(id: string) {
    const next = new Set(emailToIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setEmailToIds(next);
  }

  return (
    <div className="mt-3 p-3 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
          <Mail className="w-3.5 h-3.5" />
          Soạn email cho bước này
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Recipients */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Gửi đến</p>
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((u) => {
            const selected = emailToIds.has(u.id);
            const hasEmail = !!u.email;
            return (
              <button
                key={u.id}
                onClick={() => hasEmail && toggleRecipient(u.id)}
                disabled={!hasEmail}
                title={hasEmail ? u.email : "Người dùng chưa có email"}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition",
                  !hasEmail
                    ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600"
                    : selected
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-400",
                )}
              >
                <span className={cn(
                  "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 text-[9px] font-bold",
                  selected ? "bg-white/30 border-white/60 text-white" : "border-slate-300 dark:border-slate-500",
                )}>
                  {selected && "✓"}
                </span>
                {u.name}
                {u.id === step.assigneeId && (
                  <span className="text-[9px] opacity-70">(chính)</span>
                )}
              </button>
            );
          })}
        </div>
        {candidates.every((u) => !u.email) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Không có người nhận nào có email trong hệ thống.</p>
        )}
      </div>

      {/* Subject */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Tiêu đề</p>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Tiêu đề email..."
          className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Body */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Nội dung</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Viết nội dung email..."
          className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400">
          Gửi đến {emailToIds.size} người · Tên bạn sẽ hiện trong email
        </p>
        <button
          onClick={onSend}
          disabled={sending || emailToIds.size === 0 || !subject.trim() || !body.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-xl transition"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Gửi
        </button>
      </div>
    </div>
  );
}
