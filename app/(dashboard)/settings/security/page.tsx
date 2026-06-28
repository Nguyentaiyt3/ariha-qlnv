"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, ShieldCheck, Save, Loader2, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import Link from "next/link";

export default function SecurityPage() {
  const router = useRouter();
  const { currentUser, setCurrentUser } = useAuthStore();
  const forced = !!currentUser?.mustChangePassword;

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!currentUser) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error("Mật khẩu mới tối thiểu 6 ký tự."); return; }
    if (newPassword !== confirm) { toast.error("Mật khẩu xác nhận không khớp."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Đổi mật khẩu thất bại.");
      }
      // Clear the forced-change flag locally so the guard releases
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          mustChangePassword: false,
          passwordUpdatedAt: new Date().toISOString(),
        });
      }
      toast.success("Đã đổi mật khẩu thành công.");
      setOldPassword(""); setNewPassword(""); setConfirm("");
      if (forced) router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi mật khẩu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2 mb-6">
        <ShieldCheck className="w-6 h-6 text-blue-500" />
        Bảo mật & Mật khẩu
      </h1>

      {forced && (
        <div className="mb-5 flex items-start gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Bắt buộc đổi mật khẩu</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Tài khoản của bạn đang dùng mật khẩu tạm. Vui lòng đặt mật khẩu mới để tiếp tục sử dụng hệ thống.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        {/* Current password */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Mật khẩu hiện tại</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type={showOld ? "text" : "password"}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button type="button" onClick={() => setShowOld(!showOld)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Mật khẩu mới</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="w-full pl-10 pr-10 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button type="button" onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Xác nhận mật khẩu mới</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type={showNew ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 ${
                confirm && confirm !== newPassword ? "border-red-500 focus:ring-red-500" : "border-[var(--border)] focus:ring-blue-500"
              }`}
              required
            />
          </div>
          {confirm && confirm !== newPassword && (
            <p className="text-xs text-red-500 mt-1">Mật khẩu không khớp</p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Đổi mật khẩu
        </button>
      </form>

      {!forced && (
        <div className="mt-3 text-center">
          <Link href="/settings/profile" className="text-sm text-blue-600 hover:underline">
            ← Quay lại hồ sơ cá nhân
          </Link>
        </div>
      )}
    </div>
  );
}
