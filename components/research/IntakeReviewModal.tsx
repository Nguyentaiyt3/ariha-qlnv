"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Loader2, FileText, Download, ExternalLink, Check, X,
  AlertCircle, User as UserIcon, RotateCcw,
  ShieldCheck, UserCheck, MailPlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { normText, jaccardWords } from "@/lib/researchUtils";
import type { ResearchTopic, Task } from "@/types";

// ─── Intake checklist ─────────────────────────────────────────────────────────

const CHECKLIST = [
  { key: "authorInfo",  label: "Thông tin chủ nhiệm đề tài đầy đủ", desc: "Họ tên, đơn vị, chức danh, liên hệ" },
  { key: "topicTitle",  label: "Tên đề tài phù hợp lĩnh vực NCKH",  desc: "Ngắn gọn, rõ ràng, không trùng đề tài đã thực hiện" },
  { key: "objectives",  label: "Mục tiêu nghiên cứu cụ thể",          desc: "Ít nhất 1 mục tiêu chính được diễn đạt rõ ràng" },
  { key: "timeline",    label: "Kế hoạch và thời gian thực hiện hợp lý", desc: "Phù hợp với quý/năm kế hoạch NCKH của đơn vị" },
  { key: "fileFormat",  label: "File đề cương đúng mẫu quy định",     desc: "Sử dụng mẫu chính thức, đủ các mục bắt buộc" },
] as const;

type CheckKey = (typeof CHECKLIST)[number]["key"];

// ─── DocxViewer — client-side docx rendering via docx-preview ────────────────

function DocxViewer({ fileUrl, absoluteFileUrl }: { fileUrl: string; absoluteFileUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "not_found" | "error">("loading");
  const [errorDetail, setErrorDetail] = useState<string>("");

  useEffect(() => {
    if (!fileUrl || !containerRef.current) return;
    let cancelled = false;
    setState("loading");
    setErrorDetail("");

    const proxyUrl = fileUrl.startsWith("http")
      ? fileUrl
      : `/api/research-file?path=${encodeURIComponent(fileUrl)}`;

    import("docx-preview").then(({ renderAsync }) => {
      return fetch(proxyUrl)
        .then(r => {
          if (r.status === 404) throw Object.assign(new Error("not_found"), { code: "not_found" });
          if (!r.ok) throw new Error(`Không tải được file (HTTP ${r.status})`);
          return r.arrayBuffer();
        })
        .then(buf => {
          if (cancelled || !containerRef.current) return;
          return renderAsync(buf, containerRef.current, undefined, {
            className: "docx-preview-body",
            inWrapper: true,
            ignoreWidth: true,
          });
        });
    }).then(() => {
      if (!cancelled) setState("done");
    }).catch(err => {
      console.error("[DocxViewer] preview failed:", err);
      if (!cancelled) {
        if ((err as any).code === "not_found") {
          setState("not_found");
        } else {
          setErrorDetail(err instanceof Error ? err.message : String(err));
          setState("error");
        }
      }
    });

    return () => { cancelled = true; };
  }, [fileUrl]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Đang tải bản xem trước...</p>
        </div>
      )}
      {state === "not_found" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-slate-900 z-10">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 text-center">File đề cương không tồn tại trên máy chủ</p>
          <p className="text-[11px] text-slate-400 text-center max-w-xs">
            File đã bị xóa hoặc đường dẫn không hợp lệ. Yêu cầu tác giả nộp lại file qua form chỉnh sửa.
          </p>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-white dark:bg-slate-900 z-10">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 text-center">Không thể hiển thị bản xem trước.</p>
          {errorDetail && (
            <p className="text-[11px] text-red-400 text-center max-w-xs break-words">{errorDetail}</p>
          )}
          <a
            href={absoluteFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            <Download className="w-4 h-4" /> Tải xuống để xem
          </a>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-white dark:bg-slate-100 p-4"
        style={{ visibility: state === "done" ? "visible" : "hidden" }}
      />
    </div>
  );
}

// ─── InfoRow helper ──────────────────────────────────────────────────────────

function InfoRow({ label, value, bold }: { label: string; value?: string | number | null; bold?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-slate-400 shrink-0 w-28">{label}</span>
      <span className={cn("text-slate-700 dark:text-slate-200 flex-1 min-w-0 break-words", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="text-[11px] space-y-0.5">
      <p className="text-slate-400">{label}</p>
      <p className="text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">{value}</p>
    </div>
  );
}

// ─── Intelligence helpers ─────────────────────────────────────────────────────

// normText / jaccardWords imported from @/lib/researchUtils
const norm = normText;

const INTAKE_STATUS_LABEL: Record<string, string> = {
  passed: "Đã tiếp nhận",
  awaiting: "Chờ xét",
  revision_needed: "Yêu cầu sửa",
  rejected: "Đã từ chối",
};

// ─── IntakeReviewModal — 2/3 file viewer + 1/3 checklist ────────────────────

export function IntakeReviewModal({
  topic,
  taskId,
  taskName,
  receiverName,
  nckhTasks,
  allTopics = [],
  allUsers = [],
  currentUserId,
  currentUserName,
  onAccept,
  onRevise,
  onReject,
  onClose,
}: {
  topic: ResearchTopic;
  taskId: string;
  taskName?: string;
  receiverName?: string;
  nckhTasks?: Task[];
  allTopics?: ResearchTopic[];
  allUsers?: Array<{ id: string; name: string; email?: string; department?: string; phone?: string }>;
  currentUserId?: string;
  currentUserName?: string;
  onAccept: (note: string, linkedTaskId: string, intakeLogs: ResearchTopic["intakeLogs"], matchedUserId?: string) => Promise<void>;
  onRevise: (reason: string, intakeLogs: ResearchTopic["intakeLogs"]) => Promise<void>;
  onReject: (reason: string, intakeLogs: ResearchTopic["intakeLogs"]) => Promise<void>;
  onClose: () => void;
}) {
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    authorInfo: false, topicTitle: false, objectives: false, timeline: false, fileFormat: false,
  });
  const [note,         setNote]         = useState("");
  const [reason,       setReason]       = useState("");
  const [verdict,      setVerdict]      = useState<"accept" | "revise" | "reject" | null>(null);
  const [linkedTaskId, setLinkedTaskId] = useState(taskId);
  const [submitting,   setSubmitting]   = useState(false);

  // Capture the moment the modal was opened
  const reviewedAt = useMemo(() => new Date(), []);
  const reviewedAtDisplay = useMemo(() => {
    const d = reviewedAt;
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${date} · ${time}`;
  }, [reviewedAt]);

  // True if this topic has no task link → show phân loại field
  const isNoTask = !topic.taskId;

  const fileUrl = topic.proposalFileUrl;
  const isPdf = !!fileUrl && (
    fileUrl.toLowerCase().includes(".pdf") ||
    fileUrl.toLowerCase().includes("application/pdf")
  );
  // docx-preview only supports OOXML (.docx); .doc is binary OLE and cannot be rendered
  const isDocx = !!fileUrl && /\.docx$/i.test(fileUrl);
  const isDoc  = !!fileUrl && /\.doc$/i.test(fileUrl) && !isDocx;
  // Use the proxy route for all open/download links to avoid URL-encoding issues
  // with Vietnamese filenames in Next.js static serving.
  const absoluteFileUrl = useMemo(() => {
    if (!fileUrl) return "";
    if (fileUrl.startsWith("http")) return fileUrl;
    return `/api/research-file?path=${encodeURIComponent(fileUrl)}`;
  }, [fileUrl]);

  // Smart-sort NCKH tasks: tasks matching topic's year + quarter come first
  const sortedNckhTasks = useMemo(() => {
    if (!nckhTasks?.length) return [];
    const topicQ = topic.completionTimeline
      ? topic.completionTimeline.match(/Quý\s+(IV|III|II|I)\b/i)?.[1]
      : null;
    const getQ = (name: string) => name.match(/\bQ(\d)\b/i)?.[1] ?? name.match(/Quý\s+(IV|III|II|I)\b/i)?.[1] ?? null;
    return [...nckhTasks].sort((a, b) => {
      const aYear = a.deadlineBase ? new Date(a.deadlineBase).getFullYear() : 0;
      const bYear = b.deadlineBase ? new Date(b.deadlineBase).getFullYear() : 0;
      const aYearMatch = aYear === topic.year ? 0 : 1;
      const bYearMatch = bYear === topic.year ? 0 : 1;
      if (aYearMatch !== bYearMatch) return aYearMatch - bYearMatch;
      if (topicQ) {
        const aQMatch = getQ(a.name) === topicQ ? 0 : 1;
        const bQMatch = getQ(b.name) === topicQ ? 0 : 1;
        if (aQMatch !== bQMatch) return aQMatch - bQMatch;
      }
      return a.name.localeCompare(b.name);
    });
  }, [nckhTasks, topic.year, topic.completionTimeline]);

  // ── Duplicate detection — title is primary, investigator is secondary ────────
  type DupMatch = { t: ResearchTopic; titleSim: number; samePerson: boolean; reason: "title" | "title_and_person" };
  const duplicates = useMemo<DupMatch[]>(() =>
    allTopics
      .filter(t => t.id !== topic.id)
      .flatMap<DupMatch>(t => {
        const titleSim = jaccardWords(t.title ?? "", topic.title ?? "");
        const samePerson = !!topic.principalInvestigatorName &&
          norm(t.principalInvestigatorName) === norm(topic.principalInvestigatorName);
        // High title similarity alone → clear duplicate
        if (titleSim >= 0.65) return [{ t, titleSim, samePerson, reason: "title" }];
        // Moderate title similarity + same investigator → suspicious
        if (titleSim >= 0.35 && samePerson) return [{ t, titleSim, samePerson, reason: "title_and_person" }];
        // Same person with completely different title → NOT a duplicate
        return [];
      })
      .sort((a, b) => b.titleSim - a.titleSim),
  [allTopics, topic]);

  // ── Public form detection ──────────────────────────────────────────────────
  // Use explicit `source` field if present; fall back to principalInvestigatorId for legacy topics.
  const isPublicSubmission =
    topic.source === "public" ||
    (topic.source !== "internal" && topic.principalInvestigatorId === "public");

  // ── Account matching (email-first for public, name fallback for internal) ──
  const matchedUser = useMemo<{ user: typeof allUsers[number]; by: "email" | "name" } | null>(() => {
    if (isPublicSubmission) {
      const em = norm(topic.submitterEmail);
      if (em) {
        const byEmail = allUsers.find(u => norm(u.email) === em);
        if (byEmail) return { user: byEmail, by: "email" };
      }
    } else {
      const piName = norm(topic.principalInvestigatorName);
      if (piName) {
        const byName = allUsers.find(u => norm(u.name) === piName);
        if (byName) return { user: byName, by: "name" };
      }
    }
    return null;
  }, [allUsers, topic, isPublicSubmission]);

  // Already auto-claimed = topic principalInvestigatorId has been updated from "public" to the matched user
  const isAlreadyClaimed = !!(matchedUser && topic.principalInvestigatorId === matchedUser.user.id);

  // For matched-but-not-yet-claimed: check if user already has a similar topic in their account
  const similarTopicInUserAccount = useMemo<ResearchTopic | null>(() => {
    if (!matchedUser || isAlreadyClaimed) return null;
    const uid = matchedUser.user.id;
    return allTopics.find(t =>
      t.id !== topic.id &&
      (t.principalInvestigatorId === uid ||
       (t.mainPerformerId ?? "") === uid ||
       (t.memberIds ?? []).includes(uid) ||
       (t.contributors ?? []).some(c => c.userId === uid)) &&
      jaccardWords(t.title ?? "", topic.title ?? "") >= 0.6
    ) ?? null;
  }, [allTopics, matchedUser, isAlreadyClaimed, topic]);

  const [registerEmailSent,     setRegisterEmailSent]     = useState(false);
  const [registerEmailSending,  setRegisterEmailSending]  = useState(false);

  const checkedCount = Object.values(checks).filter(Boolean).length;
  const allChecked   = checkedCount === CHECKLIST.length;
  const canSubmit = verdict === "accept"
    ? allChecked && !!linkedTaskId.trim()
    : verdict !== null
    ? reason.trim().length > 0
    : false;

  function toggle(key: CheckKey) {
    setChecks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function buildLog(action: "accepted" | "revision_requested"): ResearchTopic["intakeLogs"] {
    return [
      ...(topic.intakeLogs ?? []),
      { id: generateId("ilog"), action, userId: "", userName: "", note: note || reason || "", timestamp: reviewedAt.toISOString() },
    ];
  }

  async function sendRegisterEmail() {
    if (!topic.submitterEmail || registerEmailSending || registerEmailSent) return;
    setRegisterEmailSending(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const recipientName = topic.principalInvestigatorName ?? topic.submitterName ?? "Quý tác giả";
      await fetch("/api/email/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUserId: currentUserId ?? "",
          recipients: [{ id: "", name: recipientName, email: topic.submitterEmail }],
          subject: "Tạo tài khoản để theo dõi tiến trình đề tài nghiên cứu",
          body:
            `Kính gửi ${recipientName},\n\n` +
            `Đề cương đề tài "${topic.title}" của bạn đã được ghi nhận trong hệ thống ARiHA WorkHub.\n\n` +
            `Để theo dõi tiến trình xét duyệt và nhận thông báo cập nhật, vui lòng đăng ký tài khoản tại:\n` +
            `${appUrl}/register\n\n` +
            `Khi đăng ký, hãy sử dụng cùng địa chỉ email này (${topic.submitterEmail}) để hệ thống tự động liên kết đề tài vào tài khoản của bạn.\n\n` +
            `Trân trọng,\n${currentUserName ?? "Ban tiếp nhận"}`,
        }),
      });
      setRegisterEmailSent(true);
      toast.success(`Đã gửi mail mời đăng ký tới ${topic.submitterEmail}`);
    } catch {
      toast.error("Gửi mail thất bại");
    } finally {
      setRegisterEmailSending(false);
    }
  }

  async function handleSubmit() {
    if (!verdict || !canSubmit) return;
    setSubmitting(true);
    try {
      if (verdict === "accept") {
        await onAccept(note, linkedTaskId, buildLog("accepted"), matchedUser?.user.id);
      } else if (verdict === "revise") {
        await onRevise(reason, buildLog("revision_requested"));
      } else {
        await onReject(reason, buildLog("revision_requested"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div
        className="w-full max-w-6xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col"
        style={{ height: "min(94vh, 860px)" }}
      >
        {/* ── Header ── */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white truncate">
              Kiểm tra & Tiếp nhận đề cương
              {topic.code && <span className="ml-2 text-[11px] font-mono text-slate-400">[{topic.code}]</span>}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">{topic.title}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 2-column body (2/3 + 1/3) ── */}
        <div
          className="flex-1 overflow-hidden grid divide-x divide-slate-200 dark:divide-slate-700"
          style={{ gridTemplateColumns: "2fr 1fr" }}
        >
          {/* ── LEFT 2/3: File viewer ── */}
          <div className="flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">File đề cương</p>
              {topic.proposalFileUrl && (
                <a
                  href={absoluteFileUrl || topic.proposalFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                >
                  <ExternalLink className="w-3 h-3" /> Mở tab mới
                </a>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              {fileUrl ? (
                isPdf ? (
                  <iframe src={fileUrl} className="w-full h-full border-0" title="File đề cương" />
                ) : isDoc ? (
                  /* .doc (binary OLE) cannot be rendered in browser — offer download */
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-slate-400">
                    <FileText className="w-14 h-14 opacity-30" />
                    <p className="text-sm text-slate-500 text-center">
                      File <span className="font-mono font-semibold">.doc</span> không hỗ trợ xem trước trực tiếp.
                    </p>
                    <a
                      href={absoluteFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                    >
                      <Download className="w-4 h-4" /> Tải xuống để xem
                    </a>
                    <p className="text-[11px] text-slate-400 text-center">
                      Yêu cầu tác giả nộp lại dạng <span className="font-semibold">.docx</span> hoặc <span className="font-semibold">.pdf</span> để xem trước.
                    </p>
                  </div>
                ) : (
                  <DocxViewer fileUrl={fileUrl} absoluteFileUrl={absoluteFileUrl} />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                  <FileText className="w-16 h-16 opacity-30" />
                  <p className="text-sm">Chưa có file đề cương</p>
                  <p className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> Tác giả cần nộp file trước khi tiếp nhận
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT 1/3: Two sections ── */}
          <div className="overflow-y-auto bg-white dark:bg-slate-900 flex flex-col">

            {/* ══════════ SECTION 1: THÔNG TIN ĐỀ TÀI ══════════ */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thông tin đề tài</p>
            </div>

            <div className="p-4 space-y-2.5 border-b-4 border-slate-100 dark:border-slate-800">
              {/* Title */}
              <div className="text-[11px] space-y-0.5">
                <p className="text-slate-400">Tên đề tài</p>
                <p className="font-semibold text-slate-800 dark:text-white leading-snug">{topic.title}</p>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <InfoRow label="Chủ nhiệm"    value={topic.principalInvestigatorName} bold />
                <InfoRow label="Đơn vị"        value={topic.department} />
                <InfoRow label="Lĩnh vực"      value={topic.field} />
                <InfoRow label="Năm / Quý"     value={`${topic.year}${topic.completionTimeline ? ` · ${topic.completionTimeline}` : ""}`} />
                <InfoRow label="Loại đăng ký"  value={topic.submissionType === "new" ? "Đề tài mới" : topic.submissionType === "resubmit" ? "Nộp lại" : undefined} />
                <InfoRow label="Người nộp"     value={topic.submitterName} />
                <InfoRow label="Email"          value={topic.submitterEmail} />
                <InfoRow label="SĐT"            value={topic.submitterPhone} />
              </div>

              {topic.memberNames && (
                <div className="pt-1">
                  <InfoBlock label="Thành viên" value={topic.memberNames} />
                </div>
              )}

              {topic.abstract && (
                <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 pt-1">
                  <InfoBlock label="Tóm tắt" value={topic.abstract} />
                </div>
              )}

              {topic.registrationNotes && (
                <InfoBlock label="Ghi chú đăng ký" value={topic.registrationNotes} />
              )}

              {(topic.proposedReviewers || topic.excludedReviewers) && (
                <div className="space-y-1.5 pt-0.5">
                  {topic.proposedReviewers  && <InfoBlock label="PB đề xuất" value={topic.proposedReviewers} />}
                  {topic.excludedReviewers  && <InfoBlock label="PB tránh"   value={topic.excludedReviewers} />}
                </div>
              )}

              {receiverName && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                  <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-slate-400">Người tiếp nhận:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{receiverName}</span>
                </div>
              )}

              {(topic.intakeRevisionCount ?? 0) > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Đã yêu cầu chỉnh sửa {topic.intakeRevisionCount} lần
                    {topic.intakeNote && `: ${topic.intakeNote}`}
                  </p>
                </div>
              )}
            </div>

            {/* ══════════ SECTION 1.5: PHÂN TÍCH TỰ ĐỘNG ══════════ */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Phân tích tự động
              </p>
            </div>

            <div className="p-4 space-y-3 border-b-4 border-slate-100 dark:border-slate-800">
              {/* Trùng lặp */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Trùng lặp đề tài</p>
                {duplicates.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">Không phát hiện đề tài trùng lặp</span>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                        Phát hiện {duplicates.length} đề tài có thể trùng
                      </span>
                    </div>
                    <div className="space-y-2">
                      {duplicates.map(({ t: d, titleSim, samePerson, reason }) => (
                        <div key={d.id} className="text-[10px] pl-2 border-l-2 border-red-300 dark:border-red-700 space-y-0.5">
                          <p className="font-medium text-red-700 dark:text-red-300 leading-snug line-clamp-2">{d.title}</p>
                          <p className="text-red-400 dark:text-red-500">
                            {d.principalInvestigatorName} · {d.year}
                            {d.intakeStatus ? ` · ${INTAKE_STATUS_LABEL[d.intakeStatus] ?? d.intakeStatus}` : ""}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold">
                              Tên đề tài {Math.round(titleSim * 100)}% tương đồng
                            </span>
                            {reason === "title_and_person" && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                + trùng chủ nhiệm
                              </span>
                            )}
                            {reason === "title" && samePerson && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                + trùng chủ nhiệm
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-red-500 italic">Nên xem xét kỹ trước khi tiếp nhận hoặc từ chối</p>
                  </div>
                )}
              </div>

              {/* Tài khoản */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Tài khoản hệ thống</p>
                  <span className={cn(
                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                    isPublicSubmission
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500",
                  )}>
                    {isPublicSubmission ? "Form public" : "Nội bộ"}
                  </span>
                </div>

                {!isPublicSubmission ? (
                  /* Internal submission — PI already owns the account */
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Đăng ký qua tài khoản nội bộ — tác giả tự quản lý đề tài
                    </span>
                  </div>
                ) : matchedUser && isAlreadyClaimed ? (
                  /* Case A: public form, email found, topic already auto-claimed */
                  <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        Đề tài đã tự động liên kết vào tài khoản tác giả
                      </span>
                    </div>
                    <div className="pl-1 space-y-0.5">
                      <p className="text-[11px] font-medium text-blue-800 dark:text-blue-200">{matchedUser.user.name}</p>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400">{matchedUser.user.email}</p>
                      {matchedUser.user.department && (
                        <p className="text-[10px] text-blue-400 dark:text-blue-500">{matchedUser.user.department}</p>
                      )}
                    </div>
                    <p className="text-[10px] text-blue-500 dark:text-blue-400 italic">
                      Tác giả đã có thể theo dõi đề tài trong tài khoản của họ
                    </p>
                  </div>
                ) : matchedUser && similarTopicInUserAccount ? (
                  /* Case B: public form, email found, not claimed, but user has similar title → potential duplicate */
                  <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Tài khoản tìm thấy — có thể đã đăng ký từ form nội bộ
                      </span>
                    </div>
                    <div className="pl-1 space-y-0.5">
                      <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">{matchedUser.user.name}</p>
                      <p className="text-[10px] text-amber-500">{matchedUser.user.email}</p>
                    </div>
                    <div className="text-[10px] border-l-2 border-amber-300 dark:border-amber-700 pl-2 space-y-0.5">
                      <p className="text-amber-600 dark:text-amber-400 font-medium">Đề tài tương tự trong tài khoản:</p>
                      <p className="text-amber-700 dark:text-amber-300 leading-snug line-clamp-2">{similarTopicInUserAccount.title}</p>
                    </div>
                    <p className="text-[10px] text-amber-500 italic">
                      Kiểm tra xem đây có phải cùng một đề tài không trước khi tiếp nhận
                    </p>
                  </div>
                ) : matchedUser ? (
                  /* Case C: public form, email found, not claimed, no similar title → will auto-link on accept */
                  <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        Tài khoản tìm thấy — đề tài chưa liên kết
                      </span>
                    </div>
                    <div className="pl-1 space-y-0.5">
                      <p className="text-[11px] font-medium text-blue-800 dark:text-blue-200">{matchedUser.user.name}</p>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400">{matchedUser.user.email}</p>
                      {matchedUser.user.department && (
                        <p className="text-[10px] text-blue-400 dark:text-blue-500">{matchedUser.user.department}</p>
                      )}
                    </div>
                    <p className="text-[10px] text-blue-500 dark:text-blue-400 italic">
                      Khi tiếp nhận, hệ thống sẽ tự động thêm đề tài vào tài khoản tác giả
                    </p>
                  </div>
                ) : (
                  /* Case D: public form, email NOT found → no account */
                  <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Tác giả chưa có tài khoản trong hệ thống
                      </span>
                    </div>
                    {topic.submitterEmail && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        Email: <span className="font-mono font-medium">{topic.submitterEmail}</span>
                      </p>
                    )}
                    <p className="text-[10px] text-amber-500 italic">
                      Tác giả cần tạo tài khoản để theo dõi tiến trình xét duyệt đề tài
                    </p>
                    {topic.submitterEmail ? (
                      <button
                        type="button"
                        disabled={registerEmailSending || registerEmailSent}
                        onClick={sendRegisterEmail}
                        className={cn(
                          "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition",
                          registerEmailSent
                            ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 cursor-default"
                            : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/40",
                        )}
                      >
                        {registerEmailSent ? (
                          <><Check className="w-3 h-3" /> Đã gửi mail mời đăng ký</>
                        ) : registerEmailSending ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Đang gửi...</>
                        ) : (
                          <><MailPlus className="w-3.5 h-3.5" /> Gửi mail mời tạo tài khoản</>
                        )}
                      </button>
                    ) : (
                      <p className="text-[10px] text-amber-500 italic">Không có email — không thể gửi thư mời</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ══════════ SECTION 2: KẾT QUẢ KIỂM TRA ══════════ */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kết quả kiểm tra</p>
            </div>

            <div className="p-4 space-y-4 flex-1">

              {/* Ngày giờ kiểm tra */}
              <div className="flex items-center justify-between text-[11px] px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                <span className="text-slate-400">Ngày &amp; giờ kiểm tra</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{reviewedAtDisplay}</span>
              </div>

              {/* ── Phân loại nhiệm vụ (only for no-task topics) ── */}
              {isNoTask && (
                <div className="px-3 py-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Phân loại nhiệm vụ
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Đề cương chưa liên kết nhiệm vụ. Gán vào nhiệm vụ NCKH cơ sở:
                  </p>
                  {sortedNckhTasks.length > 0 ? (
                    <select
                      value={linkedTaskId}
                      onChange={e => setLinkedTaskId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">— Chọn nhiệm vụ —</option>
                      {sortedNckhTasks.map(t => {
                        const tYear = t.deadlineBase ? new Date(t.deadlineBase).getFullYear() : null;
                        return (
                          <option key={t.id} value={t.id}>
                            {tYear === topic.year ? "★ " : ""}{t.name}{tYear ? ` (${tYear})` : ""}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <input
                      value={linkedTaskId}
                      onChange={e => setLinkedTaskId(e.target.value)}
                      placeholder="ID nhiệm vụ NCKH..."
                      className="w-full px-2.5 py-1.5 text-xs border border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  )}
                  {linkedTaskId && linkedTaskId !== taskId && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      → {sortedNckhTasks.find(t => t.id === linkedTaskId)?.name ?? linkedTaskId}
                    </p>
                  )}
                  {taskName && linkedTaskId === taskId && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">→ {taskName}</p>
                  )}
                </div>
              )}

              {/* ── Checklist ── */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Tiêu chí tiếp nhận ({checkedCount}/{CHECKLIST.length})
                </p>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mb-3">
                  <div
                    className="h-1.5 bg-teal-500 rounded-full transition-all"
                    style={{ width: `${(checkedCount / CHECKLIST.length) * 100}%` }}
                  />
                </div>
                <div className="space-y-1.5">
                  {CHECKLIST.map(item => {
                    const checked = checks[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggle(item.key)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition",
                          checked
                            ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition",
                          checked ? "bg-teal-500 border-teal-500" : "border-slate-300 dark:border-slate-600",
                        )}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={cn("text-[11px] leading-tight", checked ? "text-teal-700 dark:text-teal-300 font-medium" : "text-slate-600 dark:text-slate-300")}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nhận xét */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nhận xét</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú của người tiếp nhận..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* Quyết định */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quyết định</p>
                <div className="space-y-1">
                  {([
                    ["accept", "Tiếp nhận",          "border-teal-400 bg-teal-50 dark:bg-teal-900/20",   "text-teal-700 dark:text-teal-300",  "bg-teal-500"],
                    ["revise", "Yêu cầu chỉnh sửa",  "border-amber-400 bg-amber-50 dark:bg-amber-900/20","text-amber-700 dark:text-amber-300", "bg-amber-500"],
                    ["reject", "Từ chối",             "border-red-400 bg-red-50 dark:bg-red-900/20",      "text-red-600 dark:text-red-400",    "bg-red-500"],
                  ] as const).map(([v, label, activeCls, textCls, dotCls]) => (
                    <label
                      key={v}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition",
                        verdict === v ? activeCls : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                      )}
                    >
                      <input type="radio" name="verdict" checked={verdict === v} onChange={() => setVerdict(v)} className="sr-only" />
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                        verdict === v ? "border-current" : "border-slate-300 dark:border-slate-600",
                      )}>
                        {verdict === v && <div className={cn("w-1.5 h-1.5 rounded-full", dotCls)} />}
                      </div>
                      <span className={cn("text-xs font-semibold", verdict === v ? textCls : "text-slate-600 dark:text-slate-300")}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>

                {(verdict === "revise" || verdict === "reject") && (
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder={verdict === "revise" ? "Nội dung cần chỉnh sửa..." : "Lý do từ chối..."}
                    className="w-full mt-2 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  />
                )}
              </div>
            </div>

            {/* ── Footer sticky at bottom ── */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 space-y-2">
              {verdict === "accept" && !allChecked && (
                <p className="text-[11px] text-amber-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Tích đủ {CHECKLIST.length} tiêu chí
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Huỷ
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold rounded-xl text-white transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed",
                    verdict === "accept" ? "bg-teal-600 hover:bg-teal-700"
                    : verdict === "revise" ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-red-600 hover:bg-red-700",
                  )}
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {verdict === "accept" ? "Tiếp nhận"
                  : verdict === "revise" ? "Gửi chỉnh sửa"
                  : verdict === "reject" ? "Từ chối"
                  : "Gửi kết quả"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
