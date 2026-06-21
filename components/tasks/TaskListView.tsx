"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Flag, ChevronUp, ChevronDown, Search, Trash2 } from "lucide-react";
import { cn, formatDate, statusLabel, priorityLabel, getInitials, avatarColor, daysUntilDeadline } from "@/lib/utils";
import type { Task, User, TaskStatus, TaskPriority } from "@/types";

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-400",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-orange-100 text-orange-600",
  urgent: "bg-red-100 text-red-600",
};

type SortField = "name" | "deadlineBase" | "priority" | "progress" | "status";
type SortDir = "asc" | "desc";

interface TaskListViewProps {
  tasks: Task[];
  users: User[];
  onSelectTask: (task: Task) => void;
  canDelete?: boolean;
  onDeleteTask?: (task: Task) => void;
}

export function TaskListView({ tasks, users, onSelectTask, canDelete, onDeleteTask }: TaskListViewProps) {
  const [sortField, setSortField] = useState<SortField>("deadlineBase");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [localSearch, setLocalSearch] = useState("");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = [...tasks]
    .filter((t) => !localSearch || t.name.toLowerCase().includes(localSearch.toLowerCase()))
    .sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortField === "name") { va = a.name; vb = b.name; }
      else if (sortField === "deadlineBase") { va = a.deadlineBase ?? ""; vb = b.deadlineBase ?? ""; }
      else if (sortField === "priority") {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        va = order[a.priority as keyof typeof order] ?? 9;
        vb = order[b.priority as keyof typeof order] ?? 9;
      }
      else if (sortField === "progress") { va = a.progress; vb = b.progress; }
      else if (sortField === "status") { va = a.status; vb = b.status; }
      else { va = ""; vb = ""; }

      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3.5 h-3.5 text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" />
      : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Search row */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-700">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Lọc nhanh tên nhiệm vụ..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
              {[
                { key: "name", label: "Tên nhiệm vụ", w: "min-w-[200px]" },
                { key: "status", label: "Trạng thái", w: "w-32" },
                { key: "priority", label: "Ưu tiên", w: "w-28" },
                { key: "progress", label: "Tiến độ", w: "w-28" },
                { key: "deadlineBase", label: "Hạn chót", w: "w-32" },
              ].map(({ key, label, w }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key as SortField)}
                  className={cn("px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none", w)}
                >
                  <div className="flex items-center gap-1">
                    {label} <SortIcon field={key as SortField} />
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">
                Người thực hiện
              </th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                  Không có nhiệm vụ nào
                </td>
              </tr>
            ) : (
              sorted.map((task) => {
                const performer = users.find((u) => u.id === task.mainPerformerId);
                const days = task.deadlineBase ? daysUntilDeadline(task.deadlineBase) : null;
                const isOverdue = days !== null && days < 0 && task.status !== "done";
                const isNear = days !== null && days >= 0 && days <= 2;

                return (
                  <tr
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition"
                  >
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {task.riskFlag && (
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5 risk-pulse" />
                        )}
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white line-clamp-1">{task.name}</p>
                          {task.department && (
                            <p className="text-xs text-slate-400">{task.department}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-semibold", STATUS_BADGE[task.status])}>
                        {statusLabel(task.status)}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-semibold", PRIORITY_BADGE[task.priority])}>
                        {priorityLabel(task.priority)}
                      </span>
                    </td>

                    {/* Progress */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", task.progress >= 100 ? "bg-green-500" : "bg-blue-500")}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-8 text-right">{task.progress}%</span>
                      </div>
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-3">
                      {task.deadlineBase ? (
                        <div className={cn("flex items-center gap-1 text-xs font-medium",
                          isOverdue ? "text-red-500" : isNear ? "text-amber-500" : "text-slate-500"
                        )}>
                          <Clock className="w-3.5 h-3.5" />
                          {isOverdue
                            ? `Trễ ${Math.abs(days!)} ngày`
                            : formatDate(task.deadlineBase)
                          }
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Performer */}
                    <td className="px-4 py-3">
                      {performer ? (
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                            avatarColor(performer.name)
                          )}>
                            {getInitials(performer.name)}
                          </div>
                          <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[80px]">
                            {performer.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canDelete && onDeleteTask && (
                          <button
                            onClick={() => onDeleteTask(task)}
                            className="p-1 text-slate-300 hover:text-red-500 transition rounded"
                            title="Xoá nhiệm vụ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronUp className="w-4 h-4 text-slate-300 rotate-90" />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
