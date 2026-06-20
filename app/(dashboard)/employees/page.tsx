"use client";

import { useState } from "react";
import { Users, Search, Plus, Edit2, UserCheck, UserX } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { saveUser } from "@/lib/firebase/firestore";
import type { User, UserRole } from "@/types";
import { getInitials, avatarColor, roleLabel } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_COLORS: Record<UserRole, string> = {
  guest: "bg-gray-100 text-gray-700",
  staff: "bg-blue-100 text-blue-700",
  teamLead: "bg-violet-100 text-violet-700",
  director: "bg-amber-100 text-amber-700",
  hrAdmin: "bg-red-100 text-red-700",
};

export default function EmployeesPage() {
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<User | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const canManage = currentUser ? hasPermission(currentUser.role, "user:manage") : false;
  const canRead = currentUser ? hasPermission(currentUser.role, "user:read") : false;

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        Bạn không có quyền xem danh sách nhân viên.
      </div>
    );
  }

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.department ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleToggleActive = async (user: User) => {
    setSavingId(user.id);
    try {
      await saveUser({ ...user, isActive: !user.isActive });
      toast.success(`${user.isActive ? "Đã vô hiệu hóa" : "Đã kích hoạt"} ${user.name}`);
    } catch {
      toast.error("Cập nhật thất bại");
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveRole = async (user: User, role: UserRole) => {
    setSavingId(user.id);
    try {
      await saveUser({ ...user, role });
      toast.success(`Đã cập nhật vai trò ${user.name}`);
      setEditUser(null);
    } catch {
      toast.error("Cập nhật vai trò thất bại");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" />
          Nhân viên ({users.filter((u) => u.isActive).length} hoạt động)
        </h1>
      </div>

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
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
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
                <tr key={user.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: avatarColor(user.name) }}
                      >
                        {getInitials(user.name)}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{user.name}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{user.department ?? "—"}</td>
                  <td className="px-4 py-3">
                    {editUser?.id === user.id && canManage ? (
                      <select
                        value={editUser.role}
                        onChange={(e) => setEditUser({ ...editUser, role: e.target.value as UserRole })}
                        onBlur={() => handleSaveRole(user, editUser.role)}
                        autoFocus
                        className="px-2 py-1 text-xs border border-blue-400 rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none"
                      >
                        {(["guest", "staff", "teamLead", "director", "hrAdmin"] as UserRole[]).map((r) => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
                        {roleLabel(user.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {user.isActive ? "Hoạt động" : "Vô hiệu"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditUser(user)}
                          className="p-1.5 text-[var(--muted-foreground)] hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                          title="Chỉnh sửa vai trò"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
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
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-10 text-center text-[var(--muted-foreground)] text-sm">
                    Không tìm thấy nhân viên
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
