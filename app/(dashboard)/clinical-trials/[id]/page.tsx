"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Pencil, Trash2, Building2, User as UserIcon,
  Phone, Mail, Calendar, Link2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { getClinicalTrial, updateClinicalTrial, deleteClinicalTrial } from "@/lib/firebase/firestore";
import { TrialStatusPipeline } from "@/components/clinical-trials/TrialStatusPipeline";
import { TrialFormModal } from "@/components/clinical-trials/TrialFormModal";
import { EnrollmentDashboard } from "@/components/clinical-trials/EnrollmentDashboard";
import { PaymentLedger } from "@/components/clinical-trials/PaymentLedger";
import { UpdateEnrollmentModal } from "@/components/clinical-trials/UpdateEnrollmentModal";
import { EnrollmentShareModal } from "@/components/clinical-trials/EnrollmentShareModal";
import { EnrollmentLinkModal } from "@/components/clinical-trials/EnrollmentLinkModal";
import { CLINICAL_TRIAL_STATUS_LABEL } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus } from "@/types";

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
  const [showUpdateEnrollment, setShowUpdateEnrollment] = useState(false);
  const [showShareEnrollment, setShowShareEnrollment] = useState(false);
  const [showLinkEnrollment, setShowLinkEnrollment] = useState(false);

  const canManage = !!currentUser && hasPermission(currentUser.role, "trial:manage");

  // Check if current user is a member of the trial (PI, coordinator, or creator)
  const isMember = currentUser && trial && (
    trial.principalInvestigatorId === currentUser.id ||
    trial.coordinatorId === currentUser.id ||
    trial.createdBy === currentUser.id
  );

  // Can see enrollment/payment data if manager OR member
  const canSeeEnrollmentData = canManage || isMember;

  useEffect(() => {
    getClinicalTrial(id).then((t) => { setTrial(t); setLoading(false); });
  }, [id]);

  async function handleStatusChange(status: ClinicalTrialStatus) {
    if (!trial || !canManage) return;
    const prev = trial.status;
    setTrial({ ...trial, status });
    try {
      await updateClinicalTrial(trial.id, { status });
      toast.success("Đã cập nhật trạng thái");
    } catch {
      toast.error("Cập nhật thất bại — đang hoàn tác");
      setTrial({ ...trial, status: prev });
    }
  }

  async function handleDelete() {
    if (!trial) return;
    try {
      await deleteClinicalTrial(trial.id);
      toast.success("Đã xoá thử nghiệm lâm sàng");
      router.push("/clinical-trials");
    } catch {
      toast.error("Xoá thất bại");
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
    <div className="p-6 space-y-6 max-w-4xl">
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
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowEdit(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Sửa">
              <Pencil className="w-4 h-4 text-slate-500" />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Xoá">
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}
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

      {/* Enrollment Dashboard */}
      {canSeeEnrollmentData && trial.enrollment && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Tiến độ tuyển bệnh</h2>
          <EnrollmentDashboard
            enrollment={trial.enrollment}
            onUpdateClick={() => setShowUpdateEnrollment(true)}
            onShareClick={() => setShowShareEnrollment(true)}
            onCreateLinkClick={() => setShowLinkEnrollment(true)}
            canEdit={isMember || canManage}
          />
        </div>
      )}

      {/* Payment Ledger */}
      {canSeeEnrollmentData && trial.payments && trial.payments.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Sổ thanh toán</h2>
          <PaymentLedger payments={trial.payments} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4 space-y-2.5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Thông tin chung</h2>
          <InfoRow icon={UserIcon} label="Nghiên cứu viên chính" value={trial.principalInvestigatorName} />
          <InfoRow icon={Building2} label="Khoa thực hiện" value={trial.department} />
          <InfoRow icon={Building2} label="Nhà tài trợ" value={trial.sponsor} />
          <InfoRow icon={Calendar} label="Thời gian" value={trial.startPeriod || trial.endPeriod ? `${trial.startPeriod ?? "?"} – ${trial.endPeriod ?? "?"}` : undefined} />
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

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">CRA — Giám sát nghiên cứu</h2>
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
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">CRC — Điều phối tại site</h2>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Xoá thử nghiệm lâm sàng?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              Hành động này không thể hoàn tác. Toàn bộ dữ liệu của "{trial.abbreviation || trial.code}" sẽ bị xoá.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                Huỷ
              </button>
              <button onClick={handleDelete} className={cn("px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition")}>
                Xoá
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
    </div>
  );
}
