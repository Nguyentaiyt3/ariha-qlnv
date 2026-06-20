"use client";

import { useState, useEffect } from "react";
import { X, Plus, Loader2, Calendar, User, Flag, Building2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { createTask, getDefaultMilestoneConfig, getWorkflows } from "@/lib/firebase/firestore";
import { calcPhaseDeadlines, DEFAULT_MILESTONE_CONFIG } from "@/lib/deadline-calc";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission } from "@/lib/rbac/permissions";
import type { Task, TaskPriority, TaskStatus, StakeholderRole, Workflow } from "@/types";

interface CreateTaskModalProps {
  onClose: () => void;
  defaultStatus?: TaskStatus;
}

export function CreateTaskModal({ onClose, defaultStatus = "todo" }: CreateTaskModalProps) {
  const { currentUser } = useAuthStore();
  const { users, addTask } = useTaskStore();
  const [loading, setLoading] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");

  useEffect(() => {
    getWorkflows().then(setWorkflows).catch(console.error);
  }, []);

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) ?? null;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mainPerformerId, setMainPerformerId] = useState(currentUser?.id ?? "");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [deadlineBase, setDeadlineBase] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [department, setDepartment] = useState(currentUser?.department ?? "");
  const [stakeholders, setStakeholders] = useState<{ userId: string; role: StakeholderRole }[]>([]);
  const [kpiTarget, setKpiTarget] = useState(100);
  const [kpiUnit, setKpiUnit] = useState("điểm");
  const [tags, setTags] = useState("");

  const activeUsers = users.filter((u) => u.isActive);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    if (!name.trim()) { toast.error("Tên nhiệm vụ không được để trống."); return; }
    if (!mainPerformerId) { toast.error("Vui lòng chọn người thực hiện chính."); return; }

    setLoading(true);
    try {
      // Get milestone config for 3-phase deadlines
      let milestoneConfig = await getDefaultMilestoneConfig();
      const configData = milestoneConfig ?? DEFAULT_MILESTONE_CONFIG;
      const phases = calcPhaseDeadlines(
        new Date(deadlineBase).toISOString(),
        { daysBeforeForPrepare: configData.daysBeforeForPrepare, daysAfterForFinalize: configData.daysAfterForFinalize }
      );

      const canAutoApprove = hasPermission(currentUser.role, "task:approve");

      // Build stakeholders list (ensure assignee is in the list)
      const allStakeholders = [
        { userId: mainPerformerId, role: "assignee" as StakeholderRole },
        ...stakeholders.filter((s) => s.userId !== mainPerformerId),
      ];

      const newTask: Omit<Task, "id"> = {
        name: name.trim(),
        description: description.trim(),
        status: defaultStatus,
        phase: "execute",
        priority,
        deadlineBase: new Date(deadlineBase).toISOString(),
        deadlinePrepare: phases.prepare,
        deadlineExecute: phases.execute,
        deadlineFinalize: phases.finalize,
        creatorId: currentUser.id,
        mainPerformerId,
        stakeholders: allStakeholders,
        dependencies: [],
        workflowId: selectedWorkflow?.id,
        workflowName: selectedWorkflow?.name,
        steps: selectedWorkflow
          ? selectedWorkflow.steps.map((ws) => ({
              id: generateId("step"),
              name: ws.name,
              assigneeId: "",
              status: "pending" as const,
              progress: 0,
              kpiTarget: 0,
              kpiCurrent: 0,
              kpiUnit: "điểm",
              proofs: [],
              durationDays: ws.durationDays,
            }))
          : [],
        subtasks: [],
        kpi: { type: "custom", target: kpiTarget, current: 0, unit: kpiUnit },
        progress: 0,
        riskFlag: false,
        timeLogs: [],
        approved: canAutoApprove,
        department: department.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const created = await createTask(newTask);
      addTask(created);
      toast.success(
        canAutoApprove
          ? `Đã tạo nhiệm vụ "${created.name}"`
          : `Đề xuất nhiệm vụ đã gửi. Chờ quản lý phê duyệt.`
      );
      onClose();
    } catch (err) {
      toast.error("Tạo nhiệm vụ thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  function addStakeholder(userId: string, role: StakeholderRole) {
    if (!userId || stakeholders.some((s) => s.userId === userId)) return;
    setStakeholders([...stakeholders, { userId, role }]);
  }

  function removeStakeholder(userId: string) {
    setStakeholders(stakeholders.filter((s) => s.userId !== userId));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold dark:text-white">Tạo nhiệm vụ mới</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasPermission(currentUser?.role ?? "guest", "task:approve")
                ? "Nhiệm vụ sẽ được tạo ngay sau khi lưu"
                : "Cần quản lý phê duyệt trước khi bắt đầu"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {/* Task name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tên nhiệm vụ <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên nhiệm vụ rõ ràng..."
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Mô tả</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết mục tiêu, yêu cầu đầu ra..."
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white resize-none"
              />
            </div>

            {/* Workflow selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <GitBranch className="inline w-4 h-4 mr-1" />
                Quy trình
              </label>
              <select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
              >
                <option value="">-- Không dùng quy trình --</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.department ? ` (${w.department})` : ""}
                  </option>
                ))}
              </select>
              {selectedWorkflow && selectedWorkflow.steps.length > 0 && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5">
                    Quy trình gồm {selectedWorkflow.steps.length} bước:
                  </p>
                  <ol className="space-y-1">
                    {selectedWorkflow.steps.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                        <span className="w-4 h-4 shrink-0 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {i + 1}
                        </span>
                        {s.name}
                        {s.durationDays && (
                          <span className="text-blue-400">({s.durationDays}d)</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* 2-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Main performer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <User className="inline w-4 h-4 mr-1" />
                  Người thực hiện chính <span className="text-red-500">*</span>
                </label>
                <select
                  value={mainPerformerId}
                  onChange={(e) => setMainPerformerId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                  required
                >
                  <option value="">Chọn nhân viên...</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.department ?? "—"})</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Flag className="inline w-4 h-4 mr-1" />
                  Mức độ ưu tiên
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="urgent">Khẩn cấp</option>
                </select>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Hạn hoàn thành <span className="text-xs text-slate-400">(deadline gốc)</span>
                </label>
                <input
                  type="date"
                  value={deadlineBase}
                  onChange={(e) => setDeadlineBase(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Deadline 3 giai đoạn sẽ tự động tính từ cấu hình mốc quy trình.
                </p>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Building2 className="inline w-4 h-4 mr-1" />
                  Phòng ban
                </label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="VD: Phòng CNTT"
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* KPI target */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Chỉ tiêu KPI</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={kpiTarget}
                    onChange={(e) => setKpiTarget(Number(e.target.value))}
                    className="w-24 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    value={kpiUnit}
                    onChange={(e) => setKpiUnit(e.target.value)}
                    placeholder="đơn vị"
                    className="flex-1 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tags</label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="VD: urgent, q3-2026, priority"
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">Phân cách bằng dấu phẩy</p>
              </div>
            </div>

            {/* Stakeholders */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Người liên quan
              </label>
              <div className="flex gap-2 mb-2">
                <select
                  id="stakeholder-user"
                  className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Chọn người...</option>
                  {activeUsers.filter(u => u.id !== mainPerformerId).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select
                  id="stakeholder-role"
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                >
                  <option value="collaborator">Hỗ trợ</option>
                  <option value="watcher">Theo dõi</option>
                  <option value="approver">Phê duyệt</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const userSel = document.getElementById("stakeholder-user") as HTMLSelectElement;
                    const roleSel = document.getElementById("stakeholder-role") as HTMLSelectElement;
                    addStakeholder(userSel.value, roleSel.value as StakeholderRole);
                    userSel.value = "";
                  }}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {stakeholders.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {stakeholders.map((s) => {
                    const u = users.find((u) => u.id === s.userId);
                    if (!u) return null;
                    return (
                      <div key={s.userId} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full text-xs">
                        <span className="font-medium text-blue-700 dark:text-blue-300">{u.name}</span>
                        <span className="text-blue-500">•</span>
                        <span className="text-blue-500">{s.role}</span>
                        <button
                          type="button"
                          onClick={() => removeStakeholder(s.userId)}
                          className="text-blue-400 hover:text-red-500 transition ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Tạo nhiệm vụ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
