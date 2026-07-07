"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, AlertCircle, User, Calendar, Flag,
  CheckSquare, MessageSquare, Users, Mail, Activity, BarChart3,
  CheckCheck, Loader2, Star, Send, ClipboardCheck, Pencil, Trash2, X as XIcon, Save,
  Paperclip, Link2, FolderOpen, FileText, Download, Plus, DollarSign, ShieldAlert,
  Microscope, ChevronRight, ChevronDown, Bell, Copy, Check,
} from "lucide-react";
import { cn, formatDate, formatDateTime, formatRelativeTime, statusLabel, priorityLabel, getInitials, avatarColor, isTaskVisible } from "@/lib/utils";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { subscribeTask, updateTask, deleteTask, getEmailLogs, getAuditTrail, addAuditEvent, addNotification, getEvaluations, saveEvaluation, getEvaluationConfig, getTaskEvaluations, getResearchTopics } from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import { hasPermission, canAssignTo } from "@/lib/rbac/permissions";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";
import { updateStepById } from "@/lib/workflow-engine";
import { StepsTab } from "@/components/tasks/StepsTab";
import { TaskChat } from "@/components/tasks/TaskChat";
import { FinancialWidget } from "@/components/tasks/FinancialWidget";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { Task, User as UserType, EmailLog, AuditEvent, Evaluation, CompletionProposal, TaskResource, ChangeRequest, EvaluationConfig, ResearchTopic } from "@/types";
import { scoreT1, scoreT2Task, scoreT3Task, buildEval3TScore, DEFAULT_EVAL_CONFIG, GRADE_LABEL } from "@/lib/eval3T";
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

// ─── ResearchWidget ──────────────────────────────────────────


function ResearchWidget({
  taskId, topics, task, canManage, canCreate, users, currentUserId,
}: {
  taskId: string;
  topics: ResearchTopic[];
  task: Task;
  canManage: boolean;
  canCreate: boolean;
  users: UserType[];
  currentUserId: string;
}) {
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const gd1 = useMemo(() => ({
    dangKy:       topics.filter(t => !t.intakeStatus || t.intakeStatus === "awaiting").length,
    daTimNhan:    topics.filter(t => t.intakeStatus === "passed").length,
    tiepNhan:     topics.filter(t => t.stage === "proposal" && (t.currentStep === "p_intake" || t.currentStep === "p_compile")).length,
    dangThamDinh: topics.filter(t => t.stage === "proposal" && (t.currentStep === "p_review" || t.currentStep === "p_council")).length,
    chinhSua:     topics.filter(t => t.intakeStatus === "revision_needed").length,
    trienKhai:    topics.filter(t =>
      (t.stage === "proposal" && (t.currentStep === "p_assign" || t.currentStep === "p_ethics" || t.currentStep === "p_agree")) ||
      t.stage === "executing"
    ).length,
  }), [topics]);

  // Accepted topics with no task link — need classification warning
  const noTaskAccepted = useMemo(() =>
    topics.filter(t => t.intakeStatus === "passed" && !t.taskId),
  [topics]);

  // Intake-pending topics with no task link (shown in header)
  const waitingIntake = useMemo(() =>
    topics.filter(t => !t.taskId && (!t.intakeStatus || t.intakeStatus === "awaiting")).length,
  [topics]);

  // Topics classified with a taskId — funnel stats
  const linked = useMemo(() => topics.filter(t => !!t.taskId), [topics]);

  const lgd1 = useMemo(() => ({
    dangKy:       linked.length,
    daTimNhan:    linked.filter(t => t.intakeStatus === "passed").length,
    dangThamDinh: linked.filter(t => t.stage === "proposal" && (t.currentStep === "p_review" || t.currentStep === "p_council")).length,
    chinhSua:     linked.filter(t => t.intakeStatus === "revision_needed").length,
    trienKhai:    linked.filter(t =>
      (t.stage === "proposal" && (t.currentStep === "p_assign" || t.currentStep === "p_ethics" || t.currentStep === "p_agree")) ||
      t.stage === "executing"
    ).length,
  }), [linked]);

  const lgd2 = useMemo(() => ({
    deNghiTD:     linked.filter(t => ["recognition", "completed"].includes(t.stage)).length,
    tiepNhan:     linked.filter(t =>
      t.stage === "recognition" &&
      (t.steps ?? []).find(s => s.key === "r_intake")?.status === "passed" &&
      (t.steps ?? []).find(s => s.key === "r_review")?.status === "pending"
    ).length,
    dangThamDinh: linked.filter(t => t.stage === "recognition" && ["r_review","r_council"].includes(t.currentStep)).length,
    chinhSua:     0 as number,
    congNhan:     linked.filter(t => t.stage === "completed" || (t.stage === "recognition" && t.currentStep === "r_recognize")).length,
  }), [linked]);

  const gd2 = useMemo(() => ({
    deNghiTD:     topics.filter(t => t.stage === "recognition" && t.currentStep === "r_intake").length,
    tiepNhan:     topics.filter(t =>
      t.stage === "recognition" &&
      (t.steps ?? []).find(s => s.key === "r_intake")?.status === "passed" &&
      (t.steps ?? []).find(s => s.key === "r_review")?.status === "pending"
    ).length,
    dangThamDinh: topics.filter(t => t.stage === "recognition" && ["r_review","r_council"].includes(t.currentStep)).length,
    chinhSua:     0,
    congNhan:     topics.filter(t => t.stage === "completed" || (t.stage === "recognition" && t.currentStep === "r_recognize")).length,
  }), [topics]);

  // Collect unique participant ids (exclude current user)
  const participants = useMemo(() => {
    const seen = new Set<string>([currentUserId]);
    const result: { id: string; name: string }[] = [];
    const addParticipant = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const u = users.find(u => u.id === id);
      result.push({ id, name: u?.name ?? id });
    };
    if (task.mainPerformerId) addParticipant(task.mainPerformerId);
    for (const s of task.stakeholders ?? []) addParticipant(s.userId);
    return result;
  }, [task, users, currentUserId]);

  // Public form URL — no login required, taskId + taskName pre-filled
  const publicRegUrl = `/public/register?taskId=${taskId}&taskName=${encodeURIComponent(task.name)}`;
  const isMainPerformer = currentUserId === task.mainPerformerId;

  const handleCopy = async () => {
    const full = typeof window !== "undefined" ? `${window.location.origin}${publicRegUrl}` : publicRegUrl;
    await navigator.clipboard.writeText(full).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendNotifications = async () => {
    if (participants.length === 0) return;
    setSending(true);
    try {
      const internalRegUrl = `/research?create=1&taskId=${taskId}`;
      await Promise.all(participants.map(p =>
        addNotification({
          userId: p.id,
          type: "task_assigned",
          title: `Đăng ký đề tài NCKH — ${task.name}`,
          body: "Bạn được mời đăng ký đề tài NCKH cho nhiệm vụ này. Nhấn để mở form đăng ký trong hệ thống.",
          link: internalRegUrl,
          read: false,
          priority: "normal",
          taskId,
          createdAt: new Date().toISOString(),
        })
      ));
      toast.success(`Đã gửi thông báo đến ${participants.length} người tham gia`);
      setShowSendPanel(false);
    } catch {
      toast.error("Gửi thông báo thất bại");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-violet-200 dark:border-violet-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-violet-100 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/10">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <Microscope className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">
            Đề tài NCKH liên kết
          </span>
          {topics.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300">
              {topics.length}
            </span>
          )}
          {waitingIntake > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
              {waitingIntake} chờ tiếp nhận
            </span>
          )}
          <ChevronDown className={cn("w-3.5 h-3.5 text-violet-400 shrink-0 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {(canManage || isMainPerformer) && !collapsed && (
            <button
              onClick={() => setShowSendPanel(v => !v)}
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition",
                showSendPanel
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                  : "text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20",
              )}
              title="Gửi link đăng ký đề tài (không cần đăng nhập)"
            >
              <Bell className="w-3.5 h-3.5" />
              Gửi link
            </button>
          )}
          <a
            href="/research"
            className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 dark:text-violet-400 font-medium transition"
          >
            {topics.length > 0 ? "Xem & quản lý" : "Mở danh sách"} <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (<>

      {/* Send-link panel */}
      {showSendPanel && (
        <div className="px-5 py-4 border-b border-violet-100 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-900/5 space-y-4">
          {/* External link — for Zalo / email sharing to people without accounts */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Link bên ngoài — dùng để gửi qua Zalo / email cho người <span className="text-slate-500">chưa có tài khoản</span>:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 truncate text-slate-600 dark:text-slate-300">
                {typeof window !== "undefined" ? `${window.location.origin}${publicRegUrl}` : publicRegUrl}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Đã sao chép" : "Sao chép"}
              </button>
            </div>
          </div>

          <div className="border-t border-violet-100 dark:border-violet-800" />

          {/* In-app notification — links to internal modal (same for all roles) */}
          {participants.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Thông báo in-app — mở form đăng ký trong hệ thống (giống nhau với mọi vai trò):
              </p>
              <p className="text-xs text-slate-500">
                Gửi đến {participants.length} người tham gia:
                <span className="font-medium text-slate-600 dark:text-slate-300 ml-1">
                  {participants.map(p => p.name).join(", ")}
                </span>
              </p>
              <button
                onClick={handleSendNotifications}
                disabled={sending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? "Đang gửi..." : "Gửi thông báo"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Không có người tham gia khác để gửi thông báo.</p>
          )}
        </div>
      )}

      {/* Topics body — 2 groups */}
      {topics.length === 0 ? (
        <div className="px-5 py-4 text-sm text-slate-400">
          {(canManage || canCreate)
            ? <>Chưa có đề tài nào liên kết.{" "}<a href={`/research?taskId=${taskId}&create=1`} className="text-violet-600 hover:underline font-medium">Đăng ký đề tài →</a></>
            : "Chưa có đề tài NCKH nào được liên kết với nhiệm vụ này."
          }
        </div>
      ) : (
        <div className="px-5 py-3.5 space-y-3">
          {/* Group 1: Đã phân loại TaskID — funnel stats */}
          <div>
            <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              Đã phân loại TaskID
              <span className="px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 font-bold normal-case tracking-normal text-[10px]">
                {linked.length}
              </span>
            </p>
            {linked.length === 0 ? (
              <p className="text-xs text-slate-400 italic pl-3">Chưa có đề tài nào được phân loại.</p>
            ) : (
              <div className="pl-3 space-y-2.5">
                {/* GĐ1 funnel */}
                <div>
                  <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1.5">
                    Giai đoạn 1 — Thẩm định đề cương
                  </p>
                  <div className="space-y-1">
                    {([
                      { label: "Đăng ký",         val: lgd1.dangKy,       denom: null,             denomLabel: "" },
                      { label: "Tiếp nhận",        val: lgd1.daTimNhan,    denom: lgd1.dangKy,      denomLabel: "đăng ký" },
                      { label: "Đang thẩm định",   val: lgd1.dangThamDinh, denom: lgd1.daTimNhan,   denomLabel: "tiếp nhận" },
                      { label: "Chỉnh sửa",        val: lgd1.chinhSua,     denom: lgd1.dangKy,      denomLabel: "đăng ký" },
                      { label: "Triển khai",       val: lgd1.trienKhai,    denom: lgd1.daTimNhan,   denomLabel: "tiếp nhận" },
                    ]).map(({ label, val, denom, denomLabel }) => (
                      <div key={label} className="flex items-baseline gap-1 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}:</span>
                        <span className={cn("font-semibold tabular-nums", val > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-400")}>
                          {val}
                        </span>
                        {denom !== null && (
                          <span className="text-slate-400 tabular-nums">
                            /{denom}
                            <span className="text-[10px] ml-1">({denomLabel})</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* GĐ2 funnel */}
                <div>
                  <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1.5">
                    Giai đoạn 2 — Công nhận
                  </p>
                  <div className="space-y-1">
                    {([
                      { label: "Đề nghị thẩm định", val: lgd2.deNghiTD,     denom: null,              denomLabel: "" },
                      { label: "Tiếp nhận",          val: lgd2.tiepNhan,     denom: lgd2.deNghiTD,     denomLabel: "đề nghị TD" },
                      { label: "Đang thẩm định",     val: lgd2.dangThamDinh, denom: lgd2.tiepNhan,     denomLabel: "tiếp nhận" },
                      { label: "Chỉnh sửa",          val: lgd2.chinhSua,     denom: lgd2.deNghiTD,     denomLabel: "đề nghị TD" },
                      { label: "Công nhận",          val: lgd2.congNhan,     denom: lgd2.tiepNhan,     denomLabel: "tiếp nhận" },
                    ]).map(({ label, val, denom, denomLabel }) => (
                      <div key={label} className="flex items-baseline gap-1 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}:</span>
                        <span className={cn("font-semibold tabular-nums", val > 0 ? "text-violet-600 dark:text-violet-400" : "text-slate-400")}>
                          {val}
                        </span>
                        {denom !== null && (
                          <span className="text-slate-400 tabular-nums">
                            /{denom}
                            <span className="text-[10px] ml-1">({denomLabel})</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Group 2: No task — count + warning only, details in B02 step */}
          {(() => {
            const noTaskCount = topics.filter(t => !t.taskId).length;
            const noTaskWaiting = topics.filter(t => !t.taskId && (!t.intakeStatus || t.intakeStatus === "awaiting")).length;
            return noTaskCount > 0 ? (
              <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                  <p className="font-semibold">
                    {noTaskCount} đề cương chưa phân loại nhiệm vụ (no task)
                    {noTaskWaiting > 0 && <span className="ml-1 font-normal">— {noTaskWaiting} chờ tiếp nhận</span>}
                  </p>
                  {noTaskAccepted.length > 0 && (
                    <p className="text-amber-600 dark:text-amber-400">{noTaskAccepted.length} đã tiếp nhận nhưng chưa gán vào nhiệm vụ — xử lý tại bước B02</p>
                  )}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

      </>)}
    </div>
  );
}

export default function TaskDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { users } = useTaskStore();
  const { currentUser } = useAuthStore();
  const abbr = useUnitAbbr();

  const [task, setTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("steps");
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [taskEvaluations, setTaskEvaluations] = useState<Evaluation[]>([]);
  const [taskAllEvals, setTaskAllEvals] = useState<Evaluation[]>([]);
  const [evalConfig, setEvalConfig] = useState<EvaluationConfig>(DEFAULT_EVAL_CONFIG);
  const [evalRatings, setEvalRatings] = useState<Record<string, number>>({});
  const [evalComments, setEvalComments] = useState<Record<string, string>>({});
  const [submittingEval, setSubmittingEval] = useState(false);

  // Research topics linked to this task
  const [researchTopics, setResearchTopics] = useState<ResearchTopic[]>([]);

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

  // Supervisor assignment state
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [supervisorPickerId, setSupervisorPickerId] = useState("");
  const [savingSupervisor, setSavingSupervisor] = useState(false);

  // Optimistic progress — updates immediately on step change, syncs from subscription
  const [localProgress, setLocalProgress] = useState(0);
  useEffect(() => { if (task) setLocalProgress(task.progress ?? 0); }, [task?.progress]);

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

  // Load research topics: single combined call (linked + intake-pending no-task)
  useEffect(() => {
    getResearchTopics(id, true).then(setResearchTopics).catch(() => {});
  }, [id]);

  // Access guard — redirect if user is not a participant
  useEffect(() => {
    if (!task || !currentUser) return;
    if (!isTaskVisible(task, currentUser.id, currentUser.role)) {
      toast.error("Bạn không có quyền xem nhiệm vụ này.");
      router.push("/tasks");
    }
  }, [task, currentUser, router]);

  // Load evaluation config (weights + thresholds, HR-configurable)
  useEffect(() => {
    getEvaluationConfig().then(setEvalConfig).catch(console.error);
  }, []);

  // Load all evaluations for this task — drives warning banners
  const refreshTaskAllEvals = useCallback(() => {
    getTaskEvaluations(id).then(setTaskAllEvals).catch(console.error);
  }, [id]);

  useEffect(() => { refreshTaskAllEvals(); }, [refreshTaskAllEvals]);

  // Load 360° evaluations for this task's main performer
  useEffect(() => {
    const performerId = task?.mainPerformerId;
    if (!performerId) return;
    getEvaluations(performerId)
      .then((evals) => setTaskEvaluations(evals.filter((e) => e.taskId === id)))
      .catch(console.error);
  }, [task?.mainPerformerId, id]);

  // Load tab data on switch
  useEffect(() => {
    if (!task) return;
    if (activeTab === "email") {
      getEmailLogs(id).then(setEmailLogs).catch(console.error);
    } else if (activeTab === "audit") {
      getAuditTrail(id).then(setAuditEvents).catch(console.error);
    } else if (activeTab === "evaluation" && currentUser) {
      getEvaluations(currentUser.id).then(setEvaluations).catch(console.error);
      refreshTaskAllEvals();
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
      await updateTask(id, { ...pendingEdits, status: "review", changeRequests: [...(task.changeRequests ?? []), changeReq] });
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
    const pendingCRForApproval = task?.changeRequests?.find(cr => cr.status === "pending");
    if (!currentUser || !task || !pendingCRForApproval) return;
    setApprovingChange(true);
    const cr = pendingCRForApproval;
    try {
      const resolvedCRs = (task.changeRequests ?? []).map(c =>
        c === cr ? { ...c, status: approved ? "approved" as const : "rejected" as const } : c
      );
      const updates: Partial<Task> = { status: cr.previousStatus, changeRequests: resolvedCRs };
      if (!approved && cr.changedFields) {
        if (cr.changedFields.deadlineBase) updates.deadlineBase = cr.changedFields.deadlineBase.before;
        if (cr.changedFields.mainPerformerId) updates.mainPerformerId = cr.changedFields.mainPerformerId.before;
      }
      if (approved && cr.type === "subworkflow_change" && cr.changedFields?.subWorkflowChange) {
        const { stepId, proposedChildSteps, proposedChildEdges } = cr.changedFields.subWorkflowChange;
        updates.steps = updateStepById(task.steps ?? [], stepId, {
          childSteps: proposedChildSteps,
          childEdges: proposedChildEdges,
        });
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
        ...(comment ? { note: comment } : {}),
        timestamp: new Date().toISOString(),
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
      await updateTask(id, { status: "review", changeRequests: [...(task.changeRequests ?? []), changeReq] });
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
      setLocalProgress(avg);
    }

    // When a new pending change request is submitted, await save then notify managers
    const newlyAddedCR = (() => {
      if (!updates.changeRequests || !currentUser || !task) return null;
      const existing = task.changeRequests ?? [];
      return updates.changeRequests.find(cr =>
        cr.status === "pending" && !existing.some(e => e.requestedAt === cr.requestedAt)
      ) ?? null;
    })();
    if (newlyAddedCR && currentUser && task) {
      try {
        await updateTask(id, { ...updates, updatedAt: new Date().toISOString() });
        const cr = newlyAddedCR;
        const managers = users.filter(
          (u) => ["teamLead", "director", "hrAdmin"].includes(u.role) && u.isActive && u.id !== currentUser.id
        );
        const typeLabel =
          cr.type === "subworkflow_change"
            ? `đề xuất sửa quy trình con "${cr.changedFields?.subWorkflowChange?.stepName ?? ""}"`
            : cr.type === "deadline_change"
            ? "yêu cầu thay đổi thời hạn"
            : cr.type === "performer_change"
            ? "yêu cầu thay đổi người thực hiện"
            : "báo cáo vấn đề phát sinh";
        await Promise.all(managers.map((u) =>
          addNotification({
            userId: u.id, type: "approval_request",
            title: "Chờ phê duyệt thay đổi",
            body: `${cr.requestedByName} ${typeLabel} trong nhiệm vụ "${task.name}".`,
            link: `/tasks/${id}`, read: false, priority: "urgent",
            createdAt: new Date().toISOString(), actionRequired: true,
          })
        ));
        await addAuditEvent(id, {
          taskId: id, action: "change_requested",
          userId: currentUser.id, userName: currentUser.name,
          note: cr.reason, timestamp: new Date().toISOString(),
        });
      } catch { toast.error("Gửi yêu cầu phê duyệt thất bại."); }
      return;
    }

    // Fire-and-forget — StepsTab already has optimistic local state, no need to block here
    updateTask(id, { ...updates, updatedAt: new Date().toISOString() }).catch(console.error);
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
      refreshTaskAllEvals();
      toast.success("Đã gửi đánh giá");
    } catch { toast.error("Gửi đánh giá thất bại"); }
    finally { setSubmittingEval(false); }
  }



  async function handleSubmitProposal() {
    if (!currentUser || !task || !proposalSummary.trim()) return;
    setSubmittingProposal(true);
    try {
      const submittedAt = new Date().toISOString();

      // Tính điểm 3T tại thời điểm gửi đề xuất
      const t1 = scoreT1(task.deadlineBase, submittedAt);
      const t2 = scoreT2Task(
        taskEvaluations,
        task.progress,
        task.kpi?.target,
        task.kpi?.current,
      );
      const stepsWithProof = (task.steps ?? []).filter((s) => (s.proofs?.length ?? 0) > 0).length;
      const t3 = scoreT3Task(task.totalAmount, task.totalExpense, stepsWithProof, task.steps?.length);
      const score3T = buildEval3TScore(t1, t2, t3, evalConfig);

      const proposal: CompletionProposal = {
        submittedBy: currentUser.id,
        submittedAt,
        summary: proposalSummary.trim(),
        status: "pending",
        score3T,
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

  async function handleAssignSupervisor() {
    if (!currentUser || !task || !supervisorPickerId) return;
    setSavingSupervisor(true);
    try {
      const existing = task.stakeholders ?? [];
      const updated = [...existing, { userId: supervisorPickerId, role: "supervisor" as const }];
      await updateTask(id, { stakeholders: updated });
      const supervisorUser = users.find((u) => u.id === supervisorPickerId);
      await addNotification({
        userId: supervisorPickerId,
        type: "task_assigned",
        title: "Bạn được chỉ định làm Giám sát",
        body: `${currentUser.name} chỉ định bạn giám sát nhiệm vụ "${task.name}".`,
        link: `/tasks/${id}`,
        read: false,
        priority: "normal",
        taskId: id,
        createdAt: new Date().toISOString(),
      });
      await addAuditEvent(id, {
        taskId: id, action: "supervisor_assigned",
        userId: currentUser.id, userName: currentUser.name,
        timestamp: new Date().toISOString(),
        after: { name: `supervisor:${supervisorPickerId}:${supervisorUser?.name ?? ""}` } as Partial<Task>,
      });
      setShowSupervisorPicker(false);
      setSupervisorPickerId("");
      toast.success(`Đã chỉ định ${supervisorUser?.name ?? ""} làm giám sát.`);
    } catch { toast.error("Chỉ định thất bại."); }
    finally { setSavingSupervisor(false); }
  }

  async function handleRevokeSupervisor(userId: string) {
    if (!currentUser || !task) return;
    const updated = (task.stakeholders ?? []).filter(
      (s) => !(s.userId === userId && s.role === "supervisor")
    );
    await updateTask(id, { stakeholders: updated });
    const u = users.find((x) => x.id === userId);
    toast.success(`Đã hủy giám sát của ${u?.name ?? ""}.`);
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
  const pendingCR = task.changeRequests?.find(cr => cr.status === "pending") ?? null;

  // Progress color helper — 3 levels
  const progressTextCls = (p: number) =>
    p <= 33 ? "text-red-600 dark:text-red-400 font-bold"
    : p <= 66 ? "text-amber-600 dark:text-amber-400 font-bold"
    : "text-green-600 dark:text-green-400 font-bold";
  const progressBarCls = (p: number) =>
    p <= 33 ? "bg-red-500" : p <= 66 ? "bg-amber-500" : "bg-green-500";
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

  // Evaluation status — used for warning banners
  const hasSelfEval = taskAllEvals.some(
    (e) => e.evaluatedUserId === currentUser?.id && e.evaluatorId === currentUser?.id
  );
  const pendingPeerEvalWorkers = taskWorkers.filter((uid) =>
    !taskAllEvals.some((e) => e.evaluatorId === currentUser?.id && e.evaluatedUserId === uid && e.taskId === id)
  );

  // ── 3T Evaluation display ──────────────────────────────────────
  function Eval3TCards({ taskData, referenceDate, evals, savedScore }: {
    taskData: Task;
    referenceDate: string;
    evals: Evaluation[];
    savedScore?: typeof taskData.completionProposal extends undefined ? undefined : NonNullable<CompletionProposal["score3T"]>;
  }) {
    // Dùng điểm đã lưu nếu có, ngược lại tính real-time
    const stepsWithProof = (taskData.steps ?? []).filter((s) => (s.proofs?.length ?? 0) > 0).length;
    const t1Score = savedScore?.t1 ?? scoreT1(taskData.deadlineBase, referenceDate);
    const t2Score = savedScore?.t2 ?? scoreT2Task(evals, taskData.progress, taskData.kpi?.target, taskData.kpi?.current);
    const t3Score = savedScore?.t3 ?? scoreT3Task(taskData.totalAmount, taskData.totalExpense, stepsWithProof, taskData.steps?.length);

    const total = savedScore?.total ?? (t1Score * evalConfig.weights.t1 + t2Score * evalConfig.weights.t2 + t3Score * evalConfig.weights.t3);
    const grade = savedScore?.grade ?? (
      total >= evalConfig.thresholds.xuatSac ? "xuatSac" :
      total > evalConfig.thresholds.hoanThanhTot ? "hoanThanhTot" :
      total >= evalConfig.thresholds.hoanThanh ? "hoanThanh" : "khongHoanThanh"
    );

    const gradeColors: Record<string, string> = {
      xuatSac:        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      hoanThanhTot:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
      hoanThanh:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      khongHoanThanh: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
    };

    function ScoreBar({ score, color }: { score: number; color: string }) {
      return (
        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mt-1">
          <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${score * 10}%` }} />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Tổng điểm + xếp loại */}
        <div className={cn("flex items-center justify-between px-3 py-2 rounded-xl border font-semibold", gradeColors[grade])}>
          <span className="text-xs">{GRADE_LABEL[grade as keyof typeof GRADE_LABEL]}</span>
          <span className="text-lg font-black">{Math.round(total * 10) / 10}<span className="text-xs font-normal">/10</span></span>
        </div>

        {/* 3 tiêu chí */}
        <div className="grid grid-cols-3 gap-2">
          {/* T1 */}
          <div className="rounded-xl p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-center">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">T1 · Tiến độ</p>
            <p className={cn("text-base font-black", t1Score >= 8 ? "text-green-600 dark:text-green-400" : t1Score >= 6 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>
              {t1Score}
            </p>
            <ScoreBar score={t1Score} color={t1Score >= 8 ? "bg-green-500" : t1Score >= 6 ? "bg-amber-400" : "bg-red-500"} />
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              {taskData.deadlineBase ? `HĐ ${formatDate(taskData.deadlineBase)}` : "Chưa có hạn"}
            </p>
          </div>

          {/* T2 */}
          <div className="rounded-xl p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-center">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">T2 · Chất lượng</p>
            <p className={cn("text-base font-black", t2Score >= 8 ? "text-green-600 dark:text-green-400" : t2Score >= 6 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>
              {t2Score}
            </p>
            <ScoreBar score={t2Score} color={t2Score >= 8 ? "bg-green-500" : t2Score >= 6 ? "bg-amber-400" : "bg-red-500"} />
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              {evals.length > 0 ? `${evals.length} đánh giá 360°` : "KPI / minh chứng"}
            </p>
          </div>

          {/* T3 */}
          <div className="rounded-xl p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-center">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">T3 · Tài nguyên</p>
            <p className={cn("text-base font-black", t3Score >= 8 ? "text-green-600 dark:text-green-400" : t3Score >= 6 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>
              {t3Score}
            </p>
            <ScoreBar score={t3Score} color={t3Score >= 8 ? "bg-green-500" : t3Score >= 6 ? "bg-amber-400" : "bg-red-500"} />
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              {(taskData.totalAmount ?? 0) > 0 ? "Ngân sách" : `${stepsWithProof}/${taskData.steps?.length ?? 0} bước`}
            </p>
          </div>
        </div>

        {savedScore && (
          <p className="text-[10px] text-slate-400 text-right">Chốt lúc {formatDateTime(savedScore.computedAt)}</p>
        )}
      </div>
    );
  }

  return (
    <>
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
                      <span title="Thay đổi cần phê duyệt"><ShieldAlert className="w-3 h-3 text-amber-500" /></span>
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
                    <span title="Thay đổi cần phê duyệt"><ShieldAlert className="w-3 h-3 text-amber-500" /></span>
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
                      <option key={u.id} value={u.id}>{u.name} ({u.department ? abbr(u.department) : u.role})</option>
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
            {canApprove && !task.approved && !pendingCR && (
              <button
                onClick={handleApprove}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition"
              >
                <CheckCheck className="w-4 h-4" /> Phê duyệt
              </button>
            )}
            {/* Change request approval — visible to managers */}
            {canApprove && pendingCR?.status === "pending" && (
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
            {isMainPerformer && task.approved && !pendingCR && ["todo", "in_progress"].includes(task.status) && !isEditing && (
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
          ].map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><Icon className="w-3.5 h-3.5" /> {label}</div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{value}</p>
            </div>
          ))}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><BarChart3 className="w-3.5 h-3.5" /> Tiến độ</div>
            <p className={cn("text-sm", progressTextCls(localProgress))}>{localProgress}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Tiến độ tổng</span>
            <span className={progressTextCls(localProgress)}>{localProgress}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300", progressBarCls(localProgress))}
              style={{ width: `${localProgress}%` }}
            />
          </div>
        </div>

        {/* Compact 3T grade — kết quả đánh giá: chỉ quản lý mới xem được */}
        {task.status === "done" && canApprove && task.completionProposal?.score3T && (() => {
          const s = task.completionProposal.score3T!;
          const gradeColors: Record<string, string> = {
            xuatSac:        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
            hoanThanhTot:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
            hoanThanh:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
            khongHoanThanh: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
          };
          return (
            <div className={cn("mt-3 flex items-center justify-between px-3 py-2 rounded-xl border text-sm", gradeColors[s.grade])}>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{GRADE_LABEL[s.grade as keyof typeof GRADE_LABEL]}</span>
                <span className="text-[10px] opacity-70 font-normal">T1 {s.t1} · T2 {s.t2} · T3 {s.t3}</span>
              </div>
              <span className="font-black text-base">{s.total}<span className="text-xs font-normal opacity-70">/10</span></span>
            </div>
          );
        })()}

        {/* 3-phase deadlines */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {[
            {
              phase: "Chuẩn bị", deadline: task.deadlinePrepare,
              dot: "bg-blue-500",
              badge: "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800",
              label: "text-blue-500 dark:text-blue-400",
              value: "text-blue-700 dark:text-blue-300",
            },
            {
              phase: "Thực hiện", deadline: task.deadlineExecute,
              dot: "bg-amber-500",
              badge: "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800",
              label: "text-amber-500 dark:text-amber-400",
              value: "text-amber-700 dark:text-amber-300",
            },
            {
              phase: "Hoàn thiện", deadline: task.deadlineFinalize,
              dot: "bg-green-500",
              badge: "bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800",
              label: "text-green-600 dark:text-green-400",
              value: "text-green-700 dark:text-green-300",
            },
          ].filter(p => p.deadline).map(({ phase, deadline, dot, badge, label, value }) => (
            <div key={phase} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${badge}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
              <span className={label}>{phase}</span>
              <span className={`font-bold ${value}`}>{formatDate(deadline!)}</span>
            </div>
          ))}
        </div>

        {/* Pending change request banner */}
        {pendingCR && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {pendingCR.type === "deadline_change" && "Yêu cầu thay đổi thời hạn"}
                {pendingCR.type === "performer_change" && "Yêu cầu thay đổi người thực hiện"}
                {pendingCR.type === "issue_raised" && "Vấn đề phát sinh cần xem xét"}
                {pendingCR.type === "subworkflow_change" && `Đề xuất sửa quy trình con "${pendingCR.changedFields?.subWorkflowChange?.stepName ?? ""}"`}
                {" — chờ phê duyệt"}
              </p>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 ml-6">
              <span className="font-medium">{pendingCR.requestedByName}</span>: "{pendingCR.reason}"
            </p>
            {pendingCR.changedFields?.deadlineBase && (
              <p className="text-xs text-slate-600 dark:text-slate-400 ml-6">
                Hạn: <span className="line-through text-red-500">{formatDate(pendingCR.changedFields.deadlineBase.before)}</span>
                {" → "}<span className="text-green-600 font-medium">{formatDate(pendingCR.changedFields.deadlineBase.after)}</span>
              </p>
            )}
            {pendingCR.changedFields?.mainPerformerId && (
              <p className="text-xs text-slate-600 dark:text-slate-400 ml-6">
                Người thực hiện: <span className="line-through text-red-500">{users.find(u => u.id === pendingCR.changedFields?.mainPerformerId?.before)?.name ?? "—"}</span>
                {" → "}<span className="text-green-600 font-medium">{users.find(u => u.id === pendingCR.changedFields?.mainPerformerId?.after)?.name ?? "—"}</span>
              </p>
            )}
            {pendingCR.changedFields?.subWorkflowChange && (
              <p className="text-xs text-slate-600 dark:text-slate-400 ml-6">
                Bước <span className="font-medium">"{pendingCR.changedFields.subWorkflowChange.stepName}"</span>
                {" — "}{pendingCR.changedFields.subWorkflowChange.proposedChildSteps.length} bước con mới
              </p>
            )}
            <p className="text-[10px] text-amber-500 ml-6">{formatRelativeTime(pendingCR.requestedAt)}</p>
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
                  {/* 3T preview — kết quả đánh giá chỉ quản lý xem được */}
                  {canApprove && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Đánh giá 3T (dự kiến)</p>
                      <Eval3TCards taskData={task} referenceDate={new Date().toISOString()} evals={taskEvaluations} />
                    </div>
                  )}
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

                {/* 3T evaluation — kết quả đánh giá: chỉ quản lý mới xem được */}
                {canApprove ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Đánh giá 3T</p>
                    <Eval3TCards
                      taskData={task}
                      referenceDate={task.completionProposal.submittedAt}
                      evals={taskEvaluations}
                      savedScore={task.completionProposal.score3T}
                    />
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-400">
                      Kết quả đánh giá 3T do quản lý xem và quyết định. Bạn sẽ được thông báo khi có kết quả.
                    </p>
                  </div>
                )}

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

      {/* Evaluation warning banners — shown when task is done and user hasn't evaluated yet */}
      {task.status === "done" && currentUser && (
        <div className="space-y-2">
          {/* Self-evaluation reminder */}
          {isMainPerformer && !hasSelfEval && (
            <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Chưa tự đánh giá</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Bạn chưa thực hiện tự đánh giá cho nhiệm vụ này. Tự đánh giá giúp cấp trên có đủ dữ liệu tính điểm T2 chính xác.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("evaluation")}
                className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition"
              >
                Đánh giá ngay
              </button>
            </div>
          )}

          {/* Peer evaluation reminder */}
          {pendingPeerEvalWorkers.length > 0 && (
            <div className="flex items-start gap-3 p-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Chưa đánh giá đồng nghiệp</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                  Còn {pendingPeerEvalWorkers.length} thành viên chưa được bạn đánh giá:{" "}
                  {pendingPeerEvalWorkers
                    .map((uid) => users.find((u) => u.id === uid)?.name ?? uid)
                    .join(", ")}.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("evaluation")}
                className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
              >
                Đánh giá ngay
              </button>
            </div>
          )}
        </div>
      )}

      {/* Research topics widget — shown for anyone with research:create or research:manage */}
      {task && (researchTopics.length > 0 || (currentUser && (hasPermission(currentUser.role, "research:manage") || hasPermission(currentUser.role, "research:create")))) && (
        <ResearchWidget
          taskId={id}
          topics={researchTopics}
          task={task}
          canManage={!!(currentUser && hasPermission(currentUser.role, "research:manage"))}
          canCreate={!!(currentUser && hasPermission(currentUser.role, "research:create"))}
          users={users}
          currentUserId={currentUser?.id ?? ""}
        />
      )}

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
              canApprove={canApprove}
              onSave={onSaveTask}
              onEmailSent={refreshEmailLogs}
            />
          )}

          {/* Stakeholders tab */}
          {activeTab === "stakeholders" && (
            <div className="space-y-4">
              {/* Supervisor assignment panel — approvers only */}
              {canApprove && currentUser && (
                <div className="border border-amber-200 dark:border-amber-800 rounded-2xl p-4 bg-amber-50/50 dark:bg-amber-900/10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Chỉ định Giám sát</span>
                    </div>
                    {!showSupervisorPicker && (
                      <button
                        onClick={() => setShowSupervisorPicker(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm giám sát
                      </button>
                    )}
                  </div>

                  {/* Existing supervisors */}
                  {(task.stakeholders ?? []).filter((s) => s.role === "supervisor").length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(task.stakeholders ?? []).filter((s) => s.role === "supervisor").map((s) => {
                        const u = users.find((x) => x.id === s.userId);
                        if (!u) return null;
                        return (
                          <div key={s.userId} className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-full text-xs">
                            <UserAvatar user={u} size="sm" showName />
                            <span className="text-amber-500 dark:text-amber-400">{abbr(u.department)}</span>
                            <button
                              onClick={() => handleRevokeSupervisor(s.userId)}
                              className="text-amber-400 hover:text-red-500 ml-1 transition"
                              title="Hủy giám sát"
                            >
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Picker */}
                  {showSupervisorPicker && (
                    <div className="flex gap-2 mt-2">
                      <select
                        value={supervisorPickerId}
                        onChange={(e) => setSupervisorPickerId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Chọn người giám sát...</option>
                        {users
                          .filter((u) =>
                            u.isActive &&
                            canAssignTo(currentUser.role, u.role) &&
                            !(task.stakeholders ?? []).some((s) => s.userId === u.id && s.role === "supervisor")
                          )
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.department ? abbr(u.department) : u.role})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleAssignSupervisor}
                        disabled={!supervisorPickerId || savingSupervisor}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded-xl transition flex items-center gap-1.5"
                      >
                        {savingSupervisor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Xác nhận
                      </button>
                      <button
                        onClick={() => { setShowSupervisorPicker(false); setSupervisorPickerId(""); }}
                        className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 rounded-xl transition"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {(task.stakeholders ?? []).filter((s) => s.role === "supervisor").length === 0 && !showSupervisorPicker && (
                    <p className="text-xs text-amber-500/70">Chưa có người giám sát. Chỉ định để nhận cảnh báo rủi ro.</p>
                  )}
                </div>
              )}

              {/* All stakeholder groups */}
              {[
                { role: "assignee", label: "Người thực hiện", color: "blue" },
                { role: "collaborator", label: "Hỗ trợ", color: "purple" },
                { role: "supervisor", label: "Giám sát", color: "amber" },
                { role: "watcher", label: "Theo dõi", color: "slate" },
                { role: "approver", label: "Phê duyệt", color: "green" },
              ].map(({ role, label }) => {
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
                            <span className="text-xs text-slate-400">{abbr(u.department)}</span>
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
          {activeTab === "evaluation" && currentUser && (
            <div className="space-y-4">
              {/* Evaluation criteria info */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tiêu chí đánh giá 3T</p>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <div><span className="font-bold text-slate-700 dark:text-slate-200">T1 · Tiến độ</span><br/>So sánh ngày nộp với deadline gốc.</div>
                  <div><span className="font-bold text-slate-700 dark:text-slate-200">T2 · Chất lượng</span><br/>TB đánh giá 360°, tự đánh giá, hoặc tiến độ KPI.</div>
                  <div><span className="font-bold text-slate-700 dark:text-slate-200">T3 · Tài nguyên</span><br/>Chi phí thực / ngân sách, hoặc bước có minh chứng.</div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Trọng số: T1 {Math.round(evalConfig.weights.t1 * 100)}% · T2 {Math.round(evalConfig.weights.t2 * 100)}% · T3 {Math.round(evalConfig.weights.t3 * 100)}%
                  {" · "}Ngưỡng: Xuất sắc ≥{evalConfig.thresholds.xuatSac} · Hoàn thành tốt &gt;{evalConfig.thresholds.hoanThanhTot} · Hoàn thành ≥{evalConfig.thresholds.hoanThanh}
                </p>
              </div>

              {/* Self-evaluation block — only for main performer */}
              {isMainPerformer && (() => {
                const selfEval = taskAllEvals.find(
                  (e) => e.evaluatedUserId === currentUser.id && e.evaluatorId === currentUser.id && e.taskId === id
                );
                const selfKey = `self_${currentUser.id}`;
                return (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-xs font-bold text-amber-800 dark:text-amber-200">
                        {getInitials(currentUser.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{currentUser.name}</p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Tự đánh giá</p>
                      </div>
                    </div>
                    {selfEval ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>Đã tự đánh giá:</span>
                        <span className="text-amber-500">{"★".repeat(selfEval.scores.overall ?? 0)}</span>
                        {selfEval.comment && <span className="text-xs italic">"{selfEval.comment}"</span>}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => setEvalRatings((r) => ({ ...r, [selfKey]: star }))}
                              className="transition"
                            >
                              <Star className={cn(
                                "w-6 h-6",
                                (evalRatings[selfKey] ?? 0) >= star ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"
                              )} />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={evalComments[selfKey] ?? ""}
                          onChange={(e) => setEvalComments((c) => ({ ...c, [selfKey]: e.target.value }))}
                          placeholder="Nhận xét về kết quả công việc của bản thân (tùy chọn)..."
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-amber-200 dark:border-amber-700 rounded-xl bg-white dark:bg-slate-900 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                        />
                        <button
                          onClick={async () => {
                            const rating = evalRatings[selfKey];
                            if (!rating) { toast.error("Chọn số sao tự đánh giá"); return; }
                            setSubmittingEval(true);
                            try {
                              const ev: Evaluation = {
                                id: generateId("eval"),
                                taskId: id,
                                evaluatedUserId: currentUser.id,
                                evaluatorId: currentUser.id,
                                type: "self",
                                isAnonymous: false,
                                scores: { overall: rating },
                                comment: evalComments[selfKey] ?? "",
                                period: new Date().toISOString().slice(0, 7),
                                overallScore: rating * 20,
                                createdAt: new Date().toISOString(),
                              };
                              await saveEvaluation(ev);
                              refreshTaskAllEvals();
                              toast.success("Đã gửi tự đánh giá");
                            } catch { toast.error("Gửi thất bại"); }
                            finally { setSubmittingEval(false); }
                          }}
                          disabled={submittingEval || !evalRatings[selfKey]}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded-xl transition"
                        >
                          {submittingEval ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Gửi tự đánh giá"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Peer evaluation */}
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {hasPermission(currentUser.role, "task:approve") ? "Đánh giá thành viên" : "Đánh giá đồng nghiệp"}
              </p>
              {taskWorkers.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Không có thành viên nào để đánh giá.</p>
              ) : (
                taskWorkers.map((uid) => {
                  const worker = users.find((u) => u.id === uid);
                  if (!worker) return null;
                  const already = evaluations.find(
                    (e) => e.evaluatedUserId === uid && e.evaluatorId === currentUser.id && e.taskId === id,
                  ) ?? taskAllEvals.find(
                    (e) => e.evaluatedUserId === uid && e.evaluatorId === currentUser.id && e.taskId === id,
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

    {/* ─── Modals (rendered outside the scroll container) ──────── */}
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
    </>
  );
}
