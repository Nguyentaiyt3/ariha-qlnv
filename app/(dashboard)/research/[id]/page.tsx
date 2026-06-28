"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Microscope, ArrowLeft, Loader2, CheckCircle2, Circle, XCircle, Clock,
  Users, FileText, Gavel, Award, ShieldCheck, UserCheck, Plus, X,
  BookOpen, FlaskConical, Eye, EyeOff, AlertTriangle, RotateCcw,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission, canDoResearchAction, canUserAssignReviewer } from "@/lib/rbac/permissions";
import {
  getResearchTopic, updateResearchTopic, addNotification,
  getResearchGroups, createResearchGroup, updateResearchGroup,
} from "@/lib/firebase/firestore";
import { ReviewFormPanel } from "@/components/research/ReviewFormPanel";
import { AssignReviewerModal } from "@/components/research/AssignReviewerModal";
import { RESEARCH_STEPS, STAGE_LABEL, researchProgress, stepMeta } from "@/lib/research";
import type {
  ResearchTopic, ResearchStage, ResearchStepStatus, ResearchGroup,
  ResearchReview, ResearchCouncilSession, ResearchCouncilMember, CouncilMemberRole,
  ResearchContributor,
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

  // Quyền quản lý toàn bộ quy trình (tiếp nhận, chuyển bước, từ chối...)
  // director/hrAdmin: luôn true; teamLead: chỉ true nếu đề tài thuộc đơn vị mình
  const canManage = !!currentUser && canDoResearchAction(currentUser, "research:manage", topic?.department);
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
      await updateResearchTopic(topic.id, updates);
      setTopic(prev => prev ? { ...prev, ...updates } : prev);
      toast.success(successMsg);
    } catch { toast.error("Thao tác thất bại"); }
  }

  // Yêu cầu sửa đổi — reset về p_compile, giữ lịch sử reviews
  async function handleRevise(note: string) {
    if (!topic) return;
    const stamp = new Date().toISOString();
    const LOOP_KEYS = ["p_compile", "p_assign", "p_review", "p_council", "p_ethics", "p_agree"];
    const steps = topic.steps.map(s =>
      s.key === "p_compile" ? { ...s, status: "in_progress" as const, completedAt: undefined }
      : LOOP_KEYS.includes(s.key) ? { ...s, status: "pending" as const, completedAt: undefined }
      : s
    );
    const updates: Partial<ResearchTopic> = {
      steps,
      currentStep: "p_compile",
      revisionNote: note || undefined,
      revisionCount: (topic.revisionCount ?? 0) + 1,
    };
    try {
      await updateResearchTopic(topic.id, updates);
      setTopic(prev => prev ? { ...prev, ...updates } : prev);
      const piId = topic.principalInvestigatorId;
      if (piId && piId !== currentUser?.id) {
        await addNotification({
          userId: piId, type: "approval_request",
          title: "Đề cương yêu cầu sửa đổi",
          body: `Đề tài "${topic.title}" cần chỉnh sửa đề cương.${note ? ` Ghi chú: ${note}` : ""}`,
          link: `/research/${topic.id}`, read: false, priority: "urgent", createdAt: stamp,
        }).catch(() => {});
      }
      toast.success(`Đã yêu cầu sửa đổi (lần ${updates.revisionCount}) — PI cần nộp lại đề cương`);
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => router.push("/research")} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Danh sách đề tài
      </button>

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
        </div>
      </div>

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

      {/* GĐ2 action panel placeholder */}
      {topic.stage === "recognition" && (
        <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-700 rounded-2xl p-5">
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1 flex items-center gap-2">
            <Award className="w-4 h-4" /> Giai đoạn 2 — Công nhận phạm vi ảnh hưởng
          </p>
          <p className="text-sm text-slate-500">Các thao tác tiếp nhận, thẩm định kết quả và công nhận sẽ được bổ sung ở Phase C.</p>
        </div>
      )}

      {/* Pipeline tracker */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Tiến trình thẩm định & công nhận</h2>
        <div className="space-y-4">
          {STAGES.map(stage => {
            const steps = RESEARCH_STEPS.filter(s => s.stage === stage);
            return (
              <div key={stage}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{STAGE_LABEL[stage]}</p>
                <div className="space-y-1.5 pl-1">
                  {steps.map(s => {
                    const st = stepStatus(s.key);
                    const isCurrent = topic.currentStep === s.key;
                    return (
                      <div key={s.key} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg",
                        isCurrent ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" : "")}>
                        {STEP_ICON[st]}
                        <span className={cn("text-sm flex-1", st === "passed" ? "text-slate-400 line-through" : "text-[var(--foreground)]")}>
                          {s.label}
                        </span>
                        {s.needsTwoReviews && (
                          <span className="text-[10px] text-slate-400">
                            {topic.reviews.filter(r => r.stage === (stage === "proposal" ? "proposal" : "recognition") && r.status === "submitted").length}/2
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

function PanelWrap({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 space-y-3">
      <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
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
function PReviewPanel({ topic, currentUser, canManage, canAssignReviewer, users, onUpdate, onRevise, onReject }: GD1Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Which review's full form is open
  const [submitReviewId, setSubmitReviewId] = useState<string | null>(null);

  // Revise / reject inline actions
  const [actionMode, setActionMode] = useState<"advance" | "revise" | "reject" | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actioning, setActioning] = useState(false);

  const proposalReviews = topic.reviews.filter(r => r.stage === "proposal");
  const submittedCount = proposalReviews.filter(r => r.status === "submitted").length;
  const canAdvance = submittedCount >= 2 && canManage;

  async function handleAddReviewer(reviewer: ResearchReview) {
    await onUpdate({ reviews: [...topic.reviews, reviewer] }, `Đã chỉ định ${reviewer.reviewerName} làm phản biện viên`);
    setShowAdd(false);
  }

  async function handleSubmitReview(reviewId: string, data: Partial<ResearchReview>) {
    const updated = topic.reviews.map(r =>
      r.id === reviewId
        ? { ...r, ...data, status: "submitted" as const, submittedAt: new Date().toISOString() }
        : r
    );
    await onUpdate({ reviews: updated }, "Đã nộp phiếu thẩm định");
    setSubmitReviewId(null);
  }

  async function handleAdvance() {
    setSaving(true);
    await onUpdate(advanceStep(topic, "p_review", "p_council"), "Đã hoàn thành phản biện — chuyển sang họp Hội đồng");
    setSaving(false);
  }

  return (
    <>
    <PanelWrap title="GĐ1 · Thẩm định — 2 phản biện kín" icon={<Eye className="w-4 h-4" />}>
      <div className="space-y-2">
        {proposalReviews.length === 0 && (
          <p className="text-sm text-slate-400">Chưa có phản biện viên nào được gán.</p>
        )}
        {proposalReviews.map((r, i) => {
          const isMyReview = r.reviewerType === "internal" && r.reviewerId === currentUser?.id;
          const showForm = submitReviewId === r.id;
          return (
            <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">PB {i + 1}</span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  r.reviewerType === "internal" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600")}>
                  {r.reviewerType === "internal" ? "Nội bộ" : "Bên ngoài"}
                </span>
                {/* Blind: only show name to canManage or reviewer themselves */}
                {(canManage || isMyReview) ? (
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
              {r.status === "submitted" && (canManage || isMyReview) && (
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

      {/* Action footer */}
      {canManage && submittedCount >= 2 && (
        <div className="pt-2 border-t border-blue-200 dark:border-blue-700 space-y-2">
          {/* Inline note/reason form when an action is chosen */}
          {actionMode && actionMode !== "advance" && (
            <div className="space-y-2">
              <textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                rows={2}
                placeholder={actionMode === "revise" ? "Ghi chú yêu cầu sửa đổi cho PI..." : "Lý do từ chối đề tài..."}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setActionMode(null); setActionNote(""); }}
                  className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">Hủy</button>
                <button
                  disabled={actioning}
                  onClick={async () => {
                    setActioning(true);
                    if (actionMode === "revise") await onRevise(actionNote);
                    else await onReject(actionNote);
                    setActioning(false);
                    setActionMode(null); setActionNote("");
                  }}
                  className={cn("px-4 py-1.5 text-white text-xs font-medium rounded-lg flex items-center gap-2 disabled:opacity-60 transition",
                    actionMode === "revise" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700")}>
                  {actioning && <Loader2 className="w-3 h-3 animate-spin" />}
                  {actionMode === "revise" ? "Xác nhận sửa đổi" : "Xác nhận từ chối"}
                </button>
              </div>
            </div>
          )}

          {!actionMode && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => setActionMode("revise")}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition">
                <RotateCcw className="w-3.5 h-3.5" /> Yêu cầu sửa đổi
              </button>
              <button onClick={() => setActionMode("reject")}
                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition">
                <AlertTriangle className="w-3.5 h-3.5" /> Từ chối đề tài
              </button>
              <button onClick={handleAdvance} disabled={saving}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition disabled:opacity-60 flex items-center gap-2">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Chuyển sang Họp HĐ ({submittedCount}/2 phiếu)
              </button>
            </div>
          )}
        </div>
      )}
      {!canAdvance && submittedCount < 2 && (
        <p className="text-xs text-slate-400">{submittedCount}/2 phiếu phản biện đã nộp — cần đủ 2 để tiếp tục.</p>
      )}
    </PanelWrap>

    {/* ── Assign reviewer modal ── */}
    {showAdd && (
      <AssignReviewerModal
        users={users as import("@/types").User[]}
        existingReviews={proposalReviews}
        slotsLeft={2 - proposalReviews.length}
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

  const proposalSession = topic.councilSessions.find(s => s.stage === "proposal");

  async function handleCreateSession() {
    if (members.length === 0) { toast.error("Chọn ít nhất 1 thành viên Hội đồng"); return; }
    setSaving(true);
    const session: ResearchCouncilSession = {
      id: generateId("cs"),
      stage: "proposal",
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
      Object.assign(updates, advanceStep(topic, "p_council", "p_ethics"));
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
      Object.assign(updates, advanceStep(topic, "p_council", "p_ethics"));
    }
    await onUpdate(updates, "Đã ghi nhận phiếu biểu quyết");
  }

  return (
    <PanelWrap title="GĐ1 · Họp Hội đồng KHCN thông qua" icon={<Gavel className="w-4 h-4" />}>
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
                      <RotateCcw className="w-3.5 h-3.5" /> Yêu cầu sửa đổi theo HĐ
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

