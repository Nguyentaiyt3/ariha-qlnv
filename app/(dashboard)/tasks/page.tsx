"use client";

import { useState, useMemo } from "react";
import { LayoutGrid, List, Calendar, GitBranch, Filter, SortAsc } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskListView } from "@/components/tasks/TaskListView";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Task, TaskStatus, TaskViewMode } from "@/types";
import { useRouter } from "next/navigation";

const VIEW_TABS: { id: TaskViewMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "kanban", label: "Kanban", Icon: LayoutGrid },
  { id: "list", label: "Danh sách", Icon: List },
  { id: "calendar", label: "Lịch", Icon: Calendar },
  { id: "gantt", label: "Gantt", Icon: GitBranch },
];

export default function TasksPage() {
  const router = useRouter();
  const { tasks, users, viewMode, setViewMode, filters, setFilters } = useTaskStore();
  const { currentUser } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("todo");

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.department?.toLowerCase().includes(q)
      );
    }
    if (filters.status?.length) {
      result = result.filter((t) => filters.status!.includes(t.status));
    }
    if (filters.priority?.length) {
      result = result.filter((t) => filters.priority!.includes(t.priority));
    }
    if (filters.department) {
      result = result.filter((t) => t.department === filters.department);
    }
    if (filters.riskOnly) {
      result = result.filter((t) => t.riskFlag);
    }
    return result;
  }, [tasks, filters]);

  function handleSelectTask(task: Task) {
    router.push(`/tasks/${task.id}`);
  }

  function handleCreateTask(status?: TaskStatus) {
    setCreateStatus(status ?? "todo");
    setShowCreate(true);
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Quản lý Nhiệm vụ</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {filteredTasks.length} nhiệm vụ
            {tasks.filter((t) => t.riskFlag).length > 0 && (
              <span className="ml-2 text-red-500 font-medium">
                · {tasks.filter((t) => t.riskFlag).length} rủi ro
              </span>
            )}
          </p>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {VIEW_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition",
                  viewMode === id
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick filter chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Tất cả", action: () => setFilters({ riskOnly: false, status: undefined }) },
          { label: "Tác vụ của tôi", action: () => setFilters({ assigneeId: currentUser?.id }) },
          { label: "Rủi ro", action: () => setFilters({ riskOnly: true }) },
          { label: "Khẩn cấp", action: () => setFilters({ priority: ["urgent"] }) },
          { label: "Chờ duyệt", action: () => setFilters({ status: ["review"] }) },
        ].map((chip) => (
          <button
            key={chip.label}
            onClick={chip.action}
            className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 hover:text-blue-600 transition"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "kanban" && (
          <KanbanBoard
            tasks={filteredTasks}
            users={users}
            onSelectTask={handleSelectTask}
            onCreateTask={handleCreateTask}
          />
        )}
        {viewMode === "list" && (
          <TaskListView
            tasks={filteredTasks}
            users={users}
            onSelectTask={handleSelectTask}
          />
        )}
        {viewMode === "calendar" && (
          <div className="flex items-center justify-center h-64 text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="text-center">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Calendar View</p>
              <p className="text-sm">Sẽ được kích hoạt ở Phase 4</p>
            </div>
          </div>
        )}
        {viewMode === "gantt" && (
          <div className="flex items-center justify-center h-64 text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Gantt Chart</p>
              <p className="text-sm">Sẽ được kích hoạt ở Phase 8</p>
            </div>
          </div>
        )}
      </div>

      {/* Create task modal */}
      {showCreate && (
        <CreateTaskModal defaultStatus={createStatus} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
