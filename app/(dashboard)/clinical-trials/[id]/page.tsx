"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Pencil, Trash2, Building2, User as UserIcon,
  Phone, Mail, Calendar, Link2, AlertTriangle, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { isClinicalTrialViewManager, sameUnit } from "@/lib/rbac/scope";
import { getClinicalTrial, updateClinicalTrial, deleteClinicalTrial, getWorkflows } from "@/lib/firebase/firestore";
import { PendingChangeRequestPanel } from "@/components/shared/PendingChangeRequestPanel";
import { formatPeriodDDMMYY } from "@/lib/utils";
import { TrialStatusPipeline } from "@/components/clinical-trials/TrialStatusPipeline";
import { TrialFormModal } from "@/components/clinical-trials/TrialFormModal";
import { EnrollmentDashboard } from "@/components/clinical-trials/EnrollmentDashboard";
import { PaymentLedger } from "@/components/clinical-trials/PaymentLedger";
import { PaymentFormModal } from "@/components/clinical-trials/PaymentFormModal";
import { HandoverFormModal } from "@/components/finance/HandoverFormModal";
import { HandoverDistributionModal } from "@/components/finance/HandoverDistributionModal";
import { UpdateEnrollmentModal } from "@/components/clinical-trials/UpdateEnrollmentModal";
import { EnrollmentShareModal } from "@/components/clinical-trials/EnrollmentShareModal";
import { EnrollmentLinkModal } from "@/components/clinical-trials/EnrollmentLinkModal";
import { CLINICAL_TRIAL_STATUS_LABEL } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus, ClinicalTrialPayment, Workflow } from "@/types";

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div>
        <span className="text-slate-400 text-xs">{label}: </span>
        <span className="text-slate-700 dark:text-slate-200">{value}</span>
      </div>
    </div>
  );
}

export default function ClinicalTrialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuthStore();

  const [trial, setTrial] = useState<ClinicalTrial | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [showUpdateEnrollment, setShowUpdateEnrollment] = useState(false);
  const [showShareEnrollment, setShowShareEnrollment] = useState(false);
  const [showLinkEnrollment, setShowLinkEnrollment] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<ClinicalTrialPayment | undefined>();
  const [handoverPayment, setHandoverPayment] = useState<ClinicalTrialPayment | undefined>();
  const [distributionPayment, setDistributionPayment] = useState<ClinicalTrialPayment | undefined>();
  const [activeTab, setActiveTab] = useState<"enrollment" | "info" | "payment">("enrollment");
  const [generatingTask, setGeneratingTask] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");

  const canManage = !!currentUser && hasPermission(currentUser.role, "trial:manage");
  const isDesignatedViewManager = isClinicalTrialViewManager(currentUser);
  const canEditOrDelete = canManage || isDesignatedViewManager;
  const canReviewChangeRequest =
    canManage || (currentUser?.role === "teamLead" && sameUnit(trial?.department, currentUser.department));
  const isChangeRequester = trial?.pendingChangeRequest?.requestedByUserId === currentUser?.id;

  // Check if current user is a member of the trial (PI, coordinator, or creator)
  const isMember = currentUser && trial && (
    trial.principalInvestigatorId === currentUser.id ||
    trial.coordinatorId === currentUser.id ||
    trial.createdBy === currentUser.id
  );

  // Can see enrollment/payment data if manager OR member
  const canSeeEnrollmentData = canManage || isMember;

  useEffect(() => {
    getClinicalTrial(id).then(async (t) => {
      setTrial(t);
      setLoading(false);
      // Tự phục hồi: nếu Task theo dõi đã bị xoá ở nơi khác (link chết), xoá tham chiếu để
      // nút "Xem nhiệm vụ" quay lại thành "Tạo nhiệm vụ theo dõi" thay vì trỏ vào link 404.
      if (t?.executionTaskId) {
        try {
          const res = await fetch(`/api/tasks/${t.executionTaskId}`);
          if (res.status === 404) {
            await updateClinicalTrial(t.id, { executionTaskId: "" });
            setTrial({ ...t, executionTaskId: undefined });
          }
        } catch {
          // Bỏ qua — không chặn trang nếu kiểm tra thất bại
        }
      }
    });
  }, [id]);

  useEffect(() => {
    getWorkflows().then((all) => setWorkflows(all.filter((w) => w.status === "published"))).catch(() => {});
  }, []);

  async function handleStatusChange(status: ClinicalTrialStatus) {
    if (!trial || !canManage) return;
    const prev = trial.status;
    const prevHistory = trial.statusHistory;
    const statusHistory = [
      ...(trial.statusHistory || []),
      { status, changedAt: new Date().toISOString(), changedBy: currentUser?.name },
    ];
    setTrial({ ...trial, status, statusHistory });
    try {
      await updateClinicalTrial(trial.id, { status, statusHistory });
      toast.success("Đã cập nhật trạng thái");
    } catch {
      toast.error("Cập nhật thất bại — đang hoàn tác");
      setTrial({ ...trial, status: prev, statusHistory: prevHistory });
    }
  }

  async function handleGenerateTask() {
    if (!trial) return;
    setGeneratingTask(true);
    try {
      const res = await fetch(`/api/clinical-trials/${trial.id}/generate-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: selectedWorkflowId || undefined }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTrial({ ...trial, executionTaskId: data.taskId });
      toast.success(data.created ? "Đã tạo nhiệm vụ theo dõi" : "Đã có nhiệm vụ theo dõi");
      router.push(`/tasks/${data.taskId}`);
    } catch {
      toast.error("Lỗi khi tạo nhiệm vụ theo dõi");
    } finally {
      setGeneratingTask(false);
    }
  }

  async function handleDelete() {
    if (!trial) return;
    try {
      const res = await deleteClinicalTrial(trial.id, deleteReason.trim() || undefined);
      if (res?.pending) {
        toast.success("Đã gửi yêu cầu xoá — chờ trưởng nhóm cùng đơn vị duyệt");
        setShowDeleteConfirm(false);
        setDeleteReason("");
        getClinicalTrial(id).then((t) => setTrial(t));
      } else {
        toast.success("Đã xoá thử nghiệm lâm sàng");
        router.push("/clinical-trials");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xoá thất bại");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!trial) {
    return (
      <div className="p-6 text-center text-slate-400">
        Không tìm thấy thử nghiệm lâm sàng.
        <div className="mt-3">
          <Link href="/clinical-trials" className="text-blue-600 hover:underline text-sm">← Quay lại danh sách</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <PendingChangeRequestPanel
        currentRecord={trial as unknown as Record<string, unknown>}
        pendingChangeRequest={trial.pendingChangeRequest}
        canReview={canReviewChangeRequest}
        isRequester={isChangeRequester}
        approveUrl={`/api/clinical-trials/${trial.id}/approve-change-request`}
        rejectUrl={`/api/clinical-trials/${trial.id}/reject-change-request`}
        onChanged={() => getClinicalTrial(id).then((t) => setTrial(t))}
      />

      <div className="flex items-center gap-3">
        <Link href="/clinical-trials" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-slate-800 dark:text-white">
              {trial.abbreviation || trial.code}
            </h1>
            {trial.nctCode && <span className="text-xs text-slate-400">({trial.nctCode})</span>}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{trial.title}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(canManage || isMember) && (
            trial.executionTaskId ? (
              <Link
                href={`/tasks/${trial.executionTaskId}`}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Xem nhiệm vụ
              </Link>
            ) : (
              <>
                {workflows.length > 0 && (
                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                    title="Chọn quy trình mẫu (để trống = dùng mẫu mặc định)"
                    className="text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    <option value="">Quy trình mặc định</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleGenerateTask}
                  disabled={generatingTask}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-medium transition disabled:opacity-50"
                >
                  {generatingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
                  Tạo nhiệm vụ theo dõi
                </button>
              </>
            )
          )}
          {canEditOrDelete && (
            <>
              <button onClick={() => setShowEdit(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Sửa">
                <Pencil className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Xoá">
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Vòng đời thử nghiệm</h2>
        <TrialStatusPipeline status={trial.status} onChange={canManage ? handleStatusChange : undefined} />
        {trial.statusReason && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {trial.statusReason}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          {[
            { id: "enrollment" as const, label: "Tiến độ tuyển bệnh" },
            { id: "info" as const, label: "Thông tin chung" },
            { id: "payment" as const, label: "Sổ thanh toán" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Enrollment Tab */}
          {activeTab === "enrollment" && (
            <div className="space-y-4">
              {canSeeEnrollmentData && trial.enrollment ? (
                <EnrollmentDashboard
                  enrollment={trial.enrollment}
                  onUpdateClick={() => setShowUpdateEnrollment(true)}
                  onShareClick={() => setShowShareEnrollment(true)}
                  onCreateLinkClick={() => setShowLinkEnrollment(true)}
                  canEdit={isMember || canManage}
                />
              ) : (
                <p className="text-sm text-slate-400 py-4">Chưa có dữ liệu tuyển bệnh</p>
              )}
            </div>
          )}

          {/* Info Tab */}
          {activeTab === "info" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Thông tin chung</h3>
                <InfoRow icon={UserIcon} label="Mã nghiên cứu" value={trial.code} />
                <InfoRow icon={UserIcon} label="Số quyết định triển khai" value={trial.deploymentDecisionNo} />
                <InfoRow icon={UserIcon} label="Nghiên cứu viên chính" value={trial.principalInvestigatorName} />
                <InfoRow icon={UserIcon} label="Điều phối viên" value={trial.coordinatorName} />
                <InfoRow icon={Building2} label="Khoa thực hiện" value={trial.department} />
                <InfoRow icon={Building2} label="Nhà tài trợ" value={trial.sponsor} />
                <InfoRow icon={Calendar} label="Thời gian" value={trial.startPeriod || trial.endPeriod ? `${formatPeriodDDMMYY(trial.startPeriod)} – ${formatPeriodDDMMYY(trial.endPeriod)}` : undefined} />
                <InfoRow icon={Building2} label="CRO" value={trial.cro} />
                <InfoRow icon={Building2} label="SMO" value={trial.smo} />
                {trial.zaloGroupUrl && (
                  <div className="flex items-start gap-2 text-sm">
                    <Link2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <a href={trial.zaloGroupUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm break-all">
                      Nhóm Zalo
                    </a>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">CRA — Giám sát nghiên cứu</h3>
                  {trial.cra && trial.cra.length > 0 ? (
                    <div className="space-y-3">
                      {trial.cra.map((contact, idx) => (
                        <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded border border-slate-200 dark:border-slate-700 space-y-1">
                          <InfoRow icon={UserIcon} label="Tên" value={contact.name} />
                          <InfoRow icon={Phone} label="SĐT" value={contact.phone} />
                          <InfoRow icon={Mail} label="Email" value={contact.email} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Chưa có thông tin</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">CRC — Điều phối tại site</h3>
                  {trial.crc && trial.crc.length > 0 ? (
                    <div className="space-y-3">
                      {trial.crc.map((contact, idx) => (
                        <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded border border-slate-200 dark:border-slate-700 space-y-1">
                          <InfoRow icon={UserIcon} label="Tên" value={contact.name} />
                          <InfoRow icon={Phone} label="SĐT" value={contact.phone} />
                          <InfoRow icon={Mail} label="Email" value={contact.email} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Chưa có thông tin</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payment Tab */}
          {activeTab === "payment" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sổ thanh toán</h3>
                {(isMember || canManage) && (
                  <button
                    onClick={() => setShowAddPayment(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
                  >
                    + Thêm thanh toán
                  </button>
                )}
              </div>
              {trial.payments && trial.payments.length > 0 ? (
                <PaymentLedger
                  payments={trial.payments}
                  trialId={trial.id}
                  onEdit={(payment) => {
                    setEditingPayment(payment);
                    setShowAddPayment(true);
                  }}
                  onPaymentsChange={(payments) => {
                    setTrial({ ...trial, payments });
                  }}
                  onOpenHandover={(payment) => {
                    setHandoverPayment(payment);
                  }}
                  onOpenDistribution={(payment) => {
                    setDistributionPayment(payment);
                  }}
                />
              ) : (
                <p className="text-sm text-slate-400 py-4">Chưa có bản ghi thanh toán</p>
              )}
            </div>
          )}
        </div>
      </div>

      {showEdit && currentUser && (
        <TrialFormModal
          initialData={trial}
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          onClose={() => setShowEdit(false)}
          onSaved={(t) => setTrial(t)}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Xoá thử nghiệm lâm sàng?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {canManage
                ? `Hành động này không thể hoàn tác. Toàn bộ dữ liệu của "${trial.abbreviation || trial.code}" sẽ bị xoá.`
                : "Bạn không có quyền xoá trực tiếp — yêu cầu sẽ được gửi cho trưởng nhóm cùng đơn vị duyệt."}
            </p>
            {!canManage && (
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Lý do xin xoá (bắt buộc)..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteReason(""); }} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                Huỷ
              </button>
              <button
                onClick={handleDelete}
                disabled={!canManage && !deleteReason.trim()}
                className={cn("px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition")}
              >
                {canManage ? "Xoá" : "Gửi yêu cầu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdateEnrollment && (
        <UpdateEnrollmentModal
          trial={trial}
          isOpen={showUpdateEnrollment}
          onClose={() => setShowUpdateEnrollment(false)}
          onSuccess={(updatedEnrollment) => {
            setTrial({ ...trial, enrollment: updatedEnrollment });
            setShowUpdateEnrollment(false);
          }}
        />
      )}

      {showShareEnrollment && (
        <EnrollmentShareModal
          trial={trial}
          isOpen={showShareEnrollment}
          onClose={() => setShowShareEnrollment(false)}
        />
      )}

      {showLinkEnrollment && (
        <EnrollmentLinkModal
          trial={trial}
          isOpen={showLinkEnrollment}
          onClose={() => setShowLinkEnrollment(false)}
        />
      )}

      {showAddPayment && (
        <PaymentFormModal
          trial={trial}
          isOpen={showAddPayment}
          editingPayment={editingPayment}
          onClose={() => {
            setShowAddPayment(false);
            setEditingPayment(undefined);
          }}
          onSuccess={(updatedTrial) => {
            setTrial(updatedTrial);
            setShowAddPayment(false);
            setEditingPayment(undefined);
          }}
        />
      )}

      {handoverPayment && (
        <HandoverFormModal
          isOpen={!!handoverPayment}
          onClose={() => setHandoverPayment(undefined)}
          payment={handoverPayment}
          trialCode={trial?.code || ""}
          onSuccess={() => {
            setHandoverPayment(undefined);
            getClinicalTrial(id).then((t) => setTrial(t));
          }}
          onSave={() => {
            // Refresh trial data after save (without closing modal)
            getClinicalTrial(id).then((t) => setTrial(t));
          }}
        />
      )}

      {distributionPayment && (
        <HandoverDistributionModal
          isOpen={!!distributionPayment}
          onClose={() => setDistributionPayment(undefined)}
          payment={distributionPayment}
          trialCode={trial?.code || ""}
          onSuccess={() => {
            getClinicalTrial(id).then((t) => {
              setTrial(t);
              const updated = t?.payments?.find((p) => p.id === distributionPayment.id);
              if (updated) setDistributionPayment(updated);
            });
          }}
        />
      )}

    </div>
  );
}
