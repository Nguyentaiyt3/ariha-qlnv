"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Megaphone, Mail, Link2, Check, X, Loader2, FileText,
  AlertCircle, CheckCircle2, Clock, Search, RotateCcw, Eye,
  UserPlus, Users, ShieldCheck, Send, ChevronRight,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import { useTaskStore } from "@/stores/useTaskStore";
import { IntakeReviewModal } from "@/components/research/IntakeReviewModal";
import { AssignReviewersModal } from "@/components/research/AssignReviewersModal";
import type { Task, TaskStep, User, ResearchTopic, ResearchStepStatus, ResearchReview } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isB01Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("thông báo") && (n.includes("tiếp nhận") || n.includes("đề cương"));
}

function isB02Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("phân loại") || (n.includes("tiếp nhận") && n.includes("đề cương"));
}

function isB03Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("thẩm định") || (n.includes("phản biện") && (n.includes("gửi") || n.includes("phân công")));
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

// ─── B03: Gửi thẩm định đề cương ─────────────────────────────────────────────

const REVIEW_STATUS_COLOR: Record<string, string> = {
  assigned:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  submitted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const VERDICT_LABEL: Record<string, { label: string; cls: string }> = {
  pass:            { label: "ĐẠT",             cls: "text-green-600 dark:text-green-400" },
  pass_if_revised: { label: "ĐẠT — sửa",       cls: "text-amber-600 dark:text-amber-400" },
  fail:            { label: "KHÔNG ĐẠT",        cls: "text-red-600 dark:text-red-400" },
};

function proposalReviews(topic: ResearchTopic): ResearchReview[] {
  return (topic.reviews ?? []).filter(r => r.stage === "proposal");
}

function B03ReviewPanel({ task, users, currentUser, canView, canUpdate }: Props) {
  const [topics, setTopics]           = useState<ResearchTopic[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [showAssign, setShowAssign]   = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const allSystemUsers = useTaskStore(s => s.users);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/research`);
      const data = await res.json() as { topics: ResearchTopic[] };
      const passed = (data.topics ?? []).filter(t => t.intakeStatus === "passed");
      setTopics(passed);
    } catch {
      toast.error("Không thể tải danh sách đề tài");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = topics.length;
    const noReviewer = topics.filter(t => proposalReviews(t).length === 0).length;
    const one        = topics.filter(t => proposalReviews(t).length === 1).length;
    const full       = topics.filter(t => proposalReviews(t).length >= 2).length;
    const totalSlots = topics.length * 2;
    const emailSent  = topics.reduce((s, t) => s + proposalReviews(t).filter(r => r.reviewerEmail).length, 0);
    const submitted  = topics.reduce((s, t) => s + proposalReviews(t).filter(r => r.status === "submitted").length, 0);
    const passCount  = topics.reduce((s, t) => s + proposalReviews(t).filter(r => r.verdict === "pass" || r.verdict === "pass_if_revised").length, 0);
    const failCount  = topics.reduce((s, t) => s + proposalReviews(t).filter(r => r.verdict === "fail").length, 0);
    return { total, noReviewer, one, full, totalSlots, emailSent, submitted, passCount, failCount };
  }, [topics]);

  const filtered = useMemo(() => {
    if (!search.trim()) return topics;
    const q = search.toLowerCase();
    return topics.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.principalInvestigatorName ?? "").toLowerCase().includes(q) ||
      (t.code ?? "").toLowerCase().includes(q)
    );
  }, [topics, search]);

  function handleTopicUpdate(id: string, updates: Partial<ResearchTopic>) {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  }

  if (!canView) return null;

  return (
    <>
      <div className="space-y-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-900/10 p-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Gửi thẩm định đề cương ({topics.length} đề tài đã tiếp nhận)
          </div>
          {canUpdate && selected.size > 0 && (
            <button
              onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Phân công ({selected.size})
            </button>
          )}
        </div>

        {/* ── 3×3 summary grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Tổng đề tài", value: stats.total,       cls: "text-slate-700 dark:text-slate-200", bg: "bg-white dark:bg-slate-800" },
            { label: "Chưa phân công", value: stats.noReviewer, cls: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-900/10" },
            { label: "Phân công 1/2",  value: stats.one,        cls: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/10" },
            { label: "Đủ 2 phản biện", value: stats.full,       cls: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/10" },
            { label: "Đã nộp phiếu",  value: `${stats.submitted}/${stats.totalSlots}`, cls: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/10" },
            { label: "Đạt / Không đạt", value: `${stats.passCount}/${stats.failCount}`, cls: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/10" },
          ].map(s => (
            <div key={s.label} className={cn("rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-center", s.bg)}>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{s.label}</p>
              <p className={cn("text-lg font-bold mt-0.5 leading-none", s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {stats.totalSlots > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Tiến độ phản biện</span>
              <span className="font-medium">{stats.submitted}/{stats.totalSlots} phiếu đã nộp</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${Math.round((stats.submitted / stats.totalSlots) * 100)}%` }}
              />
            </div>
            <div className="flex gap-3 text-[11px]">
              <span className="text-green-600 dark:text-green-400">{stats.submitted} đã nộp</span>
              <span className="text-amber-600 dark:text-amber-400">{stats.totalSlots - stats.submitted} chờ phản biện</span>
              {stats.emailSent > 0 && <span className="text-blue-500">{stats.emailSent} email đã gửi</span>}
            </div>
          </div>
        )}

        {/* Search + select-all */}
        {topics.length > 0 && (
          <div className="flex items-center gap-2">
            {canUpdate && (
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(filtered.map(t => t.id)) : new Set())}
                  className="accent-violet-600"
                />
                <span className="text-xs text-slate-500">Chọn tất cả</span>
              </label>
            )}
            {topics.length > 3 && (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm đề tài, chủ nhiệm..."
                  className="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
          </div>
        ) : topics.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
            <AlertCircle className="w-4 h-4" />
            Chưa có đề tài nào được tiếp nhận
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                  {canUpdate && <th className="w-8 px-3 py-2" />}
                  <th className="text-left px-3 py-2 font-medium">Đề tài</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Chủ nhiệm</th>
                  <th className="text-center px-3 py-2 font-medium">Phản biện 1</th>
                  <th className="text-center px-3 py-2 font-medium">Phản biện 2</th>
                  <th className="text-center px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(topic => {
                  const reviews = proposalReviews(topic);
                  const isSelected = selected.has(topic.id);
                  const isExpanded = expandedId === topic.id;

                  return (
                    <>
                      <tr
                        key={topic.id}
                        className={cn(
                          "transition",
                          isSelected ? "bg-violet-50 dark:bg-violet-900/10" : "bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        )}
                      >
                        {canUpdate && (
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(topic.id)}
                              className="accent-violet-600 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <p className="text-xs font-medium text-slate-800 dark:text-white leading-snug line-clamp-2">{topic.title}</p>
                          {topic.code && <span className="text-[10px] text-slate-400">{topic.code}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell whitespace-nowrap">
                          {topic.principalInvestigatorName ?? "—"}
                        </td>

                        {/* Reviewer slots */}
                        {[0, 1].map(i => {
                          const r = reviews[i];
                          return (
                            <td key={i} className="px-3 py-2.5 text-center">
                              {r ? (
                                <div className="space-y-0.5">
                                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full block",
                                    r.status === "submitted"
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                      : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                  )}>
                                    {r.status === "submitted" ? "Đã nộp" : "Chờ PB"}
                                  </span>
                                  {r.verdict && (
                                    <span className={cn("text-[10px] font-bold block", VERDICT_LABEL[r.verdict]?.cls ?? "")}>
                                      {VERDICT_LABEL[r.verdict]?.label}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                          );
                        })}

                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canUpdate && (
                              <button
                                onClick={() => { setSelected(new Set([topic.id])); setShowAssign(true); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 bg-white dark:bg-slate-800 transition"
                              >
                                <UserPlus className="w-3 h-3" />
                                {reviews.length >= 2 ? "Xem PB" : "Phân công"}
                              </button>
                            )}
                            {reviews.length > 0 && (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : topic.id)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition"
                                title="Xem chi tiết phản biện"
                              >
                                <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-90")} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row — review details */}
                      {isExpanded && reviews.length > 0 && (
                        <tr key={`${topic.id}-expand`} className="bg-slate-50 dark:bg-slate-800/40">
                          <td colSpan={canUpdate ? 6 : 5} className="px-4 py-3">
                            <div className="space-y-2">
                              {reviews.map((r, i) => {
                                const scores = r.scores;
                                const total = scores
                                  ? Object.values(scores).reduce((s, v) => s + (v ?? 0), 0)
                                  : null;
                                return (
                                  <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1.5 bg-white dark:bg-slate-900/60">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                        Phản biện {i + 1}
                                        {r.reviewerType === "external" && <span className="ml-1 text-slate-400">(ngoài)</span>}
                                      </p>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                          r.status === "submitted"
                                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                        )}>
                                          {r.status === "submitted" ? "Đã nộp phiếu" : "Chờ phản biện"}
                                        </span>
                                        {r.dueAt && (
                                          <span className="text-[10px] text-slate-400">Hạn: {new Date(r.dueAt).toLocaleDateString("vi-VN")}</span>
                                        )}
                                      </div>
                                    </div>

                                    {r.status === "submitted" && (
                                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
                                        {total !== null && (
                                          <p className="text-slate-600 dark:text-slate-300">
                                            Tổng điểm: <span className="font-bold text-violet-600">{total}/35</span>
                                          </p>
                                        )}
                                        {r.verdict && (
                                          <p className={cn("font-bold", VERDICT_LABEL[r.verdict]?.cls ?? "")}>
                                            {VERDICT_LABEL[r.verdict]?.label}
                                          </p>
                                        )}
                                        {r.grade && (
                                          <p className="text-slate-500">Xếp loại: <span className="font-medium text-slate-700 dark:text-slate-300">
                                            {({ excellent: "Giỏi", good: "Khá", average: "Trung bình", fail: "Không đạt" } as Record<string, string>)[r.grade] ?? r.grade}
                                          </span></p>
                                        )}
                                        {r.submittedAt && (
                                          <p className="text-slate-400 text-[10px]">Nộp lúc: {new Date(r.submittedAt).toLocaleString("vi-VN")}</p>
                                        )}
                                      </div>
                                    )}

                                    {/* Email / link info (chỉ hiện với canUpdate) */}
                                    {canUpdate && r.token && r.status === "assigned" && (
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-slate-400 truncate flex-1">
                                          Link: {typeof window !== "undefined" ? `${window.location.origin}/review/${r.token}` : `/review/${r.token}`}
                                        </span>
                                        <button
                                          onClick={() => {
                                            const link = `${window.location.origin}/review/${r.token}`;
                                            navigator.clipboard.writeText(link);
                                            toast.success("Đã sao chép link phản biện");
                                          }}
                                          className="text-[10px] text-violet-600 hover:underline shrink-0 font-medium"
                                        >
                                          Copy link
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!canUpdate && topics.length > 0 && (
          <p className="text-xs text-slate-400 italic">Chỉ người thực hiện chính mới có thể phân công phản biện.</p>
        )}
      </div>

      {/* AssignReviewersModal */}
      {showAssign && selected.size > 0 && (
        <AssignReviewersModal
          topics={topics.filter(t => selected.has(t.id))}
          users={allSystemUsers as User[]}
          currentUser={currentUser}
          canManage={canUpdate}
          onClose={() => { setShowAssign(false); setSelected(new Set()); }}
          onTopicUpdate={handleTopicUpdate}
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
  if (isB03Step(step.name)) return <B03ReviewPanel {...props} />;
  return null;
}
