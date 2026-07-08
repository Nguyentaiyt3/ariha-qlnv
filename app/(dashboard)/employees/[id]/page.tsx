"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Pencil, Save, X, Loader2, Mail, ClipboardList,
  GraduationCap, ShieldAlert, BadgeCheck, Briefcase, Award, Paperclip, Trash2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { getUser, saveUser } from "@/lib/firebase/firestore";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";
import { cn, getInitials, avatarColor, roleLabel, formatDate, contractAlert, credentialAlert, generateId } from "@/lib/utils";
import { RESEARCH_DESIGNATION_LABEL, CONTRACT_TYPE_LABEL, CREDENTIAL_TYPE_LABEL } from "@/types";
import type { User, UserRole, ContractType, CredentialType, StaffCredential } from "@/types";

const ROLE_COLORS: Record<UserRole, string> = {
  guest:             "bg-gray-100 text-gray-700",
  staff:             "bg-blue-100 text-blue-700",
  teamLead:          "bg-violet-100 text-violet-700",
  director:          "bg-amber-100 text-amber-700",
  hrAdmin:           "bg-red-100 text-red-700",
  financeViewer:     "bg-emerald-100 text-emerald-700",
  financeAuditor:    "bg-teal-100 text-teal-700",
  financeSupervisor: "bg-cyan-100 text-cyan-700",
};

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-[var(--muted-foreground)]">{label}</p>
      <p className="text-sm text-[var(--foreground)]">{value}</p>
    </div>
  );
}

interface ContractForm {
  employeeCode: string;
  contractType: ContractType;
  contractStart: string;
  contractEnd: string;
}

const BLANK_CRED = { name: "", type: "degree" as CredentialType, issuer: "", issueDate: "", expiryDate: "" };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuthStore();
  const abbr = useUnitAbbr();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingContract, setEditingContract] = useState(false);
  const [form, setForm] = useState<ContractForm>({ employeeCode: "", contractType: "indefinite", contractStart: "", contractEnd: "" });
  const [saving, setSaving] = useState(false);

  const [addingCred, setAddingCred] = useState(false);
  const [credForm, setCredForm] = useState(BLANK_CRED);
  const [credFile, setCredFile] = useState<File | null>(null);
  const [savingCred, setSavingCred] = useState(false);

  const canManage = !!currentUser && hasPermission(currentUser.role, "user:manage");
  const canManageContract = !!currentUser && hasPermission(currentUser.role, "user:manageContract");
  const canManageCredentials = !!currentUser && hasPermission(currentUser.role, "user:manageCredentials");
  const canRead = !!currentUser && hasPermission(currentUser.role, "user:read");
  const isSelf = currentUser?.id === id;

  useEffect(() => {
    getUser(id).then((u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        setForm({
          employeeCode: u.employeeCode ?? "",
          contractType: u.contractType ?? "indefinite",
          contractStart: u.contractStart ?? "",
          contractEnd: u.contractEnd ?? "",
        });
      }
    });
  }, [id]);

  if (!canRead && !isSelf) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        Bạn không có quyền xem hồ sơ nhân viên.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-[var(--muted-foreground)]">
        Không tìm thấy nhân viên.
        <div className="mt-3">
          <Link href="/employees" className="text-blue-600 hover:underline text-sm">← Quay lại danh sách</Link>
        </div>
      </div>
    );
  }

  const alert = contractAlert(user.contractEnd);

  async function handleSaveContract() {
    if (!user) return;
    setSaving(true);
    try {
      const updates = {
        id: user.id,
        employeeCode: form.employeeCode.trim() || undefined,
        contractType: form.contractType,
        contractStart: form.contractStart || undefined,
        contractEnd: form.contractEnd || undefined,
      };
      await saveUser(updates);
      setUser({ ...user, ...updates });
      toast.success("Đã cập nhật thông tin hợp đồng");
      setEditingContract(false);
    } catch {
      toast.error("Cập nhật thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCredential() {
    if (!user || !credForm.name.trim()) return;
    setSavingCred(true);
    try {
      let fileUrl: string | undefined;
      if (credFile) fileUrl = await readFileAsDataUrl(credFile);

      const newCred: StaffCredential = {
        id: generateId("cred"),
        name: credForm.name.trim(),
        type: credForm.type,
        issuer: credForm.issuer.trim() || undefined,
        issueDate: credForm.issueDate || undefined,
        expiryDate: credForm.expiryDate || undefined,
        fileUrl,
        fileName: credFile?.name,
      };
      const credentials = [...(user.credentials ?? []), newCred];
      await saveUser({ id: user.id, credentials });
      setUser({ ...user, credentials });
      toast.success("Đã thêm chứng chỉ/bằng cấp");
      setAddingCred(false);
      setCredForm(BLANK_CRED);
      setCredFile(null);
    } catch {
      toast.error("Lưu chứng chỉ thất bại");
    } finally {
      setSavingCred(false);
    }
  }

  async function handleDeleteCredential(credId: string) {
    if (!user) return;
    const credentials = (user.credentials ?? []).filter((c) => c.id !== credId);
    try {
      await saveUser({ id: user.id, credentials });
      setUser({ ...user, credentials });
      toast.success("Đã xoá chứng chỉ");
    } catch {
      toast.error("Xoá thất bại");
    }
  }

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/employees" className="p-2 rounded-lg hover:bg-[var(--muted)] transition">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer" className="w-14 h-14 rounded-full object-cover ring-2 ring-white shrink-0" />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 ring-2 ring-white"
              style={{ background: avatarColor(user.name) }}
            >
              {getInitials(user.name)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[var(--foreground)] truncate">{user.name}</h1>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ROLE_COLORS[user.role])}>{roleLabel(user.role)}</span>
              {user.position && <span className="text-xs text-[var(--muted-foreground)]">{user.position}</span>}
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              )}>
                {user.isActive ? "Hoạt động" : "Vô hiệu"}
              </span>
            </div>
          </div>
        </div>
        {(canManage || isSelf) && (user.onboardingTaskId || user.offboardingTaskId) && (
          <div className="flex items-center gap-1 shrink-0">
            {user.onboardingTaskId && (
              <Link
                href={`/tasks/${user.onboardingTaskId}`}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Task hội nhập
              </Link>
            )}
            {user.offboardingTaskId && (
              <Link
                href={`/tasks/${user.offboardingTaskId}`}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Task nghỉ việc
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Contract expiry alert */}
      {alert && (
        <div className={cn(
          "flex items-center gap-2 border rounded-xl px-4 py-3 text-sm",
          alert.days < 0 ? "border-red-200 dark:border-red-800" : "border-amber-200 dark:border-amber-800",
          alert.cls,
        )}>
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {alert.label} ({formatDate(user.contractEnd!)})
        </div>
      )}

      {/* Liên hệ */}
      <Section title="Liên hệ" icon={Mail}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" value={user.email} />
          <Field label="Điện thoại" value={user.phone} />
          <Field label="Đơn vị" value={abbr(user.department)} />
          <Field label="Số CCCD" value={user.idNumber} />
          <Field label="Sinh nhật" value={user.birthday ? formatDate(user.birthday) : undefined} />
          <Field label="Ngày vào" value={user.joinDate ? formatDate(user.joinDate) : undefined} />
          <Field label="Ngày nghỉ" value={user.exitDate ? formatDate(user.exitDate) : undefined} />
        </div>
        {isSelf && (
          <p className="text-xs text-[var(--muted-foreground)] mt-3 pt-3 border-t border-[var(--border)]">
            Đây là hồ sơ của bạn — muốn thay đổi thông tin, vào{" "}
            <Link href="/settings/profile" className="text-blue-600 hover:underline">Cài đặt &gt; Hồ sơ cá nhân</Link>.
          </p>
        )}
      </Section>

      {/* Hợp đồng */}
      <Section title="Hồ sơ hợp đồng" icon={Briefcase}>
        {editingContract ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Mã nhân viên</label>
                <input
                  value={form.employeeCode}
                  onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Loại hợp đồng</label>
                <select
                  value={form.contractType}
                  onChange={(e) => setForm({ ...form, contractType: e.target.value as ContractType })}
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {(Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => (
                    <option key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  value={form.contractStart}
                  onChange={(e) => setForm({ ...form, contractStart: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Ngày kết thúc</label>
                <input
                  type="date"
                  value={form.contractEnd}
                  onChange={(e) => setForm({ ...form, contractEnd: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditingContract(false);
                  setForm({
                    employeeCode: user.employeeCode ?? "",
                    contractType: user.contractType ?? "indefinite",
                    contractStart: user.contractStart ?? "",
                    contractEnd: user.contractEnd ?? "",
                  });
                }}
                className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleSaveContract}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-medium transition"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Lưu
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="grid grid-cols-2 gap-3 flex-1">
              <Field label="Mã nhân viên" value={user.employeeCode} />
              <Field label="Loại hợp đồng" value={user.contractType ? CONTRACT_TYPE_LABEL[user.contractType] : undefined} />
              <Field label="Ngày bắt đầu" value={user.contractStart ? formatDate(user.contractStart) : undefined} />
              <Field label="Ngày kết thúc" value={user.contractEnd ? formatDate(user.contractEnd) : undefined} />
              {!user.employeeCode && !user.contractType && !user.contractStart && !user.contractEnd && (
                <p className="text-sm text-[var(--muted-foreground)] col-span-2">Chưa có thông tin hợp đồng.</p>
              )}
            </div>
            {canManageContract && (
              <button
                onClick={() => setEditingContract(true)}
                className="p-1.5 text-[var(--muted-foreground)] hover:text-blue-600 rounded-lg hover:bg-blue-50 transition shrink-0"
                title="Chỉnh sửa hợp đồng"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </Section>

      {/* Chứng chỉ / Bằng cấp */}
      <Section title="Chứng chỉ / Bằng cấp" icon={Award}>
        <div className="space-y-2">
          {(user.credentials ?? []).map((c) => {
            const cAlert = credentialAlert(c.expiryDate);
            return (
              <div key={c.id} className="flex items-start justify-between gap-3 border border-[var(--border)] rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-[var(--foreground)]">{c.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {CREDENTIAL_TYPE_LABEL[c.type]}
                    </span>
                    {cAlert && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", cAlert.cls)}>
                        {cAlert.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                    {[c.issuer, c.issueDate ? `cấp ${formatDate(c.issueDate)}` : null, c.expiryDate ? `hết hạn ${formatDate(c.expiryDate)}` : null]
                      .filter(Boolean).join(" · ")}
                  </p>
                  {c.fileUrl && (
                    <a href={c.fileUrl} target="_blank" rel="noreferrer" download={c.fileName} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1">
                      <Paperclip className="w-3 h-3" /> {c.fileName ?? "Xem tệp"}
                    </a>
                  )}
                </div>
                {canManageCredentials && (
                  <button
                    onClick={() => handleDeleteCredential(c.id)}
                    className="p-1 text-[var(--muted-foreground)] hover:text-red-500 rounded-lg hover:bg-red-50 transition shrink-0"
                    title="Xoá"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {(user.credentials ?? []).length === 0 && !addingCred && (
            <p className="text-sm text-[var(--muted-foreground)]">Chưa có chứng chỉ/bằng cấp nào.</p>
          )}

          {canManageCredentials && (
            addingCred ? (
              <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2 bg-blue-50/40 dark:bg-blue-950/20">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={credForm.name}
                    onChange={(e) => setCredForm({ ...credForm, name: e.target.value })}
                    placeholder="Tên chứng chỉ/bằng cấp *"
                    className="col-span-2 px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <select
                    value={credForm.type}
                    onChange={(e) => setCredForm({ ...credForm, type: e.target.value as CredentialType })}
                    className="px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {(Object.keys(CREDENTIAL_TYPE_LABEL) as CredentialType[]).map((t) => (
                      <option key={t} value={t}>{CREDENTIAL_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                  <input
                    value={credForm.issuer}
                    onChange={(e) => setCredForm({ ...credForm, issuer: e.target.value })}
                    placeholder="Nơi cấp"
                    className="px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div>
                    <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Ngày cấp</label>
                    <input
                      type="date"
                      value={credForm.issueDate}
                      onChange={(e) => setCredForm({ ...credForm, issueDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Ngày hết hạn</label>
                    <input
                      type="date"
                      value={credForm.expiryDate}
                      onChange={(e) => setCredForm({ ...credForm, expiryDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline cursor-pointer w-fit">
                      <Paperclip className="w-3.5 h-3.5" />
                      {credFile ? credFile.name : "Đính kèm ảnh/PDF minh chứng"}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => setCredFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setAddingCred(false); setCredForm(BLANK_CRED); setCredFile(null); }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleAddCredential}
                    disabled={savingCred || !credForm.name.trim()}
                    className="flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-md font-medium"
                  >
                    {savingCred ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Lưu
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingCred(true)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm chứng chỉ/bằng cấp
              </button>
            )
          )}
        </div>
      </Section>

      {/* Kiêm nhiệm */}
      {(user.positions ?? []).length > 0 && (
        <Section title="Chức vụ / Kiêm nhiệm" icon={BadgeCheck}>
          <div className="flex flex-wrap gap-2">
            {(user.positions ?? []).map((p, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                {p.title}{p.unitName ? ` — ${p.unitName}` : ""}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Vai trò NCKH */}
      {(user.researchDesignations ?? []).length > 0 && (
        <Section title="Vai trò NCKH" icon={BadgeCheck}>
          <div className="flex flex-wrap gap-2">
            {(user.researchDesignations ?? []).map((d) => (
              <span key={d} className="text-xs px-2.5 py-1 rounded-full font-semibold bg-purple-600 dark:bg-purple-700 text-white">
                {RESEARCH_DESIGNATION_LABEL[d]}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Học vấn & khoa học */}
      {(user.educationLevel || user.major || user.academicTitle || user.scientificProfile || user.workHistory) && (
        <Section title="Học vấn & khoa học" icon={GraduationCap}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trình độ" value={user.educationLevel} />
            <Field label="Chuyên ngành" value={user.major} />
            <Field label="Học hàm/học vị" value={user.academicTitle} />
          </div>
          {user.workHistory && (
            <div className="mt-3">
              <p className="text-[11px] text-[var(--muted-foreground)]">Quá trình công tác</p>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-line">{user.workHistory}</p>
            </div>
          )}
          {user.scientificProfile && (
            <div className="mt-3">
              <p className="text-[11px] text-[var(--muted-foreground)]">Lý lịch khoa học</p>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-line">{user.scientificProfile}</p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
