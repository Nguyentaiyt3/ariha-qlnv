"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, Clock, User, Calendar, Flag,
  CheckSquare, MessageSquare, Users, Mail, Activity, BarChart3,
  Edit3, Trash2, CheckCheck, X, Loader2, Plus
} from "lucide-react";
import { cn, formatDate, formatDateTime, formatRelativeTime, statusLabel, priorityLabel, phaseLabel, getInitials, avatarColor } from "@/lib/utils";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { subscribeTask, updateTask, getMessages, addMessage, getEmailLogs, getAuditTrail, addAuditEvent } from "@/lib/firebase/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import type { Task, User as UserType, Message, EmailLog, AuditEvent } from "@/types";
import { toast } from "sonner";

type TabId = "steps" | "stakeholders" | "chat" | "email" | "audit";

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

  // Realtime task subscription
  useEffect(() => {
    const unsub = subscribeTask(id, (t) => {
      setTask(t);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  // Load tab data on switch
  useEffect(() => {
    if (!task) return;
    if (activeTab === "chat") {
      getMessages(id).then(setMessages);
    } else if (activeTab === "email") {
      getEmailLogs(id).then(setEmailLogs);
    } else if (activeTab === "audit") {
      getAuditTrail(id).then(setAuditEvents);
    }
  }, [activeTab, id, task]);

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
      toast.success(`Trạng thái chuyển sang: ${statusLabel(status)}`);
    } catch { toast.error("Cập nhật trạng thái thất bại."); }
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
  const canApprove = currentUser && hasPermission(currentUser.role, "task:approve");
  const canEdit = currentUser && (
    hasPermission(currentUser.role, "task:approve") ||
    task.mainPerformerId === currentUser.id ||
    task.stakeholders?.some((s) => s.userId === currentUser.id)
  );

  const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "steps", label: "Quy trình", Icon: CheckSquare },
    { id: "stakeholders", label: "Người liên quan", Icon: Users },
    { id: "chat", label: "Tin nhắn", Icon: MessageSquare },
    { id: "email", label: "Email Log", Icon: Mail },
    { id: "audit", label: "Lịch sử", Icon: Activity },
  ];

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
          {[
            { label: "Người thực hiện", value: performer?.name ?? "—", icon: User },
            { label: "Hạn hoàn thành", value: task.deadlineBase ? formatDate(task.deadlineBase) : "—", icon: Calendar },
            { label: "Phòng ban", value: task.department ?? "—", icon: Flag },
            { label: "Tiến độ", value: `${task.progress}%`, icon: BarChart3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Icon className="w-3.5 h-3.5" /> {label}
              </div>
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

        {/* Change status */}
        {canEdit && task.status !== "done" && task.status !== "cancelled" && (
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
          {activeTab === "steps" && (
            <div className="space-y-3">
              {task.steps.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Chưa có bước quy trình nào</p>
              ) : (
                task.steps.map((step, i) => {
                  const stepUser = users.find((u) => u.id === step.assigneeId);
                  return (
                    <div key={step.id} className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        step.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {step.status === "completed" ? "✓" : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="font-medium text-sm dark:text-white">{step.name}</p>
                          {stepUser && (
                            <span className="text-xs text-slate-400">{stepUser.name}</span>
                          )}
                        </div>
                        <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${step.progress}%` }} />
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                          <span>{step.progress}% hoàn thành</span>
                          {step.deadline && <span>Hạn: {formatDate(step.deadline)}</span>}
                          <span>KPI: {step.kpiCurrent}/{step.kpiTarget} {step.kpiUnit}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
                            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white", avatarColor(u.name))}>
                              {getInitials(u.name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium dark:text-white">{u.name}</p>
                              <p className="text-[10px] text-slate-400">{u.department}</p>
                            </div>
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
