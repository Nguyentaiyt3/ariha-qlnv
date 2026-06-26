"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Megaphone, Mail, Link2, Check, X, Loader2, FileText,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import type { Task, TaskStep, User, ResearchTopic } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isB01Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("thông báo") && (n.includes("tiếp nhận") || n.includes("đề cương"));
}

function isB02Step(name: string) {
  const n = name.toLowerCase();
  return n.includes("phân loại") || (n.includes("tiếp nhận") && n.includes("đề cương"));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  task: Task;
  step: TaskStep;
  users: User[];
  currentUser: User;
  canView: boolean;    // main assignee + sub-task members + admins
  canUpdate: boolean;  // main assignee + admins only
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
      ? `${window.location.origin}/research?register=1&taskId=${task.id}`
      : `/research?register=1&taskId=${task.id}`;

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

      {/* Actions (main assignee / admin only) */}
      {!canUpdate && (
        <p className="text-xs text-slate-400 italic">Chỉ người thực hiện chính mới có thể đăng thông báo và gửi email.</p>
      )}
      {canUpdate && <div className="flex flex-wrap gap-2 pt-1">
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
      </div>}
    </div>
  );
}

// ─── B02: Tiếp nhận, phân loại đề cương ──────────────────────────────────────

type IntakeEdit = { status: "passed" | "rejected" | "pending"; note: string };

function B02IntakePanel({ task, users, currentUser, canView, canUpdate }: Props) {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, IntakeEdit>>({});
  const [saving, setSaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/research?taskId=${task.id}`);
      const data = await res.json() as { topics: ResearchTopic[] };
      setTopics(data.topics ?? []);
    } catch {
      toast.error("Không thể tải danh sách đề tài");
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  function getEdit(topic: ResearchTopic): IntakeEdit {
    return edits[topic.id] ?? {
      status: topic.intakeStatus ?? "pending",
      note: topic.intakeNote ?? "",
    };
  }

  function setStatus(topicId: string, status: "passed" | "rejected") {
    setEdits((prev) => ({
      ...prev,
      [topicId]: { ...(prev[topicId] ?? { note: "" }), status },
    }));
  }

  function setNote(topicId: string, note: string) {
    setEdits((prev) => ({
      ...prev,
      [topicId]: { ...(prev[topicId] ?? { status: "pending" }), note },
    }));
  }

  async function saveAll() {
    const dirty = Object.entries(edits).filter(([id, e]) => {
      const t = topics.find((t) => t.id === id);
      if (!t) return false;
      return e.status !== (t.intakeStatus ?? "pending") || e.note !== (t.intakeNote ?? "");
    });
    if (!dirty.length) { toast("Không có thay đổi nào cần lưu"); return; }

    setSaving(true);
    try {
      await Promise.all(
        dirty.map(([id, e]) =>
          fetch(`/api/research/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intakeStatus: e.status,
              intakeNote: e.note,
              updatedAt: new Date().toISOString(),
            }),
          })
        )
      );
      await fetchTopics();
      setEdits({});
      toast.success(`Đã lưu kết quả phân loại cho ${dirty.length} đề tài`);
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    setFinalizing(true);
    try {
      // Save any pending edits first
      await saveAll();
      toast.success("Đã hoàn tất tổng hợp — có thể chuyển bước tiếp theo");
    } finally {
      setFinalizing(false);
    }
  }

  // Summary counts (use saved + pending edits combined)
  const counts = topics.reduce(
    (acc, t) => {
      const s = edits[t.id]?.status ?? t.intakeStatus ?? "pending";
      acc[s as "passed" | "rejected" | "pending"]++;
      return acc;
    },
    { passed: 0, rejected: 0, pending: 0 }
  );

  const allReviewed = topics.length > 0 && counts.pending === 0;
  const hasDirty = Object.keys(edits).length > 0;

  if (!canView) return null;

  return (
    <div className="space-y-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-900/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300">
          <FileText className="w-4 h-4 shrink-0" />
          Phân loại đề cương ({topics.length} đề tài)
        </div>
        {/* Summary chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <Check className="w-3 h-3" /> {counts.passed} đạt
          </span>
          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
            <X className="w-3 h-3" /> {counts.rejected} trả lại
          </span>
          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            <Clock className="w-3 h-3" /> {counts.pending} chờ
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang tải danh sách đề tài...
        </div>
      ) : topics.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
          <AlertCircle className="w-4 h-4" />
          Chưa có đề tài nào nộp cho nhiệm vụ này
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                <th className="text-left px-3 py-2 font-medium">Mã / Tên đề tài</th>
                <th className="text-left px-3 py-2 font-medium">Chủ nhiệm</th>
                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Khoa/phòng</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">File đề cương</th>
                <th className="text-center px-3 py-2 font-medium">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topics.map((topic) => {
                const edit = getEdit(topic);
                const piUser = users.find((u) => u.id === topic.principalInvestigatorId);
                const piName = topic.principalInvestigatorName ?? piUser?.name ?? topic.principalInvestigatorId;
                const isNoteOpen = noteOpen === topic.id;

                return (
                  <tr key={topic.id} className="bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-3 py-2.5">
                      {topic.code && (
                        <span className="inline-block text-[10px] font-mono font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded mb-1">
                          {topic.code}
                        </span>
                      )}
                      <p className="text-xs font-medium text-slate-800 dark:text-white leading-snug">{topic.title}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{piName}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 hidden sm:table-cell whitespace-nowrap">{topic.department ?? "—"}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {topic.proposalFileUrl ? (
                        <a
                          href={topic.proposalFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          Xem file
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Chưa có file</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {canUpdate ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setStatus(topic.id, "passed")}
                              className={cn(
                                "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition",
                                edit.status === "passed"
                                  ? "bg-green-600 text-white border-green-600"
                                  : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 bg-white dark:bg-slate-800",
                              )}
                            >
                              <Check className="w-3 h-3" /> Đạt
                            </button>
                            <button
                              onClick={() => { setStatus(topic.id, "rejected"); setNoteOpen(topic.id); }}
                              className={cn(
                                "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition",
                                edit.status === "rejected"
                                  ? "bg-red-600 text-white border-red-600"
                                  : "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 bg-white dark:bg-slate-800",
                              )}
                            >
                              <X className="w-3 h-3" /> Trả lại
                            </button>
                          </div>
                          {edit.status === "rejected" && (
                            <button
                              onClick={() => setNoteOpen(isNoteOpen ? null : topic.id)}
                              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
                            >
                              {isNoteOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {edit.note ? "Sửa lý do" : "Thêm lý do"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold",
                          edit.status === "passed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : edit.status === "rejected" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                        )}>
                          {edit.status === "passed" ? "Đạt" : edit.status === "rejected" ? "Trả lại" : "Chờ"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Note inputs (shown below table when note open for a row) */}
          {noteOpen && (() => {
            const topic = topics.find((t) => t.id === noteOpen);
            if (!topic) return null;
            return (
              <div className="px-4 py-3 bg-red-50/60 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
                <label className="block text-xs font-medium text-red-700 dark:text-red-300 mb-1">
                  Lý do trả lại: <span className="font-normal text-slate-500">{topic.title}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={getEdit(topic).note}
                    onChange={(e) => setNote(topic.id, e.target.value)}
                    placeholder="Ví dụ: Nội dung chưa đủ, cần bổ sung phương pháp nghiên cứu..."
                    className="flex-1 px-3 py-1.5 text-xs border border-red-200 dark:border-red-800 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <button
                    onClick={() => setNoteOpen(null)}
                    className="px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    Xong
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Action row (editors only) */}
      {topics.length > 0 && canUpdate && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={saveAll}
            disabled={saving || !hasDirty}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 dark:disabled:bg-teal-900/40 text-white transition"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Lưu kết quả phân loại
          </button>

          {allReviewed && (
            <button
              onClick={finalize}
              disabled={finalizing}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition"
            >
              {finalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Hoàn tất tổng hợp ({counts.passed} đạt / {topics.length} đề tài)
            </button>
          )}

          {!allReviewed && counts.pending > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Còn {counts.pending} đề tài chưa phân loại
            </span>
          )}
        </div>
      )}
      {/* Read-only summary for non-editors */}
      {topics.length > 0 && !canUpdate && (
        <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
          <span className="text-green-600 font-medium">{counts.passed} đạt</span>
          <span className="text-red-500 font-medium">{counts.rejected} trả lại</span>
          <span className="text-amber-500 font-medium">{counts.pending} chờ</span>
          <span className="text-slate-400 italic ml-1">— chỉ người thực hiện chính mới có thể cập nhật</span>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ResearchStepPanel(props: Props) {
  const { step } = props;

  if (isB01Step(step.name)) return <B01NotifyPanel {...props} />;
  if (isB02Step(step.name)) return <B02IntakePanel {...props} />;
  return null;
}
