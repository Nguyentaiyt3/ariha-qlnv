"use client";

import { useState, useRef } from "react";
import { User, Camera, Save, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { saveUser } from "@/lib/firebase/firestore";
import { getInitials, avatarColor, roleLabel } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

export default function ProfilePage() {
  const { currentUser, setCurrentUser } = useAuthStore();
  const [form, setForm] = useState({
    name: currentUser?.name ?? "",
    phone: currentUser?.phone ?? "",
    position: currentUser?.position ?? "",
    department: currentUser?.department ?? "",
    birthday: currentUser?.birthday ?? "",
    educationLevel: currentUser?.educationLevel ?? "",
    major: currentUser?.major ?? "",
    academicTitle: currentUser?.academicTitle ?? "",
    scientificProfile: currentUser?.scientificProfile ?? "",
    workHistory: currentUser?.workHistory ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Resize to max 200×200 using canvas — keeps Firestore doc well under 1MB
          const SIZE = 200;
          const canvas = document.createElement("canvas");
          const scale = Math.min(SIZE / img.width, SIZE / img.height, 1);
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

          const updated = { ...currentUser, avatar: dataUrl };
          await saveUser(updated);
          setCurrentUser(updated);
          toast.success("Đã cập nhật ảnh đại diện");
        } catch (err) {
          console.error(err);
          toast.error("Lưu ảnh thất bại");
        } finally {
          setUploadingAvatar(false);
        }
      };
      img.onerror = () => {
        toast.error("Không thể đọc file ảnh");
        setUploadingAvatar(false);
      };
      img.src = ev.target?.result as string;
    };
    reader.onerror = () => {
      toast.error("Không thể đọc file ảnh");
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = { ...currentUser, ...form };
      await saveUser(updated);
      setCurrentUser(updated);
      toast.success("Đã lưu hồ sơ");
    } catch (err) {
      console.error(err);
      toast.error("Lưu thất bại — kiểm tra Firestore rules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2 mb-6">
        <User className="w-6 h-6 text-blue-500" />
        Hồ sơ cá nhân
      </h1>

      {/* Avatar card */}
      <div className="flex items-center gap-5 mb-6 p-5 bg-[var(--card)] border border-[var(--border)] rounded-xl">
        {/* Avatar with upload overlay */}
        <div className="relative flex-shrink-0">
          {currentUser.avatar ? (
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-full object-cover ring-4 ring-[var(--border)]"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold ring-4 ring-[var(--border)]"
              style={{ background: avatarColor(currentUser.name) }}
            >
              {getInitials(currentUser.name)}
            </div>
          )}

          {/* Upload button overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute bottom-0 right-0 w-7 h-7 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-60"
            title="Thay ảnh đại diện"
          >
            {uploadingAvatar ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <div>
          <p className="font-semibold text-[var(--foreground)] text-lg">{currentUser.name}</p>
          <p className="text-sm text-[var(--muted-foreground)]">{currentUser.email}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
            {roleLabel(currentUser.role)}
          </span>
          <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
            Nhấn vào icon 📷 để thay ảnh đại diện (tối đa 2MB)
          </p>
        </div>
      </div>

      {/* Thông tin cơ bản */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Thông tin cơ bản</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: "name",       label: "Họ tên",          type: "text" },
            { key: "phone",      label: "Số điện thoại",   type: "tel"  },
            { key: "position",   label: "Chức danh",        type: "text" },
            { key: "department", label: "Phòng ban",        type: "text" },
            { key: "birthday",   label: "Ngày sinh",        type: "date" },
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
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Email</label>
          <input
            type="email"
            value={currentUser.email}
            disabled
            className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Email được quản lý bởi tài khoản đăng nhập.</p>
        </div>
      </div>

      {/* Hồ sơ học vấn & khoa học */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Hồ sơ học vấn & khoa học</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: "educationLevel", label: "Trình độ",        placeholder: "Đại học / Thạc sĩ / Tiến sĩ" },
            { key: "major",          label: "Chuyên ngành",    placeholder: "VD: Công nghệ thông tin" },
            { key: "academicTitle",  label: "Học hàm / học vị", placeholder: "VD: GS, PGS, TS, ThS" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
              <input
                type="text"
                value={form[key as keyof typeof form]}
                placeholder={placeholder}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Lý lịch khoa học</label>
          <textarea
            rows={4}
            value={form.scientificProfile}
            placeholder="Công trình nghiên cứu, bài báo, đề tài, giải thưởng..."
            onChange={(e) => setForm((f) => ({ ...f, scientificProfile: e.target.value }))}
            className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Quá trình công tác</label>
          <textarea
            rows={3}
            value={form.workHistory}
            placeholder="Tóm tắt quá trình công tác, kinh nghiệm làm việc..."
            onChange={(e) => setForm((f) => ({ ...f, workHistory: e.target.value }))}
            className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Lưu hồ sơ
      </button>

      <div className="mt-3 flex items-center justify-center gap-4">
        <Link href="/settings/security" className="text-sm text-blue-600 hover:underline">
          Đổi mật khẩu →
        </Link>
        <span className="text-[var(--border)]">|</span>
        <Link href="/settings/notifications" className="text-sm text-blue-600 hover:underline">
          Tùy chọn thông báo →
        </Link>
      </div>
    </div>
  );
}
