"use client";

import { useState } from "react";
import { User, Camera, Save } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { saveUser } from "@/lib/firebase/firestore";
import { getInitials, avatarColor } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

export default function ProfilePage() {
  const { currentUser, setCurrentUser } = useAuthStore();
  const [form, setForm] = useState({
    name: currentUser?.name ?? "",
    phone: currentUser?.phone ?? "",
    position: currentUser?.position ?? "",
    department: currentUser?.department ?? "",
  });
  const [saving, setSaving] = useState(false);

  if (!currentUser) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = { ...currentUser, ...form };
      await saveUser(updated);
      setCurrentUser(updated);
      toast.success("Đã lưu hồ sơ");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2 mb-6">
        <User className="w-6 h-6 text-blue-500" />
        Hồ sơ cá nhân
      </h1>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6 p-5 bg-[var(--card)] border border-[var(--border)] rounded-xl">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
          style={{ background: avatarColor(currentUser.name) }}
        >
          {getInitials(currentUser.name)}
        </div>
        <div>
          <p className="font-semibold text-[var(--foreground)]">{currentUser.name}</p>
          <p className="text-sm text-[var(--muted-foreground)]">{currentUser.email}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{currentUser.role}</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 mb-4">
        {[
          { key: "name", label: "Họ tên", type: "text" },
          { key: "phone", label: "Số điện thoại", type: "tel" },
          { key: "position", label: "Chức danh", type: "text" },
          { key: "department", label: "Phòng ban", type: "text" },
        ].map(({ key, label, type }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
            <input
              type={type}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Email</label>
          <input
            type="email"
            value={currentUser.email}
            disabled
            className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Email được quản lý bởi Google Account.</p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60"
      >
        {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
        Lưu hồ sơ
      </button>

      <div className="mt-3 text-center">
        <Link href="/settings/notifications" className="text-sm text-blue-600 hover:underline">
          Tùy chọn thông báo →
        </Link>
      </div>
    </div>
  );
}
