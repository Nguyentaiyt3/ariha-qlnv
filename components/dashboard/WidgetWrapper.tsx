"use client";

import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, EyeOff, Maximize2 } from "lucide-react";
import type { WidgetConfig } from "@/types";

// Approximate pixel sizes per grid unit (matches grid-auto-rows + minmax column)
const COL_PX = 290;
const ROW_PX = 230;
const MAX_W   = 4;
const MAX_H   = 4;

interface Props {
  widget: WidgetConfig;
  isEditMode: boolean;
  onHide: (id: string) => void;
  onResize: (id: string, w: number, h: number) => void;
  children: React.ReactNode;
}

export default function WidgetWrapper({ widget, isEditMode, onHide, onResize, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !isEditMode,
  });

  // Live size preview during drag
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const displayW = preview?.w ?? widget.w ?? 1;
  const displayH = preview?.h ?? widget.h ?? 2;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.5 : 1,
    gridColumn: `span ${displayW}`,
    gridRow:    `span ${displayH}`,
  };

  function handleResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, w: widget.w ?? 1, h: widget.h ?? 2 };

    function onMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      const newW = Math.max(1, Math.min(MAX_W, dragRef.current.w + Math.round(dx / COL_PX)));
      const newH = Math.max(1, Math.min(MAX_H, dragRef.current.h + Math.round(dy / ROW_PX)));
      setPreview({ w: newW, h: newH });
    }

    function onUp(ev: PointerEvent) {
      if (dragRef.current) {
        const dx = ev.clientX - dragRef.current.x;
        const dy = ev.clientY - dragRef.current.y;
        const newW = Math.max(1, Math.min(MAX_W, dragRef.current.w + Math.round(dx / COL_PX)));
        const newH = Math.max(1, Math.min(MAX_H, dragRef.current.h + Math.round(dy / ROW_PX)));
        onResize(widget.id, newW, newH);
      }
      dragRef.current = null;
      setPreview(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "relative bg-[var(--card)] border rounded-2xl overflow-hidden flex flex-col",
        isDragging ? "shadow-2xl z-50" : "shadow-sm",
        isEditMode
          ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800"
          : "border-[var(--border)]",
        preview ? "ring-2 ring-blue-400 shadow-lg" : "",
      ].join(" ")}
    >
      {/* Edit-mode controls */}
      {isEditMode && (
        <>
          {/* Top-right: drag + hide */}
          <div className="absolute top-2 right-2 flex gap-1 z-20">
            <button
              {...attributes}
              {...listeners}
              className="p-1 bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-grab active:cursor-grabbing shadow-sm"
              title="Kéo để di chuyển"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onHide(widget.id)}
              className="p-1 bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--muted-foreground)] hover:text-red-500 shadow-sm"
              title="Ẩn widget"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Size badge */}
          <div className="absolute top-2 left-2 z-20 bg-blue-600/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none">
            {displayW}×{displayH}
          </div>

          {/* Bottom-right: resize handle */}
          <div
            onPointerDown={handleResizeDown}
            className="absolute bottom-0 right-0 w-7 h-7 cursor-se-resize z-20 flex items-end justify-end p-1.5 text-blue-400 hover:text-blue-600 transition-colors select-none"
            title="Kéo để thay đổi kích thước"
          >
            <Maximize2 className="w-3.5 h-3.5 rotate-0" />
          </div>

          {/* Resize hint overlay during drag */}
          {preview && (
            <div className="absolute inset-0 bg-blue-50/20 dark:bg-blue-900/10 pointer-events-none z-10 flex items-center justify-center">
              <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg">
                {preview.w} × {preview.h}
              </span>
            </div>
          )}
        </>
      )}

      {children}
    </div>
  );
}
