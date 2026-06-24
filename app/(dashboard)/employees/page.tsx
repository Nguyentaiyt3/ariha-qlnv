"use client";

import { useState } from "react";
import { Users, Search, Edit2, UserCheck, UserX, Save, X, Clock, KeyRound } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { saveUser } from "@/lib/firebase/firestore";
import type { User, UserRole } from "@/types";
import { getInitials, avatarColor, roleLabel } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_COLORS: Record<UserRole, string> = {
  guest:    "bg-gray-100 text-gray-700",
  staff:    "bg-blue-100 text-blue-700",
  teamLead: "bg-violet-100 text-violet-700",
  director: "bg-amber-100 text-amber-700",
  hrAdmin:  "bg-red-100 text-red-700",
  financeViewer:     "bg-emerald-100 text-emerald-700",
  financeAuditor:    "bg-teal-100 text-teal-700",
  financeSupervisor: "bg-cyan-100 text-cyan-700",
};

function Avatar({ user, size = "md" }: { user: User; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "w-12 h-12 text-base" : size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        referrerPolicy="no-referrer"
        className={`${dim} rounded-full object-cover flex-shrink-0 ring-2 ring-white`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ring-2 ring-white`}
      style={{ background: avatarColor(user.name) }}
    >
      {getInitials(user.name)}
    </div>
  );
}

interface EditState {
  userId: string;
  name: string;
  department: string;
  role: UserRole;
}

export default function EmployeesPage() {
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();
  const [search, setSearch] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const canManage = currentUser ? hasPermission(currentUser.role, "user:manage") : false;
  const canRead   = currentUser ? hasPermission(currentUser.role, "user:read")   : false;

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        Bạn không có quyền xem danh sách nhân viên.
      </div>
    );
  }

  const pendingGuests = users.filter((u) => u.role === "guest" && u.isActive);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.department ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const startEdit = (user: User) => {
    setEditState({
      userId: user.id,
      name: user.name,
      department: user.department ?? "",
      role: user.role,
    });
  };

  const cancelEdit = () => setEditState(null);

  const handleSaveEdit = async (user: User) => {
    if (!editState) return;
    setSavingId(user.id);
    try {
      await saveUser({
        ...user,
        name: editState.name.trim() || user.name,
        department: editState.department.trim() || undefined,
        role: editState.role,
      });
      toast.success(`Đã cập nhật ${editState.name || user.name}`);
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

  const isEditing = (user: User) => editState?.userId === user.id;

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" />
          Nhân viên
          <span className="text-base font-normal text-[var(--muted-foreground)]">
            ({users.filter((u) => u.isActive).length} hoạt động)
          </span>
        </h1>
      </div>

      {/* Pending-role banner — visible to managers only */}
      {canManage && pendingGuests.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {pendingGuests.length} tài khoản chờ phân quyền
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingGuests.map((u) => (
              <div key={u.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 shadow-sm">
                <Avatar user={u} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate max-w-[140px]">{u.name}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)] truncate max-w-[140px]">{u.email}</p>
                </div>
                <select
                  defaultValue="guest"
                  onChange={async (e) => {
                    const newRole = e.target.value as UserRole;
                    if (newRole === "guest") return;
                    try {
                      await saveUser({ ...u, role: newRole });
                      toast.success(`Đã phân quyền ${u.name} → ${roleLabel(newRole)}`);
                    } catch {
                      toast.error("Phân quyền thất bại.");
                      e.target.value = "guest";
                    }
                  }}
                  className="text-xs border border-amber-300 dark:border-amber-700 rounded-lg px-2 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="guest">Phân quyền...</option>
                  {(["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"] as UserRole[]).map((r) => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Trạng thái</th>
                {canManage && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Hành động</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
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
                            onChange={(e) => setEditState({ ...editState!, name: e.target.value })}
                            className="text-sm font-medium border border-blue-400 rounded-lg px-2 py-0.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none w-36"
                          />
                        ) : (
                          <p className="font-medium text-[var(--foreground)] truncate">{user.name}</p>
                        )}
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Department */}
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {isEditing(user) ? (
                      <input
                        value={editState!.department}
                        onChange={(e) => setEditState({ ...editState!, department: e.target.value })}
                        placeholder="Phòng ban"
                        className="text-sm border border-blue-400 rounded-lg px-2 py-0.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none w-36"
                      />
                    ) : (
                      user.department ?? "—"
                    )}
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    {isEditing(user) && canManage ? (
                      <select
                        value={editState!.role}
                        onChange={(e) => setEditState({ ...editState!, role: e.target.value as UserRole })}
                        className="px-2 py-1 text-xs border border-blue-400 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none"
                      >
                        {(["guest", "staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"] as UserRole[]).map((r) => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
                        {roleLabel(user.role)}
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {user.isActive ? "Hoạt động" : "Vô hiệu"}
                    </span>
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
                              <Save className="w-3 h-3" />
                              Lưu
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
                            <button
                              onClick={() => startEdit(user)}
                              className="p-1.5 text-[var(--muted-foreground)] hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Chỉnh sửa"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {canManage && (
                              <button
                                onClick={() => handleResetPassword(user)}
                                disabled={savingId === user.id}
                                className="p-1.5 text-[var(--muted-foreground)] hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-40"
                                title="Reset mật khẩu"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            )}
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
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-10 text-center text-[var(--muted-foreground)] text-sm">
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
          Nhấn ✏️ để chỉnh sửa tên, phòng ban và vai trò. Nhấn <strong>Lưu</strong> để xác nhận thay đổi.
        </p>
      )}
    </div>
  );
}
