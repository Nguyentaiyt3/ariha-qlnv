"use client";

/**
 * StepFlowDiagram — hiển thị các bước quy trình dưới dạng DAG tương tác.
 * - Read-only: không kéo thả vị trí node (vị trí từ template).
 * - Click node → mở StepNodePanel với section tương ứng.
 * - Node có childSteps → breadcrumb drill-down.
 */

import { useMemo, useState, useEffect } from "react";
import ReactFlow, {
  Background, Controls,
  type Node, type Edge, type NodeProps,
  MarkerType, BackgroundVariant,
  Handle, Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { ChevronRight, GitBranch, Lock, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/common/UserAvatar";
import { computeInputState } from "@/lib/workflow-engine";
import type { Task, TaskStep, User } from "@/types";

export type PanelSection = "progress" | "helpers" | "advance" | "transaction" | "email" | "proof" | "subworkflow";

const SECTION_BTNS: { s: PanelSection; label: string }[] = [
  { s: "progress",    label: "%" },
  { s: "helpers",     label: "Hỗ trợ" },
  { s: "advance",     label: "Tạm ứng" },
  { s: "transaction", label: "Thu/Chi" },
  { s: "email",       label: "Email" },
  { s: "proof",       label: "Minh chứng" },
];

// ── Color helpers ──────────────────────────────────────────────
const pBarColor  = (p: number) => p <= 33 ? "#EF4444" : p <= 66 ? "#F59E0B" : "#22C55E";
const pTextColor = (p: number) => p <= 33 ? "#DC2626" : p <= 66 ? "#D97706" : "#16A34A";

// ── Node data shape ────────────────────────────────────────────
interface StepNodeData {
  step: TaskStep;
  stepIdx: number;
  allSteps: TaskStep[];
  assignee?: User;
  myRole: "assignee" | "helper" | null;
  canIUpdate: boolean;
  onAction: (section: PanelSection) => void;
  onDrillDown: () => void;
  onEditSubWorkflow?: () => void;
}

// ── Custom ReactFlow node ──────────────────────────────────────
function StepFlowNode({ data }: NodeProps<StepNodeData>) {
  const { step, stepIdx, allSteps, assignee, myRole, canIUpdate, onAction, onDrillDown, onEditSubWorkflow } = data;
  const inputState = computeInputState(step, allSteps);
  const isDone  = step.status === "completed" || step.progress >= 100;
  const isRunning = !isDone && step.status === "in_progress";
  const isLocked  = !isDone && !isRunning && !inputState.ready;
  const hasChildren = (step.childSteps?.length ?? 0) > 0;

  const borderColor = isDone ? "#22C55E" : isRunning ? "#3B82F6" : isLocked ? "#94A3B8" : "#CBD5E1";
  const bg = isDone
    ? "rgba(240,253,244,1)"
    : isRunning
    ? "rgba(239,246,255,1)"
    : "rgba(255,255,255,1)";

  return (
    <div
      style={{ borderColor, background: bg, borderWidth: 2, minWidth: 200 }}
      className="rounded-xl border shadow-sm select-none"
    >
      <Handle type="target" position={Position.Left}   style={{ background: borderColor, width: 8, height: 8, border: "none" }} />
      <Handle type="target" position={Position.Top}    style={{ background: borderColor, width: 8, height: 8, border: "none" }} />
      <Handle type="source" position={Position.Right}  style={{ background: borderColor, width: 8, height: 8, border: "none" }} />
      <Handle type="source" position={Position.Bottom} style={{ background: borderColor, width: 8, height: 8, border: "none" }} />

      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-start gap-2">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
            style={{ background: borderColor }}
          >
            {isDone ? "✓" : stepIdx + 1}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-tight line-clamp-2 flex-1">{step.name}</p>
          {isLocked && <span title="Chờ bước trước hoàn thành"><Lock className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" /></span>}
        </div>
      </div>

      {/* Progress */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold" style={{ color: pTextColor(step.progress) }}>
            {step.progress}%
          </span>
          {inputState.pendingNames.length > 0 && (
            <span className="text-[9px] text-slate-400 truncate max-w-[100px]" title={inputState.pendingNames.join(", ")}>
              Chờ: {inputState.pendingNames[0]}
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${step.progress}%`, background: pBarColor(step.progress) }}
          />
        </div>
      </div>

      {/* Assignee + role badge + child badge */}
      <div className="px-3 pb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          {assignee ? (
            <UserAvatar user={assignee} size="xs" showName namePosition="right" />
          ) : (
            <span className="text-[10px] text-slate-400 italic">Chưa phân công</span>
          )}
          {myRole && (
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded-full font-semibold w-fit leading-tight",
              myRole === "assignee"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
            )}>
              {myRole === "assignee" ? "Thực hiện chính" : "Cộng tác"}
            </span>
          )}
        </div>
        {hasChildren && (
          <button
            className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 font-semibold shrink-0 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded-md transition"
            onMouseDown={(e) => { e.stopPropagation(); onDrillDown(); }}
            title="Xem quy trình con"
          >
            <GitBranch className="w-2.5 h-2.5" />
            {step.childSteps!.length} con
          </button>
        )}
      </div>

      {/* Action buttons */}
      {canIUpdate && (
        <div className="border-t border-slate-100 px-2 py-1.5 flex gap-1 flex-wrap">
          {SECTION_BTNS.map(({ s, label }) => (
            <button
              key={s}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition font-medium"
              onMouseDown={(e) => { e.stopPropagation(); onAction(s); }}
            >
              {label}
            </button>
          ))}
          <button
            className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 transition font-medium flex items-center gap-0.5"
            onMouseDown={(e) => { e.stopPropagation(); onEditSubWorkflow?.(); }}
            title={hasChildren ? "Sửa quy trình con (cần phê duyệt)" : "Thiết lập quy trình con"}
          >
            <GitBranch className="w-2.5 h-2.5" />
            {hasChildren ? "Sửa con" : "+ Con"}
          </button>
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { stepNode: StepFlowNode };

// ── Main component ─────────────────────────────────────────────
interface Props {
  task: Task;
  steps: TaskStep[];
  users: User[];
  currentUser: User;
  canAssignSteps: boolean;
  onNodeClick: (stepId: string, section: PanelSection) => void;
  onEditSubWorkflow?: (stepId: string) => void;
}

export function StepFlowDiagram({ task, steps, users, currentUser, canAssignSteps, onNodeClick, onEditSubWorkflow }: Props) {
  // Breadcrumb path: [{id, name}] for drill-down
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close fullscreen with Escape key
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Resolve current steps array based on drill-down depth
  const currentSteps = useMemo((): TaskStep[] => {
    if (crumbs.length === 0) return steps;
    let arr = steps;
    for (const crumb of crumbs) {
      const found = arr.find((s) => s.id === crumb.id);
      if (!found?.childSteps?.length) return [];
      arr = found.childSteps;
    }
    return arr;
  }, [steps, crumbs]);

  // Build ReactFlow nodes
  const rfNodes = useMemo((): Node<StepNodeData>[] => {
    return currentSteps.map((step, idx) => {
      const assignee = users.find((u) => u.id === step.assigneeId);
      const canIUpdate = step.assigneeId === currentUser.id || canAssignSteps;
      // Role badge: show the logged-in user's relationship to this step
      const myRole: "assignee" | "helper" | null =
        step.assigneeId === currentUser.id ? "assignee"
        : (step.helpers ?? []).includes(currentUser.id) ? "helper"
        : null;
      // Use saved position or auto-layout left→right
      const position = step.position ?? { x: (idx % 4) * 240 + 40, y: Math.floor(idx / 4) * 160 + 60 };
      return {
        id: step.id,
        type: "stepNode",
        position,
        draggable: false,
        selectable: false,
        data: {
          step,
          stepIdx: idx,
          allSteps: currentSteps,
          assignee,
          myRole,
          canIUpdate,
          onAction: (section: PanelSection) => onNodeClick(step.id, section),
          onDrillDown: () => setCrumbs((prev) => [...prev, { id: step.id, name: step.name }]),
          onEditSubWorkflow: onEditSubWorkflow ? () => onEditSubWorkflow(step.id) : undefined,
        } satisfies StepNodeData,
      };
    });
  }, [currentSteps, users, currentUser.id, canAssignSteps, onNodeClick, onEditSubWorkflow]);

  // Build edges from dependsOn
  const rfEdges = useMemo((): Edge[] => {
    const edges: Edge[] = [];
    const currentIds = new Set(currentSteps.map((s) => s.id));
    for (const step of currentSteps) {
      for (const depId of step.dependsOn ?? []) {
        if (!currentIds.has(depId)) continue;
        edges.push({
          id: `${depId}->${step.id}`,
          source: depId,
          target: step.id,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#94A3B8" },
          style: { stroke: "#94A3B8", strokeWidth: 1.5 },
        });
      }
    }
    return edges;
  }, [currentSteps]);

  const done  = steps.filter((s) => s.status === "completed" || s.progress >= 100).length;
  const total = steps.length;

  const containerCls = isFullscreen
    ? "fixed inset-0 z-[9999] bg-slate-50 dark:bg-slate-900 flex flex-col"
    : "relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900";
  const containerStyle = isFullscreen ? undefined : { height: 520 };

  return (
    <div className={containerCls} style={containerStyle}>

      {/* Breadcrumb */}
      {crumbs.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-white dark:bg-slate-800 rounded-lg px-3 py-1.5 shadow-sm text-xs border border-slate-200 dark:border-slate-700">
          <button
            className="text-blue-600 hover:underline font-medium"
            onClick={() => setCrumbs([])}
          >
            Quy trình chính
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-slate-400" />
              {i < crumbs.length - 1 ? (
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => setCrumbs((prev) => prev.slice(0, i + 1))}
                >
                  {c.name}
                </button>
              ) : (
                <span className="font-semibold text-slate-700 dark:text-slate-200">{c.name}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Top-right controls: summary + fullscreen toggle */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        <div className="bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 shadow-sm text-slate-500">
          {done}/{total} hoàn thành
        </div>
        <button
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? "Thu nhỏ (Esc)" : "Xem toàn màn hình"}
          className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1.5 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Fullscreen title bar */}
      {isFullscreen && (
        <div className="shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {task.name} — Sơ đồ quy trình
          </span>
          <button
            onClick={() => setIsFullscreen(false)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            <Minimize2 className="w-3.5 h-3.5" /> Thu nhỏ · Esc
          </button>
        </div>
      )}

      {/* Empty sub-workflow */}
      {currentSteps.length === 0 && crumbs.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-slate-400">Quy trình con chưa có bước nào.</p>
        </div>
      )}

      <div className={isFullscreen ? "flex-1 relative" : "absolute inset-0"}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#CBD5E1" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
