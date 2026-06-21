"use client";

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import WidgetWrapper from "./WidgetWrapper";
import type { WidgetConfig, WidgetType } from "@/types";
import dynamic from "next/dynamic";

// Placeholder for unimplemented widget types
const Placeholder = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center h-full text-xs text-[var(--muted-foreground)] p-4">{label}</div>
);

// Lazy-load all widgets to keep bundle small
const WIDGET_MAP: Partial<Record<WidgetType, React.ComponentType>> = {
  my_tasks:          dynamic(() => import("./widgets/MyTasksWidget")),
  support_tasks:     dynamic(() => import("./widgets/SupportTasksWidget")),
  analytics_summary: dynamic(() => import("./widgets/AnalyticsSummaryWidget")),
  deadline_alert:    dynamic(() => import("./widgets/DeadlineAlertWidget")),
  team_leaderboard:  dynamic(() => import("./widgets/TeamLeaderboardWidget")),
  kpi_week:          dynamic(() => import("./widgets/KPIWeekWidget")),
  calendar_mini:     dynamic(() => import("./widgets/CalendarMiniWidget")),
  workload_heatmap:  dynamic(() => import("./widgets/WorkloadHeatmapWidget")),
  internal_messages: dynamic(() => import("./widgets/InternalMessagesWidget")),
};

interface Props {
  widgets: WidgetConfig[];
  isEditMode: boolean;
  onReorder: (widgets: WidgetConfig[]) => void;
  onHide: (id: string) => void;
  onResize: (id: string, w: number, h: number) => void;
}

export default function DashboardGrid({ widgets, isEditMode, onReorder, onHide, onResize }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = widgets.filter((w) => w.visible);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = visible.findIndex((w) => w.id === active.id);
    const newIdx = visible.findIndex((w) => w.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(visible, oldIdx, newIdx);
    // Merge back hidden widgets at their original positions
    const hidden = widgets.filter((w) => !w.visible);
    onReorder([...reordered, ...hidden]);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gridAutoRows: "220px" }}>
          {visible.map((widget) => {
            const WidgetComponent = WIDGET_MAP[widget.type] ?? (() => <Placeholder label={widget.type} />);
            if (!WidgetComponent) return null;
            return (
              <WidgetWrapper key={widget.id} widget={widget} isEditMode={isEditMode} onHide={onHide} onResize={onResize}>
                <WidgetComponent />
              </WidgetWrapper>
            );
          })}
          {isEditMode && visible.length === 0 && (
            <div className="col-span-full text-center py-16 text-[var(--muted-foreground)] text-sm border-2 border-dashed border-[var(--border)] rounded-xl">
              Tất cả widget đã bị ẩn. Nhấn "Thêm widget" để hiện lại.
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
