"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Microscope, ArrowLeft, Loader2, CheckCircle2, Circle, XCircle, Clock,
  Users, FileText, Gavel, Award, ShieldCheck, UserCheck, Plus, X,
  BookOpen, FlaskConical, Eye, EyeOff, AlertTriangle, RotateCcw, ListChecks, Pencil, Upload, Lock,
} from "lucide-react";
import Link from "next/link";
import { cn, generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission, canDoResearchAction, canUserAssignReviewer, getEffectiveRole, ROLE_RANK } from "@/lib/rbac/permissions";
import { sameUnit } from "@/lib/rbac/scope";
import { isNckhManager } from "@/lib/researchUtils";
import {
  getResearchTopic, updateResearchTopic, addNotification,
  getResearchGroups, createResearchGroup, updateResearchGroup,
  generateResearchTask, updateTask,
} from "@/lib/firebase/firestore";
import { ReviewFormPanel } from "@/components/research/ReviewFormPanel";
import { AssignReviewerModal } from "@/components/research/AssignReviewerModal";
import { DocxAnnotator } from "@/components/research/DocxAnnotator";
import { PendingChangeRequestPanel } from "@/components/shared/PendingChangeRequestPanel";
import {
  RESEARCH_STEPS, STAGE_LABEL, researchProgress, stepMeta, researchTaskSync,
  isProposalFileLocked, isFinalReportFileLocked, TASK_ONLY_STEP_KEYS,
  activeReviews, submittedReviewCount, isAwaitingRevisionResubmit, isAwaitingRevisionProcessing,
  reviewersToResendForReconfirm,
} from "@/lib/research";
import type {
  ResearchTopic, ResearchStage, ResearchStepStatus, ResearchStepKey, ResearchGroup,
  ResearchReview, ResearchCouncilSession, ResearchCouncilMember, CouncilMemberRole,
  ResearchContributor, TaskResource,
} from "@/types";
import { toast } from "sonner";

const STEP_ICON: Record<ResearchStepStatus, React.ReactNode> = {
  passed:      <CheckCircle2 className="w-4 h-4 text-green-500" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  failed:      <XCircle className="w-4 h-4 text-red-500" />,
  pending:     <Circle className="w-4 h-4 text-slate-300" />,
};

const STAGES: ResearchStage[] = ["init", "proposal", "executing", "recognition"];

const COUNCIL_ROLE_LABEL: Record<CouncilMemberRole, string> = {
  chair: "Chủ tịch", member: "Thành viên", secretary: "Thư ký",
};
const COUNCIL_ROLE_COLOR: Record<CouncilMemberRole, string> = {
  chair:     "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  member:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  secretary: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const CONTRIBUTOR_ROLE_LABEL: Record<string, string> = {
  author: "Tác giả", coAuthor: "Đồng tác giả", participant: "Tham gia",
};
const CONTRIBUTOR_ROLE_COLOR: Record<string, string> = {
  author:      "text-violet-600 dark:text-violet-400 font-semibold",
  coAuthor:    "text-blue-600 dark:text-blue-400",
  participant: "text-slate-500 dark:text-slate-400",
};

const REVIEW_VERDICT_LABEL: Record<string, string> = {
  pass: "ĐẠT", pass_if_revised: "ĐẠT (nếu chỉnh sửa)", fail: "KHÔNG ĐẠT",
};
const REVIEW_GRADE_LABEL: Record<string, string> = {
  excellent: "Giỏi", good: "Khá", average: "Trung bình", fail: "Không đạt",
};

const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("vi-VN") : undefined;

/**
 * Kết quả thực tế gắn với 1 bước đã hoàn thành trong timeline — hiển thị thay cho gạch ngang, để
 * người xem thấy ngay dữ liệu thật (ngày tiếp nhận, kết luận phản biện, ngày biên bản, số chứng
 * nhận...) thay vì chỉ biết bước đó "đã xong". Trả về null nếu không có dữ liệu thật để hiện.
 */
function stepResultDetail(topic: ResearchTopic, key: ResearchStepKey, stepCompletedAt?: string): string | null {
  switch (key) {
    case "p_intake":
    case "r_intake": {
      // intakeLogs không được ghi bởi luồng hiện tại (field còn để đó từ trước, không có nơi nào
      // push vào) — dùng completedAt của chính bước này (luôn được ghi khi advanceStep chạy) để
      // không lấy nhầm ngày của giai đoạn khác khi intakeLogs chỉ có 1 mục cũ.
      const date = fmtDate(stepCompletedAt);
      return date ? `Ngày tiếp nhận: ${date}` : null;
    }
    case "p_review":
    case "r_review": {
      const stage = key === "p_review" ? "proposal" : "recognition";
      const parts = topic.reviews
        .filter(r => r.stage === stage && r.status === "submitted")
        .map((r, i) => `PB${i + 1}: ${r.verdict ? (REVIEW_VERDICT_LABEL[r.verdict] ?? "—") : "—"}`);
      return parts.length ? parts.join(" · ") : null;
    }
    case "p_council":
    case "r_council": {
      const stage = key === "p_council" ? "proposal" : "recognition";
      const cs = topic.councilSessions.find(s => s.stage === stage);
      if (!cs) return null;
      const decisionLabel =
        cs.decision === "passed" ? "Thông qua" :
        cs.decision === "failed" ? "Không thông qua" :
        cs.decision === "revise" ? "Yêu cầu sửa đổi" : undefined;
      const date = fmtDate(cs.scheduledAt ?? cs.createdAt);
      const parts = [decisionLabel, date].filter((v): v is string => !!v);
      return parts.length ? parts.join(" · ") : null;
    }
    case "p_ethics": {
      const cert = topic.certificates.find(c => c.type === "ethics");
      if (!cert) return null;
      if (cert.number) return `Số: ${cert.number}`;
      const date = fmtDate(cert.issuedAt);
      return date ? `Cấp ngày: ${date}` : "Đã cấp";
    }
    case "r_recognize": {
      const cert = topic.certificates.find(c => c.type === "recognition");
      if (!cert) return null;
      if (cert.scope) return `Phạm vi: ${cert.scope}`;
      if (cert.number) return `Số: ${cert.number}`;
      const date = fmtDate(cert.issuedAt);
      return date ? `Cấp ngày: ${date}` : "Đã công nhận";
    }
    default: {
      const date = fmtDate(stepCompletedAt);
      return date ? `Ngày: ${date}` : null;
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function advanceStep(
  topic: ResearchTopic,
  passKey: string,
  nextKey: string | null,
  newStage?: ResearchTopic["stage"]
): Partial<ResearchTopic> {
  const stamp = new Date().toISOString();
  const steps = topic.steps.map(s =>
    s.key === passKey ? { ...s, status: "passed" as const, completedAt: stamp }
    : nextKey && s.key === nextKey ? { ...s, status: "in_progress" as const }
    : s
  );
  return {
    steps,
    currentStep: (nextKey ?? topic.currentStep) as ResearchTopic["currentStep"],
    ...(newStage ? { stage: newStage } : {}),
  };
}

/**
 * Báo cho người phụ trách chỉ định phản biện + Quản lý NCKH biết tác giả đã nộp lại bản chỉnh
 * sửa, để họ vào tab "Nghiên cứu KH" xử lý tiếp (tiếp nhận/chuyển bước) — không phải chờ họ tự
 * phát hiện qua badge trạng thái.
 */
async function notifyResubmission(
  topic: ResearchTopic,
  users: { id: string; researchDesignations?: string[]; role?: string }[],
  excludeUserId: string | undefined,
  stageLabel: string,
) {
  const stamp = new Date().toISOString();
  const targets = new Set<string>();
  if (topic.reviewAssignment?.delegatedTo) targets.add(topic.reviewAssignment.delegatedTo);
  for (const u of users) {
    if (u.role === "hrAdmin" || (u.researchDesignations ?? []).includes("researchManager")) targets.add(u.id);
  }
  targets.delete(excludeUserId ?? "");
  await Promise.all([...targets].map(uid =>
    addNotification({
      userId: uid, type: "approval_request", title: `${stageLabel} — đã nộp lại`,
      body: `Đề tài "${topic.title}" đã được nộp lại sau yêu cầu sửa đổi — cần xử lý tiếp.`,
      link: `/research/${topic.id}`, read: false, priority: "normal", createdAt: stamp,
    }).catch(() => {})
  ));
}

/**
 * Gửi phiếu xác nhận rút gọn (mode "confirm") cho đúng (các) phản biện cần xem lại bản chỉnh
 * sửa — dùng chung cho cả lượt xác nhận đầu tiên (người phụ trách bấm) lẫn các lượt lặp lại tự
 * động sau đó (tác giả nộp lại khi vòng lặp đang chạy). Có thông báo cho từng phản biện.
 */
async function sendReconfirmReviews(
  topicId: string,
  stage: "proposal" | "recognition",
  priorReviews: ResearchReview[],
  topicTitle: string,
) {
  const stamp = new Date().toISOString();
  for (const r of priorReviews) {
    await fetch(`/api/research/${topicId}/reviews`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage, mode: "confirm",
        reviewerType: r.reviewerType, reviewerId: r.reviewerId, reviewerName: r.reviewerName,
        reviewerEmail: r.reviewerEmail, reviewerOrg: r.reviewerOrg,
      }),
    }).catch(() => {});
    if (r.reviewerId) {
      await addNotification({
        userId: r.reviewerId, type: "approval_request", title: "Cần xác nhận bản chỉnh sửa",
        body: `Đề tài "${topicTitle}" đã nộp lại theo yêu cầu của bạn — vui lòng xác nhận Đồng ý/Không đồng ý.`,
        link: `/research/${topicId}`, read: false, priority: "normal", createdAt: stamp,
      }).catch(() => {});
    }
  }
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ResearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();

  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [groups, setGroups] = useState<ResearchGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"process" | "proposal" | "topic">("process");

  // Quyền quản lý toàn bộ quy trình (tiếp nhận, chuyển bước, từ chối...)
  // director/hrAdmin: luôn true; teamLead: chỉ true nếu đề tài thuộc đơn vị mình.
  // KHÔNG chỉ dựa vào permission "research:manage" đơn thuần — một số tổ chức đã cấp permission
  // này rộng cho cả vai trò "staff" qua cấu hình phân quyền chung, khiến chính tác giả (nếu vai
  // trò của họ có permission đó) thấy nhầm các nút hành động quản lý (vd. "Đã tiếp nhận kết quả")
  // ngay trên đề tài của chính mình. Chỉ coi là quản lý thật khi có cấp bậc quản lý thực sự
  // (teamLead trở lên) HOẶC được chỉ định "Quản lý NCKH" rõ ràng.
  const canManage = !!currentUser && (
    isNckhManager(currentUser) ||
    (ROLE_RANK[getEffectiveRole(currentUser)] >= ROLE_RANK.teamLead &&
      canDoResearchAction(currentUser, "research:manage", topic?.department))
  );
  // Quyền chỉ định phản biện — chỉ Trưởng VP (Văn phòng) hoặc Director/hrAdmin
  const canAssignReviewer = !!currentUser && canUserAssignReviewer(currentUser, topic?.department);
  // Quyền thành lập hội đồng — scoped theo đơn vị
  const canAssignCouncil = !!currentUser && canDoResearchAction(currentUser, "research:assignCouncil", topic?.department);
  // Quyền thêm tác giả/thành viên — scoped theo đơn vị
  const canAddContributor = !!currentUser && canDoResearchAction(currentUser, "research:addContributor", topic?.department);
  const isPI = topic?.principalInvestigatorId === currentUser?.id;
  const isPerformer = topic?.mainPerformerId === currentUser?.id;

  const reload = useCallback(() => {
    getResearchTopic(id).then(setTopic).catch(() => toast.error("Không tải được đề tài"));
  }, [id]);

  useEffect(() => {
    Promise.all([
      getResearchTopic(id),
      getResearchGroups(),
    ]).then(([t, g]) => {
      setTopic(t);
      setGroups(g);
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleUpdate(updates: Partial<ResearchTopic>, successMsg: string) {
    if (!topic) return;
    try {
      const res = await updateResearchTopic(topic.id, updates);
      if (res?.pending) {
        toast.success("Đã gửi yêu cầu sửa — chờ trưởng nhóm cùng đơn vị duyệt");
        reload();
        return;
      }
      const merged = { ...topic, ...updates };
      setTopic(merged);
      toast.success(successMsg);
      // Đồng bộ tiến độ/ trạng thái sang Task liên kết (heatmap/risk-flag/Hiệu suất)
      if (merged.executionTaskId && (updates.steps || updates.stage)) {
        updateTask(merged.executionTaskId, researchTaskSync(merged)).catch(() => {});
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Thao tác thất bại"); }
  }

  // Yêu cầu sửa đổi — GĐ1 reset về p_compile; GĐ2 reset về r_intake. Giữ lịch sử reviews.
  async function handleRevise(note: string) {
    if (!topic) return;
    const stamp = new Date().toISOString();
    const isRecognition = topic.currentStep.startsWith("r_") || topic.stage === "recognition";
    const resetTo = isRecognition ? "r_intake" : "p_compile";
    const LOOP_KEYS = isRecognition
      ? ["r_intake", "r_review", "r_council", "r_recognize"]
      : ["p_compile", "p_assign", "p_review", "p_council", "p_ethics", "p_agree"];
    const steps = topic.steps.map(s =>
      s.key === resetTo ? { ...s, status: "in_progress" as const, completedAt: undefined }
      : LOOP_KEYS.includes(s.key) ? { ...s, status: "pending" as const, completedAt: undefined }
      : s
    );
    const updates: Partial<ResearchTopic> = {
      steps,
      currentStep: resetTo,
      revisionNote: note || undefined,
      revisionCount: (topic.revisionCount ?? 0) + 1,
      revisionResubmittedAt: null,
    };
    try {
      await updateResearchTopic(topic.id, updates);
      setTopic(prev => prev ? { ...prev, ...updates } : prev);
      // Đồng bộ task liên kết (tiến độ tụt lại sau khi reset)
      if (topic.executionTaskId) {
        updateTask(topic.executionTaskId, researchTaskSync({ ...topic, ...updates })).catch(() => {});
      }
      const piId = topic.principalInvestigatorId;
      const notifyTargets = [piId, topic.mainPerformerId].filter(Boolean) as string[];
      await Promise.all([...new Set(notifyTargets)].filter(uid => uid !== currentUser?.id).map(uid =>
        addNotification({
          userId: uid, type: "approval_request",
          title: isRecognition ? "Kết quả yêu cầu sửa đổi" : "Đề cương yêu cầu sửa đổi",
          body: `Đề tài "${topic.title}" cần chỉnh sửa ${isRecognition ? "kết quả nghiên cứu" : "đề cương"}.${note ? ` Ghi chú: ${note}` : ""}`,
          link: `/research/${topic.id}`, read: false, priority: "urgent", createdAt: stamp,
        }).catch(() => {})
      ));
      toast.success(`Đã yêu cầu sửa đổi (lần ${updates.revisionCount}) — ${isRecognition ? "cần nộp lại kết quả" : "PI cần nộp lại đề cương"}`);
    } catch { toast.error("Thao tác thất bại"); }
  }

  // Từ chối đề tài
  async function handleReject(reason: string) {
    if (!topic) return;
    const stamp = new Date().toISOString();
    const updates: Partial<ResearchTopic> = { stage: "rejected", rejectionReason: reason || undefined };
    try {
      await updateResearchTopic(topic.id, updates);
      setTopic(prev => prev ? { ...prev, ...updates } : prev);
      const notifyIds = [topic.principalInvestigatorId, topic.mainPerformerId].filter(Boolean) as string[];
      await Promise.all(notifyIds.filter(uid => uid !== currentUser?.id).map(uid =>
        addNotification({
          userId: uid, type: "approval_request",
          title: "Đề tài bị từ chối",
          body: `Đề tài "${topic.title}" đã bị từ chối.${reason ? ` Lý do: ${reason}` : ""}`,
          link: `/research/${topic.id}`, read: false, priority: "urgent", createdAt: stamp,
        }).catch(() => {})
      ));
      setShowRejectModal(false);
      toast.success("Đã từ chối đề tài");
    } catch { toast.error("Thao tác thất bại"); }
  }

  // GĐ0: Quản lý phê duyệt task → thông báo nhân viên → vào GĐ1 (Tiếp nhận)
  async function handleApproveTask() {
    if (!topic) return;
    setApproving(true);
    const stamp = new Date().toISOString();
    const steps = topic.steps.map(s =>
      s.key === "approve_task" ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "notify" ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "p_intake" ? { ...s, status: "in_progress" as const }
      : s
    );
    const updates: Partial<ResearchTopic> = {
      approvedToExecute: true,
      stage: "proposal",
      currentStep: "p_intake",
      steps,
    };
    try {
      await updateResearchTopic(topic.id, updates);
      if (topic.createdBy && topic.createdBy !== currentUser?.id) {
        await addNotification({
          userId: topic.createdBy, type: "request_approved",
          title: "Đề tài đã được duyệt",
          body: `Đề tài "${topic.title}" đã được duyệt — bắt đầu Giai đoạn 1 (thẩm định đề cương).`,
          link: `/research/${topic.id}`, read: false, priority: "normal",
          createdAt: stamp,
        }).catch(() => {});
      }
      setTopic({ ...topic, ...updates });
      toast.success("Đã phê duyệt & thông báo nhân viên — vào Giai đoạn 1");
    } catch { toast.error("Thao tác thất bại"); }
    finally { setApproving(false); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>;
  if (!topic) return <div className="text-center py-20 text-slate-400">Không tìm thấy đề tài.</div>;

  const pi = users.find(u => u.id === topic.principalInvestigatorId);
  const performer = users.find(u => u.id === topic.mainPerformerId);
  const supervisor = users.find(u => u.id === topic.supervisorId);
  const pct = researchProgress(topic);
  const stepStatus = (key: string) => topic.steps.find(s => s.key === key)?.status ?? "pending";

  const canReviewChangeRequest =
    canManage || (currentUser?.role === "teamLead" && sameUnit(topic.department, currentUser.department));
  const isChangeRequester = topic.pendingChangeRequest?.requestedByUserId === currentUser?.id;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => router.push("/research")} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Danh sách đề tài
      </button>

      <PendingChangeRequestPanel
        currentRecord={topic as unknown as Record<string, unknown>}
        pendingChangeRequest={topic.pendingChangeRequest}
        canReview={canReviewChangeRequest}
        isRequester={isChangeRequester}
        approveUrl={`/api/research/${topic.id}/approve-change-request`}
        rejectUrl={`/api/research/${topic.id}/reject-change-request`}
        onChanged={reload}
      />

      {/* Header */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Microscope className="w-6 h-6 text-violet-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {topic.code && <span className="text-xs font-mono text-slate-400">{topic.code}</span>}
            <h1 className="text-lg font-bold text-[var(--foreground)] leading-tight">{topic.title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Chủ nhiệm: <strong>{pi?.name ?? "—"}</strong>
              {topic.field && ` · ${topic.field}`} · Năm {topic.year}
              {topic.department && ` · ${topic.department}`}
            </p>
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
              <UserCheck className="w-3.5 h-3.5" /> Thực hiện chính: <strong>{performer?.name ?? "chưa phân công"}</strong>
              {supervisor && <> · Giám sát: <strong>{supervisor.name}</strong></>}
              {topic.groupName && <> · Nhóm: <strong>{topic.groupName}</strong></>}
            </p>
            {topic.abstract && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 italic">{topic.abstract}</p>}
            {topic.contributors && topic.contributors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {topic.contributors.map((c, i) => (
                  <span key={i} className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60">
                    <span className={CONTRIBUTOR_ROLE_COLOR[c.role]}>{CONTRIBUTOR_ROLE_LABEL[c.role]}</span>
                    {c.academicTitle && <span className="text-slate-400 text-[10px]">{c.academicTitle}</span>}
                    <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            {STAGE_LABEL[topic.stage]}
          </span>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Tiến độ tổng</span><span className="font-semibold">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {topic.executionTaskId && (
            <Link href={`/tasks/${topic.executionTaskId}`}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
              <ListChecks className="w-3.5 h-3.5" /> Nhiệm vụ thực thi liên kết — theo dõi tiến độ & đánh giá 3T
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: "process",  label: "Quy trình" },
          { key: "proposal", label: "Đề cương" },
          { key: "topic",    label: "Đề tài" },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition",
              activeTab === t.key
                ? "border-violet-600 text-violet-600 dark:text-violet-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-[var(--foreground)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "proposal" && (
        <ProposalTab
          topic={topic}
          canEdit={canManage || isPI || isPerformer}
          canManage={canManage}
          onUpdate={handleUpdate}
          onReload={reload}
        />
      )}

      {activeTab === "topic" && (
        <FinalTopicTab
          topic={topic}
          canEdit={canManage || isPI || isPerformer}
          canManage={canManage}
          onUpdate={handleUpdate}
          onReload={reload}
        />
      )}

      {activeTab === "process" && (
      <>
      {/* GĐ0 action panel */}
      {topic.stage === "init" && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Quản lý phê duyệt task
          </h2>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-300 flex-1 min-w-[200px]">
                Duyệt đề tài để chuyển sang Giai đoạn 1. Nhân viên tạo đề tài sẽ được thông báo.
                Việc gán <strong>người thực hiện chính / giám sát theo nhóm</strong> sẽ làm ở bước "Phê duyệt thực hiện" trong GĐ1.
              </p>
              <button onClick={handleApproveTask} disabled={approving}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
                {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Phê duyệt & thông báo
              </button>
            </div>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">Đề tài đang chờ quản lý (HR/Admin hoặc Giám đốc) phê duyệt.</p>
          )}
        </div>
      )}

      {/* GĐ1 action panel */}
      {/* Rejected banner */}
      {topic.stage === "rejected" && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-700 rounded-2xl p-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Đề tài đã bị từ chối</p>
            {topic.rejectionReason && (
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">Lý do: {topic.rejectionReason}</p>
            )}
          </div>
        </div>
      )}

      {topic.stage === "proposal" && (
        <GD1ActionPanel
          topic={topic}
          currentUser={currentUser}
          users={users}
          groups={groups}
          canManage={canManage}
          canAssignReviewer={canAssignReviewer}
          canAssignCouncil={canAssignCouncil}
          isPI={isPI}
          isPerformer={isPerformer}
          onUpdate={handleUpdate}
          onReload={reload}
          onGroupCreated={g => setGroups(prev => [g, ...prev])}
          onRevise={handleRevise}
          onReject={handleReject}
        />
      )}

      {/* Giai đoạn Triển khai */}
      {topic.stage === "executing" && (
        <ExecutingPanel
          topic={topic}
          canManage={canManage}
          isPI={isPI}
          isPerformer={isPerformer}
          onUpdate={handleUpdate}
        />
      )}

      {/* GĐ2 action panel */}
      {topic.stage === "recognition" && (
        <GD2ActionPanel
          topic={topic}
          currentUser={currentUser}
          users={users}
          groups={groups}
          canManage={canManage}
          canAssignReviewer={canAssignReviewer}
          canAssignCouncil={canAssignCouncil}
          isPI={isPI}
          isPerformer={isPerformer}
          onUpdate={handleUpdate}
          onReload={reload}
          onGroupCreated={g => setGroups(prev => [g, ...prev])}
          onRevise={handleRevise}
          onReject={handleReject}
        />
      )}

      {/* Completed banner */}
      {topic.stage === "completed" && (
        <div className="bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-700 rounded-2xl p-5 flex gap-3">
          <Award className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Đề tài đã được công nhận & hoàn tất</p>
            {topic.certificates.find(c => c.type === "recognition")?.scope && (
              <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                Phạm vi ảnh hưởng: {topic.certificates.find(c => c.type === "recognition")?.scope}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pipeline tracker */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Tiến trình thẩm định & công nhận</h2>
        {(() => {
          // Phản biện chỉ cần thấy các mốc thẩm định, không cần biết chi tiết vận hành/nhiệm vụ nội
          // bộ đề tài (Tổng hợp đề cương, Phê duyệt & gán người...) — áp dụng ngay cả khi họ đồng
          // thời có quyền quản lý (nhất quán với nguyên tắc ẩn danh tính tác giả: đã là phản biện
          // của đề tài này thì không còn "quản lý thuần" cho riêng đề tài đó). Tác giả/thực hiện
          // chính (không thể đồng thời là phản biện của chính đề tài mình) vẫn luôn thấy đầy đủ.
          const viewerIsReviewerOnly =
            !isPI && !isPerformer &&
            topic.reviews.some(r => r.reviewerId === currentUser?.id);
          return (
        <div className="space-y-4">
          {STAGES.map(stage => {
            const steps = RESEARCH_STEPS.filter(s =>
              s.stage === stage && (!viewerIsReviewerOnly || !TASK_ONLY_STEP_KEYS.has(s.key)));
            return (
              <div key={stage}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{STAGE_LABEL[stage]}</p>
                <div className="space-y-1.5 pl-1">
                  {steps.map(s => {
                    const st = stepStatus(s.key);
                    const isCurrent = topic.currentStep === s.key;
                    const completedAt = topic.steps.find(s2 => s2.key === s.key)?.completedAt;
                    const detail = st === "passed" ? stepResultDetail(topic, s.key, completedAt) : null;
                    return (
                      <div key={s.key} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg",
                        isCurrent ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" : "")}>
                        {STEP_ICON[st]}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-[var(--foreground)]">{s.label}</span>
                          {detail && <p className="text-[11px] text-slate-400 truncate">{detail}</p>}
                        </div>
                        {s.needsTwoReviews && (
                          <span className="text-[10px] text-slate-400">
                            {submittedReviewCount(topic, s.stage as "proposal" | "recognition")}/2
                          </span>
                        )}
                        {isCurrent && <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">Hiện tại</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
          );
        })()}
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Users className="w-4 h-4" />, label: "Phản biện kín", count: topic.reviews.length },
          { icon: <Gavel className="w-4 h-4" />, label: "Hội đồng KHCN", count: topic.councilSessions.length },
          { icon: <Award className="w-4 h-4" />, label: "Chứng nhận", count: topic.certificates.length },
          { icon: <FileText className="w-4 h-4" />, label: "Tài liệu", count: topic.documents.length },
        ].map((s, i) => (
          <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="flex justify-center text-violet-500 mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-[var(--foreground)]">{s.count}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}

// ─── Executing Panel ─────────────────────────────────────────────────────────

function ExecutingPanel({ topic, canManage, isPI, isPerformer, onUpdate }: {
  topic: ResearchTopic;
  canManage: boolean;
  isPI: boolean;
  isPerformer: boolean;
  onUpdate: (updates: Partial<ResearchTopic>, msg: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [midtermNote, setMidtermNote] = useState("");
  const [showMidterm, setShowMidterm] = useState(false);
  const canAct = canManage || isPI || isPerformer;

  const execSteps = ["exec_start", "exec_midterm", "exec_submit"] as const;
  const stepStatus = (key: string) => topic.steps.find(s => s.key === key)?.status ?? "pending";

  async function handleAdvanceExec(passKey: string, nextKey: string | null, newStage?: ResearchTopic["stage"]) {
    setSaving(true);
    await onUpdate(advanceStep(topic, passKey, nextKey, newStage),
      nextKey === "r_intake"
        ? "Đã nộp báo cáo kết quả — chuyển sang GĐ2 Nghiệm thu"
        : nextKey === "exec_midterm"
        ? "Đã ghi nhận báo cáo tiến độ giữa kỳ"
        : "Đã bắt đầu triển khai nghiên cứu"
    );
    setSaving(false);
    setShowMidterm(false);
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 space-y-4">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
        <FlaskConical className="w-4 h-4" /> Giai đoạn Triển khai — Thực hiện nghiên cứu
      </p>

      <div className="space-y-2">
        {/* exec_start */}
        <div className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-amber-100 dark:border-amber-800">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Bắt đầu triển khai</p>
            <p className="text-xs text-slate-400">Xác nhận đề tài chính thức bắt đầu thực hiện nghiên cứu</p>
          </div>
          {stepStatus("exec_start") === "passed"
            ? <span className="text-xs text-green-600 font-medium">✓ Đã bắt đầu</span>
            : canAct && (
              <button onClick={() => { setSaving(true); handleAdvanceExec("exec_start", "exec_midterm"); }}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50">
                Xác nhận bắt đầu
              </button>
            )
          }
        </div>

        {/* exec_midterm (optional) */}
        {stepStatus("exec_start") === "passed" && (
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-amber-100 dark:border-amber-800 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Báo cáo tiến độ giữa kỳ</p>
                <p className="text-xs text-slate-400">Tuỳ chọn — ghi nhận tiến độ nghiên cứu</p>
              </div>
              {stepStatus("exec_midterm") === "passed"
                ? <span className="text-xs text-green-600 font-medium">✓ Đã báo cáo</span>
                : canAct && (
                  <button onClick={() => setShowMidterm(v => !v)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-slate-600 dark:text-slate-300 transition">
                    {showMidterm ? "Huỷ" : "Ghi nhận"}
                  </button>
                )
              }
            </div>
            {showMidterm && (
              <div className="space-y-2">
                <textarea value={midtermNote} onChange={e => setMidtermNote(e.target.value)}
                  placeholder="Tóm tắt tiến độ nghiên cứu hiện tại..."
                  rows={3}
                  className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                <button onClick={() => handleAdvanceExec("exec_midterm", "exec_submit")}
                  disabled={saving || !midtermNote.trim()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50">
                  Lưu báo cáo tiến độ
                </button>
              </div>
            )}
          </div>
        )}

        {/* exec_submit → GĐ2 */}
        {stepStatus("exec_start") === "passed" && (
          <div className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-amber-100 dark:border-amber-800">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nộp báo cáo kết quả</p>
              <p className="text-xs text-slate-400">Kết thúc triển khai — chuyển sang GĐ2 Nghiệm thu</p>
            </div>
            {stepStatus("exec_submit") === "passed"
              ? <span className="text-xs text-green-600 font-medium">✓ Đã nộp</span>
              : canAct && (
                <button
                  onClick={() => handleAdvanceExec("exec_submit", "r_intake", "recognition")}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50">
                  Nộp kết quả → GĐ2
                </button>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GĐ1 Action Panel ────────────────────────────────────────────────────────

interface GD1Props {
  topic: ResearchTopic;
  currentUser: { id: string; name: string; role: string } | null;
  users: { id: string; name: string; role?: string; department?: string; academicTitle?: string }[];
  groups: ResearchGroup[];
  canManage: boolean;
  canAssignReviewer: boolean;  // research:assignReviewer scoped theo đơn vị
  canAssignCouncil: boolean;   // research:assignCouncil scoped theo đơn vị
  isPI: boolean;
  isPerformer: boolean;
  onUpdate: (updates: Partial<ResearchTopic>, msg: string) => Promise<void>;
  onReload: () => void;
  onGroupCreated: (g: ResearchGroup) => void;
  onRevise: (note: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
}

function GD1ActionPanel(props: GD1Props) {
  const { topic } = props;
  switch (topic.currentStep) {
    case "p_intake":   return <PIntakePanel {...props} />;
    case "p_compile":  return <PCompilePanel {...props} />;
    case "p_assign":   return <PAssignPanel {...props} />;
    case "p_review":   return <PReviewPanel {...props} />;
    case "p_council":  return <PCouncilPanel {...props} />;
    case "p_ethics":   return <PEthicsPanel {...props} />;
    case "p_agree":    return <PAgreePanel {...props} />;
    default: return null;
  }
}

function PanelWrap({ title, icon, children, tone = "blue" }: { title: string; icon: React.ReactNode; children: React.ReactNode; tone?: "blue" | "violet" }) {
  const box = tone === "violet"
    ? "bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800"
    : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800";
  const head = tone === "violet"
    ? "text-violet-700 dark:text-violet-300"
    : "text-blue-700 dark:text-blue-300";
  return (
    <div className={cn("border rounded-2xl p-5 space-y-3", box)}>
      <h2 className={cn("text-sm font-semibold flex items-center gap-2", head)}>
        {icon}{title}
      </h2>
      {children}
    </div>
  );
}

// ── p_intake ──────────────────────────────────────────────────────────────────
function PIntakePanel({ topic, canManage, onUpdate }: GD1Props) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    await onUpdate(advanceStep(topic, "p_intake", "p_compile"), "Đã tiếp nhận — chuyển sang tổng hợp đề cương");
    setSaving(false);
  }
  return (
    <PanelWrap title="GĐ1 · Tiếp nhận" icon={<BookOpen className="w-4 h-4" />}>
      {canManage ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300 flex-1">Xác nhận đã tiếp nhận đề tài để chuyển sang bước tổng hợp đề cương.</p>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2 whitespace-nowrap">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Đã tiếp nhận
          </button>
        </div>
      ) : (
        <p className="text-sm text-blue-600 dark:text-blue-400">Đang chờ quản lý tiếp nhận đề tài.</p>
      )}
    </PanelWrap>
  );
}

// ── p_compile ─────────────────────────────────────────────────────────────────
function PCompilePanel({ topic, currentUser, canManage, isPI, isPerformer, onUpdate, users }: GD1Props) {
  const [note, setNote] = useState(topic.compileNote ?? "");
  const [saving, setSaving] = useState(false);
  const canSubmit = isPI || isPerformer || canManage;

  async function handle() {
    if (!note.trim()) { toast.error("Nhập tóm tắt đề cương"); return; }
    setSaving(true);
    const managers = users.filter(u =>
      ["teamLead", "director", "hrAdmin"].includes(u.role ?? "") && u.id !== currentUser?.id
    );
    try {
      await onUpdate(
        { compileNote: note.trim(), ...advanceStep(topic, "p_compile", "p_assign") },
        "Đã nộp đề cương — chờ phê duyệt thực hiện"
      );
      await Promise.all(managers.map(u =>
        addNotification({
          userId: u.id, type: "approval_request", title: "Đề cương chờ phê duyệt",
          body: `Đề tài "${topic.title}" đã nộp đề cương — cần phê duyệt thực hiện & gán người.`,
          link: `/research/${topic.id}`, read: false, priority: "normal",
          createdAt: new Date().toISOString(),
        }).catch(() => {})
      ));
    } finally { setSaving(false); }
  }

  return (
    <PanelWrap title="GĐ1 · Tổng hợp đề cương, nộp báo cáo quản lý" icon={<FileText className="w-4 h-4" />}>
      {canSubmit ? (
        <>
          <textarea
            value={note} onChange={e => setNote(e.target.value)} rows={4}
            placeholder="Tóm tắt nội dung đề cương, mục tiêu, phương pháp, kế hoạch thực hiện..."
            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex justify-end">
            <button onClick={handle} disabled={saving || !note.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Nộp đề cương
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-blue-600 dark:text-blue-400">
          Chờ chủ nhiệm đề tài hoặc người thực hiện chính nộp đề cương.
        </p>
      )}
    </PanelWrap>
  );
}

// ── p_assign ─────────────────────────────────────────────────────────────────
function PAssignPanel({ topic, currentUser, canManage, users, groups, onUpdate, onGroupCreated }: GD1Props) {
  const [mode, setMode] = useState<"select" | "create">("select");
  const [selectedGroupId, setSelectedGroupId] = useState(topic.groupId ?? "");
  const [newGroupName, setNewGroupName] = useState("");
  const [newPerformerId, setNewPerformerId] = useState("");
  const [newSupervisorId, setNewSupervisorId] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const performerId = mode === "select" ? (selectedGroup?.mainPerformerId ?? "") : newPerformerId;
  const supervisorId = mode === "select" ? (selectedGroup?.supervisorId ?? "") : newSupervisorId;
  const performer = users.find(u => u.id === performerId);
  const supervisor = users.find(u => u.id === supervisorId);

  async function handle() {
    if (!performerId) { toast.error("Chọn người thực hiện chính"); return; }
    setSaving(true);
    try {
      let groupId = selectedGroupId;
      let groupName = selectedGroup?.name ?? "";

      if (mode === "create") {
        if (!newGroupName.trim()) { toast.error("Nhập tên nhóm"); setSaving(false); return; }
        const newGroup: ResearchGroup = {
          id: generateId("rgrp"),
          name: newGroupName.trim(),
          year: topic.year,
          field: topic.field,
          mainPerformerId: newPerformerId,
          supervisorId: newSupervisorId || undefined,
          topicIds: [topic.id],
          createdBy: currentUser?.id ?? "",
          createdAt: new Date().toISOString(),
        };
        await createResearchGroup(newGroup);
        onGroupCreated(newGroup);
        groupId = newGroup.id;
        groupName = newGroup.name;
      } else if (selectedGroupId) {
        // Add this topic to existing group's topicIds
        const existing = groups.find(g => g.id === selectedGroupId);
        if (existing && !existing.topicIds.includes(topic.id)) {
          await updateResearchGroup(selectedGroupId, {
            topicIds: [...existing.topicIds, topic.id],
          });
        }
      }

      await onUpdate(
        {
          groupId: groupId || undefined,
          groupName: groupName || undefined,
          mainPerformerId: performerId,
          supervisorId: supervisorId || undefined,
          ...advanceStep(topic, "p_assign", "p_review"),
        },
        "Đã phê duyệt thực hiện & gán người — chuyển sang phản biện kín"
      );
    } finally { setSaving(false); }
  }

  if (!canManage) {
    return (
      <PanelWrap title="GĐ1 · Phê duyệt thực hiện & gán người (theo nhóm)" icon={<Users className="w-4 h-4" />}>
        <p className="text-sm text-blue-600 dark:text-blue-400">Chờ quản lý phê duyệt thực hiện và gán người thực hiện chính / giám sát theo nhóm đề tài.</p>
      </PanelWrap>
    );
  }

  return (
    <PanelWrap title="GĐ1 · Phê duyệt thực hiện & gán người (theo nhóm)" icon={<Users className="w-4 h-4" />}>
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setMode("select")}
          className={cn("px-3 py-1.5 text-xs font-medium rounded-lg border transition",
            mode === "select" ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300")}>
          Chọn nhóm có sẵn
        </button>
        <button onClick={() => setMode("create")}
          className={cn("px-3 py-1.5 text-xs font-medium rounded-lg border transition",
            mode === "create" ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300")}>
          <Plus className="w-3 h-3 inline mr-1" />Tạo nhóm mới
        </button>
      </div>

      {mode === "select" ? (
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có nhóm đề tài nào — hãy tạo nhóm mới.</p>
          ) : (
            <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Chọn nhóm đề tài —</option>
              {groups.map(g => {
                const mp = users.find(u => u.id === g.mainPerformerId);
                return <option key={g.id} value={g.id}>{g.name} · Thực hiện: {mp?.name ?? g.mainPerformerId}</option>;
              })}
            </select>
          )}
          {selectedGroup && (
            <div className="text-xs text-slate-500 pl-1 space-y-0.5">
              <p>Người thực hiện chính: <strong>{users.find(u => u.id === selectedGroup.mainPerformerId)?.name}</strong></p>
              {selectedGroup.supervisorId && <p>Giám sát: <strong>{users.find(u => u.id === selectedGroup.supervisorId)?.name}</strong></p>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tên nhóm <span className="text-red-500">*</span></label>
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              placeholder="VD: Nhóm nghiên cứu lâm sàng A"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Người thực hiện chính <span className="text-red-500">*</span></label>
              <select value={newPerformerId} onChange={e => setNewPerformerId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Chọn —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Người giám sát</label>
              <select value={newSupervisorId} onChange={e => setNewSupervisorId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Không bắt buộc —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {performerId && (
        <p className="text-xs text-slate-500">
          Sẽ gán: <strong>{performer?.name ?? performerId}</strong>
          {supervisorId && <> · Giám sát: <strong>{supervisor?.name ?? supervisorId}</strong></>}
        </p>
      )}

      <div className="flex justify-end">
        <button onClick={handle} disabled={saving || !performerId}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Phê duyệt thực hiện
        </button>
      </div>
    </PanelWrap>
  );
}

// ── p_review ─────────────────────────────────────────────────────────────────
function PReviewPanel({ topic, currentUser, canAssignReviewer, users, onUpdate, onReload }: GD1Props) {
  const [showAdd, setShowAdd] = useState(false);

  // Which review's full form is open
  const [submitReviewId, setSubmitReviewId] = useState<string | null>(null);

  const stage: "proposal" | "recognition" = topic.currentStep === "r_review" ? "recognition" : "proposal";
  const stageLabel = stage === "recognition" ? "GĐ2" : "GĐ1";

  // Chỉ phiếu của vòng thẩm định hiện tại — sau khi "Yêu cầu sửa đổi" (revisionCount tăng), phiếu
  // vòng trước không còn tính vào đây nữa, đề tài coi như cần thẩm định lại từ đầu cho vòng mới.
  const proposalReviews = activeReviews(topic, stage);
  const submittedCount = proposalReviews.filter(r => r.status === "submitted").length;

  // Không bao giờ PATCH nguyên mảng `reviews` (state client có thể đã bị ẩn danh tính phản biện
  // khác theo nguyên tắc phản biện kín) — dùng route riêng, thao tác đúng 1 phần tử trên server,
  // rồi tải lại toàn bộ đề tài để đồng bộ.
  async function handleAddReviewer(reviewer: ResearchReview) {
    try {
      const res = await fetch(`/api/research/${topic.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: reviewer.stage,
          reviewerType: reviewer.reviewerType,
          reviewerId: reviewer.reviewerId,
          reviewerName: reviewer.reviewerName,
          reviewerEmail: reviewer.reviewerEmail,
          reviewerOrg: reviewer.reviewerOrg,
          dueAt: reviewer.dueAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Không thể chỉ định phản biện viên"); return; }
      toast.success(`Đã chỉ định ${reviewer.reviewerName} làm phản biện viên`);
      onReload();
    } catch { toast.error("Chỉ định phản biện viên thất bại"); }
    setShowAdd(false);
  }

  async function handleSubmitReview(reviewId: string, data: Partial<ResearchReview>) {
    try {
      const res = await fetch(`/api/research/${topic.id}/reviews`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, ...data }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(resData.error ?? "Không thể nộp phiếu"); return; }
      toast.success("Đã nộp phiếu thẩm định");
      const review = proposalReviews.find(r => r.id === reviewId);
      if (review?.mode === "confirm" && (data.verdict === "pass" || data.verdict === "fail")) {
        await handleConfirmReviewOutcome(topic, review, data.verdict, data.additionalComments, onUpdate);
      }
      onReload();
    } catch { toast.error("Nộp phiếu thất bại"); }
    setSubmitReviewId(null);
  }

  return (
    <>
    <PanelWrap title={`${stageLabel} · Thẩm định — 2 phản biện kín`} icon={<Eye className="w-4 h-4" />} tone={stage === "recognition" ? "violet" : "blue"}>
      <div className="space-y-2">
        {proposalReviews.length === 0 && (
          <p className="text-sm text-slate-400">Chưa có phản biện viên nào được gán.</p>
        )}
        {proposalReviews.map((r, i) => {
          const isMyReview = r.reviewerType === "internal" && r.reviewerId === currentUser?.id;
          // Server (GET /api/research/[id]) đã ẩn danh theo đúng nguyên tắc phản biện kín 2
          // chiều (tác giả không biết phản biện, 2 phản biện cùng giai đoạn không biết nhau) —
          // client chỉ cần tin vào dữ liệu đã nhận, không tự suy luận lại bằng canManage/isMyReview
          // (dễ sai lệch, vd. hiển thị tên dù server đã xoá vì viewer đồng thời có quyền quản lý).
          const identityVisible = !!r.reviewerName;
          const showForm = submitReviewId === r.id;
          return (
            <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">PB {i + 1}</span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  r.reviewerType === "internal" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600")}>
                  {r.reviewerType === "internal" ? "Nội bộ" : "Bên ngoài"}
                </span>
                {identityVisible ? (
                  <span className="text-sm font-medium text-[var(--foreground)]">{r.reviewerName}</span>
                ) : (
                  <span className="text-sm text-slate-400 flex items-center gap-1"><EyeOff className="w-3 h-3" />Ẩn danh</span>
                )}
                <span className={cn("ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  r.status === "submitted" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600")}>
                  {r.status === "submitted" ? "Đã nộp" : "Chờ phản biện"}
                </span>
              </div>
              {/* Submitted summary */}
              {r.status === "submitted" && identityVisible && (
                <div className="text-xs text-slate-500 pl-1 space-y-0.5">
                  <div className="flex flex-wrap gap-3">
                    {r.score !== undefined && (
                      <span>Tổng điểm: <strong className="text-[var(--foreground)]">{r.score}/35</strong></span>
                    )}
                    {r.verdict && (
                      <span>Kết luận: <strong className={
                        r.verdict === "pass" ? "text-green-600" :
                        r.verdict === "pass_if_revised" ? "text-amber-600" : "text-red-600"
                      }>{{ pass:"ĐẠT", pass_if_revised:"ĐẠT (nếu chỉnh sửa)", fail:"KHÔNG ĐẠT" }[r.verdict]}</strong></span>
                    )}
                    {r.grade && (
                      <span>Xếp loại: <strong className="text-[var(--foreground)]">{{ excellent:"Giỏi", good:"Khá", average:"Trung bình", fail:"Không đạt" }[r.grade]}</strong></span>
                    )}
                    {r.needResubmit && <span className="text-amber-600 font-medium">⚠ Cần nộp lại</span>}
                  </div>
                  {r.revisionPoints && (
                    <p className="mt-0.5 italic text-slate-400 line-clamp-2">Chỉnh sửa: "{r.revisionPoints}"</p>
                  )}
                  <button
                    onClick={() => setSubmitReviewId(r.id)}
                    className="text-[10px] text-blue-500 hover:underline mt-1 block"
                  >
                    Xem chi tiết phiếu →
                  </button>
                </div>
              )}
              {/* Open full review form */}
              {isMyReview && r.status === "assigned" && (
                <button
                  onClick={() => setSubmitReviewId(r.id)}
                  className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> Mở phiếu thẩm định →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canAssignReviewer && proposalReviews.length < 2 && (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 rounded-lg font-medium transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Chỉ định phản biện ({proposalReviews.length}/2)
        </button>
      )}

      {/* Quyết định bước tiếp theo (chuyển Hội đồng / yêu cầu sửa / từ chối) được thực hiện tập
          trung tại tab "Hội đồng KH&CN" → "Tổng hợp kết quả" một khi đã đủ 2 phiếu, không còn xử
          lý rời rạc ở đây để tránh người chỉ có vai trò phản biện thấy các nút hành động không
          liên quan đến mình. */}
      <p className="text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700">
        {submittedCount >= 2
          ? "Đã đủ 2 phiếu phản biện — chờ tổng hợp kết quả tại tab Hội đồng KH&CN."
          : `${submittedCount}/2 phiếu phản biện đã nộp.`}
      </p>
    </PanelWrap>

    {/* ── Assign reviewer modal ── */}
    {showAdd && (
      <AssignReviewerModal
        users={users as import("@/types").User[]}
        existingReviews={proposalReviews}
        slotsLeft={2 - proposalReviews.length}
        stage={stage}
        currentUserId={currentUser?.id}
        onAssign={handleAddReviewer}
        onClose={() => setShowAdd(false)}
      />
    )}

    {/* ── Full review form modal ── */}
    {submitReviewId && (() => {
      const rev = proposalReviews.find(r => r.id === submitReviewId);
      if (!rev) return null;
      return (
        <ReviewFormPanel
          key={submitReviewId}
          review={rev}
          topic={topic}
          onCancel={() => setSubmitReviewId(null)}
          onSubmit={data => handleSubmitReview(submitReviewId, data)}
        />
      );
    })()}
    </>
  );
}

// ── p_council ─────────────────────────────────────────────────────────────────
function PCouncilPanel({ topic, currentUser, canManage, canAssignCouncil, users, onUpdate, onRevise, onReject }: GD1Props) {
  const [mode, setMode] = useState<"in_person" | "online">("in_person");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [members, setMembers] = useState<ResearchCouncilMember[]>([]);
  const [pendingRole, setPendingRole] = useState<CouncilMemberRole>("member");
  const [decision, setDecision] = useState<"passed" | "failed" | "revise">("passed");
  const [conclusion, setConclusion] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [councilActionMode, setCouncilActionMode] = useState<"revise" | "reject" | null>(null);
  const [councilActionNote, setCouncilActionNote] = useState("");
  const [councilActioning, setCouncilActioning] = useState(false);

  const stage: "proposal" | "recognition" = topic.currentStep === "r_council" ? "recognition" : "proposal";
  const councilKey = stage === "recognition" ? "r_council" : "p_council";
  const nextKey = stage === "recognition" ? "r_recognize" : "p_ethics";
  const stageLabel = stage === "recognition" ? "GĐ2" : "GĐ1";

  const proposalSession = topic.councilSessions.find(s => s.stage === stage);

  async function handleCreateSession() {
    if (members.length === 0) { toast.error("Chọn ít nhất 1 thành viên Hội đồng"); return; }
    setSaving(true);
    const session: ResearchCouncilSession = {
      id: generateId("cs"),
      stage,
      mode,
      scheduledAt: scheduledAt || undefined,
      location: location || undefined,
      members,
      memberIds: members.map(m => m.userId ?? "").filter(Boolean),
      decision: mode === "in_person" ? decision : undefined,
      conclusion: conclusion || undefined,
      createdAt: new Date().toISOString(),
      votes: mode === "online" ? members.map(m => ({ memberId: m.userId ?? "", vote: "abstain" as const, votedAt: "" })) : undefined,
    };
    const updates: Partial<ResearchTopic> = { councilSessions: [...topic.councilSessions, session] };
    if (mode === "in_person" && decision !== "revise") {
      Object.assign(updates, advanceStep(topic, councilKey, nextKey));
    }
    await onUpdate(updates, mode === "in_person" ? "Đã ghi nhận kết luận Hội đồng" : "Đã tạo phiên bỏ phiếu online");
    setShowForm(false);
    setSaving(false);
  }

  async function handleVote(sessionId: string, memberId: string, vote: "approve"|"reject"|"abstain") {
    const sessions = topic.councilSessions.map(s => {
      if (s.id !== sessionId) return s;
      const votes = (s.votes ?? []).map(v => v.memberId === memberId ? { ...v, vote, votedAt: new Date().toISOString() } : v);
      const approves = votes.filter(v => v.vote === "approve").length;
      const rejects = votes.filter(v => v.vote === "reject").length;
      const total = (s.members ?? s.memberIds ?? []).length;
      const allVoted = votes.every(v => v.votedAt);
      const finalDecision: "passed"|"failed"|"revise"|undefined = allVoted
        ? approves > total / 2 ? "passed" : "failed"
        : undefined;
      return { ...s, votes, decision: finalDecision };
    });
    const updates: Partial<ResearchTopic> = { councilSessions: sessions };
    const updated = sessions.find(s => s.id === sessionId);
    if (updated?.decision && updated.decision !== "revise") {
      Object.assign(updates, advanceStep(topic, councilKey, nextKey));
    }
    await onUpdate(updates, "Đã ghi nhận phiếu biểu quyết");
  }

  return (
    <PanelWrap title={`${stageLabel} · Họp Hội đồng KHCN thông qua`} icon={<Gavel className="w-4 h-4" />} tone={stage === "recognition" ? "violet" : "blue"}>
      {proposalSession ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
              proposalSession.mode === "in_person" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600")}>
              {proposalSession.mode === "in_person" ? "Họp trực tiếp" : "Bỏ phiếu online"}
            </span>
            {proposalSession.scheduledAt && <span className="text-xs text-slate-400">{proposalSession.scheduledAt.slice(0,10)}</span>}
            {proposalSession.location && <span className="text-xs text-slate-400">· {proposalSession.location}</span>}
            {proposalSession.decision && (
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded ml-auto",
                proposalSession.decision === "passed" ? "bg-green-100 text-green-600"
                : proposalSession.decision === "failed" ? "bg-red-100 text-red-600"
                : "bg-amber-100 text-amber-600")}>
                {proposalSession.decision === "passed" ? "Thông qua" : proposalSession.decision === "failed" ? "Không thông qua" : "Yêu cầu sửa đổi"}
              </span>
            )}
          </div>
          {proposalSession.conclusion && <p className="text-xs text-slate-500 italic">"{proposalSession.conclusion}"</p>}

          {/* Members with roles */}
          {proposalSession.members && proposalSession.members.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {proposalSession.members.map(m => (
                <span key={m.userId} className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", COUNCIL_ROLE_COLOR[m.role])}>
                  {COUNCIL_ROLE_LABEL[m.role]}: {m.name}{m.academicTitle ? ` (${m.academicTitle})` : ""}
                </span>
              ))}
            </div>
          )}

          {/* Online voting */}
          {proposalSession.mode === "online" && !proposalSession.decision && (
            <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-700 pt-2">
              {proposalSession.votes?.map(v => {
                const member = users.find(u => u.id === v.memberId);
                const isMe = v.memberId === currentUser?.id;
                return (
                  <div key={v.memberId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-slate-600 dark:text-slate-300">{member?.name ?? v.memberId}</span>
                    {isMe && !v.votedAt ? (
                      <div className="flex gap-1">
                        {(["approve","reject","abstain"] as const).map(opt => (
                          <button key={opt} onClick={() => handleVote(proposalSession.id, v.memberId, opt)}
                            className={cn("px-2 py-0.5 text-[10px] rounded border font-medium",
                              opt==="approve" ? "border-green-500 text-green-600 hover:bg-green-50"
                              : opt==="reject" ? "border-red-400 text-red-600 hover:bg-red-50"
                              : "border-slate-300 text-slate-500 hover:bg-slate-50")}>
                            {opt==="approve"?"Tán thành":opt==="reject"?"Phản đối":"Bỏ phiếu trắng"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                        !v.votedAt ? "bg-slate-100 text-slate-400" :
                        v.vote==="approve" ? "bg-green-100 text-green-600" :
                        v.vote==="reject" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-500")}>
                        {!v.votedAt ? "Chưa bỏ phiếu" : v.vote==="approve"?"Tán thành":v.vote==="reject"?"Phản đối":"Bỏ phiếu trắng"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons for revise/failed decisions */}
          {canManage && proposalSession.decision && proposalSession.decision !== "passed" && (
            <div className="pt-2 border-t border-blue-200 dark:border-blue-700 space-y-2">
              {councilActionMode ? (
                <div className="space-y-2">
                  <textarea
                    value={councilActionNote}
                    onChange={e => setCouncilActionNote(e.target.value)}
                    rows={2}
                    placeholder={councilActionMode === "revise" ? "Ghi chú sửa đổi theo kết luận hội đồng..." : "Lý do từ chối cuối cùng..."}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setCouncilActionMode(null); setCouncilActionNote(""); }}
                      className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">Hủy</button>
                    <button
                      disabled={councilActioning}
                      onClick={async () => {
                        setCouncilActioning(true);
                        if (councilActionMode === "revise") await onRevise(councilActionNote);
                        else await onReject(councilActionNote);
                        setCouncilActioning(false);
                        setCouncilActionMode(null); setCouncilActionNote("");
                      }}
                      className={cn("px-4 py-1.5 text-white text-xs font-medium rounded-lg flex items-center gap-2 disabled:opacity-60 transition",
                        councilActionMode === "revise" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700")}>
                      {councilActioning && <Loader2 className="w-3 h-3 animate-spin" />}
                      {councilActionMode === "revise" ? "Xác nhận sửa đổi" : "Xác nhận từ chối"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 justify-end">
                  {proposalSession.decision === "revise" && (
                    <button onClick={() => setCouncilActionMode("revise")}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition">
                      <RotateCcw className="w-3.5 h-3.5" />
                      {stage === "proposal" ? "Yêu cầu sửa đổi theo HĐ" : "Yêu cầu nộp lại kết quả"}
                    </button>
                  )}
                  {proposalSession.decision === "failed" && (
                    <button onClick={() => setCouncilActionMode("reject")}
                      className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition">
                      <AlertTriangle className="w-3.5 h-3.5" /> Từ chối theo kết luận HĐ
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : canAssignCouncil ? (
        <>
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-4 h-4" /> Tạo phiên họp Hội đồng
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["in_person","online"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={cn("px-2.5 py-1 text-xs rounded-lg border font-medium",
                      mode===m ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-500")}>
                    {m==="in_person" ? "Họp trực tiếp" : "Bỏ phiếu online"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Ngày họp</label>
                  <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
                </div>
                {mode === "in_person" && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Địa điểm</label>
                    <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Phòng họp..."
                      className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Thành viên Hội đồng</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {members.map(m => (
                    <span key={m.userId} className={cn("text-xs px-2 py-0.5 rounded-full flex items-center gap-1", COUNCIL_ROLE_COLOR[m.role])}>
                      <span className="opacity-70 text-[10px]">{COUNCIL_ROLE_LABEL[m.role]}</span>
                      {m.name}
                      <button onClick={() => setMembers(prev => prev.filter(x => x.userId !== m.userId))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <select
                    value={pendingRole}
                    onChange={e => setPendingRole(e.target.value as CouncilMemberRole)}
                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <option value="chair">Chủ tịch</option>
                    <option value="member">Thành viên</option>
                    <option value="secretary">Thư ký</option>
                  </select>
                  <select
                    onChange={e => {
                      if (!e.target.value) return;
                      const u = users.find(u => u.id === e.target.value);
                      if (!u || members.some(m => m.userId === e.target.value)) return;
                      setMembers(prev => [...prev, {
                        userId: u.id, name: u.name, role: pendingRole,
                        department: u.department, academicTitle: u.academicTitle,
                      }]);
                      e.target.value = "";
                    }}
                    className="flex-1 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
                  >
                    <option value="">+ Thêm thành viên...</option>
                    {users.filter(u => !members.some(m => m.userId === u.id)).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}{u.academicTitle ? ` (${u.academicTitle})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {mode === "in_person" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Kết luận</label>
                    <select value={decision} onChange={e => setDecision(e.target.value as "passed"|"failed"|"revise")}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800">
                      <option value="passed">Thông qua</option>
                      <option value="revise">Yêu cầu sửa đổi</option>
                      <option value="failed">Không thông qua</option>
                    </select>
                  </div>
                  <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} rows={2}
                    placeholder="Tóm tắt kết luận hội đồng..."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800 resize-none" />
                </>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="text-xs text-slate-400 hover:text-slate-600">Hủy</button>
                <button onClick={handleCreateSession} disabled={saving}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg flex items-center gap-1">
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />} Lưu phiên họp
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-blue-600 dark:text-blue-400">Chờ quản lý tổ chức phiên họp Hội đồng KHCN.</p>
      )}
    </PanelWrap>
  );
}

// ── p_ethics ─────────────────────────────────────────────────────────────────
function PEthicsPanel({ topic, canManage, onUpdate }: GD1Props) {
  const [certNo, setCertNo] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [saving, setSaving] = useState(false);

  async function handle() {
    if (!certNo.trim()) { toast.error("Nhập số chứng nhận"); return; }
    setSaving(true);
    const cert = {
      type: "ethics" as const,
      number: certNo.trim(),
      issuedAt: issuedAt || undefined,
      issuedBy: issuedBy || undefined,
    };
    await onUpdate(
      { certificates: [...topic.certificates, cert], ...advanceStep(topic, "p_ethics", "p_agree") },
      "Đã ghi nhận chứng nhận y đức — chuyển sang đồng ý thực hiện"
    );
    setSaving(false);
  }

  return (
    <PanelWrap title="GĐ1 · Chứng nhận y đức" icon={<ShieldCheck className="w-4 h-4" />}>
      {canManage ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 sm:col-span-1">
              <label className="block text-xs text-slate-500 mb-0.5">Số chứng nhận <span className="text-red-500">*</span></label>
              <input value={certNo} onChange={e => setCertNo(e.target.value)} placeholder="YĐ-2026-001"
                className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Ngày cấp</label>
              <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Đơn vị cấp</label>
              <input value={issuedBy} onChange={e => setIssuedBy(e.target.value)} placeholder="Hội đồng y đức..."
                className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handle} disabled={saving || !certNo.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Ghi nhận chứng nhận y đức
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-blue-600 dark:text-blue-400">Chờ quản lý ghi nhận chứng nhận y đức.</p>
      )}
    </PanelWrap>
  );
}

// ── p_agree ──────────────────────────────────────────────────────────────────
function PAgreePanel({ topic, currentUser, canManage, users, onUpdate }: GD1Props) {
  const [saving, setSaving] = useState(false);

  async function handle() {
    setSaving(true);
    const stamp = new Date().toISOString();
    const steps = topic.steps.map(s =>
      s.key === "p_agree"     ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "exec_start" ? { ...s, status: "in_progress" as const }
      : s
    );
    const updates: Partial<ResearchTopic> = { steps, stage: "executing", currentStep: "exec_start" };
    await onUpdate(updates, "Đã đồng ý thực hiện — chuyển sang Giai đoạn Triển khai");

    // Tự sinh Task per-đề-tài (hub theo dõi tiến độ/risk/3T/plan)
    try {
      const res = await generateResearchTask(topic.id);
      if (res?.taskId) {
        await updateResearchTopic(topic.id, { executionTaskId: res.taskId });
        onUpdate({ executionTaskId: res.taskId }, "Đã tạo nhiệm vụ thực thi liên kết");
      }
    } catch { /* sinh task không thành công — không chặn luồng nghiệp vụ */ }

    // Notify PI and performer
    const notifyIds = [topic.principalInvestigatorId, topic.mainPerformerId].filter(Boolean) as string[];
    await Promise.all(notifyIds.filter(uid => uid !== currentUser?.id).map(uid =>
      addNotification({
        userId: uid, type: "request_approved", title: "Đề tài bắt đầu triển khai",
        body: `Đề tài "${topic.title}" đã được duyệt đề cương — bắt đầu giai đoạn thực hiện nghiên cứu.`,
        link: `/research/${topic.id}`, read: false, priority: "normal", createdAt: stamp,
      }).catch(() => {})
    ));
    setSaving(false);
  }

  return (
    <PanelWrap title="GĐ1 · Đồng ý cho thực hiện" icon={<FlaskConical className="w-4 h-4" />}>
      {canManage ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300 flex-1">
            Tất cả điều kiện GĐ1 đã hoàn thành. Xác nhận đồng ý cho thực hiện đề tài nghiên cứu — chuyển sang Giai đoạn 2.
          </p>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2 whitespace-nowrap">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Đồng ý thực hiện
          </button>
        </div>
      ) : (
        <p className="text-sm text-blue-600 dark:text-blue-400">Chờ quản lý ký xác nhận đồng ý thực hiện đề tài.</p>
      )}
    </PanelWrap>
  );
}

// ─── GĐ2 Action Panel (Nghiệm thu & Công nhận) ───────────────────────────────

function GD2ActionPanel(props: GD1Props) {
  const { topic } = props;
  switch (topic.currentStep) {
    case "r_intake":    return <RIntakePanel {...props} />;
    case "r_review":    return <PReviewPanel {...props} />;   // tái dùng — tự nhận stage="recognition"
    case "r_council":   return <PCouncilPanel {...props} />;  // tái dùng — tự nhận stage="recognition"
    case "r_recognize": return <RRecognizePanel {...props} />;
    default:            return null;
  }
}

// ── r_intake ──────────────────────────────────────────────────────────────────
function RIntakePanel({ topic, canManage, onUpdate, onReload }: GD1Props) {
  const [saving, setSaving] = useState(false);
  const awaitingResubmit = isAwaitingRevisionResubmit(topic);
  const awaitingProcessing = isAwaitingRevisionProcessing(topic);
  // Sau khi tác giả nộp lại (revisionCount > 0), người phụ trách xác nhận đã nhận — hệ thống rẽ
  // theo đúng xếp loại đã chọn ở "Tổng hợp kết quả": chuyển thẳng Hội đồng (skipReviewRound),
  // hoặc gửi lại đúng phản biện cũ 1 phiếu xác nhận rút gọn (needsReviewerReconfirmRound). Nếu
  // đây là lần tiếp nhận đầu tiên (revisionCount = 0, chưa từng yêu cầu sửa đổi) thì vẫn theo
  // luồng gốc: chuyển sang thẩm định đầy đủ (r_review, 2 phản biện mới).
  const canSkipToCouncil = topic.skipReviewRound === (topic.revisionCount ?? 0);
  const needsReconfirm = topic.needsReviewerReconfirmRound === (topic.revisionCount ?? 0);
  async function handle() {
    setSaving(true);
    const stamp = new Date().toISOString();
    if (canSkipToCouncil) {
      const steps = topic.steps.map(s =>
        (s.key === "r_intake" || s.key === "r_review") ? { ...s, status: "passed" as const, completedAt: stamp }
        : s.key === "r_council" ? { ...s, status: "in_progress" as const }
        : s
      );
      await onUpdate({ steps, currentStep: "r_council" }, "Đã xác nhận — chuyển thẳng sang Hội đồng thông qua");
    } else if (needsReconfirm) {
      const steps = topic.steps.map(s =>
        s.key === "r_intake" ? { ...s, status: "passed" as const, completedAt: stamp }
        : s.key === "r_review" ? { ...s, status: "in_progress" as const }
        : s
      );
      await onUpdate(
        { steps, currentStep: "r_review", reconfirmLoopActive: true },
        "Đã xác nhận — gửi lại phản biện xác nhận bản chỉnh sửa"
      );
      // Vòng vừa được xếp loại là round = revisionCount - 1 (đã tăng lúc phân loại ở Tổng hợp
      // kết quả) — chỉ gửi phiếu xác nhận cho ĐÚNG (các) phản biện đã yêu cầu xem lại.
      const priorRound = (topic.revisionCount ?? 1) - 1;
      const priorReviews = reviewersToResendForReconfirm(
        topic.reviews.filter(r => r.stage === "recognition" && (r.round ?? 0) === priorRound)
      );
      await sendReconfirmReviews(topic.id, "recognition", priorReviews, topic.title);
      onReload();
    } else {
      await onUpdate(advanceStep(topic, "r_intake", "r_review"), "Đã tiếp nhận kết quả — chuyển sang phản biện nghiệm thu");
    }
    setSaving(false);
  }
  return (
    <PanelWrap title="GĐ2 · Tiếp nhận kết quả nghiên cứu" icon={<BookOpen className="w-4 h-4" />} tone="violet">
      {awaitingResubmit && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-400">
            <p className="font-medium">Đã yêu cầu sửa đổi (lần {topic.revisionCount}) — đang chờ tác giả nộp lại</p>
            {topic.revisionNote && <p className="text-xs mt-0.5 whitespace-pre-wrap">{topic.revisionNote}</p>}
          </div>
        </div>
      )}
      {awaitingProcessing && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-3">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
            Tác giả đã nộp lại (lần {topic.revisionCount}) — sẵn sàng xác nhận.
          </p>
        </div>
      )}
      {canManage ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300 flex-1">
            {awaitingProcessing && needsReconfirm
              ? "Xác nhận đã nhận bản chỉnh sửa — gửi lại đúng phản biện cũ để xác nhận."
              : awaitingProcessing && canSkipToCouncil
              ? "Xác nhận đã nhận bản chỉnh sửa — báo hoàn tất, chuyển thẳng Hội đồng thông qua."
              : "Xác nhận đã tiếp nhận báo cáo kết quả nghiên cứu để chuyển sang thẩm định nghiệm thu (2 phản biện kín)."}
          </p>
          <button onClick={handle} disabled={saving || awaitingResubmit}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2 whitespace-nowrap">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {awaitingProcessing ? "Xác nhận đã nhận" : "Đã tiếp nhận kết quả"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-violet-600 dark:text-violet-400">
          {awaitingResubmit ? "Đang chờ tác giả nộp lại kết quả đã chỉnh sửa." : "Đang chờ quản lý tiếp nhận kết quả nghiên cứu."}
        </p>
      )}
    </PanelWrap>
  );
}

// ── r_recognize ─────────────────────────────────────────────────────────────────
/** Suy ra xếp loại 3T từ điểm trung bình (thang 10). */
function grade3TFromAvg(avg10: number): "xuatSac" | "hoanThanhTot" | "hoanThanh" | "khongHoanThanh" {
  if (avg10 >= 9) return "xuatSac";
  if (avg10 >= 8) return "hoanThanhTot";
  if (avg10 >= 5) return "hoanThanh";
  return "khongHoanThanh";
}

function RRecognizePanel({ topic, currentUser, canManage, onUpdate }: GD1Props) {
  const [certNo, setCertNo] = useState("");
  const [scope, setScope] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [saving, setSaving] = useState(false);

  // Điểm trung bình từ phản biện GĐ2 (đã nộp) → quy đổi 3T cho Hiệu suất
  const recReviews = activeReviews(topic, "recognition").filter(r => r.status === "submitted");
  const scores = recReviews.map(r => r.score).filter((s): s is number => typeof s === "number");
  const avg35 = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const avg10 = avg35 != null ? Math.round((avg35 / 35) * 100) / 10 : null;

  async function handle() {
    if (!certNo.trim()) { toast.error("Nhập số chứng nhận công nhận"); return; }
    setSaving(true);
    const stamp = new Date().toISOString();
    const cert = {
      type: "recognition" as const,
      number: certNo.trim(),
      scope: scope.trim() || undefined,
      issuedAt: issuedAt || undefined,
      issuedBy: issuedBy || undefined,
    };
    await onUpdate(
      { certificates: [...topic.certificates, cert], ...advanceStep(topic, "r_recognize", null, "completed") },
      "Đã công nhận phạm vi ảnh hưởng — hoàn tất đề tài",
    );

    // Khoá kết quả vào Task liên kết → tính Kế hoạch NCKH + vào Hiệu suất (3T)
    if (topic.executionTaskId) {
      const t10 = avg10 ?? 8; // không có điểm → mặc định Hoàn thành tốt
      const rating5 = Math.max(1, Math.min(5, Math.round(t10 / 2)));
      updateTask(topic.executionTaskId, {
        status: "done",
        progress: 100,
        evaluation: "Đề tài NCKH được Hội đồng công nhận phạm vi ảnh hưởng cấp cơ sở.",
        evaluationRating: rating5,
        completionProposal: {
          submittedBy: topic.mainPerformerId || topic.principalInvestigatorId || currentUser?.id || "",
          submittedAt: stamp,
          summary: "Đề tài hoàn thành & được Hội đồng KHCN công nhận.",
          status: "approved",
          reviewedBy: currentUser?.id,
          reviewedAt: stamp,
          reviewRating: rating5,
          score3T: {
            t1: t10, t2: t10, t3: t10, total: t10,
            grade: grade3TFromAvg(t10),
            computedAt: stamp,
          },
        },
      }).catch(() => {});
    }

    // Thông báo PI + người thực hiện
    const notifyIds = [topic.principalInvestigatorId, topic.mainPerformerId].filter(Boolean) as string[];
    await Promise.all(notifyIds.filter(uid => uid !== currentUser?.id).map(uid =>
      addNotification({
        userId: uid, type: "request_approved", title: "Đề tài được công nhận",
        body: `Đề tài "${topic.title}" đã được Hội đồng KHCN công nhận phạm vi ảnh hưởng cấp cơ sở.`,
        link: `/research/${topic.id}`, read: false, priority: "normal", createdAt: stamp,
      }).catch(() => {})
    ));
    setSaving(false);
  }

  if (!canManage) {
    return (
      <PanelWrap title="GĐ2 · Công nhận phạm vi ảnh hưởng" icon={<Award className="w-4 h-4" />} tone="violet">
        <p className="text-sm text-violet-600 dark:text-violet-400">Chờ quản lý cấp chứng nhận công nhận phạm vi ảnh hưởng.</p>
      </PanelWrap>
    );
  }

  return (
    <PanelWrap title="GĐ2 · Công nhận phạm vi ảnh hưởng" icon={<Award className="w-4 h-4" />} tone="violet">
      <div className="space-y-3">
        {avg10 != null && (
          <p className="text-xs text-slate-500">
            Điểm trung bình phản biện nghiệm thu: <strong className="text-[var(--foreground)]">{avg35?.toFixed(1)}/35</strong>
            {" "}(~{avg10}/10) · Dự kiến xếp loại 3T:{" "}
            <strong className="text-violet-600 dark:text-violet-400">
              {{ xuatSac: "Xuất sắc", hoanThanhTot: "Hoàn thành tốt", hoanThanh: "Hoàn thành", khongHoanThanh: "Không hoàn thành" }[grade3TFromAvg(avg10)]}
            </strong>
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 sm:col-span-1">
            <label className="block text-xs text-slate-500 mb-0.5">Số chứng nhận <span className="text-red-500">*</span></label>
            <input value={certNo} onChange={e => setCertNo(e.target.value)} placeholder="CN-2026-001"
              className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Ngày cấp</label>
            <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Đơn vị cấp</label>
            <input value={issuedBy} onChange={e => setIssuedBy(e.target.value)} placeholder="Hội đồng KHCN..."
              className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Phạm vi ảnh hưởng (cấp cơ sở)</label>
          <textarea value={scope} onChange={e => setScope(e.target.value)} rows={2}
            placeholder="Mô tả phạm vi ảnh hưởng / ứng dụng của đề tài..."
            className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-800 resize-none" />
        </div>
        <div className="flex justify-end">
          <button onClick={handle} disabled={saving || !certNo.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
            Công nhận & hoàn tất đề tài
          </button>
        </div>
      </div>
    </PanelWrap>
  );
}

// ─── File preview/edit field (dùng chung cho tab Đề cương & Đề tài) ──────────

const UPLOAD_ACCEPT = ".pdf,.doc,.docx";

function FileUrlField({ label, url, canEdit, folder, lockedMessage, onSave }: {
  label: string;
  url?: string;
  canEdit: boolean;
  folder: string;
  /** Hiển thị khi có file nhưng canEdit=false do đã khoá (vd. đã nộp thẩm định) — phân biệt với
   * trường hợp người xem đơn giản là không có quyền sửa. */
  lockedMessage?: string;
  onSave: (url: string) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState(url ?? "");

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Upload thất bại");
      await onSave(data.url);
      toast.success("Đã upload file");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveUrl() {
    await onSave(urlDraft.trim());
    setShowUrlInput(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        {canEdit && url && (
          <div className="flex items-center gap-3">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 disabled:opacity-50">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Thay file khác
            </button>
            <button onClick={() => setShowUrlInput(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Dán link khác
            </button>
          </div>
        )}
        {!canEdit && url && lockedMessage && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Lock className="w-3 h-3" /> {lockedMessage}
          </span>
        )}
      </div>

      {canEdit && showUrlInput && (
        <div className="flex items-center gap-2 mb-3">
          <input
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            placeholder="Dán link Google Drive / URL file..."
            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button onClick={handleSaveUrl}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition">
            Lưu
          </button>
          <button onClick={() => { setShowUrlInput(false); setUrlDraft(url ?? ""); }}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-500 text-xs rounded-lg">
            Huỷ
          </button>
        </div>
      )}

      {url ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" style={{ height: 560 }}>
          <DocxAnnotator fileUrl={url} annotations={[]} canAnnotate={false} />
        </div>
      ) : canEdit ? (
        <div className="space-y-2">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            ) : (
              <Upload className="w-6 h-6 text-slate-400" />
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {uploading ? "Đang tải lên..." : "Nhấn để chọn file (PDF / Word) — tối đa 20MB"}
            </p>
          </div>
          <button onClick={() => setShowUrlInput(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline">
            {showUrlInput ? "Ẩn" : "Hoặc dán link Google Drive"}
          </button>
          {showUrlInput && (
            <div className="flex items-center gap-2">
              <input
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button onClick={handleSaveUrl}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition">
                Lưu
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">Chưa có file</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Tóm tắt phản biện theo giai đoạn (dùng chung cho 2 tab) ─────────────────

function ReviewStageSummary({ reviews, stage, currentUserId, onOpenReview }: {
  reviews: ResearchReview[];
  stage: "proposal" | "recognition";
  currentUserId?: string;
  onOpenReview?: (reviewId: string) => void;
}) {
  const stageReviews = reviews.filter(r => r.stage === stage);
  const submitted = stageReviews.filter(r => r.status === "submitted");
  const scores = submitted.map(r => r.score).filter((s): s is number => typeof s === "number");
  const avg35 = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const avg10 = avg35 != null ? Math.round((avg35 / 35) * 100) / 10 : null;

  if (stageReviews.length === 0) {
    return <p className="text-sm text-slate-400 italic">Chưa có phản biện nào ở giai đoạn này.</p>;
  }

  return (
    <div className="space-y-3">
      {avg10 != null && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl">
          <p className="text-sm text-violet-700 dark:text-violet-300">
            Điểm trung bình: <strong>{avg35?.toFixed(1)}/35</strong> (~{avg10}/10)
          </p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-800/40 text-violet-700 dark:text-violet-300 font-medium">
            {{ xuatSac: "Xuất sắc", hoanThanhTot: "Hoàn thành tốt", hoanThanh: "Hoàn thành", khongHoanThanh: "Không hoàn thành" }[grade3TFromAvg(avg10)]}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {stageReviews.map((r, i) => {
          // Server đã ẩn danh theo nguyên tắc phản biện kín 2 chiều — chỉ tin dữ liệu nhận được,
          // không tự suy luận lại bằng canManage (dễ lộ danh tính khi viewer đồng thời là tác giả
          // hoặc là phản biện còn lại cùng giai đoạn nhưng cũng có quyền quản lý khác).
          const identityVisible = !!r.reviewerName;
          return (
            <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">PB {i + 1}</span>
                {identityVisible ? (
                  <span className="text-sm font-medium text-[var(--foreground)]">{r.reviewerName}</span>
                ) : (
                  <span className="text-sm text-slate-400 flex items-center gap-1"><EyeOff className="w-3 h-3" />Ẩn danh</span>
                )}
                <span className={cn("ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  r.status === "submitted" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600")}>
                  {r.status === "submitted" ? "Đã nộp" : "Chờ phản biện"}
                </span>
              </div>
              {r.status === "submitted" && (
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                  {r.score !== undefined && <span>Điểm: <strong className="text-[var(--foreground)]">{r.score}/35</strong></span>}
                  {r.verdict && (
                    <span>Kết luận: <strong className={
                      r.verdict === "pass" ? "text-green-600" :
                      r.verdict === "pass_if_revised" ? "text-amber-600" : "text-red-600"
                    }>{REVIEW_VERDICT_LABEL[r.verdict]}</strong></span>
                  )}
                  {r.grade && (
                    <span>Xếp loại: <strong className="text-[var(--foreground)]">{REVIEW_GRADE_LABEL[r.grade]}</strong></span>
                  )}
                </div>
              )}
              {/* Phiếu của chính người xem, chưa nộp — mở phiếu thẩm định ngay từ tab Đề cương/Đề tài,
                  không bắt buộc phải qua tab Quy trình mới thẩm định được. */}
              {r.status !== "submitted" && r.reviewerId === currentUserId && onOpenReview && (
                <button
                  onClick={() => onOpenReview(r.id)}
                  className="mt-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                >
                  {r.mode === "confirm" ? "Mở phiếu xác nhận bản sửa →" : "Mở phiếu thẩm định →"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Đề cương ────────────────────────────────────────────────────────────

interface TabProps {
  topic: ResearchTopic;
  canEdit: boolean;
  canManage: boolean;
  onUpdate: (updates: Partial<ResearchTopic>, msg: string) => Promise<void>;
  onReload: () => void;
}

/** Nộp phiếu thẩm định của chính mình qua route riêng — không PATCH nguyên mảng reviews (xem
 * lý do ở handleSubmitReview trong PReviewPanel: state client có thể đã bị ẩn danh phản biện
 * khác, PATCH cả mảng sẽ xoá vĩnh viễn danh tính thật của người khác trong DB). */
async function submitOwnReview(topicId: string, reviewId: string, data: Partial<ResearchReview>) {
  const res = await fetch(`/api/research/${topicId}/reviews`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewId, ...data }),
  });
  const resData = await res.json().catch(() => ({}));
  if (!res.ok) { toast.error(resData.error ?? "Không thể nộp phiếu"); return false; }
  toast.success("Đã nộp phiếu thẩm định");
  return true;
}

/**
 * Xử lý sau khi phản biện nộp phiếu xác nhận rút gọn (mode "confirm") — thực hiện đúng vòng lặp
 * tác giả↔phản biện: Đồng ý (và không còn phiếu xác nhận nào khác của round này chưa nộp) →
 * chuyển thẳng sang Hội đồng thông qua, kết thúc vòng lặp. Không đồng ý → tự động bắt đầu 1 vòng
 * sửa đổi mới, giữ nguyên cờ vòng lặp đang chạy để lần nộp lại tiếp theo tự động gửi lại đúng
 * phản biện đó — không cần người phụ trách can thiệp lại mỗi vòng.
 */
async function handleConfirmReviewOutcome(
  topic: ResearchTopic,
  review: ResearchReview,
  verdict: "pass" | "fail",
  note: string | undefined,
  onUpdate: (updates: Partial<ResearchTopic>, msg: string) => Promise<void>,
) {
  const stamp = new Date().toISOString();
  const stage = review.stage;
  const notifyIds = [...new Set([topic.principalInvestigatorId, topic.mainPerformerId].filter(Boolean) as string[])];

  if (verdict === "fail") {
    const resetTo = stage === "recognition" ? "r_intake" : "p_compile";
    const loopKeys = stage === "recognition"
      ? ["r_intake", "r_review", "r_council", "r_recognize"]
      : ["p_compile", "p_assign", "p_review", "p_council", "p_ethics", "p_agree"];
    const newRound = (topic.revisionCount ?? 0) + 1;
    const steps = topic.steps.map(s =>
      s.key === resetTo ? { ...s, status: "in_progress" as const, completedAt: undefined }
      : loopKeys.includes(s.key) ? { ...s, status: "pending" as const, completedAt: undefined }
      : s
    );
    await onUpdate(
      {
        steps, currentStep: resetTo,
        revisionNote: note || undefined,
        revisionCount: newRound,
        revisionResubmittedAt: null,
        needsReviewerReconfirmRound: newRound,
        reconfirmLoopActive: true,
      },
      "Phản biện chưa đồng ý — tiếp tục quy trình chỉnh sửa"
    );
    await Promise.all(notifyIds.map(uid =>
      addNotification({
        userId: uid, type: "approval_request", title: "Cần chỉnh sửa lại",
        body: `Phản biện chưa đồng ý với bản chỉnh sửa của đề tài "${topic.title}".${note ? ` Lý do: ${note}` : ""}`,
        link: `/research/${topic.id}`, read: false, priority: "urgent", createdAt: stamp,
      }).catch(() => {})
    ));
    return;
  }

  // Đồng ý — chỉ chuyển tiếp khi KHÔNG còn phiếu xác nhận nào khác của round này chưa nộp/chưa
  // đồng ý (trường hợp hiếm gặp nhiều phản biện cùng yêu cầu xác nhận).
  const round = topic.revisionCount ?? 0;
  const roundConfirmReviews = topic.reviews.filter(r => r.stage === stage && r.mode === "confirm" && (r.round ?? 0) === round);
  const allAgreed = roundConfirmReviews.every(r => r.id === review.id || (r.status === "submitted" && r.verdict === "pass"));
  if (!allAgreed) return;

  const councilKey = stage === "recognition" ? "r_council" : "p_council";
  const reviewKey = stage === "recognition" ? "r_review" : "p_review";
  const steps = topic.steps.map(s =>
    s.key === reviewKey ? { ...s, status: "passed" as const, completedAt: stamp }
    : s.key === councilKey ? { ...s, status: "in_progress" as const }
    : s
  );
  await onUpdate(
    { steps, currentStep: councilKey, reconfirmLoopActive: false },
    "Phản biện đã đồng ý — chuyển sang Hội đồng thông qua"
  );
  await Promise.all(notifyIds.map(uid =>
    addNotification({
      userId: uid, type: "request_approved", title: "Hoàn tất chỉnh sửa",
      body: `Phản biện đã đồng ý với bản chỉnh sửa của đề tài "${topic.title}" — chuyển sang Hội đồng thông qua.`,
      link: `/research/${topic.id}`, read: false, priority: "normal", createdAt: stamp,
    }).catch(() => {})
  ));
}

function ProposalTab({ topic, canEdit, canManage, onUpdate, onReload }: TabProps) {
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();
  const [note, setNote] = useState(topic.compileNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitReviewId, setSubmitReviewId] = useState<string | null>(null);

  const fileEditable = canEdit && !isProposalFileLocked(topic);

  // Chỉ xuất hiện sau khi đề cương đã thẩm định đạt và đi tiếp các bước sau p_review (dữ liệu
  // của các bước này chỉ tồn tại khi topic đã tiến qua p_review thành công).
  const councilSession = topic.councilSessions.find(s => s.stage === "proposal");
  const ethicsCert = topic.certificates.find(c => c.type === "ethics");
  const agreeStep = topic.steps.find(s => s.key === "p_agree");
  const agreePassed = agreeStep?.status === "passed";

  // Chỉ ở đúng bước "Tổng hợp đề cương" (p_compile) mới cần nộp thẩm định — sau khi nộp,
  // currentStep chuyển sang p_assign nên nút này tự ẩn.
  const needsSubmission = canEdit && topic.currentStep === "p_compile" && !!topic.proposalFileUrl;

  const wasAwaitingResubmit = isAwaitingRevisionResubmit(topic);

  async function handleSubmitForReview() {
    if (!note.trim()) { toast.error("Nhập tóm tắt đề cương trước khi nộp thẩm định"); return; }
    setSubmitting(true);
    const stamp = new Date().toISOString();
    try {
      const reconfirmLoop = topic.needsReviewerReconfirmRound === (topic.revisionCount ?? 0) && topic.reconfirmLoopActive;
      if (wasAwaitingResubmit && reconfirmLoop) {
        // Vòng lặp xác nhận đang chạy (phản biện đã "Không đồng ý" ít nhất 1 lần trước đó) —
        // người phụ trách đã quyết định 1 lần rồi, không cần xác nhận lại mỗi vòng: tự động gửi
        // thẳng cho đúng phản biện đó xác nhận lại bản mới.
        const steps = topic.steps.map(s =>
          (s.key === "p_compile" || s.key === "p_assign") ? { ...s, status: "passed" as const, completedAt: stamp }
          : s.key === "p_review" ? { ...s, status: "in_progress" as const }
          : s
        );
        await onUpdate(
          { compileNote: note.trim(), steps, currentStep: "p_review", revisionResubmittedAt: stamp },
          "Đã nộp lại đề cương — gửi lại phản biện xác nhận"
        );
        const priorRound = (topic.revisionCount ?? 1) - 1;
        const priorReviews = reviewersToResendForReconfirm(
          topic.reviews.filter(r => r.stage === "proposal" && (r.round ?? 0) === priorRound)
        );
        await sendReconfirmReviews(topic.id, "proposal", priorReviews, topic.title);
        onReload();
      } else if (wasAwaitingResubmit) {
        // Nộp lại sau "Yêu cầu sửa đổi" — chỉ cập nhật nội dung & đánh dấu đã nộp lại, KHÔNG tự
        // động chuyển bước. Người phụ trách chỉ định phản biện/Quản lý NCKH sẽ xác nhận đã nhận
        // và quyết định bước tiếp theo (xem khối "Xác nhận đã nhận" bên dưới).
        await onUpdate(
          { compileNote: note.trim(), revisionResubmittedAt: stamp },
          "Đã nộp lại đề cương — chờ xác nhận"
        );
        await notifyResubmission(topic, users, currentUser?.id, "Đề cương");
      } else {
        const managers = users.filter(u =>
          ["teamLead", "director", "hrAdmin"].includes(u.role ?? "") && u.id !== currentUser?.id
        );
        await onUpdate(
          { compileNote: note.trim(), ...advanceStep(topic, "p_compile", "p_assign") },
          "Đã nộp đề cương — chờ phê duyệt thực hiện"
        );
        await Promise.all(managers.map(u =>
          addNotification({
            userId: u.id, type: "approval_request", title: "Đề cương chờ phê duyệt",
            body: `Đề tài "${topic.title}" đã nộp đề cương — cần phê duyệt thực hiện & gán người.`,
            link: `/research/${topic.id}`, read: false, priority: "normal",
            createdAt: stamp,
          }).catch(() => {})
        ));
      }
    } finally { setSubmitting(false); }
  }

  // ── Xác nhận đã nhận bản chỉnh sửa (người phụ trách chỉ định phản biện / Quản lý NCKH) ──
  const [confirming, setConfirming] = useState(false);
  const needsReconfirm = topic.needsReviewerReconfirmRound === (topic.revisionCount ?? 0);
  const canSkipToCouncil = topic.skipReviewRound === (topic.revisionCount ?? 0);

  async function handleConfirmComplete() {
    setConfirming(true);
    const stamp = new Date().toISOString();
    const steps = topic.steps.map(s =>
      (s.key === "p_compile" || s.key === "p_assign" || s.key === "p_review")
        ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "p_council" ? { ...s, status: "in_progress" as const }
      : s
    );
    await onUpdate({ steps, currentStep: "p_council" }, "Đã xác nhận — chuyển thẳng sang Hội đồng thông qua");
    setConfirming(false);
  }

  async function handleConfirmReconfirm() {
    setConfirming(true);
    const stamp = new Date().toISOString();
    const steps = topic.steps.map(s =>
      (s.key === "p_compile" || s.key === "p_assign")
        ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "p_review" ? { ...s, status: "in_progress" as const }
      : s
    );
    await onUpdate(
      { steps, currentStep: "p_review", reconfirmLoopActive: true },
      "Đã xác nhận — gửi lại phản biện xác nhận bản chỉnh sửa"
    );
    // Vòng vừa được xếp loại là round = revisionCount - 1 (đã tăng lúc phân loại ở Tổng hợp kết
    // quả) — chỉ gửi phiếu xác nhận cho ĐÚNG (các) phản biện đã yêu cầu xem lại, không phải toàn
    // bộ phản biện của vòng đó.
    const priorRound = (topic.revisionCount ?? 1) - 1;
    const priorReviews = reviewersToResendForReconfirm(
      topic.reviews.filter(r => r.stage === "proposal" && (r.round ?? 0) === priorRound)
    );
    await sendReconfirmReviews(topic.id, "proposal", priorReviews, topic.title);
    onReload();
    setConfirming(false);
  }

  return (
    <div className="space-y-4">
      {isAwaitingRevisionResubmit(topic) && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-400">
            <p className="font-medium">Phản biện yêu cầu sửa đổi (lần {topic.revisionCount}) — vui lòng cập nhật file & nộp lại thẩm định</p>
            {topic.revisionNote && <p className="text-xs mt-0.5 whitespace-pre-wrap">{topic.revisionNote}</p>}
          </div>
        </div>
      )}
      {isAwaitingRevisionProcessing(topic) && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
              Đã nộp lại đề cương (lần {topic.revisionCount}) — đang chờ quản lý xử lý tiếp.
            </p>
            {canManage && (
              <div className="mt-2">
                {needsReconfirm ? (
                  <button onClick={handleConfirmReconfirm} disabled={confirming}
                    className="px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-60">
                    {confirming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Xác nhận đã nhận — gửi lại phản biện xác nhận
                  </button>
                ) : canSkipToCouncil ? (
                  <button onClick={handleConfirmComplete} disabled={confirming}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-60">
                    {confirming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Xác nhận đã nhận — báo hoàn tất, chuyển Hội đồng
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <FileUrlField
          label="File đề cương"
          url={topic.proposalFileUrl}
          canEdit={fileEditable}
          folder="proposals"
          lockedMessage="Đã nộp thẩm định — không thể sửa/xoá/thay thế file"
          onSave={(url) => onUpdate({ proposalFileUrl: url || undefined }, "Đã cập nhật file đề cương")}
        />
        {(needsSubmission || topic.compileNote) && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Nội dung tổng hợp</p>
            {needsSubmission ? (
              <div className="space-y-2">
                <textarea
                  value={note} onChange={e => setNote(e.target.value)} rows={4}
                  placeholder="Tóm tắt nội dung đề cương, mục tiêu, phương pháp, kế hoạch thực hiện..."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <div className="flex justify-end">
                  <button onClick={handleSubmitForReview} disabled={submitting || !note.trim()}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Nộp thẩm định
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                {topic.compileNote}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Điểm đạt Giai đoạn 1 (thẩm định đề cương)</h2>
        <ReviewStageSummary reviews={activeReviews(topic, "proposal")} stage="proposal" currentUserId={currentUser?.id} onOpenReview={setSubmitReviewId} />
      </div>

      {submitReviewId && (() => {
        const rev = topic.reviews.find(r => r.id === submitReviewId);
        if (!rev) return null;
        return (
          <ReviewFormPanel
            key={submitReviewId}
            review={rev}
            topic={topic}
            onCancel={() => setSubmitReviewId(null)}
            onSubmit={async data => {
              const ok = await submitOwnReview(topic.id, submitReviewId, data);
              if (ok) {
                if (rev.mode === "confirm" && (data.verdict === "pass" || data.verdict === "fail")) {
                  await handleConfirmReviewOutcome(topic, rev, data.verdict, data.additionalComments, onUpdate);
                }
                onReload();
              }
              setSubmitReviewId(null);
            }}
          />
        );
      })()}

      {(councilSession || ethicsCert || agreePassed) && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Kết quả Giai đoạn 1</h2>

          {councilSession && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Kết quả Hội đồng KHCN</p>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    councilSession.mode === "in_person" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600")}>
                    {councilSession.mode === "in_person" ? "Họp trực tiếp" : "Bỏ phiếu online"}
                  </span>
                  {councilSession.scheduledAt && <span className="text-xs text-slate-400">{councilSession.scheduledAt.slice(0, 10)}</span>}
                  {councilSession.decision && (
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded ml-auto",
                      councilSession.decision === "passed" ? "bg-green-100 text-green-600"
                      : councilSession.decision === "failed" ? "bg-red-100 text-red-600"
                      : "bg-amber-100 text-amber-600")}>
                      {councilSession.decision === "passed" ? "Thông qua" : councilSession.decision === "failed" ? "Không thông qua" : "Yêu cầu sửa đổi"}
                    </span>
                  )}
                </div>
                {councilSession.conclusion && <p className="text-xs text-slate-500 italic">"{councilSession.conclusion}"</p>}
                {councilSession.members && councilSession.members.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {councilSession.members.map(m => (
                      <span key={m.userId} className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", COUNCIL_ROLE_COLOR[m.role])}>
                        {COUNCIL_ROLE_LABEL[m.role]}: {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {ethicsCert && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Chứng nhận Y đức</p>
              <div className="text-sm text-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-1">
                {ethicsCert.number && <p>Số chứng nhận: <strong>{ethicsCert.number}</strong></p>}
                {ethicsCert.issuedAt && <p>Ngày cấp: <strong>{ethicsCert.issuedAt}</strong></p>}
                {ethicsCert.issuedBy && <p>Đơn vị cấp: <strong>{ethicsCert.issuedBy}</strong></p>}
              </div>
            </div>
          )}

          {agreePassed && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Quyết định cho thực hiện</p>
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Đã đồng ý cho thực hiện đề tài
                {agreeStep?.completedAt && ` — ${new Date(agreeStep.completedAt).toLocaleDateString("vi-VN")}`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Minh chứng sản phẩm đề tài (nhiều file) — kèm theo khi nộp thẩm định GĐ2 ────

function EvidenceDocsField({ documents, canEdit, onChange }: {
  documents: TaskResource[];
  canEdit: boolean;
  onChange: (docs: TaskResource[]) => Promise<void>;
}) {
  const { currentUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList) {
    setUploading(true);
    try {
      const uploaded: TaskResource[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("folder", "research-evidence");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(data?.error || `Upload thất bại: ${file.name}`); continue; }
        uploaded.push({
          id: generateId("doc"),
          type: "file",
          name: file.name,
          url: data.url,
          mimeType: file.type,
          size: file.size,
          addedBy: currentUser?.id ?? "",
          addedByName: currentUser?.name ?? "",
          addedAt: new Date().toISOString(),
        });
      }
      if (uploaded.length > 0) {
        await onChange([...documents, ...uploaded]);
        toast.success(`Đã thêm ${uploaded.length} minh chứng`);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(id: string) {
    await onChange(documents.filter(d => d.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Minh chứng sản phẩm đề tài</p>
        {canEdit && (
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 disabled:opacity-50">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Thêm minh chứng
          </button>
        )}
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Chưa có minh chứng nào</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
              <a href={doc.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline truncate min-w-0">
                <FileText className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{doc.name}</span>
              </a>
              {canEdit && (
                <button onClick={() => handleRemove(doc.id)} className="text-slate-400 hover:text-red-500 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={`${UPLOAD_ACCEPT},.jpg,.jpeg,.png`}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Tab: Đề tài ──────────────────────────────────────────────────────────────

function FinalTopicTab({ topic, canEdit, onUpdate, onReload }: TabProps) {
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();
  const recognitionCert = topic.certificates.find(c => c.type === "recognition");
  const [submitting, setSubmitting] = useState(false);
  const [submitReviewId, setSubmitReviewId] = useState<string | null>(null);

  const fileEditable = canEdit && !isFinalReportFileLocked(topic);
  // Đã có file và chưa bước vào GĐ2 (Nghiệm thu) — cho phép đề nghị thẩm định để bắt đầu GĐ2
  // ngay từ tab này, không bắt buộc phải quay lại tab Quy trình bấm "Bắt đầu triển khai"/
  // "Nộp báo cáo kết quả" tuần tự trước.
  const needsSubmission = canEdit && !!topic.finalReportFileUrl && !isFinalReportFileLocked(topic);

  async function handleSubmitForReview() {
    setSubmitting(true);
    const stamp = new Date().toISOString();
    const wasAwaitingResubmit = isAwaitingRevisionResubmit(topic);
    const reconfirmLoop = topic.needsReviewerReconfirmRound === (topic.revisionCount ?? 0) && topic.reconfirmLoopActive;
    if (wasAwaitingResubmit && reconfirmLoop) {
      // Vòng lặp xác nhận đang chạy — không cần người phụ trách xác nhận lại mỗi vòng: tự động
      // gửi thẳng cho đúng phản biện đã yêu cầu xác nhận xem lại bản mới.
      const steps = topic.steps.map(s =>
        s.key === "r_intake" ? { ...s, status: "passed" as const, completedAt: stamp }
        : s.key === "r_review" ? { ...s, status: "in_progress" as const }
        : s
      );
      await onUpdate(
        { steps, currentStep: "r_review", revisionResubmittedAt: stamp },
        "Đã nộp lại kết quả — gửi lại phản biện xác nhận"
      );
      const priorRound = (topic.revisionCount ?? 1) - 1;
      const priorReviews = reviewersToResendForReconfirm(
        topic.reviews.filter(r => r.stage === "recognition" && (r.round ?? 0) === priorRound)
      );
      await sendReconfirmReviews(topic.id, "recognition", priorReviews, topic.title);
      onReload();
      setSubmitting(false);
      return;
    }
    // Đánh dấu luôn "Bắt đầu triển khai" (nếu chưa) để tiến trình ở tab Quy trình không bị
    // thiếu bước — rồi mới nộp kết quả & chuyển sang GĐ2 Nghiệm thu.
    const steps = topic.steps.map(s =>
      s.key === "exec_start" && s.status !== "passed" ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "exec_submit" ? { ...s, status: "passed" as const, completedAt: stamp }
      : s.key === "r_intake" ? { ...s, status: "in_progress" as const }
      : s
    );
    await onUpdate(
      { steps, currentStep: "r_intake", stage: "recognition", ...(wasAwaitingResubmit ? { revisionResubmittedAt: stamp } : {}) },
      wasAwaitingResubmit ? "Đã nộp lại kết quả nghiên cứu — chờ tiếp nhận" : "Đã nộp báo cáo kết quả — chuyển sang GĐ2 Nghiệm thu"
    );
    if (wasAwaitingResubmit) await notifyResubmission(topic, users, currentUser?.id, "Kết quả nghiên cứu (GĐ2)");
    setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      {isAwaitingRevisionResubmit(topic) && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-400">
            <p className="font-medium">Phản biện yêu cầu sửa đổi (lần {topic.revisionCount}) — vui lòng cập nhật file & nộp lại thẩm định</p>
            {topic.revisionNote && <p className="text-xs mt-0.5 whitespace-pre-wrap">{topic.revisionNote}</p>}
          </div>
        </div>
      )}
      {isAwaitingRevisionProcessing(topic) && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
            Đã nộp lại kết quả (lần {topic.revisionCount}) — đang chờ quản lý tiếp nhận.
          </p>
        </div>
      )}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <FileUrlField
          label="File đề tài / báo cáo tổng kết"
          url={topic.finalReportFileUrl}
          canEdit={fileEditable}
          folder="final-reports"
          lockedMessage="Đã nộp thẩm định — không thể sửa/xoá/thay thế file"
          onSave={(url) => onUpdate({ finalReportFileUrl: url || undefined }, "Đã cập nhật file đề tài")}
        />
        <EvidenceDocsField
          documents={topic.documents}
          canEdit={fileEditable}
          onChange={(docs) => onUpdate({ documents: docs }, "Đã cập nhật minh chứng")}
        />
        {needsSubmission && (
          <div className="flex justify-end">
            <button onClick={handleSubmitForReview} disabled={submitting}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Nộp thẩm định
            </button>
          </div>
        )}
        {recognitionCert && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Chứng nhận công nhận</p>
            <div className="text-sm text-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-1">
              {recognitionCert.number && <p>Số chứng nhận: <strong>{recognitionCert.number}</strong></p>}
              {recognitionCert.issuedAt && <p>Ngày cấp: <strong>{recognitionCert.issuedAt}</strong></p>}
              {recognitionCert.issuedBy && <p>Đơn vị cấp: <strong>{recognitionCert.issuedBy}</strong></p>}
              {recognitionCert.scope && <p>Phạm vi ảnh hưởng: {recognitionCert.scope}</p>}
            </div>
          </div>
        )}
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Điểm Giai đoạn 2 (nghiệm thu & công nhận)</h2>
        <ReviewStageSummary reviews={activeReviews(topic, "recognition")} stage="recognition" currentUserId={currentUser?.id} onOpenReview={setSubmitReviewId} />
      </div>

      {submitReviewId && (() => {
        const rev = topic.reviews.find(r => r.id === submitReviewId);
        if (!rev) return null;
        return (
          <ReviewFormPanel
            key={submitReviewId}
            review={rev}
            topic={topic}
            onCancel={() => setSubmitReviewId(null)}
            onSubmit={async data => {
              const ok = await submitOwnReview(topic.id, submitReviewId, data);
              if (ok) {
                if (rev.mode === "confirm" && (data.verdict === "pass" || data.verdict === "fail")) {
                  await handleConfirmReviewOutcome(topic, rev, data.verdict, data.additionalComments, onUpdate);
                }
                onReload();
              }
              setSubmitReviewId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

