"use client";

import { useState, useEffect, useRef } from "react";
import { X, Plus, Loader2, Calendar, User, Flag, Building2, GitBranch, Paperclip, Camera, Link2, FileText, Trash2, ClipboardList, ChevronDown, ChevronRight, Pencil, CheckCircle2, GripVertical, RotateCcw } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { nodesToTaskSteps, linearStepsToTaskSteps, topoSortNodeIds, normalizeEdgeDirection } from "@/lib/workflow-engine";
import { createTask, getWorkflows } from "@/lib/firebase/firestore";
import WorkflowBuilder from "@/components/tasks/WorkflowBuilder";
import type { WorkflowNode, WorkflowEdge } from "@/types";
import { uploadFile } from "@/lib/firebase/storage";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";
import { calcPhaseDeadlines } from "@/lib/deadline-calc";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { sameUnit } from "@/lib/rbac/scope";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import type { Task, TaskPriority, TaskStatus, StakeholderRole, TaskResource, UnitPlan, PlanItem, Workflow } from "@/types";

// Pending attachment — file held in memory until submit; links stored directly
type PendingFile = {
  kind: "file";
  id: string;
  file: File;
  previewUrl: string; // object URL for local preview
  name: string;
  mimeType: string;
  size: number;
};
type PendingLink = {
  kind: "link";
  id: string;
  name: string;
  url: string;
};
type PendingAttachment = PendingFile | PendingLink;

interface CreateTaskModalProps {
  onClose: () => void;
  defaultStatus?: TaskStatus;
}

export function CreateTaskModal({ onClose, defaultStatus = "todo" }: CreateTaskModalProps) {
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();
  const abbr = useUnitAbbr();
  const [loading, setLoading] = useState(false);

  // Kế hoạch đơn vị
  const [availablePlans, setAvailablePlans] = useState<UnitPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedParentItemId, setSelectedParentItemId] = useState<string>("");

  // Quy trình mẫu
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");

  useEffect(() => {
    fetch("/api/unit-plans")
      .then((r) => r.json())
      .then((data) => setAvailablePlans(data.plans ?? []))
      .catch(console.error);
    // Chỉ cho chọn quy trình đã được phê duyệt (status "published") — quy trình đang chờ duyệt
    // của chính mình vẫn trả về từ getWorkflows() để theo dõi ở trang Quy trình, nhưng chưa
    // được dùng để tạo nhiệm vụ.
    getWorkflows().then((all) => setWorkflows(all.filter((w) => w.status === "published"))).catch(console.error);
  }, []);

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) ?? null;

  // Người được gán cho từng node lúc tạo task (template để trống theo vai trò).
  const [nodeAssignees, setNodeAssignees] = useState<Record<string, string>>({});
  // Draft workflow — nếu có, dùng thay vì template gốc (người dùng đã điều chỉnh).
  const [draftNodes, setDraftNodes] = useState<WorkflowNode[] | null>(null);
  const [draftEdges, setDraftEdges] = useState<WorkflowEdge[] | null>(null);
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);
  // Thứ tự bước điều chỉnh tay bằng kéo thả (null = dùng topo sort tự động).
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  // Reset gán người + draft + thứ tự khi đổi quy trình.
  useEffect(() => {
    setNodeAssignees({});
    setDraftNodes(null);
    setDraftEdges(null);
    setManualOrder(null);
  }, [selectedWorkflowId]);

  const stepSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = orderedNodes.map((n) => n.id);
    const oldIdx = currentIds.indexOf(String(active.id));
    const newIdx = currentIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    setManualOrder(arrayMove(currentIds, oldIdx, newIdx));
  }

  // Effective nodes/edges: draft nếu có, ngược lại dùng template gốc.
  const effectiveNodes = draftNodes ?? selectedWorkflow?.nodes ?? [];
  const effectiveEdges = draftEdges ?? selectedWorkflow?.edges ?? [];
  const isWorkflowModified = !!draftNodes;

  // Quy trình mẫu dạng đồ thị (có sơ đồ node) → ưu tiên dùng nodes/edges (draft nếu có).
  const hasGraph = effectiveNodes.length > 0;
  // Normalize edge direction first (detect & flip if the workflow was drawn in reverse).
  const normalizedEdges = hasGraph ? normalizeEdgeDirection(effectiveNodes, effectiveEdges) : effectiveEdges;
  // Thứ tự auto (topo sort trên edges đã chuẩn hóa).
  const autoOrderedIds = hasGraph ? topoSortNodeIds(effectiveNodes, normalizedEdges) : [];
  // Node theo thứ tự: dùng manualOrder nếu có, ngược lại dùng auto topo sort.
  const orderedNodes = hasGraph
    ? (manualOrder ?? autoOrderedIds)
        .map((id) => effectiveNodes.find((n) => n.id === id)!)
        .filter(Boolean)
    : [];

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
  const [stakeholderUserId, setStakeholderUserId] = useState("");
  const [stakeholderRole, setStakeholderRole] = useState<StakeholderRole>("collaborator");
  const [kpiTarget, setKpiTarget] = useState(100);
  const [kpiUnit, setKpiUnit] = useState("điểm");
  const [tags, setTags] = useState("");

  // Attachments — held locally until submit
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const activeUsers = users.filter((u) => u.isActive);
  // Trưởng nhóm chỉ được thêm người liên quan cùng đơn vị mình (director/hrAdmin và các vai
  // trò khác không bị giới hạn ở đây).
  const stakeholderCandidates = currentUser?.role === "teamLead"
    ? activeUsers.filter((u) => sameUnit(u.department, currentUser.department))
    : activeUsers;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    if (loading) return; // prevent double-submit
    if (!name.trim()) { toast.error("Tên nhiệm vụ không được để trống."); return; }
    if (!mainPerformerId) { toast.error("Vui lòng chọn người thực hiện chính."); return; }

    setLoading(true);
    try {
      // Upload pending files to Firebase Storage now (only on confirmed submit)
      const uploadedResources: TaskResource[] = [];
      for (const att of pending) {
        if (att.kind === "link") {
          uploadedResources.push({
            id: att.id, type: "link",
            name: att.name, url: att.url,
            addedBy: currentUser.id, addedByName: currentUser.name,
            addedAt: new Date().toISOString(),
          });
        } else {
          const url = await uploadFile(att.file, "task-attachments");
          uploadedResources.push({
            id: att.id, type: "file",
            name: att.name, url,
            mimeType: att.mimeType, size: att.size,
            addedBy: currentUser.id, addedByName: currentUser.name,
            addedAt: new Date().toISOString(),
          });
        }
      }

      // 3-phase deadlines: prepare = base - 3 ngày, finalize = base + 30 ngày
      const phases = calcPhaseDeadlines(
        new Date(deadlineBase).toISOString(),
        { daysBeforeForPrepare: 3, daysAfterForFinalize: 30 }
      );

      const canAutoApprove = hasPermission(currentUser.role, "task:approve");

      // Build stakeholders list (ensure assignee + người phụ trách node đều có mặt)
      const nodeAssigneeIds = Object.values(nodeAssignees).filter(Boolean);
      const seen = new Set<string>([mainPerformerId]);
      const allStakeholders: { userId: string; role: StakeholderRole }[] = [
        { userId: mainPerformerId, role: "assignee" },
      ];
      for (const s of stakeholders) {
        if (s.userId !== mainPerformerId && !seen.has(s.userId)) {
          seen.add(s.userId);
          allStakeholders.push(s);
        }
      }
      for (const uid of nodeAssigneeIds) {
        if (!seen.has(uid)) {
          seen.add(uid);
          allStakeholders.push({ userId: uid, role: "assignee" });
        }
      }

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
        // Quy trình có sơ đồ → copy đầy đủ đồ thị (node + phụ thuộc + người gán).
        // Chỉ có danh sách phẳng → tạo chuỗi tuyến tính tương thích ngược.
        steps: !selectedWorkflow
          ? []
          : hasGraph
          ? (() => {
              const raw = nodesToTaskSteps(effectiveNodes, normalizedEdges, {
                assigneeByNode: nodeAssignees,
                defaultKpiUnit: kpiUnit,
              });
              if (!manualOrder) return raw;
              // Giữ nguyên dependsOn (logic thực thi) nhưng sắp xếp theo thứ tự tay.
              const byId = new Map(raw.map((s) => [s.id, s]));
              return [
                ...manualOrder.map((id) => byId.get(id)).filter(Boolean) as typeof raw,
                ...raw.filter((s) => !manualOrder.includes(s.id)),
              ];
            })()
          : linearStepsToTaskSteps(selectedWorkflow.steps, { defaultKpiUnit: kpiUnit }),
        subtasks: [],
        kpi: { type: "custom", target: kpiTarget, current: 0, unit: kpiUnit },
        progress: 0,
        riskFlag: false,
        timeLogs: [],
        approved: canAutoApprove,
        department: department.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        resources: uploadedResources.length > 0 ? uploadedResources : undefined,
        planId: selectedPlanId || undefined,
        planItemParentId: (selectedPlanId && selectedParentItemId) ? selectedParentItemId : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const created = await createTask(newTask);
      // No addTask() — the Firestore realtime listener in layout.tsx will pick it up automatically
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems: PendingFile[] = Array.from(files).map((file) => ({
      kind: "file",
      id: generateId("att"),
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      mimeType: file.type,
      size: file.size,
    }));
    setPending((prev) => [...prev, ...newItems]);
    e.target.value = "";
  }

  function handleAddLink() {
    if (!linkName.trim() || !linkUrl.trim()) { toast.error("Nhập tên và URL."); return; }
    const url = linkUrl.trim().startsWith("http") ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    setPending((prev) => [
      ...prev,
      { kind: "link", id: generateId("att"), name: linkName.trim(), url },
    ]);
    setLinkName("");
    setLinkUrl("");
    setShowLinkForm(false);
  }

  function removeAttachment(id: string) {
    setPending((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.kind === "file") URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function formatSize(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

            {/* Kế hoạch / Quy trình */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <ClipboardList className="inline w-4 h-4 mr-1 text-indigo-500" />
                Thuộc nhóm chỉ tiêu kế hoạch
              </label>
              <select
                value={selectedPlanId}
                onChange={(e) => {
                  const planId = e.target.value;
                  setSelectedPlanId(planId);
                  setSelectedParentItemId("");
                  const plan = availablePlans.find((p) => p.id === planId);
                  if (plan) { setKpiTarget(plan.target); setKpiUnit(plan.unit); }
                }}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
              >
                <option value="">-- Không thuộc kế hoạch nào --</option>
                {availablePlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.year})</option>
                ))}
              </select>

              {/* Chọn cấp cha/con/cháu trong kế hoạch */}
              {selectedPlanId && (() => {
                const plan = availablePlans.find((p) => p.id === selectedPlanId);
                if (!plan || plan.items.length === 0) return (
                  <p className="mt-1.5 text-[10px] text-slate-400">Kế hoạch chưa có mục nào. Nhiệm vụ sẽ ở cấp 1.</p>
                );
                const buildTree = (items: PlanItem[], parentId: string | null, depth: number): { item: PlanItem; depth: number }[] =>
                  items
                    .filter((i) => i.parentId === parentId)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .flatMap((item) => [{ item, depth }, ...buildTree(items, item.id, depth + 1)]);
                const flatItems = buildTree(plan.items, null, 0);
                return (
                  <div className="mt-2">
                    <select
                      value={selectedParentItemId}
                      onChange={(e) => setSelectedParentItemId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">— Cấp 1 (nhiệm vụ cha) —</option>
                      {flatItems.map(({ item, depth }) => (
                        <option key={item.id} value={item.id}>
                          {"　".repeat(depth)}{depth > 0 ? "└ " : ""}{item.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Chọn cấp cha để nhiệm vụ này trở thành con/cháu trong kế hoạch.
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Quy trình mẫu */}
            {workflows.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <GitBranch className="inline w-4 h-4 mr-1 text-blue-500" />
                  Quy trình mẫu
                </label>
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">-- Không áp dụng quy trình mẫu --</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.department ? ` (${w.department})` : ""}
                    </option>
                  ))}
                </select>

                {/* Nút điều chỉnh sơ đồ — chỉ hiện khi template có graph */}
                {selectedWorkflow && hasGraph && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowWorkflowEditor(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Điều chỉnh sơ đồ quy trình
                    </button>
                    {isWorkflowModified && (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Đã điều chỉnh ({orderedNodes.length} bước)
                      </span>
                    )}
                  </div>
                )}

                {/* Quy trình có sơ đồ → hiển thị chuỗi node + gán người phụ trách từng bước */}
                {selectedWorkflow && hasGraph && (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        {orderedNodes.length} bước theo quy trình — kéo <GripVertical className="w-3 h-3 inline" /> để đổi thứ tự, chọn người phụ trách:
                      </p>
                      {manualOrder && (
                        <button
                          type="button"
                          onClick={() => setManualOrder(null)}
                          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" /> Đặt lại
                        </button>
                      )}
                    </div>
                    <DndContext sensors={stepSensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
                      <SortableContext items={orderedNodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                        <ol className="space-y-2">
                          {orderedNodes.map((n, i) => {
                            const deps = normalizedEdges
                              .filter((e) => e.target === n.id)
                              .map((e) => orderedNodes.find((x) => x.id === e.source)?.name)
                              .filter(Boolean) as string[];
                            const candidates = activeUsers.filter(
                              (u) => !n.roleRequired || u.role === n.roleRequired
                            );
                            return (
                              <SortableStepRow
                                key={n.id}
                                node={n}
                                index={i}
                                deps={deps}
                                candidates={candidates}
                                assigneeValue={nodeAssignees[n.id] ?? ""}
                                onAssigneeChange={(nid, uid) => setNodeAssignees((m) => ({ ...m, [nid]: uid }))}
                              />
                            );
                          })}
                        </ol>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {/* Quy trình chỉ có danh sách phẳng (chưa vẽ sơ đồ) */}
                {selectedWorkflow && !hasGraph && selectedWorkflow.steps.length > 0 && (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5">
                      {selectedWorkflow.steps.length} bước sẽ được tạo tự động (chuỗi tuần tự):
                    </p>
                    <ol className="space-y-1">
                      {selectedWorkflow.steps.map((s, i) => (
                        <li key={s.id} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                          <span className="w-4 h-4 shrink-0 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-[10px] font-bold">
                            {i + 1}
                          </span>
                          {s.name}
                          {s.durationDays && <span className="text-blue-400">({s.durationDays}d)</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* 2-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Main performer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <User className="inline w-4 h-4 mr-1" />
                  Người thực hiện chính <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={mainPerformerId}
                  onChange={setMainPerformerId}
                  options={activeUsers.map((u) => ({ id: u.id, label: u.name, sub: u.department ? abbr(u.department) : undefined }))}
                  placeholder="Chọn nhân viên..."
                  emptyText="Không tìm thấy nhân viên"
                />
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
                  Kết thúc chuẩn bị = trước 3 ngày · Kết thúc nhiệm vụ = sau 30 ngày
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
                <SearchableSelect
                  value={stakeholderUserId}
                  onChange={setStakeholderUserId}
                  options={stakeholderCandidates
                    .filter((u) => u.id !== mainPerformerId && !stakeholders.some((s) => s.userId === u.id))
                    .map((u) => ({ id: u.id, label: u.name, sub: u.department ? abbr(u.department) : undefined }))}
                  placeholder="Chọn người..."
                  emptyText="Không tìm thấy"
                  className="flex-1"
                />
                <select
                  value={stakeholderRole}
                  onChange={(e) => setStakeholderRole(e.target.value as StakeholderRole)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
                >
                  <option value="collaborator">Hỗ trợ</option>
                  <option value="supervisor">Giám sát</option>
                  <option value="watcher">Theo dõi</option>
                  <option value="approver">Phê duyệt</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!stakeholderUserId) return;
                    addStakeholder(stakeholderUserId, stakeholderRole);
                    setStakeholderUserId("");
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

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Đính kèm
              </label>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm rounded-xl transition"
                >
                  <Paperclip className="w-4 h-4" />
                  File / Ảnh
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm rounded-xl transition"
                >
                  <Camera className="w-4 h-4" />
                  Camera
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm rounded-xl transition"
                >
                  <Link2 className="w-4 h-4" />
                  Thêm link
                </button>

                {/* Hidden file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="*/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Link form */}
              {showLinkForm && (
                <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <input
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="Tên đường dẫn"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:text-white"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddLink())}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleAddLink}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">
                      Thêm
                    </button>
                    <button type="button" onClick={() => setShowLinkForm(false)}
                      className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                      Huỷ
                    </button>
                  </div>
                </div>
              )}

              {/* Attachment list — local preview, uploaded on submit */}
              {pending.length > 0 && (
                <div className="space-y-1.5">
                  {pending.map((att) => {
                    const isImage = att.kind === "file" && att.mimeType.startsWith("image/");
                    return (
                      <div key={att.id} className="flex items-center gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        {/* Icon / thumbnail */}
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={(att as PendingFile).previewUrl} alt={att.name} className="w-full h-full object-cover" />
                          ) : att.kind === "link" ? (
                            <Link2 className="w-4 h-4 text-blue-500" />
                          ) : (
                            <FileText className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{att.name}</p>
                          {att.kind === "file" && att.size > 0 && (
                            <p className="text-[10px] text-slate-400">{formatSize(att.size)}</p>
                          )}
                          {att.kind === "link" && (
                            <p className="text-[10px] text-slate-400 truncate">{att.url}</p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {pending.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5" />
                  {pending.filter(a => a.kind === "file").length > 0
                    ? `${pending.filter(a => a.kind === "file").length} file sẽ được tải lên khi tạo nhiệm vụ`
                    : null}
                </p>
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

      {/* ── Workflow Editor Overlay (draft mode, không lưu DB) ── */}
      {showWorkflowEditor && selectedWorkflow && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
            <div>
              <h3 className="text-sm font-bold dark:text-white">
                Điều chỉnh sơ đồ quy trình — {selectedWorkflow.name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Thay đổi chỉ áp dụng cho nhiệm vụ này, không ảnh hưởng quy trình mẫu gốc.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowWorkflowEditor(false)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          {/* Builder chiếm toàn bộ phần còn lại */}
          <div className="flex-1 min-h-0">
            <WorkflowBuilder
              workflow={{
                ...selectedWorkflow,
                nodes: effectiveNodes,
                edges: effectiveEdges,
              }}
              allWorkflows={[]}
              canEdit
              users={activeUsers.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, department: u.department }))}
              onSave={async () => {}}
              onConfirm={(nodes, edges) => {
                setDraftNodes(nodes);
                setDraftEdges(edges);
                setShowWorkflowEditor(false);
              }}
              onCancelDraft={() => setShowWorkflowEditor(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SortableStepRow ──────────────────────────────────────────────────────────

interface SortableStepRowProps {
  node: WorkflowNode;
  index: number;
  deps: string[];
  candidates: { id: string; name: string; department?: string }[];
  assigneeValue: string;
  onAssigneeChange: (nodeId: string, userId: string) => void;
}

function SortableStepRow({ node, index, deps, candidates, assigneeValue, onAssigneeChange }: SortableStepRowProps) {
  const abbr = useUnitAbbr();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-white dark:bg-slate-800 rounded-lg p-2 border border-blue-100 dark:border-blue-900/40 transition-shadow",
        isDragging && "opacity-60 shadow-xl ring-2 ring-blue-400",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 font-medium">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-slate-300 hover:text-slate-500 dark:hover:text-slate-400 shrink-0 p-0.5 -ml-0.5 rounded"
          tabIndex={-1}
          aria-label="Kéo để sắp xếp"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="w-4 h-4 shrink-0 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-[10px] font-bold select-none">
          {index + 1}
        </span>
        <span className="truncate">{node.name}</span>
        {node.roleRequired && (
          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded-full shrink-0">
            {node.roleRequired}
          </span>
        )}
      </div>
      {deps.length > 0 && (
        <p className="text-[10px] text-slate-400 mt-0.5 ml-[1.625rem]">
          Đầu vào từ: {deps.join(", ")}
        </p>
      )}
      <div className="mt-1.5 ml-[1.625rem] w-[calc(100%-1.625rem)]">
        <SearchableSelect
          value={assigneeValue}
          onChange={(uid) => onAssigneeChange(node.id, uid)}
          options={candidates.map((u) => ({ id: u.id, label: u.name, sub: u.department ? abbr(u.department) : undefined }))}
          placeholder="— Chưa gán (phân công sau) —"
          emptyText="Không tìm thấy"
          listHeight="max-h-36"
          compact
        />
      </div>
    </li>
  );
}
