"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, AlertCircle, User, Calendar, Flag,
  CheckSquare, MessageSquare, Users, Mail, Activity, BarChart3,
  CheckCheck, Loader2, Star, Send, ClipboardCheck, Pencil, Trash2, X as XIcon, Save,
  Paperclip, Link2, FolderOpen, FileText, Download, Plus, DollarSign, ShieldAlert,
} from "lucide-react";
import { cn, formatDate, formatDateTime, formatRelativeTime, statusLabel, priorityLabel, getInitials, avatarColor, isTaskVisible } from "@/lib/utils";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { subscribeTask, updateTask, deleteTask, getEmailLogs, getAuditTrail, addAuditEvent, addNotification, getEvaluations, saveEvaluation } from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import { hasPermission } from "@/lib/rbac/permissions";
import { StepsTab } from "@/components/tasks/StepsTab";
import { TaskChat } from "@/components/tasks/TaskChat";
import { FinancialWidget } from "@/components/tasks/FinancialWidget";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { Task, User as UserType, EmailLog, AuditEvent, Evaluation, CompletionProposal, TaskResource, ChangeRequest } from "@/types";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";

type TabId = "steps" | "stakeholders" | "chat" | "email" | "audit" | "evaluation" | "resources" | "finance";

// ─── ResourcesTab ────────────────────────────────────────────
interface ResourcesTabProps {
  task: Task;
  currentUser: UserType;
  isMainPerformer: boolean;
  onSave: (updates: Partial<Task>) => Promise<void>;
}

function ResourcesTab({ task, currentUser, isMainPerformer, onSave }: ResourcesTabProps) {
  const [resources, setResources] = useState<TaskResource[]>(task.resources ?? []);
  const [addMode, setAddMode] = useState<"link" | null>(null);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function formatSize(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, "task-resources");
      const resource: TaskResource = {
        id: generateId("res"),
        type: "file",
        name: file.name,
        url,
        mimeType: file.type,
        size: file.size,
        addedBy: currentUser.id,
        addedByName: currentUser.name,
        addedAt: new Date().toISOString(),
      };
      const updated = [...resources, resource];
      setResources(updated);
      await onSave({ resources: updated });
      toast.success("Đã đính kèm tài liệu.");
    } catch {
      toast.error("Tải lên thất bại.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleAddLink() {
    if (!linkName.trim() || !linkUrl.trim()) { toast.error("Nhập tên và URL."); return; }
    const resource: TaskResource = {
      id: generateId("res"),
      type: "link",
      name: linkName.trim(),
      url: linkUrl.trim(),
      addedBy: currentUser.id,
      addedByName: currentUser.name,
      addedAt: new Date().toISOString(),
    };
    const updated = [...resources, resource];
    setResources(updated);
    await onSave({ resources: updated });
    toast.success("Đã thêm đường dẫn.");
    setLinkName("");
    setLinkUrl("");
    setAddMode(null);
  }

  async function handleRemove(resId: string) {
    const updated = resources.filter((r) => r.id !== resId);
    setResources(updated);
    await onSave({ resources: updated });
    toast.success("Đã xoá tài liệu.");
  }

  return (
    <div className="space-y-4">
      {isMainPerformer && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition"
          >
            <Paperclip className="w-4 h-4" />
            {uploading ? "Đang tải..." : "Đính kèm file"}
          </button>
          <button
            onClick={() => setAddMode(addMode === "link" ? null : "link")}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm rounded-lg transition"
          >
            <Link2 className="w-4 h-4" /> Thêm đường dẫn
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
        </div>
      )}

      {addMode === "link" && isMainPerformer && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Thêm đường dẫn</p>
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Tên đường dẫn"
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:text-white"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:text-white"
          />
          <div className="flex gap-2">
            <button onClick={handleAddLink} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition">
              Thêm
            </button>
            <button onClick={() => setAddMode(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {resources.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chưa có tài liệu nào được đính kèm.</p>
          {isMainPerformer && (
            <p className="text-slate-400 text-xs mt-1">Bấm "Đính kèm file" hoặc "Thêm đường dẫn" để bắt đầu.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map((res) => (
            <div key={res.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0">
                {res.type === "link"
                  ? <Link2 className="w-4 h-4 text-blue-500" />
                  : <FileText className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{res.name}</p>
                <p className="text-xs text-slate-400">
                  {res.addedByName} · {formatDate(res.addedAt)}
                  {res.size ? ` · ${formatSize(res.size)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition"
                  title={res.type === "link" ? "Mở đường dẫn" : "Tải xuống"}
                >
                  {res.type === "link"
                    ? <Link2 className="w-4 h-4 text-blue-500" />
                    : <Download className="w-4 h-4 text-slate-500" />}
                </a>
                {isMainPerformer && (
                  <button
                    onClick={() => handleRemove(res.id)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition"
                    title="Xoá"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { users } = useTaskStore();
  const { currentUser } = useAuthStore();

  const [task, setTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("steps");
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evalRatings, setEvalRatings] = useState<Record<string, number>>({});
  const [evalComments, setEvalComments] = useState<Record<string, string>>({});
  const [submittingEval, setSubmittingEval] = useState(false);

  // Completion proposal state
  const [proposalSummary, setProposalSummary] = useState("");
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [closureRating, setClosureRating] = useState(0);
  const [closureComment, setClosureComment] = useState("");
  const [submittingClosure, setSubmittingClosure] = useState(false);

  // Edit / delete state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", priority: "", deadlineBase: "", department: "", mainPerformerId: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  // Change request modal state
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [pendingEdits, setPendingEdits] = useState<Partial<Task> | null>(null);
  const [pendingChangedFields, setPendingChangedFields] = useState<ChangeRequest["changedFields"]>();
  const [approvingChange, setApprovingChange] = useState(false);

  // Issue escalation modal state
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  const [submittingIssue, setSubmittingIssue] = useState(false);

  const refreshEmailLogs = useCallback(() => {
    getEmailLogs(id).then(setEmailLogs).catch(console.error);
  }, [id]);

  // Realtime task subscription
  useEffect(() => {
    const unsub = subscribeTask(id, (t) => {
      setTask(t);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  // Access guard — redirect if user is not a participant
  useEffect(() => {
    if (!task || !currentUser) return;
    if (!isTaskVisible(task, currentUser.id, currentUser.role)) {
      toast.error("Bạn không có quyền xem nhiệm vụ này.");
      router.push("/tasks");
    }
  }, [task, currentUser, router]);

  // Load tab data on switch
  useEffect(() => {
    if (!task) return;
    if (activeTab === "email") {
      getEmailLogs(id).then(setEmailLogs).catch(console.error);
    } else if (activeTab === "audit") {
      getAuditTrail(id).then(setAuditEvents).catch(console.error);
    } else if (activeTab === "evaluation" && currentUser) {
      getEvaluations(currentUser.id).then(setEvaluations).catch(console.error);
    }
  }, [activeTab, id, task, currentUser]);

  function startEdit() {
    if (!task) return;
    setEditForm({
      name: task.name,
      description: task.description ?? "",
      priority: task.priority,
      deadlineBase: task.deadlineBase ? task.deadlineBase.slice(0, 10) : "",
      department: task.department ?? "",
      mainPerformerId: task.mainPerformerId ?? "",
    });
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!task || !currentUser || !editForm.name.trim()) { toast.error("Tên nhiệm vụ không được để trống."); return; }

    const updates: Partial<Task> = {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      priority: editForm.priority as Task["priority"],
      deadlineBase: editForm.deadlineBase || undefined,
      department: editForm.department.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    if (editForm.mainPerformerId && editForm.mainPerformerId !== task.mainPerformerId) {
      updates.mainPerformerId = editForm.mainPerformerId;
    }

    // Detect sensitive changes that require manager re-approval
    const changedFields: ChangeRequest["changedFields"] = {};
    if (editForm.deadlineBase !== (task.deadlineBase?.slice(0, 10) ?? "")) {
      changedFields.deadlineBase = { before: task.deadlineBase ?? "", after: editForm.deadlineBase };
    }
    if (editForm.mainPerformerId && editForm.mainPerformerId !== task.mainPerformerId) {
      changedFields.mainPerformerId = { before: task.mainPerformerId ?? "", after: editForm.mainPerformerId };
    }

    if (Object.keys(changedFields).length > 0 && task.approved) {
      setPendingEdits(updates);
      setPendingChangedFields(changedFields);
      setChangeReason("");
      setShowChangeModal(true);
      return;
    }

    setSavingEdit(true);
    try {
      await updateTask(id, updates);
      await addAuditEvent(id, {
        taskId: id, action: "edited",
        userId: currentUser.id, userName: currentUser.name,
        before: { name: task.name }, after: { name: updates.name },
        timestamp: new Date().toISOString(),
      });
      toast.success("Đã cập nhật nhiệm vụ.");
      setIsEditing(false);
    } catch { toast.error("Cập nhật thất bại."); }
    finally { setSavingEdit(false); }
  }

  async function handleConfirmChangeRequest() {
    if (!task || !currentUser || !pendingEdits || !changeReason.trim()) {
      toast.error("Vui lòng nhập lý do thay đổi.");
      return;
    }
    setSavingEdit(true);
    try {
      const crType: ChangeRequest["type"] =
        pendingChangedFields?.deadlineBase && pendingChangedFields?.mainPerformerId
          ? "deadline_change"
          : pendingChangedFields?.deadlineBase
          ? "deadline_change"
          : "performer_change";
      const changeReq: ChangeRequest = {
        type: crType,
        reason: changeReason.trim(),
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        requestedAt: new Date().toISOString(),
        previousStatus: task.status,
        status: "pending",
        changedFields: pendingChangedFields,
      };
      await updateTask(id, { ...pendingEdits, status: "review", pendingChangeRequest: changeReq });
      const managers = users.filter((u) => ["teamLead", "director", "hrAdmin"].includes(u.role) && u.id !== currentUser.id);
      await Promise.all(managers.map((u) =>
        addNotification({
          userId: u.id, type: "approval_request",
          title: "Yêu cầu thay đổi cần phê duyệt",
          body: `${currentUser.name} yêu cầu thay đổi "${task.name}": ${changeReason.trim()}`,
          link: `/tasks/${id}`, read: false, priority: "urgent",
          createdAt: new Date().toISOString(), actionRequired: true,
        })
      ));
      await addAuditEvent(id, {
        taskId: id, action: "change_requested",
        userId: currentUser.id, userName: currentUser.name,
        note: changeReason.trim(), timestamp: new Date().toISOString(),
      });
      toast.success("Đã gửi yêu cầu thay đổi, chờ quản lý phê duyệt.");
      setShowChangeModal(false);
      setIsEditing(false);
      setPendingEdits(null);
      setPendingChangedFields(undefined);
      setChangeReason("");
    } catch { toast.error("Gửi yêu cầu thất bại."); }
    finally { setSavingEdit(false); }
  }

  async function handleApproveChangeRequest(approved: boolean, comment?: string) {
    if (!currentUser || !task?.pendingChangeRequest) return;
    setApprovingChange(true);
    const cr = task.pendingChangeRequest;
    try {
      const updates: Partial<Task> = { status: cr.previousStatus, pendingChangeRequest: null };
      if (!approved && cr.changedFields) {
        if (cr.changedFields.deadlineBase) updates.deadlineBase = cr.changedFields.deadlineBase.before;
        if (cr.changedFields.mainPerformerId) updates.mainPerformerId = cr.changedFields.mainPerformerId.before;
      }
      await updateTask(id, updates);
      if (cr.requestedBy !== currentUser.id) {
        await addNotification({
          userId: cr.requestedBy,
          type: "approval_request",
          title: approved ? "Thay đổi được phê duyệt" : "Thay đổi bị từ chối",
          body: approved
            ? `Yêu cầu thay đổi nhiệm vụ "${task.name}" đã được phê duyệt.`
            : `Yêu cầu thay đổi nhiệm vụ "${task.name}" bị từ chối${comment ? `: ${comment}` : ""}.`,
          link: `/tasks/${id}`, read: false, priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
      await addAuditEvent(id, {
        taskId: id, action: approved ? "change_approved" : "change_rejected",
        userId: currentUser.id, userName: currentUser.name,
        note: comment, timestamp: new Date().toISOString(),
      });
      toast.success(approved ? "Đã phê duyệt thay đổi." : "Đã từ chối và hoàn tác thay đổi.");
    } catch { toast.error("Thao tác thất bại."); }
    finally { setApprovingChange(false); }
  }

  async function handleRaiseIssue() {
    if (!task || !currentUser || !issueDescription.trim()) {
      toast.error("Vui lòng mô tả vấn đề phát sinh.");
      return;
    }
    setSubmittingIssue(true);
    try {
      const changeReq: ChangeRequest = {
        type: "issue_raised",
        reason: issueDescription.trim(),
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        requestedAt: new Date().toISOString(),
        previousStatus: task.status,
        status: "pending",
      };
      await updateTask(id, { status: "review", pendingChangeRequest: changeReq });
      const managers = users.filter((u) => ["teamLead", "director", "hrAdmin"].includes(u.role) && u.id !== currentUser.id);
      await Promise.all(managers.map((u) =>
        addNotification({
          userId: u.id, type: "approval_request",
          title: "Vấn đề phát sinh cần xem xét",
          body: `${currentUser.name} báo cáo vấn đề trong "${task.name}": ${issueDescription.trim()}`,
          link: `/tasks/${id}`, read: false, priority: "urgent",
          createdAt: new Date().toISOString(), actionRequired: true,
        })
      ));
      await addAuditEvent(id, {
        taskId: id, action: "issue_raised",
        userId: currentUser.id, userName: currentUser.name,
        note: issueDescription.trim(), timestamp: new Date().toISOString(),
      });
      toast.success("Đã báo cáo vấn đề, chờ quản lý xem xét.");
      setShowIssueModal(false);
      setIssueDescription("");
    } catch { toast.error("Gửi báo cáo thất bại."); }
    finally { setSubmittingIssue(false); }
  }

  async function handleDeleteTask() {
    if (!task || !currentUser) return;
    if (!confirm(`Xoá nhiệm vụ "${task.name}"? Hành động này không thể hoàn tác.`)) return;
    setDeletingTask(true);
    try {
      await deleteTask(id);
      toast.success("Đã xoá nhiệm vụ.");
      router.push("/tasks");
    } catch { toast.error("Xoá thất bại."); setDeletingTask(false); }
  }

  async function handleApprove() {
    if (!currentUser || !task) return;
    try {
      await updateTask(id, { approved: true, approvedBy: currentUser.id, approvedAt: new Date().toISOString() });
      await addAuditEvent(id, {
        taskId: id, action: "approved",
        userId: currentUser.id, userName: currentUser.name,
        before: { approved: false }, after: { approved: true },
        timestamp: new Date().toISOString(),
      });
      toast.success("Đã phê duyệt nhiệm vụ.");
    } catch { toast.error("Phê duyệt thất bại."); }
  }

  async function handleChangeStatus(status: Task["status"]) {
    if (!currentUser || !task) return;
    if (!canChangeStatus) {
      toast.error("Chỉ người thực hiện chính mới có thể thay đổi trạng thái.");
      return;
    }
    const old = task.status;
    try {
      await updateTask(id, { status, updatedAt: new Date().toISOString() });
      await addAuditEvent(id, {
        taskId: id, action: "status_changed",
        userId: currentUser.id, userName: currentUser.name,
        before: { status: old }, after: { status },
        timestamp: new Date().toISOString(),
      });

      // Notify approvers + all managers when task moves to review
      if (status === "review") {
        const approvers = (task.stakeholders ?? []).filter((s) => s.role === "approver").map((s) => s.userId);
        const managers = users.filter((u) => ["teamLead", "director", "hrAdmin"].includes(u.role) && u.isActive).map((u) => u.id);
        const notifTargets = Array.from(new Set([...approvers, ...managers])).filter((uid) => uid !== currentUser.id);
        await Promise.all(notifTargets.map((uid) =>
          addNotification({
            userId: uid,
            type: "approval_request",
            title: "Nhiệm vụ cần phê duyệt",
            body: `"${task.name}" đã được gửi lên chờ phê duyệt bởi ${currentUser.name}.`,
            link: `/tasks/${id}`,
            read: false,
            priority: "urgent",
            createdAt: new Date().toISOString(),
          })
        ));
      }

      // Notify creator + performer when task is done
      if (status === "done") {
        const targets = Array.from(new Set([task.creatorId, task.mainPerformerId].filter(Boolean) as string[]));
        await Promise.all(targets.map((uid) =>
          addNotification({
            userId: uid,
            type: "task_completed",
            title: "Nhiệm vụ hoàn thành",
            body: `"${task.name}" đã được đánh dấu hoàn thành.`,
            link: `/tasks/${id}`,
            read: false,
            priority: "normal",
            createdAt: new Date().toISOString(),
          })
        ));
      }

      toast.success(`Trạng thái chuyển sang: ${statusLabel(status)}`);
    } catch { toast.error("Cập nhật trạng thái thất bại."); }
  }

  async function onSaveTask(updates: Partial<Task>) {
    if (updates.steps) {
      const avg = updates.steps.length
        ? Math.round(updates.steps.reduce((s, step) => s + step.progress, 0) / updates.steps.length)
        : 0;
      updates.progress = avg;
    }
    await updateTask(id, { ...updates, updatedAt: new Date().toISOString() });
  }

  async function handleSubmitEval(targetUserId: string) {
    if (!currentUser || !task) return;
    const rating = evalRatings[targetUserId];
    if (!rating) { toast.error("Chọn số sao đánh giá"); return; }
    setSubmittingEval(true);
    try {
      const ev: Evaluation = {
        id: generateId("eval"),
        taskId: id,
        evaluatedUserId: targetUserId,
        evaluatorId: currentUser.id,
        type: hasPermission(currentUser.role, "task:approve") ? "manager" : "peer",
        isAnonymous: false,
        scores: { overall: rating },
        comment: evalComments[targetUserId] ?? "",
        period: new Date().toISOString().slice(0, 7),
        overallScore: rating * 20,
        createdAt: new Date().toISOString(),
      };
      await saveEvaluation(ev);
      setEvaluations((prev) => [...prev, ev]);
      toast.success("Đã gửi đánh giá");
    } catch { toast.error("Gửi đánh giá thất bại"); }
    finally { setSubmittingEval(false); }
  }



  async function handleSubmitProposal() {
    if (!currentUser || !task || !proposalSummary.trim()) return;
    setSubmittingProposal(true);
    try {
      const proposal: CompletionProposal = {
        submittedBy: currentUser.id,
        submittedAt: new Date().toISOString(),
        summary: proposalSummary.trim(),
        status: "pending",
      };
      await updateTask(id, { completionProposal: proposal });
      const managers = users.filter(
        (u) => ["teamLead", "director", "hrAdmin"].includes(u.role) && u.isActive && u.id !== currentUser.id
      );
      await Promise.all(managers.map((u) =>
        addNotification({
          userId: u.id,
          type: "completion_proposal",
          title: "Đề xuất kết thúc nhiệm vụ",
          body: `${currentUser.name} đề xuất kết thúc "${task.name}".`,
          link: `/tasks/${id}`,
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        })
      ));
      await addAuditEvent(id, {
        taskId: id, action: "completion_proposed",
        userId: currentUser.id, userName: currentUser.name,
        timestamp: new Date().toISOString(),
      });
      setProposalSummary("");
      toast.success("Đã gửi đề xuất kết thúc. Cấp trên sẽ xem xét và phê duyệt.");
    } catch { toast.error("Gửi đề xuất thất bại."); }
    finally { setSubmittingProposal(false); }
  }

  async function handleReviewProposal(approved: boolean) {
    if (!currentUser || !task || !task.completionProposal) return;
    if (approved && closureRating === 0) { toast.error("Vui lòng chọn số sao đánh giá."); return; }
    setSubmittingClosure(true);
    try {
      const updated: CompletionProposal = {
        ...task.completionProposal,
        status: approved ? "approved" : "rejected",
        reviewedBy: currentUser.id,
        reviewedAt: new Date().toISOString(),
        ...(approved && closureRating > 0 && { reviewRating: closureRating }),
        ...(closureComment.trim() && { reviewComment: closureComment.trim() }),
      };
      await updateTask(id, { completionProposal: updated });
      if (task.mainPerformerId && task.mainPerformerId !== currentUser.id) {
        await addNotification({
          userId: task.mainPerformerId,
          type: "completion_reviewed",
          title: approved ? "Đề xuất kết thúc được phê duyệt" : "Đề xuất kết thúc bị từ chối",
          body: `${currentUser.name} đã ${approved ? "phê duyệt" : "từ chối"} đề xuất kết thúc "${task.name}".`,
          link: `/tasks/${id}`,
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
      await addAuditEvent(id, {
        taskId: id, action: approved ? "completion_approved" : "completion_rejected",
        userId: currentUser.id, userName: currentUser.name,
        timestamp: new Date().toISOString(),
      });
      setClosureComment("");
      setClosureRating(0);
      toast.success(approved ? "Đã phê duyệt kết thúc nhiệm vụ." : "Đã từ chối đề xuất.");
    } catch { toast.error("Thao tác thất bại."); }
    finally { setSubmittingClosure(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Không tìm thấy nhiệm vụ.</p>
        <button onClick={() => router.back()} className="text-blue-600 hover:underline text-sm">← Quay lại</button>
      </div>
    );
  }

  const performer = users.find((u) => u.id === task.mainPerformerId);
  const canApprove = !!(currentUser && hasPermission(currentUser.role, "task:approve"));
  const isMainPerformer = currentUser?.id === task.mainPerformerId;
  const canAssignSteps = task.approved && (isMainPerformer || canApprove);
  // Only mainPerformer (or director/hrAdmin override) can change status
  const canChangeStatus = !!(currentUser && (
    ["director", "hrAdmin"].includes(currentUser.role) ||
    (task.approved && isMainPerformer)
  ));
  const canEdit = !!(currentUser && (
    canApprove ||
    isMainPerformer ||
    (task.stakeholders ?? []).some((s) => s.userId === currentUser.id)
  ));
  const canDelete = !!(currentUser && hasPermission(currentUser.role, "task:delete"));

  const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "steps", label: "Quy trình", Icon: CheckSquare },
    { id: "stakeholders", label: "Người liên quan", Icon: Users },
    { id: "resources", label: "Tài liệu", Icon: FolderOpen },
    { id: "chat", label: "Tin nhắn", Icon: MessageSquare },
    { id: "email", label: "Email Log", Icon: Mail },
    { id: "audit", label: "Lịch sử", Icon: Activity },
    ...(task.status === "done" ? [{ id: "evaluation" as TabId, label: "Đánh giá", Icon: Star }] : []),
    ...(currentUser && hasPermission(currentUser.role, "finance:read") ? [{ id: "finance" as TabId, label: "Tài chính", Icon: DollarSign }] : []),
  ];

  // All people who worked on this task (for peer evaluation)
  const taskWorkers = Array.from(new Set([
    task.mainPerformerId,
    ...(task.steps ?? []).flatMap((s) => [s.assigneeId, ...(s.subTasks ?? []).map((st) => st.userId)]),
    ...(task.stakeholders ?? []).filter((s) => s.role === "assignee").map((s) => s.userId),
  ].filter(Boolean) as string[])).filter((uid) => uid !== currentUser?.id);

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
      </button>

      {/* Task header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {task.riskFlag && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded-full border border-red-100">
                  <AlertTriangle className="w-3.5 h-3.5" /> Rủi ro
                </span>
              )}
              {!task.approved && (
                <span className="px-2.5 py-1 bg-yellow-50 text-yellow-700 text-xs font-semibold rounded-full border border-yellow-200">
                  Chờ phê duyệt
                </span>
              )}
              <span className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold",
                task.status === "done" ? "bg-green-100 text-green-700"
                  : task.status === "in_progress" ? "bg-blue-100 text-blue-700"
                  : task.status === "review" ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600"
              )}>
                {statusLabel(task.status)}
              </span>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold",
                task.priority === "urgent" ? "bg-red-100 text-red-600"
                  : task.priority === "high" ? "bg-orange-100 text-orange-600"
                  : task.priority === "medium" ? "bg-blue-50 text-blue-600"
                  : "bg-slate-100 text-slate-500"
              )}>
                {priorityLabel(task.priority)}
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-3 mt-1">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Tên nhiệm vụ *"
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Mô tả (tuỳ chọn)"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Độ ưu tiên</label>
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Thấp</option>
                      <option value="medium">Trung bình</option>
                      <option value="high">Cao</option>
                      <option value="urgent">Khẩn cấp</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                      Hạn hoàn thành
                      <ShieldAlert className="w-3 h-3 text-amber-500" title="Thay đổi cần phê duyệt" />
                    </label>
                    <input
                      type="date"
                      value={editForm.deadlineBase}
                      onChange={(e) => setEditForm((f) => ({ ...f, deadlineBase: e.target.value }))}
                      className={cn(
                        "w-full px-2 py-1.5 text-sm border rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500",
                        editForm.deadlineBase !== (task.deadlineBase?.slice(0, 10) ?? "")
                          ? "border-amber-400 ring-1 ring-amber-300"
                          : "border-[var(--border)]"
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Phòng ban</label>
                    <input
                      value={editForm.department}
                      onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                      placeholder="Phòng ban"
                      className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {/* Người thực hiện chính — sensitive field */}
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                    Người thực hiện chính
                    <ShieldAlert className="w-3 h-3 text-amber-500" title="Thay đổi cần phê duyệt" />
                  </label>
                  <select
                    value={editForm.mainPerformerId}
                    onChange={(e) => setEditForm((f) => ({ ...f, mainPerformerId: e.target.value }))}
                    className={cn(
                      "w-full px-2 py-1.5 text-sm border rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500",
                      editForm.mainPerformerId !== task.mainPerformerId
                        ? "border-amber-400 ring-1 ring-amber-300"
                        : "border-[var(--border)]"
                    )}
                  >
                    <option value="">— Chọn người thực hiện —</option>
                    {users.filter((u) => u.isActive !== false).map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.department ?? u.role})</option>
                    ))}
                  </select>
                </div>
                {/* Warning when sensitive fields changed */}
                {task.approved && (
                  (editForm.deadlineBase !== (task.deadlineBase?.slice(0, 10) ?? "") ||
                   editForm.mainPerformerId !== task.mainPerformerId) && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Thay đổi thời gian hoặc người thực hiện sẽ yêu cầu phê duyệt lại từ quản lý. Nhiệm vụ sẽ chuyển về trạng thái <strong>Chờ xét duyệt</strong>.</span>
                    </div>
                  )
                )}
                <div className="flex gap-2">
                  <button onClick={() => setIsEditing(false)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-[var(--border)] text-sm rounded-xl hover:bg-[var(--muted)] transition">
                    <XIcon className="w-3.5 h-3.5" /> Huỷ
                  </button>
                  <button onClick={handleSaveEdit} disabled={savingEdit}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm rounded-xl transition">
                    {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold text-slate-800 dark:text-white">{task.name}</h1>
                {task.description && (
                  <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm leading-relaxed">{task.description}</p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Initial approval */}
            {canApprove && !task.approved && !task.pendingChangeRequest && (
              <button
                onClick={handleApprove}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition"
              >
                <CheckCheck className="w-4 h-4" /> Phê duyệt
              </button>
            )}
            {/* Change request approval — visible to managers */}
            {canApprove && task.pendingChangeRequest?.status === "pending" && (
              <>
                <button
                  onClick={() => handleApproveChangeRequest(true)}
                  disabled={approvingChange}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
                >
                  {approvingChange ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  Duyệt thay đổi
                </button>
                <button
                  onClick={() => handleApproveChangeRequest(false)}
                  disabled={approvingChange}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 text-sm font-medium rounded-xl transition"
                >
                  <XIcon className="w-4 h-4" /> Từ chối
                </button>
              </>
            )}
            {/* Issue escalation — visible to mainPerformer when task is active */}
            {isMainPerformer && task.approved && !task.pendingChangeRequest && ["todo", "in_progress"].includes(task.status) && !isEditing && (
              <button
                onClick={() => setShowIssueModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-orange-200 text-orange-600 hover:bg-orange-50 text-sm font-medium rounded-xl transition"
                title="Báo cáo vấn đề phát sinh"
              >
                <AlertCircle className="w-4 h-4" /> Báo cáo vấn đề
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] text-sm font-medium rounded-xl transition"
                title="Chỉnh sửa nhiệm vụ"
              >
                <Pencil className="w-4 h-4" /> Sửa
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDeleteTask}
                disabled={deletingTask}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 text-sm font-medium rounded-xl transition"
                title="Xoá nhiệm vụ"
              >
                {deletingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xoá
              </button>
            )}
          </div>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><User className="w-3.5 h-3.5" /> Người thực hiện</div>
            {performer ? (
              <UserAvatar user={performer} size="sm" showName />
            ) : (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">—</p>
            )}
          </div>
          {[
            { label: "Hạn hoàn thành", value: task.deadlineBase ? formatDate(task.deadlineBase) : "—", icon: Calendar },
            { label: "Phòng ban", value: task.department ?? "—", icon: Flag },
            { label: "Tiến độ", value: `${task.progress}%`, icon: BarChart3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><Icon className="w-3.5 h-3.5" /> {label}</div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{value}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", task.progress >= 100 ? "bg-green-500" : task.riskFlag ? "bg-red-500" : "bg-blue-500")}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>

        {/* 3-phase deadlines */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            { phase: "Chuẩn bị", deadline: task.deadlinePrepare },
            { phase: "Thực hiện", deadline: task.deadlineExecute },
            { phase: "Hoàn thiện", deadline: task.deadlineFinalize },
          ].filter(p => p.deadline).map(({ phase, deadline }) => (
            <div key={phase} className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs">
              <span className="text-slate-400">{phase}: </span>
              <span className="font-semibold text-slate-600 dark:text-slate-300">{formatDate(deadline!)}</span>
            </div>
          ))}
        </div>

        {/* Pending change request banner */}
        {task.pendingChangeRequest?.status === "pending" && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {task.pendingChangeRequest.type === "deadline_change" && "Yêu cầu thay đổi thời hạn"}
                {task.pendingChangeRequest.type === "performer_change" && "Yêu cầu thay đổi người thực hiện"}
                {task.pendingChangeRequest.type === "issue_raised" && "Vấn đề phát sinh cần xem xét"}
                {" — chờ phê duyệt"}
              </p>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 ml-6">
              <span className="font-medium">{task.pendingChangeRequest.requestedByName}</span>: "{task.pendingChangeRequest.reason}"
            </p>
            {task.pendingChangeRequest.changedFields?.deadlineBase && (
              <p className="text-xs text-slate-600 dark:text-slate-400 ml-6">
                Hạn: <span className="line-through text-red-500">{formatDate(task.pendingChangeRequest.changedFields.deadlineBase.before)}</span>
                {" → "}<span className="text-green-600 font-medium">{formatDate(task.pendingChangeRequest.changedFields.deadlineBase.after)}</span>
              </p>
            )}
            {task.pendingChangeRequest.changedFields?.mainPerformerId && (
              <p className="text-xs text-slate-600 dark:text-slate-400 ml-6">
                Người thực hiện: <span className="line-through text-red-500">{users.find(u => u.id === task.pendingChangeRequest?.changedFields?.mainPerformerId?.before)?.name ?? "—"}</span>
                {" → "}<span className="text-green-600 font-medium">{users.find(u => u.id === task.pendingChangeRequest?.changedFields?.mainPerformerId?.after)?.name ?? "—"}</span>
              </p>
            )}
            <p className="text-[10px] text-amber-500 ml-6">{formatRelativeTime(task.pendingChangeRequest.requestedAt)}</p>
          </div>
        )}

        {/* Completion proposal — main performer submits when task is done */}
        {task.status === "done" && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            {!task.completionProposal ? (
              isMainPerformer && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-green-600" />
                    Đề xuất kết thúc nhiệm vụ
                  </p>
                  <textarea
                    value={proposalSummary}
                    onChange={(e) => setProposalSummary(e.target.value)}
                    placeholder="Tóm tắt kết quả đạt được, những việc đã hoàn thành và bài học kinh nghiệm..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                  <button
                    onClick={handleSubmitProposal}
                    disabled={submittingProposal || !proposalSummary.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition"
                  >
                    {submittingProposal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Gửi đề xuất kết thúc
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardCheck className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Đề xuất kết thúc nhiệm vụ</p>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    task.completionProposal.status === "approved" ? "bg-green-100 text-green-700"
                      : task.completionProposal.status === "rejected" ? "bg-red-100 text-red-600"
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {task.completionProposal.status === "approved" ? "Đã phê duyệt"
                      : task.completionProposal.status === "rejected" ? "Bị từ chối"
                      : "Chờ phê duyệt"}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Tóm tắt từ người thực hiện</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{task.completionProposal.summary}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(task.completionProposal.submittedAt)}</p>
                </div>

                {task.completionProposal.status !== "pending" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {task.completionProposal.status === "approved" ? "Nhận xét phê duyệt" : "Lý do từ chối"}
                    </p>
                    {task.completionProposal.reviewRating && (
                      <span className="text-amber-500">{"★".repeat(task.completionProposal.reviewRating)}{"☆".repeat(5 - task.completionProposal.reviewRating)}</span>
                    )}
                    {task.completionProposal.reviewComment && (
                      <p className="text-sm text-slate-700 dark:text-slate-200">{task.completionProposal.reviewComment}</p>
                    )}
                    {task.completionProposal.reviewedBy && (
                      <p className="text-[10px] text-slate-400">
                        {users.find((u) => u.id === task.completionProposal?.reviewedBy)?.name ?? "Cấp trên"}
                        {" · "}
                        {task.completionProposal.reviewedAt ? formatDateTime(task.completionProposal.reviewedAt) : ""}
                      </p>
                    )}
                  </div>
                )}

                {/* Manager review form */}
                {canApprove && task.completionProposal.status === "pending" && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900 space-y-2">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Đánh giá &amp; phê duyệt kết thúc</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => setClosureRating(star)}>
                          <Star className={cn(
                            "w-5 h-5 transition",
                            closureRating >= star ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"
                          )} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={closureComment}
                      onChange={(e) => setClosureComment(e.target.value)}
                      placeholder="Nhận xét tổng thể về nhiệm vụ (tùy chọn)..."
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-blue-200 dark:border-blue-800 rounded-xl bg-white dark:bg-slate-900 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReviewProposal(true)}
                        disabled={submittingClosure || closureRating === 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition"
                      >
                        {submittingClosure ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                        Phê duyệt kết thúc
                      </button>
                      <button
                        onClick={() => handleReviewProposal(false)}
                        disabled={submittingClosure}
                        className="flex items-center gap-1.5 px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm font-semibold rounded-xl transition"
                      >
                        Từ chối
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-100 dark:border-slate-700 overflow-x-auto">
          {TABS.map(({ id: tabId, label, Icon }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={cn(
                "flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition border-b-2",
                activeTab === tabId
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Steps tab */}
          {activeTab === "steps" && currentUser && (
            <StepsTab
              task={task}
              users={users}
              currentUser={currentUser}
              canAssignSteps={canAssignSteps}
              onSave={onSaveTask}
              onEmailSent={refreshEmailLogs}
            />
          )}

          {/* Stakeholders tab */}
          {activeTab === "stakeholders" && (
            <div className="space-y-3">
              {[
                { role: "assignee", label: "Người thực hiện", color: "blue" },
                { role: "collaborator", label: "Hỗ trợ", color: "purple" },
                { role: "watcher", label: "Theo dõi", color: "slate" },
                { role: "approver", label: "Phê duyệt", color: "green" },
              ].map(({ role, label, color }) => {
                const roleStakeholders = task.stakeholders?.filter((s) => s.role === role) ?? [];
                if (roleStakeholders.length === 0) return null;
                return (
                  <div key={role}>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {roleStakeholders.map((s) => {
                        const u = users.find((u) => u.id === s.userId);
                        if (!u) return null;
                        return (
                          <div key={s.userId} className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 rounded-xl">
                            <UserAvatar user={u} size="sm" showName />
                            <span className="text-xs text-slate-400">{u.department}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resources tab */}
          {activeTab === "resources" && currentUser && (
            <ResourcesTab
              task={task}
              currentUser={currentUser}
              isMainPerformer={isMainPerformer}
              onSave={onSaveTask}
            />
          )}

          {/* Chat tab */}
          {activeTab === "chat" && currentUser && (
            <TaskChat taskId={id} currentUser={currentUser} />
          )}

          {/* Finance tab */}
          {activeTab === "finance" && currentUser && (
            <FinancialWidget
              task={task}
              currentUser={{ id: currentUser.id, name: currentUser.name, role: currentUser.role }}
            />
          )}

          {/* Email log tab */}
          {activeTab === "email" && (() => {
            if (emailLogs.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-400">Chưa có email nào được gửi</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600">Email sẽ xuất hiện ở đây sau khi gửi từ các bước quy trình</p>
                </div>
              );
            }

            const EVENT_LABEL: Record<string, string> = {
              task_assigned:    "Giao việc",
              deadline_alert:   "Sắp hết hạn",
              task_overdue:     "Quá hạn",
              approval_request: "Yêu cầu duyệt",
              task_completed:   "Hoàn thành",
              step_notification:"Bước quy trình",
              comment_mention:  "Nhắc tên",
              calendar_change:  "Thay đổi lịch",
              digest_daily:     "Tổng hợp ngày",
              digest_weekly:    "Tổng hợp tuần",
            };

            function getDateLabel(sentAt: string) {
              const d = new Date(sentAt);
              const today = new Date();
              const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
              if (d.toDateString() === today.toDateString()) return "Hôm nay";
              if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
              return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
            }

            // Group by date (logs already sorted newest→oldest by Firestore)
            const groups: { label: string; items: EmailLog[] }[] = [];
            for (const log of emailLogs) {
              const label = getDateLabel(log.sentAt);
              const last = groups[groups.length - 1];
              if (last && last.label === label) last.items.push(log);
              else groups.push({ label, items: [log] });
            }

            return (
              <div className="space-y-6">
                {groups.map(({ label, items }) => (
                  <div key={label}>
                    {/* Date divider */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-1">
                        {label}
                      </span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>

                    {/* Email log items */}
                    <div className="space-y-2">
                      {items.map((log) => (
                        <div
                          key={log.id}
                          className={cn(
                            "group flex items-start gap-3 p-3.5 rounded-xl border transition-all",
                            "bg-[var(--card)] border-[var(--border)]",
                            "hover:border-blue-300 dark:hover:border-blue-700",
                            "hover:bg-blue-50/50 dark:hover:bg-blue-950/20",
                            "hover:shadow-sm",
                          )}
                        >
                          {/* Icon */}
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                            log.status === "sent"
                              ? "bg-blue-50 dark:bg-blue-900/30 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50"
                              : "bg-red-50 dark:bg-red-900/20",
                          )}>
                            <Mail className={cn("w-4 h-4", log.status === "sent" ? "text-blue-500" : "text-red-500")} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">{log.subject}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(log.sentAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                              {" · "}
                              {log.recipientEmails.length} người nhận
                            </p>
                            {/* Recipients */}
                            {log.recipientEmails.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {log.recipientEmails.map((email) => (
                                  <span key={email}
                                    className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 group-hover:bg-white dark:group-hover:bg-slate-600 rounded-full text-slate-500 dark:text-slate-400 transition-colors">
                                    {email}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Status + type */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full",
                              log.status === "sent"
                                ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                                : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
                            )}>
                              {log.status === "sent" ? "Đã gửi" : "Thất bại"}
                            </span>
                            <span className="text-[10px] text-slate-400 text-right">
                              {EVENT_LABEL[log.eventType] ?? log.eventType}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Evaluation tab */}
          {activeTab === "evaluation" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasPermission(currentUser?.role ?? "guest", "task:approve")
                  ? "Bạn có thể đánh giá tất cả thành viên đã tham gia nhiệm vụ này."
                  : "Đánh giá đồng nghiệp đã cùng thực hiện nhiệm vụ."}
              </p>
              {taskWorkers.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Không có thành viên nào để đánh giá.</p>
              ) : (
                taskWorkers.map((uid) => {
                  const worker = users.find((u) => u.id === uid);
                  if (!worker) return null;
                  const already = evaluations.find(
                    (e) => e.evaluatedUserId === uid && e.evaluatorId === currentUser?.id && e.taskId === id,
                  );
                  return (
                    <div key={uid} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3 mb-3">
                        <UserAvatar user={worker} size="md" showName />
                      </div>
                      {already ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>Đã đánh giá:</span>
                          <span className="text-amber-500">{"★".repeat(already.scores.overall ?? 0)}</span>
                          {already.comment && <span className="text-xs italic">"{already.comment}"</span>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setEvalRatings((r) => ({ ...r, [uid]: star }))}
                                className="transition"
                              >
                                <Star
                                  className={cn(
                                    "w-6 h-6",
                                    (evalRatings[uid] ?? 0) >= star
                                      ? "fill-amber-400 text-amber-400"
                                      : "text-slate-300 dark:text-slate-600",
                                  )}
                                />
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={evalComments[uid] ?? ""}
                            onChange={(e) => setEvalComments((c) => ({ ...c, [uid]: e.target.value }))}
                            placeholder="Nhận xét (tùy chọn)..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                          <button
                            onClick={() => handleSubmitEval(uid)}
                            disabled={submittingEval || !evalRatings[uid]}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-xl transition"
                          >
                            {submittingEval ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Gửi đánh giá"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Audit trail tab */}
          {activeTab === "audit" && (() => {
            if (auditEvents.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-400">Chưa có lịch sử hành động</p>
                </div>
              );
            }

            const ACTION_LABEL: Record<string, string> = {
              edited:              "chỉnh sửa nhiệm vụ",
              approved:            "phê duyệt nhiệm vụ",
              status_changed:      "đổi trạng thái",
              completion_proposed: "đề xuất kết thúc nhiệm vụ",
              completion_approved: "duyệt kết thúc nhiệm vụ",
              completion_rejected: "từ chối kết thúc nhiệm vụ",
              progress_updated:    "cập nhật tiến độ",
              step_assigned:       "phân công bước quy trình",
              risk_flagged:        "gắn cờ rủi ro",
              comment_added:       "thêm bình luận",
              deleted:             "xoá nhiệm vụ",
            };

            const STATUS_VI: Record<string, string> = { todo: "Chờ thực hiện", in_progress: "Đang thực hiện", review: "Xét duyệt", done: "Hoàn thành", cancelled: "Đã huỷ" };
            const PRIORITY_VI: Record<string, string> = { low: "Thấp", medium: "Trung bình", high: "Cao", urgent: "Khẩn cấp" };

            function fmtVal(key: string, val: unknown): string {
              if (key === "status") return STATUS_VI[val as string] ?? String(val);
              if (key === "priority") return PRIORITY_VI[val as string] ?? String(val);
              if (key === "approved") return val ? "Đã duyệt" : "Chưa duyệt";
              if (typeof val === "boolean") return val ? "Có" : "Không";
              return String(val ?? "—");
            }

            function describeEvent(ev: AuditEvent): string {
              const base = ACTION_LABEL[ev.action] ?? ev.action.replace(/_/g, " ");
              if (ev.before && ev.after) {
                const diffs = Object.keys(ev.after)
                  .filter((k) => (ev.before as Record<string, unknown>)[k] !== (ev.after as Record<string, unknown>)[k])
                  .map((k) => `${fmtVal(k, (ev.before as Record<string, unknown>)[k])} → ${fmtVal(k, (ev.after as Record<string, unknown>)[k])}`)
                  .join(", ");
                if (diffs) return `${base}: ${diffs}`;
              }
              if (ev.note) return `${base} — "${ev.note}"`;
              return base;
            }

            function toDateKey(ts: string): string {
              const d = new Date(ts);
              return [
                d.getDate().toString().padStart(2, "0"),
                (d.getMonth() + 1).toString().padStart(2, "0"),
                d.getFullYear(),
              ].join("/");
            }

            // Group by date (auditEvents sorted newest→oldest)
            const groups: { dateKey: string; items: AuditEvent[] }[] = [];
            for (const ev of auditEvents) {
              const dateKey = toDateKey(ev.timestamp);
              const last = groups[groups.length - 1];
              if (last && last.dateKey === dateKey) last.items.push(ev);
              else groups.push({ dateKey, items: [ev] });
            }

            return (
              <div className="space-y-1">
                {groups.map(({ dateKey, items }, gi) => (
                  <details
                    key={dateKey}
                    open={gi === 0}
                    className="group rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                  >
                    {/* Header row */}
                    <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer list-none select-none bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      {/* +/- toggle */}
                      <span className="w-5 h-5 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm leading-none group-open:hidden select-none">
                        +
                      </span>
                      <span className="w-5 h-5 rounded border border-blue-300 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/50 hidden items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm leading-none group-open:flex select-none">
                        −
                      </span>

                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Ngày {dateKey}
                      </span>

                      <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {items.length} hoạt động
                      </span>
                    </summary>

                    {/* Log rows */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {items.map((ev) => {
                        const time = new Date(ev.timestamp).toLocaleTimeString("vi-VN", {
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        });
                        return (
                          <div
                            key={ev.id}
                            className="flex items-baseline gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums w-[62px]">
                              {time}
                            </span>
                            <span className="text-[11px] text-slate-300 dark:text-slate-600 shrink-0">:</span>
                            <span className="text-sm text-slate-800 dark:text-slate-100 min-w-0">
                              <span className="font-semibold">{ev.userName}</span>
                              <span className="text-slate-400 dark:text-slate-500 mx-1">–</span>
                              <span className="text-slate-600 dark:text-slate-300">{describeEvent(ev)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>

    {/* ─── Change Request Modal ─────────────────────────────────── */}
    {showChangeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Yêu cầu phê duyệt thay đổi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Nhiệm vụ sẽ chuyển về Chờ xét duyệt</p>
            </div>
          </div>

          {/* Show what changed */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 space-y-1.5 text-xs">
            {pendingChangedFields?.deadlineBase && (
              <p className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">Hạn hoàn thành: </span>
                <span className="line-through text-red-500">{formatDate(pendingChangedFields.deadlineBase.before) || "—"}</span>
                {" → "}
                <span className="text-green-600 font-medium">{formatDate(pendingChangedFields.deadlineBase.after) || "—"}</span>
              </p>
            )}
            {pendingChangedFields?.mainPerformerId && (
              <p className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">Người thực hiện: </span>
                <span className="line-through text-red-500">{users.find(u => u.id === pendingChangedFields.mainPerformerId?.before)?.name ?? "—"}</span>
                {" → "}
                <span className="text-green-600 font-medium">{users.find(u => u.id === pendingChangedFields.mainPerformerId?.after)?.name ?? "—"}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Lý do thay đổi <span className="text-red-500">*</span>
            </label>
            <textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Mô tả lý do cần thay đổi thời gian hoặc người thực hiện..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowChangeModal(false); setChangeReason(""); }}
              className="px-4 py-2 border border-[var(--border)] text-sm rounded-xl hover:bg-[var(--muted)] transition"
            >
              Huỷ
            </button>
            <button
              onClick={handleConfirmChangeRequest}
              disabled={savingEdit || !changeReason.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
            >
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Gửi yêu cầu
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Issue Escalation Modal ───────────────────────────────── */}
    {showIssueModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Báo cáo vấn đề phát sinh</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Nhiệm vụ sẽ chuyển sang Chờ xét duyệt để quản lý xem xét</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Mô tả vấn đề <span className="text-red-500">*</span>
            </label>
            <textarea
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="Mô tả chi tiết vấn đề đang gặp phải, ảnh hưởng đến tiến độ hoặc chất lượng công việc..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowIssueModal(false); setIssueDescription(""); }}
              className="px-4 py-2 border border-[var(--border)] text-sm rounded-xl hover:bg-[var(--muted)] transition"
            >
              Huỷ
            </button>
            <button
              onClick={handleRaiseIssue}
              disabled={submittingIssue || !issueDescription.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
            >
              {submittingIssue ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Gửi báo cáo
            </button>
          </div>
        </div>
      </div>
    )}
  );
}
