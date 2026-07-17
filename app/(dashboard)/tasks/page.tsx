"use client";

import { useState, useMemo } from "react";
import { LayoutGrid, List, Calendar, GitBranch, AlertTriangle, ShieldAlert, X } from "lucide-react";
import { deleteTask } from "@/lib/firebase/firestore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskCalendarView } from "@/components/tasks/TaskCalendarView";
import { TaskGanttView } from "@/components/tasks/TaskGanttView";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDashboardFilter } from "@/stores/useDashboardFilter";
import { hasPermission } from "@/lib/rbac/permissions";
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
  const { tasks, users, viewMode, setViewMode, filters, setFilters, resetFilters } = useTaskStore();
  const { currentUser } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("todo");

  const { mode, year, month, quarter, getRange } = useDashboardFilter();
  const canApprove = !!(currentUser && hasPermission(currentUser.role, "task:approve"));
  const canDelete = !!(currentUser && hasPermission(currentUser.role, "task:delete"));
  const pendingApprovalCount = canApprove ? tasks.filter((t) => !t.approved).length : 0;
  const riskCount = tasks.filter((t) => t.riskFlag && t.status !== "done" && t.status !== "cancelled").length;
  const urgentCount = tasks.filter((t) => t.priority === "urgent" && t.status !== "done" && t.status !== "cancelled").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueCount = tasks.filter((t) => t.deadlineBase && t.deadlineBase < todayStr && t.status !== "done" && t.status !== "cancelled").length;
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const showAlertBanner = !dismissedAlert && (riskCount > 0 || urgentCount > 0 || overdueCount > 0);

  const filteredTasks = useMemo(() => {
    // Task hub đồng bộ ngầm (vd. Task thực thi liên kết per-đề-tài NCKH) — không hiện ở đây, tác
    // giả theo dõi/cập nhật tiến độ ngay tại nguồn gốc sinh ra nó, không cần quản lý như 1 Task
    // độc lập. Vẫn tính đủ ở Heatmap/Hiệu suất/Kế hoạch (không lọc cờ này ở những nơi đó).
    let result = tasks.filter((t) => !t.hiddenFromTaskList);

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
    if (filters.assigneeId) {
      result = result.filter((t) =>
        t.mainPerformerId === filters.assigneeId ||
        (t.stakeholders ?? []).some((s) => s.userId === filters.assigneeId) ||
        (t.steps ?? []).some((s) =>
          s.assigneeId === filters.assigneeId ||
          (s.subTasks ?? []).some((st) => st.userId === filters.assigneeId)
        )
      );
    }
    if (filters.pendingReview) {
      result = result.filter((t) => !t.approved || t.status === "review");
    }
    if (filters.overdueOnly) {
      const today = new Date().toISOString().slice(0, 10);
      result = result.filter((t) => t.deadlineBase && t.deadlineBase < today && t.status !== "done" && t.status !== "cancelled");
    }
    // Date-range filter — bỏ qua khi có intent filter đang active
    // (riskOnly / pendingReview / overdueOnly / assigneeId hiển thị toàn bộ, không giới hạn kỳ)
    const hasIntentFilter =
      filters.riskOnly || filters.pendingReview || filters.overdueOnly || !!filters.assigneeId;
    if (!hasIntentFilter) {
      const range = getRange();
      if (range) {
        const s = range.start.slice(0, 10);
        const e = range.end.slice(0, 10);
        result = result.filter((t) => !t.deadlineBase || (t.deadlineBase >= s && t.deadlineBase <= e));
      }
    }
    return result;
  }, [tasks, filters, mode, year, month, quarter]);

  function handleSelectTask(task: Task) {
    router.push(`/tasks/${task.id}`);
  }

  async function handleDeleteTask(task: Task) {
    if (!confirm(`Xoá nhiệm vụ "${task.name}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await deleteTask(task.id);
      toast.success("Đã xoá nhiệm vụ.");
    } catch {
      toast.error("Xoá thất bại.");
    }
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

      {/* Alert banner — risk / urgent / overdue */}
      {showAlertBanner && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1.5">Cần chú ý ngay</p>
            <div className="flex flex-wrap gap-2">
              {riskCount > 0 && (
                <button
                  onClick={() => { resetFilters(); setFilters({ riskOnly: true }); setDismissedAlert(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-xs font-semibold rounded-xl transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {riskCount} nhiệm vụ có rủi ro
                </button>
              )}
              {urgentCount > 0 && (
                <button
                  onClick={() => { resetFilters(); setFilters({ priority: ["urgent"] }); setDismissedAlert(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-900/60 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 text-xs font-semibold rounded-xl transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {urgentCount} nhiệm vụ khẩn cấp
                </button>
              )}
              {overdueCount > 0 && (
                <button
                  onClick={() => { resetFilters(); setFilters({ overdueOnly: true }); setDismissedAlert(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded-xl transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {overdueCount} nhiệm vụ trễ hạn
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => setDismissedAlert(true)}
            className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 shrink-0 transition"
            title="Ẩn cảnh báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick filter chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Tất cả",         key: "all",    action: () => resetFilters(),                                                       count: 0,           alert: "" },
          { label: "Tác vụ của tôi", key: "mine",   action: () => { resetFilters(); setFilters({ assigneeId: currentUser?.id }); },    count: 0,           alert: "" },
          { label: "Rủi ro",         key: "risk",   action: () => { resetFilters(); setFilters({ riskOnly: true }); },                  count: riskCount,   alert: "red" },
          { label: "Khẩn cấp",       key: "urgent", action: () => { resetFilters(); setFilters({ priority: ["urgent"] }); },            count: urgentCount, alert: "orange" },
          { label: "Đang xét duyệt", key: "review", action: () => { resetFilters(); setFilters({ pendingReview: true }); },             count: 0,           alert: "" },
        ].map((chip) => {
          const isActive = (() => {
            if (chip.key === "all")    return !filters.riskOnly && !filters.overdueOnly && !filters.status?.length && !filters.priority?.length && !filters.assigneeId && !filters.pendingReview;
            if (chip.key === "mine")   return !!filters.assigneeId;
            if (chip.key === "risk")   return !!filters.riskOnly;
            if (chip.key === "urgent") return !!filters.priority?.includes("urgent");
            if (chip.key === "review") return !!filters.pendingReview;
            return false;
          })();

          const hasAlert = chip.count > 0 && !isActive;
          const alertCls = chip.alert === "red"
            ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100"
            : chip.alert === "orange"
            ? "bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100"
            : "";
          const badgeCls = chip.alert === "red"
            ? "bg-red-500 text-white"
            : "bg-orange-500 text-white";

          return (
            <button
              key={chip.key}
              onClick={chip.action}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition",
                isActive
                  ? "bg-blue-600 text-white border-blue-600"
                  : hasAlert
                  ? alertCls
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 hover:text-blue-600"
              )}
            >
              {chip.label}
              {hasAlert && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none", badgeCls)}>
                  {chip.count}
                </span>
              )}
            </button>
          );
        })}

        {/* Approval chip — only visible to managers */}
        {canApprove && pendingApprovalCount > 0 && (
          <button
            onClick={() => { resetFilters(); setFilters({ pendingReview: true }); }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-full border transition flex items-center gap-1.5",
              filters.pendingReview
                ? "bg-yellow-500 text-white border-yellow-500"
                : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100"
            )}
          >
            Cần phê duyệt
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
              filters.pendingReview ? "bg-white text-yellow-600" : "bg-yellow-500 text-white"
            )}>
              {pendingApprovalCount}
            </span>
          </button>
        )}
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
            canDelete={canDelete}
            onDeleteTask={handleDeleteTask}
          />
        )}
        {viewMode === "calendar" && (
          <TaskCalendarView
            tasks={filteredTasks}
            users={users}
            onSelectTask={handleSelectTask}
          />
        )}
        {viewMode === "gantt" && (
          <TaskGanttView
            tasks={filteredTasks}
            users={users}
            onSelectTask={handleSelectTask}
          />
        )}
      </div>

      {/* Create task modal */}
      {showCreate && (
        <CreateTaskModal defaultStatus={createStatus} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
