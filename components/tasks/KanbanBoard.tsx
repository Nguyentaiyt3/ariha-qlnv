"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { cn, statusLabel } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import { updateTask, addAuditEvent, addNotification } from "@/lib/firebase/firestore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import type { Task, TaskStatus, User } from "@/types";
import { toast } from "sonner";

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "Chờ thực hiện", color: "border-t-slate-400" },
  { id: "in_progress", label: "Đang thực hiện", color: "border-t-blue-500" },
  { id: "review", label: "Chờ duyệt", color: "border-t-amber-500" },
  { id: "done", label: "Hoàn thành", color: "border-t-green-500" },
];

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  onSelectTask: (task: Task) => void;
  onCreateTask?: (status?: TaskStatus) => void;
}

export function KanbanBoard({ tasks, users, onSelectTask, onCreateTask }: KanbanBoardProps) {
  const { currentUser } = useAuthStore();
  const { updateTask: storeUpdateTask } = useTaskStore();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  const getColumnTasks = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedTask = tasks.find((t) => t.id === active.id);
    if (!draggedTask) return;

    const newStatus = over.id as TaskStatus;
    if (!COLUMNS.some((c) => c.id === newStatus)) return;
    if (draggedTask.status === newStatus) return;

    const oldStatus = draggedTask.status;
    storeUpdateTask(draggedTask.id, { status: newStatus });

    try {
      await updateTask(draggedTask.id, { status: newStatus });
      if (currentUser) {
        await addAuditEvent(draggedTask.id, {
          taskId: draggedTask.id,
          action: "status_changed",
          userId: currentUser.id,
          userName: currentUser.name,
          before: { status: oldStatus },
          after: { status: newStatus },
          timestamp: new Date().toISOString(),
        });

        if (newStatus === "review") {
          const approvers = (draggedTask.stakeholders ?? []).filter((s) => s.role === "approver");
          const targets = approvers.length > 0
            ? approvers.map((s) => s.userId)
            : draggedTask.creatorId ? [draggedTask.creatorId] : [];
          await Promise.all(targets.map((uid) =>
            addNotification({
              userId: uid,
              type: "approval_request",
              title: "Nhiệm vụ cần phê duyệt",
              body: `"${draggedTask.name}" đã được gửi lên chờ phê duyệt bởi ${currentUser.name}.`,
              link: `/tasks/${draggedTask.id}`,
              read: false,
              priority: "high",
              createdAt: new Date().toISOString(),
            })
          ));
        }

        if (newStatus === "done") {
          const targets = [...new Set([draggedTask.creatorId, draggedTask.mainPerformerId].filter(Boolean) as string[])];
          await Promise.all(targets.map((uid) =>
            addNotification({
              userId: uid,
              type: "task_completed",
              title: "Nhiệm vụ hoàn thành",
              body: `"${draggedTask.name}" đã được đánh dấu hoàn thành.`,
              link: `/tasks/${draggedTask.id}`,
              read: false,
              priority: "normal",
              createdAt: new Date().toISOString(),
            })
          ));
        }
      }
    } catch {
      storeUpdateTask(draggedTask.id, { status: oldStatus });
      toast.error("Cập nhật trạng thái thất bại.");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = getColumnTasks(col.id);
          return (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={colTasks}
              users={users}
              onSelectTask={onSelectTask}
              onCreateTask={onCreateTask}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="w-72 rotate-3 opacity-90">
            <TaskCard task={activeTask} users={users} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  column: { id: TaskStatus; label: string; color: string };
  tasks: Task[];
  users: User[];
  onSelectTask: (task: Task) => void;
  onCreateTask?: (status?: TaskStatus) => void;
}

function KanbanColumn({ column, tasks, users, onSelectTask, onCreateTask }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className={cn(
        "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-t-2 p-3 mb-3 shadow-sm",
        column.color
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</span>
            <span className="w-5 h-5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full text-[10px] font-bold flex items-center justify-center">
              {tasks.length}
            </span>
          </div>
          {onCreateTask && (
            <button
              onClick={() => onCreateTask(column.id)}
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2.5 rounded-xl p-1 min-h-[200px] transition-colors",
          isOver && "bg-blue-50/50 dark:bg-blue-900/10 ring-2 ring-blue-400 ring-inset"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              users={users}
              onClick={() => onSelectTask(task)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-slate-300 dark:text-slate-600 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            Kéo nhiệm vụ vào đây
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTaskCard({ task, users, onClick }: { task: Task; users: User[]; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} users={users} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}
