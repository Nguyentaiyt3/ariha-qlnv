"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Megaphone, Mail, Link2, Check, X, Loader2, FileText,
  AlertCircle, CheckCircle2, Clock, Search, RotateCcw, Eye,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import { useTaskStore } from "@/stores/useTaskStore";
import { IntakeReviewModal } from "@/components/research/IntakeReviewModal";
import type { Task, TaskStep, User, ResearchTopic, ResearchStepStatus } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isB01Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("thông báo") && (n.includes("tiếp nhận") || n.includes("đề cương"));
}

function isB02Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("phân loại") || (n.includes("tiếp nhận") && n.includes("đề cương"));
}

// Build updated steps that mark all early steps passed and set p_compile in_progress
function buildIntakePassedSteps(topic: ResearchTopic): Partial<ResearchTopic> {
  const stamp = new Date().toISOString();
  const earlyKeys = ["create", "approve_task", "notify", "p_intake"];
  const steps = (topic.steps ?? []).map(s =>
    earlyKeys.includes(s.key)
      ? { ...s, status: "passed" as ResearchStepStatus, completedAt: s.completedAt ?? stamp }
      : s.key === "p_compile"
      ? { ...s, status: "in_progress" as ResearchStepStatus }
      : s,
  );
  return { steps, currentStep: "p_compile" as ResearchTopic["currentStep"], stage: "proposal" as const };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  task: Task;
  step: TaskStep;
  users: User[];
  currentUser: User;
  canView: boolean;
  canUpdate: boolean;
}

// ─── B01: Thông báo tiếp nhận đề cương ────────────────────────────────────────

function B01NotifyPanel({ task, step, users, currentUser, canView, canUpdate }: Props) {
  const year = new Date().getFullYear();
  const defaultTitle = `Thông báo tiếp nhận đề cương nghiên cứu khoa học cấp cơ sở năm ${year}`;
  const defaultBody =
    `Kính gửi toàn thể cán bộ, viên chức,\n\n` +
    `Hội đồng Khoa học & Công nghệ trân trọng thông báo mở tiếp nhận đề cương nghiên cứu khoa học cấp cơ sở năm ${year}.\n\n` +
    `Cán bộ có nhu cầu đăng ký vui lòng điền vào form đăng ký theo đường dẫn bên dưới trước thời hạn quy định.\n\n` +
    `Trân trọng,\n${currentUser.name}`;

  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [deadline, setDeadline] = useState("");
  const [posting, setPosting] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [postedAnn, setPostedAnn] = useState(false);
  const [sentEmail, setSentEmail] = useState(false);

  const regLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/public/register?taskId=${task.id}&taskName=${encodeURIComponent(task.name)}`
      : `/public/register?taskId=${task.id}&taskName=${encodeURIComponent(task.name)}`;

  function copyLink() {
    navigator.clipboard.writeText(regLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function postAnnouncement() {
    setPosting(true);
    try {
      const fullBody =
        body +
        `\n\n📎 Link đăng ký: ${regLink}` +
        (deadline ? `\n📅 Hạn nộp: ${deadline}` : "");

      await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: generateId("ann"),
          title,
          content: fullBody,
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          status: "published",
          targetRoles: ["Staff", "TeamLead", "Director", "HRAdmin", "Finance"],
          attachments: [],
          reactions: {},
          pinned: false,
          commentsCount: 0,
          viewedBy: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
      setPostedAnn(true);
      toast.success("Đã đăng thông báo lên mạng nội bộ");
    } catch {
      toast.error("Không thể đăng thông báo");
    } finally {
      setPosting(false);
    }
  }

  async function sendEmailAll() {
    setSending(true);
    try {
      const recipients = users
        .filter((u) => u.email)
        .map((u) => ({ id: u.id, name: u.name, email: u.email! }));

      if (recipients.length === 0) {
        toast.error("Không có địa chỉ email nào trong hệ thống");
        return;
      }

      const emailBody =
        body +
        `\n\n📎 Link đăng ký: ${regLink}` +
        (deadline ? `\n📅 Hạn nộp: ${deadline}` : "");

      const res = await fetch("/api/email/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUserId: currentUser.id,
          recipients,
          subject: title,
          body: emailBody,
          taskId: task.id,
          stepName: step.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Gửi thất bại");
      }
      setSentEmail(true);
      toast.success(`Đã gửi email đến ${recipients.length} người`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Gửi thất bại");
    } finally {
      setSending(false);
    }
  }

  if (!canView) return null;

  return (
    <div className="space-y-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
        <Megaphone className="w-4 h-4 shrink-0" />
        Tạo thông báo tiếp nhận đề cương
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Tiêu đề thông báo</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Deadline */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Hạn nộp đề cương (tùy chọn)</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Nội dung thông báo</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
        />
      </div>

      {/* Registration link */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <Link2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="flex-1 text-xs text-slate-500 truncate">{regLink}</span>
        <button
          onClick={copyLink}
          className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 shrink-0 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          {copied ? "Đã copy" : "Copy link"}
        </button>
      </div>

      {!canUpdate && (
        <p className="text-xs text-slate-400 italic">Chỉ người thực hiện chính mới có thể đăng thông báo và gửi email.</p>
      )}
      {canUpdate && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={postAnnouncement}
            disabled={posting || !title.trim()}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl transition disabled:opacity-60",
              postedAnn
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                : "bg-violet-600 hover:bg-violet-700 text-white",
            )}
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : postedAnn ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Megaphone className="w-3.5 h-3.5" />}
            {postedAnn ? "Đã đăng mạng nội bộ" : "Đăng mạng nội bộ"}
          </button>

          <button
            onClick={sendEmailAll}
            disabled={sending || !title.trim()}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl transition disabled:opacity-60",
              sentEmail
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                : "border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-white dark:bg-slate-800",
            )}
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sentEmail ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
            {sentEmail ? `Đã gửi email (${users.filter((u) => u.email).length} người)` : `Gửi email toàn viện (${users.filter((u) => u.email).length} người)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── B02: Tiếp nhận, phân loại đề cương ──────────────────────────────────────

const INTAKE_STATUS_LABEL: Record<string, string> = {
  awaiting:         "Chờ xét",
  passed:           "Đã tiếp nhận",
  revision_needed:  "Cần chỉnh sửa",
  rejected:         "Từ chối",
};

const INTAKE_STATUS_COLOR: Record<string, string> = {
  awaiting:         "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  passed:           "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  revision_needed:  "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  rejected:         "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function B02IntakePanel({ task, users, currentUser, canView, canUpdate }: Props) {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [allTopicsForDup, setAllTopicsForDup] = useState<ResearchTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  // All NCKH tasks for the phân loại combobox
  const allTasks = useTaskStore(s => s.tasks);
  const allSystemUsers = useTaskStore(s => s.users);
  const nckhTasks = useMemo(
    () => allTasks.filter(t => /NCKH/i.test(t.name) || /NCKH/i.test(t.workflowName ?? "")),
    [allTasks],
  );

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel: intake queue + all topics (for duplicate detection)
      const [intakeRes, allRes] = await Promise.all([
        fetch(`/api/research?forIntake=1`),
        fetch(`/api/research`),
      ]);
      const intakeData = await intakeRes.json() as { topics: ResearchTopic[] };
      const allData   = await allRes.json()    as { topics: ResearchTopic[] };
      setTopics(intakeData.topics ?? []);
      setAllTopicsForDup(allData.topics ?? []);
    } catch {
      toast.error("Không thể tải danh sách đề tài");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  // Summary counts
  const counts = topics.reduce(
    (acc, t) => {
      const s = t.intakeStatus ?? "awaiting";
      acc[s as keyof typeof acc] = (acc[s as keyof typeof acc] ?? 0) + 1;
      return acc;
    },
    { awaiting: 0, passed: 0, revision_needed: 0, rejected: 0 } as Record<string, number>,
  );

  const filtered = topics.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.principalInvestigatorName ?? "").toLowerCase().includes(q) ||
      (t.department ?? "").toLowerCase().includes(q) ||
      (t.code ?? "").toLowerCase().includes(q)
    );
  });

  const openTopic = topics.find(t => t.id === openTopicId) ?? null;

  async function handleAccept(topic: ResearchTopic, note: string, linkedTaskId: string, intakeLogs: ResearchTopic["intakeLogs"], matchedUserId?: string) {
    const stamp = new Date().toISOString();
    const stepUpdates = buildIntakePassedSteps(topic);
    const updates: Partial<ResearchTopic> = {
      intakeStatus: "passed",
      intakeNote: note || undefined,
      intakeLogs,
      taskId: linkedTaskId || task.id,
      ...(matchedUserId && topic.principalInvestigatorId !== matchedUserId
        ? { principalInvestigatorId: matchedUserId, createdBy: matchedUserId }
        : {}),
      ...stepUpdates,
      updatedAt: stamp,
    };
    await fetch(`/api/research/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, ...updates } : t));
    setOpenTopicId(null);
    toast.success(`Đã tiếp nhận đề cương "${topic.title}" — liên kết với nhiệm vụ & chuyển sang p_compile`);
  }

  async function handleRevise(topic: ResearchTopic, reason: string, intakeLogs: ResearchTopic["intakeLogs"]) {
    const updates: Partial<ResearchTopic> = {
      intakeStatus: "revision_needed",
      intakeNote: reason,
      intakeRevisionCount: (topic.intakeRevisionCount ?? 0) + 1,
      intakeLogs,
      updatedAt: new Date().toISOString(),
    };
    await fetch(`/api/research/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, ...updates } : t));
    setOpenTopicId(null);
    toast.success("Đã gửi yêu cầu chỉnh sửa đến tác giả");
  }

  async function handleReject(topic: ResearchTopic, reason: string, intakeLogs: ResearchTopic["intakeLogs"]) {
    const updates: Partial<ResearchTopic> = {
      intakeStatus: "rejected",
      intakeNote: reason,
      intakeLogs,
      updatedAt: new Date().toISOString(),
    };
    await fetch(`/api/research/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, ...updates } : t));
    setOpenTopicId(null);
    toast.success("Đã từ chối đề cương");
  }

  if (!canView) return null;

  return (
    <>
      <div className="space-y-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-900/10 p-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300">
            <FileText className="w-4 h-4 shrink-0" />
            Tiếp nhận đề cương ({topics.length} đề tài)
          </div>
          {/* Summary chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {counts.awaiting > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                <Clock className="w-3 h-3" /> {counts.awaiting} chờ xét
              </span>
            )}
            {counts.passed > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                <Check className="w-3 h-3" /> {counts.passed} tiếp nhận
              </span>
            )}
            {counts.revision_needed > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                <RotateCcw className="w-3 h-3" /> {counts.revision_needed} chỉnh sửa
              </span>
            )}
            {counts.rejected > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                <X className="w-3 h-3" /> {counts.rejected} từ chối
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        {topics.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm đề tài, chủ nhiệm, đơn vị..."
              className="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách đề tài...
          </div>
        ) : topics.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
            <AlertCircle className="w-4 h-4" />
            Chưa có đề tài nào nộp đăng ký
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Không tìm thấy đề tài phù hợp</p>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                  <th className="text-left px-3 py-2 font-medium">Đề tài</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Chủ nhiệm</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Đơn vị</th>
                  <th className="text-center px-3 py-2 font-medium">Trạng thái</th>
                  <th className="text-center px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(topic => {
                  const status = topic.intakeStatus ?? "awaiting";
                  const isLinked = topic.taskId === task.id;
                  return (
                    <tr key={topic.id} className="bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <div className="flex items-start gap-1.5">
                          {topic.code && (
                            <span className="shrink-0 text-[9px] font-mono px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                              {topic.code}
                            </span>
                          )}
                          {!topic.taskId && (
                            <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full border border-slate-200 dark:border-slate-600">
                              no task
                            </span>
                          )}
                          {isLinked && (
                            <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full border border-violet-200 dark:border-violet-700">
                              liên kết
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-800 dark:text-white leading-snug mt-0.5">{topic.title}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell whitespace-nowrap">
                        {topic.principalInvestigatorName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 hidden md:table-cell whitespace-nowrap">
                        {topic.department ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", INTAKE_STATUS_COLOR[status])}>
                          {INTAKE_STATUS_LABEL[status] ?? status}
                        </span>
                        {topic.intakeRevisionCount && topic.intakeRevisionCount > 0 ? (
                          <p className="text-[10px] text-slate-400 mt-0.5">Lần {topic.intakeRevisionCount}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => setOpenTopicId(topic.id)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition",
                            canUpdate
                              ? "border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 bg-white dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed",
                          )}
                          disabled={!canUpdate}
                        >
                          <Eye className="w-3 h-3" />
                          {canUpdate ? "Kiểm tra" : "Xem"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary row */}
        {topics.length > 0 && (
          <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
            <span className="text-teal-600 font-medium">{counts.passed} tiếp nhận</span>
            <span className="text-amber-600 font-medium">{counts.awaiting} chờ xét</span>
            {counts.revision_needed > 0 && <span className="text-orange-500 font-medium">{counts.revision_needed} chỉnh sửa</span>}
            {counts.rejected > 0 && <span className="text-red-500 font-medium">{counts.rejected} từ chối</span>}
            {!canUpdate && <span className="text-slate-400 italic ml-1">— chỉ người thực hiện chính mới có thể cập nhật</span>}
          </div>
        )}
      </div>

      {/* Intake review modal */}
      {openTopic && (
        <IntakeReviewModal
          topic={openTopic}
          taskId={task.id}
          taskName={task.name}
          receiverName={currentUser.name}
          nckhTasks={nckhTasks}
          allTopics={allTopicsForDup}
          allUsers={allSystemUsers}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
          onAccept={(note, linkedTaskId, logs, matchedUserId) => handleAccept(openTopic, note, linkedTaskId, logs, matchedUserId)}
          onRevise={(reason, logs) => handleRevise(openTopic, reason, logs)}
          onReject={(reason, logs) => handleReject(openTopic, reason, logs)}
          onClose={() => setOpenTopicId(null)}
        />
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ResearchStepPanel(props: Props) {
  const { step } = props;

  if (isB01Step(step.name)) return <B01NotifyPanel {...props} />;
  if (isB02Step(step.name)) return <B02IntakePanel {...props} />;
  return null;
}
