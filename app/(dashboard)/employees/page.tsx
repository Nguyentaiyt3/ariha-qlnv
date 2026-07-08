"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { Users, Search, Edit2, UserCheck, UserX, Save, X, Clock, KeyRound, ChevronDown, Check, ShieldAlert, UserPlus, Loader2, FileUp, GitMerge } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";
import { saveUser, getUsers } from "@/lib/firebase/firestore";
import { ImportEmployeesModal } from "@/components/employees/ImportEmployeesModal";
import { MergeEmployeesModal } from "@/components/employees/MergeEmployeesModal";
import type { User, UserRole, OrgPosition, ResearchDesignation } from "@/types";
import { RESEARCH_DESIGNATION_LABEL } from "@/types";
import { cn, getInitials, avatarColor, roleLabel, contractAlert, credentialAlert } from "@/lib/utils";
import { toast } from "sonner";

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

// ─── Phát hiện nhân viên trùng lặp ──────────────────────────────

interface DuplicatePair {
  a: User;
  b: User;
  reasons: string[];
}

function normalizePhone(p?: string): string {
  return (p || "").replace(/\D/g, "");
}
function normalizeName(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * So khớp từng cặp nhân viên đang hoạt động theo CCCD/điện thoại (tín hiệu mạnh) hoặc tên + phòng
 * ban trùng nhau (tín hiệu yếu hơn, vẫn đáng ngờ). O(n²) nhưng chấp nhận được với quy mô nhân sự
 * 1 tổ chức (vài chục–vài trăm người), chỉ chạy khi hiển thị trang, không phải trên hot path.
 */
function findDuplicatePairs(users: User[]): DuplicatePair[] {
  const active = users.filter((u) => u.isActive);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const reasons: string[] = [];
      if (a.idNumber?.trim() && b.idNumber?.trim() && a.idNumber.trim() === b.idNumber.trim()) {
        reasons.push("Trùng số CCCD");
      }
      const pa = normalizePhone(a.phone);
      const pb = normalizePhone(b.phone);
      if (pa && pb && pa === pb) reasons.push("Trùng số điện thoại");
      if (normalizeName(a.name) === normalizeName(b.name) && a.department && b.department && a.department === b.department) {
        reasons.push("Trùng tên + phòng ban");
      }
      if (reasons.length > 0) pairs.push({ a, b, reasons });
    }
  }
  return pairs;
}

// ─── Inline Combobox ──────────────────────────────────────────
// Combobox nhỏ gọn dùng trong table cell.
// Cho phép gõ tự do (free text) — list chỉ là gợi ý.

function InlineCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; sub?: string }>;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = value
    ? options.filter(o => o.label.toLowerCase().includes(value.toLowerCase()))
    : options;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="flex items-center border border-blue-400 rounded-lg overflow-hidden bg-[var(--background)] focus-within:ring-1 focus-within:ring-blue-400/40">
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 text-xs px-2 py-1 bg-transparent text-[var(--foreground)] focus:outline-none min-w-0"
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
          className="px-1 text-slate-400 hover:text-slate-600 shrink-0"
        >
          <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-44 overflow-y-auto">
          {filtered.map((opt, i) => (
            <div
              key={i}
              onMouseDown={e => { e.preventDefault(); onChange(opt.label); setOpen(false); }}
              className={cn(
                "px-2.5 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 transition",
                value === opt.label && "bg-blue-50 dark:bg-blue-950/20"
              )}
            >
              <p className="text-xs text-[var(--foreground)]">{opt.label}</p>
              {opt.sub && <p className="text-[10px] text-slate-400">{opt.sub}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────

function Avatar({ user, size = "md" }: { user: User; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  if (user.avatar) {
    return (
      <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer"
        className={`${dim} rounded-full object-cover flex-shrink-0 ring-2 ring-white`} />
    );
  }
  return (
    <div className={`${dim} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ring-2 ring-white`}
      style={{ background: avatarColor(user.name) }}>
      {getInitials(user.name)}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────

interface EditState {
  userId: string;
  name: string;
  department: string;
  role: UserRole;
  position: string;
  positions: OrgPosition[];
  addingPos: boolean;
  newPosTitle: string;
  newPosUnit: string;
  newPosRole: UserRole;
  researchDesignations: ResearchDesignation[];
}

// ─── Thêm nhân viên mới (HR/Admin tạo trực tiếp, khác luồng tự đăng ký → guest → duyệt) ──

const ASSIGNABLE_ROLES: UserRole[] = ["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"];

function genTempPassword() {
  return "Ariha@" + Math.random().toString(36).slice(-6);
}

function AddEmployeeModal({
  unitOptions, posOptions, onClose, onCreated,
}: {
  unitOptions: Array<{ label: string; sub?: string }>;
  posOptions: Array<{ label: string; sub?: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [employeeCode, setEmployeeCode] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [tempPassword, setTempPassword] = useState(genTempPassword());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Vui lòng nhập tên và email");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          tempPassword,
          role,
          department: department.trim() || undefined,
          position: position.trim() || undefined,
          employeeCode: employeeCode.trim() || undefined,
          idNumber: idNumber.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Tạo tài khoản thất bại");
      }
      toast.success(`Đã tạo tài khoản cho ${name.trim()}. Mật khẩu tạm: ${tempPassword}`, {
        duration: 60000,
        description: "Gửi cho nhân viên. Họ sẽ bị buộc đổi mật khẩu khi đăng nhập.",
      });
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo tài khoản thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-500" /> Thêm nhân viên mới
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Họ tên *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Phòng ban</label>
              <InlineCombobox value={department} onChange={setDepartment} options={unitOptions} placeholder="Chọn phòng ban" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Chức danh</label>
              <InlineCombobox value={position} onChange={setPosition} options={posOptions} placeholder="Chọn chức danh" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Vai trò *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mã nhân viên</label>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Số CCCD</label>
            <input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mật khẩu tạm</label>
            <div className="flex gap-2">
              <input
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setTempPassword(genTempPassword())}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Tạo lại
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Nhân viên sẽ bị buộc đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              Huỷ
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Tạo tài khoản
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { currentUser } = useAuthStore();
  const { users, setUsers } = useTaskStore();
  const abbr = useUnitAbbr();
  const [search, setSearch] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<UserRole>("staff");
  const [bulkApproving, setBulkApproving] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState<DuplicatePair | null>(null);

  // Catalog data for comboboxes
  const [unitOptions, setUnitOptions] = useState<Array<{ label: string; sub?: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; sub?: string }>>([]);

  useEffect(() => {
    // Position catalog từ API
    fetch("/api/positions")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.positions)) {
          const seen = new Set<string>();
          const opts: Array<{ label: string; sub?: string }> = [];
          for (const p of d.positions as Array<{ title: string; name?: string }>) {
            if (!seen.has(p.title)) {
              seen.add(p.title);
              opts.push({ label: p.title, sub: p.name !== p.title ? p.name : undefined });
            }
          }
          setPosOptions(opts);
        }
      })
      .catch(() => {});

    // Unit catalog từ API
    fetch("/api/units")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.catalog)) {
          setUnitOptions(
            (d.catalog as Array<{ name: string; abbr?: string }>).map(u => ({
              label: u.name,
              sub: u.abbr,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const canManage = currentUser ? hasPermission(currentUser.role, "user:manage") : false;
  const canRead   = currentUser ? hasPermission(currentUser.role, "user:read")   : false;
  const canCreate = currentUser ? hasPermission(currentUser.role, "user:create") : false;
  const canMerge  = currentUser ? hasPermission(currentUser.role, "user:merge")  : false;

  const duplicatePairs = useMemo(() => (canMerge ? findDuplicatePairs(users) : []), [users, canMerge]);

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        Bạn không có quyền xem danh sách nhân viên.
      </div>
    );
  }

  const pendingGuests = users.filter(u => u.role === "guest" && u.isActive);

  // Dashboard cảnh báo hết hạn — gộp hợp đồng + chứng chỉ/bằng cấp sắp/đã hết hạn
  const expiryAlerts = users
    .filter(u => u.isActive)
    .flatMap(u => {
      const items: { user: User; label: string; expired: boolean }[] = [];
      const cAlert = contractAlert(u.contractEnd);
      if (cAlert) items.push({ user: u, label: "Hợp đồng — " + cAlert.label, expired: cAlert.days < 0 });
      for (const cred of u.credentials ?? []) {
        const credA = credentialAlert(cred.expiryDate);
        if (credA) items.push({ user: u, label: `${cred.name} — ${credA.label}`, expired: credA.days < 0 });
      }
      return items;
    });

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.department ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (user: User) => {
    setEditState({
      userId: user.id,
      name: user.name,
      department: user.department ?? "",
      role: user.role,
      position: user.position ?? "",
      positions: user.positions ?? [],
      addingPos: false,
      newPosTitle: "",
      newPosUnit: "",
      newPosRole: user.role,
      researchDesignations: user.researchDesignations ?? [],
    });
  };

  const cancelEdit = () => setEditState(null);

  const handleSaveEdit = async (user: User) => {
    if (!editState) return;
    setSavingId(user.id);
    try {
      const updated: User = {
        ...user,
        name: editState.name.trim() || user.name,
        department: editState.department.trim() || undefined,
        role: editState.role,
        position: editState.position.trim() || undefined,
        positions: editState.positions,
        researchDesignations: editState.researchDesignations.length > 0
          ? editState.researchDesignations
          : undefined,
      };
      await saveUser(updated);
      setUsers(users.map(u => u.id === user.id ? updated : u));
      toast.success(`Đã cập nhật ${updated.name}`);
      setEditState(null);
    } catch (err) {
      console.error(err);
      toast.error("Cập nhật thất bại — kiểm tra Firestore rules");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (user: User) => {
    setSavingId(user.id);
    try {
      await saveUser({ ...user, isActive: !user.isActive });
      toast.success(`${user.isActive ? "Đã vô hiệu hóa" : "Đã kích hoạt"} ${user.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Cập nhật thất bại — kiểm tra Firestore rules");
    } finally {
      setSavingId(null);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!window.confirm(`Reset mật khẩu cho ${user.name}?\nHệ thống sẽ tạo mật khẩu tạm và bắt họ đổi ở lần đăng nhập tiếp theo.`)) return;
    const tempPassword = "Ariha@" + Math.random().toString(36).slice(-6);
    setSavingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempPassword }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Reset thất bại");
      }
      toast.success(`Mật khẩu tạm của ${user.name}: ${tempPassword}`, {
        duration: 60000,
        description: "Gửi cho nhân viên. Họ sẽ bị buộc đổi mật khẩu khi đăng nhập.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset thất bại");
    } finally {
      setSavingId(null);
    }
  };

  const handleBulkApprove = async (ids: string[], role: UserRole) => {
    if (ids.length === 0) return;
    setBulkApproving(true);
    try {
      const res = await fetch("/api/users/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ids, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Lỗi");
      const { count } = await res.json();
      toast.success(`Đã duyệt ${count} tài khoản → ${roleLabel(role)}`);
      setSelectedPending(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duyệt thất bại");
    } finally {
      setBulkApproving(false);
    }
  };

  const isEditing = (user: User) => editState?.userId === user.id;

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" />
          Nhân viên
          <span className="text-base font-normal text-[var(--muted-foreground)]">
            ({users.filter(u => u.isActive).length} hoạt động)
          </span>
        </h1>
        {canCreate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition"
            >
              <FileUp className="w-4 h-4" /> Import Excel
            </button>
            <button
              onClick={() => setShowAddEmployee(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              <UserPlus className="w-4 h-4" /> Thêm nhân viên
            </button>
          </div>
        )}
      </div>

      {showAddEmployee && (
        <AddEmployeeModal
          unitOptions={unitOptions}
          posOptions={posOptions}
          onClose={() => setShowAddEmployee(false)}
          onCreated={() => { getUsers().then(setUsers); }}
        />
      )}

      {showImport && (
        <ImportEmployeesModal
          onClose={() => setShowImport(false)}
          onImported={() => { getUsers().then(setUsers); }}
        />
      )}

      {mergeCandidate && (
        <MergeEmployeesModal
          userA={mergeCandidate.a}
          userB={mergeCandidate.b}
          onClose={() => setMergeCandidate(null)}
          onMerged={() => { getUsers().then(setUsers); }}
        />
      )}

      {/* ── Cảnh báo nhân viên trùng lặp ── */}
      {canMerge && duplicatePairs.length > 0 && (
        <div className="mb-5 border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800">
            <GitMerge className="w-4 h-4 text-violet-600 shrink-0" />
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
              {duplicatePairs.length} cặp nhân viên có khả năng trùng lặp
            </p>
          </div>
          <div className="divide-y divide-violet-100 dark:divide-violet-900/30 max-h-64 overflow-y-auto bg-white dark:bg-slate-900">
            {duplicatePairs.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--foreground)] truncate">
                    <span className="font-medium">{p.a.name}</span> ({p.a.email}) &nbsp;↔&nbsp; <span className="font-medium">{p.b.name}</span> ({p.b.email})
                  </p>
                  <p className="text-[11px] text-violet-600 dark:text-violet-400 truncate">{p.reasons.join(" · ")}</p>
                </div>
                <button
                  onClick={() => setMergeCandidate(p)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition shrink-0"
                >
                  <GitMerge className="w-3 h-3" /> Xem & Gộp
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dashboard cảnh báo hết hạn (hợp đồng + chứng chỉ/bằng cấp) ── */}
      {canManage && expiryAlerts.length > 0 && (
        <div className="mb-5 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {expiryAlerts.length} mục hợp đồng/chứng chỉ sắp hoặc đã hết hạn
            </p>
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-900/30 max-h-48 overflow-y-auto bg-white dark:bg-slate-900">
            {expiryAlerts.map((item, i) => (
              <Link
                key={i}
                href={`/employees/${item.user.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 transition-colors"
              >
                <Avatar user={item.user} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">{item.user.name}</p>
                  <p className={cn("text-[11px] truncate", item.expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                    {item.label}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Approval Queue ── */}
      {canManage && pendingGuests.length > 0 && (
        <div className="mb-5 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {pendingGuests.length} tài khoản chờ phân quyền
              </p>
              {selectedPending.size > 0 && (
                <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full px-2 py-0.5">
                  {selectedPending.size} đã chọn
                </span>
              )}
            </div>

            {/* Bulk controls */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Select all */}
              <button
                onClick={() => {
                  if (selectedPending.size === pendingGuests.length) {
                    setSelectedPending(new Set());
                  } else {
                    setSelectedPending(new Set(pendingGuests.map(u => u.id)));
                  }
                }}
                className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
              >
                {selectedPending.size === pendingGuests.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </button>

              {/* Role for bulk */}
              <select
                value={bulkRole}
                onChange={e => setBulkRole(e.target.value as UserRole)}
                className="text-xs border border-amber-300 dark:border-amber-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {(["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"] as UserRole[]).map(r => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>

              {/* Approve selected */}
              <button
                disabled={selectedPending.size === 0 || bulkApproving}
                onClick={() => handleBulkApprove(Array.from(selectedPending), bulkRole)}
                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition"
              >
                {bulkApproving ? "Đang duyệt..." : `Duyệt ${selectedPending.size > 0 ? selectedPending.size : ""} đã chọn`}
              </button>

              {/* Approve all shortcut */}
              <button
                disabled={bulkApproving}
                onClick={() => handleBulkApprove(pendingGuests.map(u => u.id), "staff")}
                className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-40 transition"
              >
                Duyệt tất cả → Nhân viên
              </button>
            </div>
          </div>

          {/* Guest list */}
          <div className="divide-y divide-amber-100 dark:divide-amber-900/30 max-h-64 overflow-y-auto bg-white dark:bg-slate-900">
            {pendingGuests.map(u => {
              const checked = selectedPending.has(u.id);
              return (
                <div
                  key={u.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 transition-colors",
                    checked && "bg-amber-50/60 dark:bg-amber-950/20",
                  )}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedPending(prev => {
                        const next = new Set(prev);
                        if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                        return next;
                      });
                    }}
                    className="w-4 h-4 rounded accent-amber-500 cursor-pointer shrink-0"
                  />

                  <Avatar user={u} size="sm" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{u.name}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)] truncate">{u.email}</p>
                  </div>

                  {/* Per-user quick assign */}
                  <select
                    defaultValue=""
                    onChange={async e => {
                      const newRole = e.target.value as UserRole;
                      if (!newRole) return;
                      try {
                        await saveUser({ ...u, role: newRole });
                        toast.success(`${u.name} → ${roleLabel(newRole)}`);
                        e.target.value = "";
                      } catch {
                        toast.error("Phân quyền thất bại.");
                        e.target.value = "";
                      }
                    }}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-[var(--background)] text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
                  >
                    <option value="">Gán riêng...</option>
                    {(["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"] as UserRole[]).map(r => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, email, phòng ban..."
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Nhân viên</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Phòng ban</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Vai trò</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Chức vụ / Kiêm nhiệm</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Trạng thái</th>
                {canManage && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Hành động</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr
                  key={user.id}
                  className={`border-b border-[var(--border)] last:border-0 transition-colors ${
                    isEditing(user) ? "bg-blue-50/40 dark:bg-blue-950/20" : "hover:bg-[var(--muted)]"
                  }`}
                >
                  {/* Avatar + Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={user} />
                      <div className="min-w-0">
                        {isEditing(user) ? (
                          <input
                            value={editState!.name}
                            onChange={e => setEditState({ ...editState!, name: e.target.value })}
                            className="text-sm font-medium border border-blue-400 rounded-lg px-2 py-0.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none w-36"
                          />
                        ) : (
                          <Link
                            href={`/employees/${user.id}`}
                            className="font-medium text-[var(--foreground)] truncate hover:text-blue-600 hover:underline block"
                          >
                            {user.name}
                          </Link>
                        )}
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Department — combobox từ unit catalog */}
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {isEditing(user) ? (
                      <InlineCombobox
                        value={editState!.department}
                        onChange={v => setEditState({ ...editState!, department: v })}
                        options={unitOptions}
                        placeholder="Phòng ban"
                        className="w-40"
                      />
                    ) : (
                      abbr(user.department)
                    )}
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    {isEditing(user) && canManage ? (
                      <select
                        value={editState!.role}
                        onChange={e => setEditState({ ...editState!, role: e.target.value as UserRole })}
                        className="px-2 py-1 text-xs border border-blue-400 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none"
                      >
                        {(["guest", "staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"] as UserRole[]).map(r => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
                        {roleLabel(user.role)}
                      </span>
                    )}
                  </td>

                  {/* Position / Kiêm nhiệm */}
                  <td className="px-4 py-3 max-w-[240px]">
                    {isEditing(user) ? (
                      <div className="space-y-1.5">
                        {/* Chức danh chính — combobox từ position catalog */}
                        <InlineCombobox
                          value={editState!.position}
                          onChange={v => setEditState({ ...editState!, position: v })}
                          options={posOptions}
                          placeholder="Chức danh chính..."
                          className="w-full"
                        />

                        {/* Danh sách kiêm nhiệm */}
                        {editState!.positions.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {editState!.positions.map((p, i) => (
                              <div key={i} className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-medium text-slate-700 dark:text-slate-200 truncate">{p.title}</p>
                                  {p.unitName && <p className="text-[9px] text-slate-400 truncate">{p.unitName}</p>}
                                </div>
                                <button
                                  onClick={() => setEditState(s => s ? { ...s, positions: s.positions.filter((_, j) => j !== i) } : s)}
                                  className="text-slate-400 hover:text-red-500 shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Form thêm kiêm nhiệm */}
                        {editState!.addingPos ? (
                          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-2 space-y-1.5 bg-blue-50/40 dark:bg-blue-950/20">
                            {/* Chức danh kiêm nhiệm — combobox */}
                            <InlineCombobox
                              value={editState!.newPosTitle}
                              onChange={v => setEditState({ ...editState!, newPosTitle: v })}
                              options={posOptions}
                              placeholder="Chức danh kiêm nhiệm *"
                            />
                            {/* Đơn vị — combobox */}
                            <InlineCombobox
                              value={editState!.newPosUnit}
                              onChange={v => setEditState({ ...editState!, newPosUnit: v })}
                              options={unitOptions}
                              placeholder="Đơn vị quản lý..."
                            />
                            <select
                              value={editState!.newPosRole}
                              onChange={e => setEditState({ ...editState!, newPosRole: e.target.value as UserRole })}
                              className="text-xs border border-blue-300 dark:border-blue-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-[var(--foreground)] focus:outline-none w-full"
                            >
                              {(["staff", "teamLead", "director"] as UserRole[]).map(r => (
                                <option key={r} value={r}>{roleLabel(r)} — quyền hạn vị trí này</option>
                              ))}
                            </select>
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => setEditState(s => s ? { ...s, addingPos: false, newPosTitle: "", newPosUnit: "", newPosRole: s.role } : s)}
                                className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-1"
                              >
                                Hủy
                              </button>
                              <button
                                onClick={() => {
                                  if (!editState!.newPosTitle.trim()) return;
                                  const newPos: OrgPosition = {
                                    role: editState!.newPosRole,
                                    title: editState!.newPosTitle.trim(),
                                    unitName: editState!.newPosUnit.trim() || undefined,
                                  };
                                  setEditState(s => s ? {
                                    ...s,
                                    positions: [...s.positions, newPos],
                                    addingPos: false,
                                    newPosTitle: "",
                                    newPosUnit: "",
                                  } : s);
                                }}
                                className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-md font-medium"
                              >
                                Thêm
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditState({ ...editState!, addingPos: true })}
                            className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                          >
                            + Thêm kiêm nhiệm
                          </button>
                        )}

                        {/* ── Vai trò NCKH ── */}
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-700 mt-1.5">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Vai trò NCKH</p>
                          <div className="flex flex-wrap gap-1">
                            {(["researchManager", "reviewer", "councilMember", "councilChair", "councilSecretary"] as const).map(d => {
                              const active = editState!.researchDesignations.includes(d);
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setEditState(s => {
                                    if (!s) return s;
                                    const list = s.researchDesignations;
                                    return {
                                      ...s,
                                      researchDesignations: active
                                        ? list.filter(x => x !== d)
                                        : [...list, d],
                                    };
                                  })}
                                  className={cn(
                                    "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition font-medium",
                                    active
                                      ? "bg-purple-600 dark:bg-purple-700 border-purple-600 dark:border-purple-700 text-white shadow-sm"
                                      : "border-slate-200 dark:border-slate-700 text-slate-400 hover:border-purple-300 hover:text-purple-600",
                                  )}
                                >
                                  {active && <Check className="w-2.5 h-2.5 shrink-0" />}
                                  {RESEARCH_DESIGNATION_LABEL[d]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {user.position && (
                          <p className="text-xs font-medium text-[var(--foreground)] truncate">{user.position}</p>
                        )}
                        {(user.positions ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(user.positions ?? []).map((p, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                                {p.title}
                              </span>
                            ))}
                          </div>
                        )}
                        {!user.position && (user.positions ?? []).length === 0 && (user.researchDesignations ?? []).length === 0 && (
                          <span className="text-xs text-[var(--muted-foreground)]">—</span>
                        )}
                        {(user.researchDesignations ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(user.researchDesignations ?? []).map(d => (
                              <span key={d} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-600 dark:bg-purple-700 text-white shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />
                                {RESEARCH_DESIGNATION_LABEL[d]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {user.isActive ? "Hoạt động" : "Vô hiệu"}
                      </span>
                      {(() => {
                        const alert = contractAlert(user.contractEnd);
                        return alert ? (
                          <span className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium", alert.cls)}>
                            <ShieldAlert className="w-2.5 h-2.5" /> {alert.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </td>

                  {/* Actions */}
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing(user) ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(user)}
                              disabled={savingId === user.id}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
                            >
                              <Save className="w-3 h-3" />Lưu
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(user)} className="p-1.5 text-[var(--muted-foreground)] hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="Chỉnh sửa">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user)}
                              disabled={savingId === user.id}
                              className="p-1.5 text-[var(--muted-foreground)] hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-40"
                              title="Reset mật khẩu"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(user)}
                              disabled={savingId === user.id || user.id === currentUser?.id}
                              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                                user.isActive
                                  ? "text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-50"
                                  : "text-[var(--muted-foreground)] hover:text-green-600 hover:bg-green-50"
                              }`}
                              title={user.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
                            >
                              {user.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-[var(--muted-foreground)] text-sm">
                    Không tìm thấy nhân viên nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Nhấn ✏️ để chỉnh sửa. Nhấn <strong>Lưu</strong> để xác nhận thay đổi.
        </p>
      )}
    </div>
  );
}
