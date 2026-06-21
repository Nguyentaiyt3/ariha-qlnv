"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Settings2, Plus, Eye, Check } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import type { WidgetConfig, WidgetType } from "@/types";
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";
import { saveUser } from "@/lib/firebase/firestore";

const WIDGET_LABELS: Partial<Record<WidgetType, string>> = {
  my_tasks:          "Nhiệm vụ của tôi",
  support_tasks:     "Hỗ trợ của tôi",
  analytics_summary: "Tổng quan tổ chức",
  deadline_alert:    "Sắp đến hạn",
  team_leaderboard:  "Xếp hạng nhóm",
  kpi_week:          "KPI tuần này",
  calendar_mini:     "7 ngày tới",
  workload_heatmap:  "Phân bổ công việc",
  internal_messages: "Tin nhắn mới nhất",
};

function buildDefaultWidgets(role: string): WidgetConfig[] {
  const layout = DEFAULT_DASHBOARD_LAYOUTS[role as keyof typeof DEFAULT_DASHBOARD_LAYOUTS] ?? DEFAULT_DASHBOARD_LAYOUTS.staff;
  return layout.map((l, i) => ({
    id: generateId("widget"),
    type: l.type as WidgetType,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    visible: true,
  }));
}

export default function DashboardPage() {
  const { currentUser } = useAuthStore();
  const {
    profiles,
    activeProfileId,
    isEditMode,
    setProfiles,
    setActiveProfile,
    updateWidgets,
    addProfile,
    deleteProfile,
    toggleEditMode,
    toggleWidgetVisibility,
    getActiveProfile,
  } = useDashboardStore();

  const [newProfileName, setNewProfileName] = useState("");
  const [showProfileInput, setShowProfileInput] = useState(false);

  // Initialize default profile if none exist
  useEffect(() => {
    if (!currentUser) return;
    if (profiles.length === 0) {
      const defaultWidgets = buildDefaultWidgets(currentUser.role);
      const p = addProfile("Mặc định", defaultWidgets);
      setActiveProfile(p.id);
    }
  }, [currentUser, profiles.length]);

  const activeProfile = getActiveProfile();

  const handleReorder = (widgets: WidgetConfig[]) => {
    if (!activeProfile) return;
    updateWidgets(activeProfile.id, widgets);
  };

  const handleHideWidget = (widgetId: string) => {
    if (!activeProfile) return;
    toggleWidgetVisibility(activeProfile.id, widgetId);
  };

  const handleResize = (widgetId: string, w: number, h: number) => {
    if (!activeProfile) return;
    const updated = activeProfile.widgets.map((wg) =>
      wg.id === widgetId ? { ...wg, w, h } : wg
    );
    updateWidgets(activeProfile.id, updated);
  };

  const handleShowWidget = (widgetId: string) => {
    if (!activeProfile) return;
    toggleWidgetVisibility(activeProfile.id, widgetId);
  };

  const handleAddProfile = () => {
    if (!newProfileName.trim() || !currentUser) return;
    const widgets = buildDefaultWidgets(currentUser.role);
    const p = addProfile(newProfileName.trim(), widgets);
    setActiveProfile(p.id);
    setNewProfileName("");
    setShowProfileInput(false);
  };

  const hiddenWidgets = activeProfile?.widgets.filter((w) => !w.visible) ?? [];
  const allWidgetTypes: WidgetType[] = ["my_tasks", "support_tasks", "analytics_summary", "deadline_alert", "team_leaderboard", "kpi_week", "calendar_mini", "workload_heatmap", "internal_messages"];
  const existingTypes = activeProfile?.widgets.map((w) => w.type) ?? [];
  const addableTypes = allWidgetTypes.filter((t) => !existingTypes.includes(t));

  const handleAddWidget = (type: WidgetType) => {
    if (!activeProfile) return;
    const newWidget: WidgetConfig = {
      id: generateId("widget"),
      type,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      visible: true,
    };
    updateWidgets(activeProfile.id, [...activeProfile.widgets, newWidget]);
  };

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-blue-500" />
          Dashboard
        </h1>

        {/* Profile tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                p.id === activeProfileId
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
              }`}
            >
              {p.name}
            </button>
          ))}
          {showProfileInput ? (
            <div className="flex items-center gap-1.5">
              <input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddProfile()}
                autoFocus
                placeholder="Tên profile..."
                className="px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
              />
              <button onClick={handleAddProfile} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowProfileInput(true)}
              className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-dashed border-[var(--border)] rounded-lg hover:border-blue-300 transition-colors"
              title="Thêm profile mới"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Edit mode toggle */}
        <button
          onClick={toggleEditMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium border transition-colors ${
            isEditMode
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:border-blue-300"
          }`}
        >
          <Settings2 className="w-4 h-4" />
          {isEditMode ? "Xong chỉnh sửa" : "Tùy chỉnh"}
        </button>
      </div>

      {/* Hidden widgets restore panel */}
      {isEditMode && (hiddenWidgets.length > 0 || addableTypes.length > 0) && (
        <div className="mb-4 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
          <p className="text-xs font-medium text-[var(--muted-foreground)] mb-2">
            {hiddenWidgets.length > 0 ? "Widget đã ẩn — nhấn để hiện lại:" : "Thêm widget:"}
          </p>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map((w) => (
              <button
                key={w.id}
                onClick={() => handleShowWidget(w.id)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[var(--muted)] hover:bg-blue-50 hover:text-blue-700 border border-[var(--border)] rounded-full transition-colors"
              >
                <Eye className="w-3 h-3" />
                {WIDGET_LABELS[w.type] ?? w.type}
              </button>
            ))}
            {addableTypes.map((type) => (
              <button
                key={type}
                onClick={() => handleAddWidget(type)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-full transition-colors"
              >
                <Plus className="w-3 h-3" />
                {WIDGET_LABELS[type] ?? type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      {activeProfile ? (
        <DashboardGrid
          widgets={activeProfile.widgets}
          isEditMode={isEditMode}
          onReorder={handleReorder}
          onHide={handleHideWidget}
          onResize={handleResize}
        />
      ) : (
        <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)] text-sm">
          Đang tải dashboard...
        </div>
      )}
    </div>
  );
}
