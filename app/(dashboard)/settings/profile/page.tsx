"use client";

import { useState, useRef, useEffect } from "react";
import { User, Camera, Loader2, Pencil, Clock, ExternalLink } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { saveUser, getRequests } from "@/lib/firebase/firestore";
import { getInitials, avatarColor, roleLabel, formatDate } from "@/lib/utils";
import { PROFILE_FIELD_LABEL } from "@/types";
import type { WorkRequest } from "@/types";
import { ProfileChangeRequestModal } from "@/components/employees/ProfileChangeRequestModal";
import { toast } from "sonner";
import Link from "next/link";

export default function ProfilePage() {
  const { currentUser, setCurrentUser } = useAuthStore();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<WorkRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    refreshPendingRequest();
  }, [currentUser?.id]);

  function refreshPendingRequest() {
    if (!currentUser) return;
    getRequests().then((reqs) => {
      const pending = reqs.find(
        (r) => r.submittedBy === currentUser.id && r.type === "profile_change" && r.status === "pending",
      );
      setPendingRequest(pending ?? null);
    });
  }

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

      {/* Pending change request banner */}
      {pendingRequest && (
        <div className="mb-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">
            Có 1 đề xuất thay đổi thông tin đang chờ HR/Admin phê duyệt.
          </p>
          <Link href={`/requests/${pendingRequest.id}`} className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline shrink-0">
            Xem đơn →
          </Link>
        </div>
      )}

      {/* Thông tin cơ bản — chỉ xem, sửa qua "Đề xuất thay đổi" (cần HR/Admin duyệt) */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Thông tin cơ bản</h2>
          <button
            onClick={() => setShowRequestModal(true)}
            disabled={!!pendingRequest}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            <Pencil className="w-3.5 h-3.5" /> Đề xuất thay đổi
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["name", "phone", "position", "department", "birthday", "idNumber"] as const).map((key) => (
            <div key={key}>
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">{PROFILE_FIELD_LABEL[key]}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {key === "birthday" && currentUser[key] ? formatDate(currentUser[key] as string) : (currentUser[key] as string) || "—"}
              </p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--foreground)] mb-1">Email</p>
          <p className="text-sm text-[var(--muted-foreground)]">{currentUser.email}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Email được quản lý bởi tài khoản đăng nhập.</p>
        </div>
      </div>

      {/* Hồ sơ học vấn & khoa học — cũng qua "Đề xuất thay đổi" */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Hồ sơ học vấn & khoa học</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["educationLevel", "major", "academicTitle"] as const).map((key) => (
            <div key={key}>
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">{PROFILE_FIELD_LABEL[key]}</p>
              <p className="text-sm text-[var(--muted-foreground)]">{currentUser[key] || "—"}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--foreground)] mb-1">Lý lịch khoa học</p>
          <p className="text-sm text-[var(--muted-foreground)] whitespace-pre-line">{currentUser.scientificProfile || "—"}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--foreground)] mb-1">Quá trình công tác</p>
          <p className="text-sm text-[var(--muted-foreground)] whitespace-pre-line">{currentUser.workHistory || "—"}</p>
        </div>
      </div>

      <Link
        href={`/employees/${currentUser.id}`}
        className="flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:underline mb-3"
      >
        Xem hồ sơ nhân viên đầy đủ (hợp đồng, chứng chỉ...) <ExternalLink className="w-3.5 h-3.5" />
      </Link>

      <div className="flex items-center justify-center gap-4">
        <Link href="/settings/security" className="text-sm text-blue-600 hover:underline">
          Đổi mật khẩu →
        </Link>
        <span className="text-[var(--border)]">|</span>
        <Link href="/settings/notifications" className="text-sm text-blue-600 hover:underline">
          Tùy chọn thông báo →
        </Link>
      </div>

      {showRequestModal && (
        <ProfileChangeRequestModal
          currentUser={currentUser}
          onClose={() => setShowRequestModal(false)}
          onSubmitted={refreshPendingRequest}
        />
      )}
    </div>
  );
}
