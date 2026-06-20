"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Clock, AlertTriangle } from "lucide-react";
import { getMilestoneConfigs, saveMilestoneConfig } from "@/lib/firebase/firestore";
import type { MilestoneConfig } from "@/types";
import { DEFAULT_MILESTONE_CONFIG } from "@/lib/deadline-calc";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";

export default function SystemSettingsPage() {
  const { currentUser } = useAuthStore();
  const [config, setConfig] = useState<MilestoneConfig>({
    ...DEFAULT_MILESTONE_CONFIG,
    id: "default",
    name: "Mặc định",
    isDefault: true,
    createdBy: "",
    createdAt: new Date().toISOString(),
  });
  const [saving, setSaving] = useState(false);

  const canEdit = currentUser ? hasPermission(currentUser.role, "*") || currentUser.role === "hrAdmin" : false;

  useEffect(() => {
    getMilestoneConfigs().then((configs) => {
      const def = configs.find((c) => c.id === "default") ?? configs[0];
      if (def) setConfig(def);
    });
  }, []);

  if (!canEdit) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        Chỉ HR Admin mới có quyền chỉnh sửa cấu hình hệ thống.
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMilestoneConfig(config);
      toast.success("Đã lưu cấu hình");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-blue-500" />
        Cấu hình hệ thống
      </h1>

      {/* Milestone config */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5">
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-blue-500" />
          Mốc quy trình 3 giai đoạn
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          Xác định khoảng thời gian tự động tính 3 giai đoạn (Chuẩn bị, Thực hiện, Hoàn thiện) từ deadline gốc.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Ngày chuẩn bị trước deadline (Giai đoạn 1)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={config.daysBeforeForPrepare}
                onChange={(e) => setConfig((c) => ({ ...c, daysBeforeForPrepare: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-[var(--muted-foreground)]">ngày trước deadline gốc</span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Ví dụ: deadline 15/07, chuẩn bị từ {config.daysBeforeForPrepare} ngày trước → bắt đầu 12/07
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Ngày hoàn thiện hồ sơ sau deadline (Giai đoạn 3)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={config.daysAfterForFinalize}
                onChange={(e) => setConfig((c) => ({ ...c, daysAfterForFinalize: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-[var(--muted-foreground)]">ngày sau deadline gốc</span>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Thay đổi này chỉ áp dụng cho nhiệm vụ tạo mới. Nhiệm vụ hiện tại giữ nguyên deadline 3 giai đoạn.
          </p>
        </div>
      </div>

      {/* Risk flag config */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5">
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Ngưỡng cờ rủi ro
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Hiện tại: nhiệm vụ còn ≤ <strong>2 ngày</strong> deadline VÀ tiến độ &lt; <strong>50%</strong> sẽ tự động bị đánh cờ rủi ro.
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          (Ngưỡng này được cấu hình trực tiếp trong <code className="text-blue-600">lib/risk-flag.ts</code>)
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60"
      >
        {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
        Lưu cấu hình
      </button>
    </div>
  );
}
