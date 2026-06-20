"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, EyeOff, X } from "lucide-react";
import type { WidgetConfig } from "@/types";

interface Props {
  widget: WidgetConfig;
  isEditMode: boolean;
  onHide: (id: string) => void;
  children: React.ReactNode;
}

export default function WidgetWrapper({ widget, isEditMode, onHide, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !isEditMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    gridColumn: `span ${widget.w ?? 1}`,
    gridRow: `span ${widget.h ?? 1}`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-[var(--card)] border rounded-xl overflow-hidden flex flex-col ${
        isDragging ? "shadow-2xl z-50" : "shadow-sm"
      } ${isEditMode ? "border-blue-300 ring-1 ring-blue-200" : "border-[var(--border)]"}`}
    >
      {/* Edit-mode overlay controls */}
      {isEditMode && (
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <button
            {...attributes}
            {...listeners}
            className="p-1 bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-grab active:cursor-grabbing"
            title="Kéo để di chuyển"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onHide(widget.id)}
            className="p-1 bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--muted-foreground)] hover:text-red-500"
            title="Ẩn widget"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
