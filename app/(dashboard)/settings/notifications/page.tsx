"use client";

import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Save, Clock } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { saveUser } from "@/lib/firebase/firestore";
import type { EmailEventType } from "@/types";
import { toast } from "sonner";

interface NotifPrefs {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestFreq: "realtime" | "daily" | "weekly";
  disabledEventTypes: EmailEventType[];
  retentionDays: number;
}

const EVENT_LABELS: { key: EmailEventType; label: string; description: string }[] = [
  { key: "task_assigned" as EmailEventType, label: "Giao nhiệm vụ", description: "Khi bạn được giao một nhiệm vụ mới" },
  { key: "deadline_alert" as EmailEventType, label: "Cảnh báo deadline", description: "Khi nhiệm vụ còn ≤ 2 ngày tới hạn" },
  { key: "task_overdue" as EmailEventType, label: "Nhiệm vụ quá hạn", description: "Khi nhiệm vụ đã vượt qua deadline" },
  { key: "comment_mention" as EmailEventType, label: "Nhắc tên trong bình luận", description: "Khi ai đó nhắc @tên bạn" },
  { key: "approval_request" as EmailEventType, label: "Yêu cầu phê duyệt", description: "Khi cần bạn phê duyệt nhiệm vụ" },
  { key: "task_completed" as EmailEventType, label: "Nhiệm vụ hoàn thành", description: "Khi nhiệm vụ được đánh dấu hoàn thành" },
];

const URGENT_EVENTS: EmailEventType[] = ["task_overdue", "approval_request"];

export default function NotificationSettingsPage() {
  const { currentUser, setCurrentUser } = useAuthStore();
  const [prefs, setPrefs] = useState<NotifPrefs>({
    emailEnabled: true,
    inAppEnabled: true,
    digestFreq: "realtime",
    disabledEventTypes: [],
    retentionDays: 30,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser?.notificationPrefs) {
      setPrefs({
        emailEnabled: currentUser.notificationPrefs.emailEnabled ?? true,
        inAppEnabled: currentUser.notificationPrefs.inAppEnabled ?? true,
        digestFreq: currentUser.notificationPrefs.digestFreq ?? "realtime",
        disabledEventTypes: currentUser.notificationPrefs.disabledEventTypes ?? [],
        retentionDays: currentUser.notificationPrefs.retentionDays ?? 30,
      });
    }
  }, [currentUser]);

  const toggleEventType = (key: EmailEventType) => {
    if (URGENT_EVENTS.includes(key)) return; // can't disable urgent
    setPrefs((prev) => ({
      ...prev,
      disabledEventTypes: prev.disabledEventTypes.includes(key)
        ? prev.disabledEventTypes.filter((e) => e !== key)
        : [...prev.disabledEventTypes, key],
    }));
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      await saveUser({ ...currentUser, notificationPrefs: prefs });
      setCurrentUser({ ...currentUser, notificationPrefs: prefs });
      toast.success("Đã lưu tùy chọn thông báo");
    } catch {
      toast.error("Lưu thất bại, thử lại sau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Bell className="w-6 h-6 text-blue-500" />
          Tùy chọn thông báo
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Kiểm soát cách bạn nhận thông báo từ WorkHub
        </p>
      </div>

      {/* Channel toggles */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5">
        <h2 className="font-semibold text-[var(--foreground)] mb-4">Kênh nhận thông báo</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Mail className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Email</p>
                <p className="text-xs text-[var(--muted-foreground)]">Nhận email tóm tắt vào Gmail</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              onChange={(e) => setPrefs((p) => ({ ...p, emailEnabled: e.target.checked }))}
              className="w-10 h-6 appearance-none bg-gray-200 rounded-full checked:bg-blue-600 transition-colors cursor-pointer relative before:absolute before:left-1 before:top-1 before:w-4 before:h-4 before:bg-white before:rounded-full before:transition-transform checked:before:translate-x-4"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Trong ứng dụng</p>
                <p className="text-xs text-[var(--muted-foreground)]">Hiện chuông thông báo trong WorkHub</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.inAppEnabled}
              onChange={(e) => setPrefs((p) => ({ ...p, inAppEnabled: e.target.checked }))}
              className="w-10 h-6 appearance-none bg-gray-200 rounded-full checked:bg-blue-600 transition-colors cursor-pointer relative before:absolute before:left-1 before:top-1 before:w-4 before:h-4 before:bg-white before:rounded-full before:transition-transform checked:before:translate-x-4"
            />
          </label>
        </div>
      </div>

      {/* Digest frequency */}
      {prefs.emailEnabled && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Tần suất email</h2>
          <div className="grid grid-cols-3 gap-2">
            {(["realtime", "daily", "weekly"] as const).map((freq) => (
              <button
                key={freq}
                onClick={() => setPrefs((p) => ({ ...p, digestFreq: freq }))}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  prefs.digestFreq === freq
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-blue-300"
                }`}
              >
                {freq === "realtime" ? "Ngay lập tức" : freq === "daily" ? "Hàng ngày" : "Hàng tuần"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-event toggles */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-[var(--foreground)] mb-1">Loại sự kiện nhận thông báo</h2>
        <p className="text-xs text-[var(--muted-foreground)] mb-4">
          Sự kiện khẩn cấp (quá hạn, phê duyệt) luôn được gửi và không thể tắt.
        </p>
        <div className="space-y-2">
          {EVENT_LABELS.map(({ key, label, description }) => {
            const isUrgent = URGENT_EVENTS.includes(key);
            const isEnabled = !prefs.disabledEventTypes.includes(key);
            return (
              <div
                key={key}
                className={`flex items-center justify-between p-3 rounded-lg ${isUrgent ? "bg-red-50/50 border border-red-100" : "hover:bg-[var(--muted)]"}`}
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)] flex items-center gap-1.5">
                    {label}
                    {isUrgent && <span className="text-xs text-red-600 font-normal">(bắt buộc)</span>}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={isUrgent}
                  onChange={() => toggleEventType(key)}
                  className="w-4 h-4 rounded cursor-pointer disabled:opacity-50"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Retention / Auto-delete */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-[var(--foreground)] mb-1 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          Tự động xóa thông báo cũ
        </h2>
        <p className="text-xs text-[var(--muted-foreground)] mb-4">
          Thông báo đã đọc sẽ tự xóa sau số ngày bạn chọn. Thông báo chưa đọc và mục cần xử lý sẽ không bị xóa tự động.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {([{ v: 7, label: "7 ngày" }, { v: 30, label: "30 ngày" }, { v: 90, label: "90 ngày" }, { v: 0, label: "Không xóa" }] as const).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setPrefs((p) => ({ ...p, retentionDays: v }))}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                prefs.retentionDays === v
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-blue-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Lưu tùy chọn
      </button>
    </div>
  );
}
