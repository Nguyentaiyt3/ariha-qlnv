"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, User, Calendar, Flag,
  CheckSquare, MessageSquare, Users, Mail, Activity, BarChart3,
  CheckCheck, Loader2, Star, Send, ClipboardCheck,
} from "lucide-react";
import { cn, formatDate, formatDateTime, formatRelativeTime, statusLabel, priorityLabel, getInitials, avatarColor, isTaskVisible } from "@/lib/utils";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { subscribeTask, updateTask, getMessages, addMessage, getEmailLogs, getAuditTrail, addAuditEvent, addNotification, getEvaluations, saveEvaluation } from "@/lib/firebase/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { StepsTab } from "@/components/tasks/StepsTab";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { Task, User as UserType, Message, EmailLog, AuditEvent, Evaluation, CompletionProposal } from "@/types";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";

type TabId = "steps" | "stakeholders" | "chat" | "email" | "audit" | "evaluation";

export default function TaskDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { users } = useTaskStore();
  const { currentUser } = useAuthStore();

  const [task, setTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("steps");
  const [messages, setMessages] = useState<Message[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
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
    if (activeTab === "chat") {
      getMessages(id).then(setMessages).catch(console.error);
    } else if (activeTab === "email") {
      getEmailLogs(id).then(setEmailLogs).catch(console.error);
    } else if (activeTab === "audit") {
      getAuditTrail(id).then(setAuditEvents).catch(console.error);
    } else if (activeTab === "evaluation" && currentUser) {
      getEvaluations(currentUser.id).then(setEvaluations).catch(console.error);
    }
  }, [activeTab, id, task, currentUser]);

  async function handleSendMessage() {
    if (!chatInput.trim() || !currentUser || !task) return;
    setSendingMsg(true);
    try {
      const msg = await addMessage(id, {
        taskId: id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: chatInput.trim(),
        mentions: [],
        attachments: [],
        timestamp: new Date().toISOString(),
      });
      setMessages((prev) => [...prev, msg]);
      setChatInput("");
    } catch {
      toast.error("Gửi tin nhắn thất bại.");
    } finally {
      setSendingMsg(false);
    }
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
  // Staff cannot change status while task is pending approval
  const canChangeStatus = !!(currentUser && (
    canApprove ||
    (task.approved && (
      isMainPerformer ||
      (task.stakeholders ?? []).some((s) => s.userId === currentUser.id)
    ))
  ));
  const canEdit = !!(currentUser && (
    canApprove ||
    isMainPerformer ||
    (task.stakeholders ?? []).some((s) => s.userId === currentUser.id)
  ));

  const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "steps", label: "Quy trình", Icon: CheckSquare },
    { id: "stakeholders", label: "Người liên quan", Icon: Users },
    { id: "chat", label: "Tin nhắn", Icon: MessageSquare },
    { id: "email", label: "Email Log", Icon: Mail },
    { id: "audit", label: "Lịch sử", Icon: Activity },
    ...(task.status === "done" ? [{ id: "evaluation" as TabId, label: "Đánh giá", Icon: Star }] : []),
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
                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-100">
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
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{task.name}</h1>
            {task.description && (
              <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm leading-relaxed">{task.description}</p>
            )}
          </div>

          {/* Actions */}
          {canApprove && !task.approved && (
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition"
            >
              <CheckCheck className="w-4 h-4" /> Phê duyệt
            </button>
          )}
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

        {/* Change status — staff cannot act while awaiting approval */}
        {canChangeStatus && task.status !== "done" && task.status !== "cancelled" && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-xs text-slate-400">Chuyển sang:</span>
            {(["todo", "in_progress", "review", "done"] as Task["status"][])
              .filter((s) => s !== task.status)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => handleChangeStatus(s)}
                  className="px-3 py-1 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 transition"
                >
                  {statusLabel(s)}
                </button>
              ))}
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

          {/* Chat tab */}
          {activeTab === "chat" && (
            <div className="flex flex-col gap-4 h-[400px]">
              <div className="flex-1 overflow-y-auto space-y-3">
                {messages.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">Chưa có tin nhắn</p>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === currentUser?.id;
                    return (
                      <div key={msg.id} className={cn("flex gap-2", isMe && "flex-row-reverse")}>
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", avatarColor(msg.senderName))}>
                          {getInitials(msg.senderName)}
                        </div>
                        <div className={cn("max-w-[70%]", isMe && "items-end flex flex-col")}>
                          <p className="text-[10px] text-slate-400 mb-0.5">{msg.senderName}</p>
                          <div className={cn("px-3 py-2 rounded-xl text-sm", isMe ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 dark:text-white")}>
                            {msg.content}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{formatRelativeTime(msg.timestamp)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder="Nhập tin nhắn... (Enter để gửi)"
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:text-white"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || sendingMsg}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition"
                >
                  {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Email log tab */}
          {activeTab === "email" && (
            <div className="space-y-2">
              {emailLogs.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Chưa có email nào được gửi</p>
              ) : (
                emailLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <Mail className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium dark:text-white">{log.subject}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Gửi lúc {formatDateTime(log.sentAt)} · {log.recipientEmails.length} người nhận
                      </p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      log.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    )}>
                      {log.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

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
          {activeTab === "audit" && (
            <div className="space-y-2">
              {auditEvents.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Chưa có lịch sử hành động</p>
              ) : (
                auditEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <div className="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {getInitials(event.userName)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm dark:text-white">
                        <span className="font-semibold">{event.userName}</span>
                        {" "}{event.action.replace(/_/g, " ")}
                      </p>
                      {event.before && event.after && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {JSON.stringify(event.before)} → {JSON.stringify(event.after)}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(event.timestamp)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
