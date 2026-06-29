"use client";

import { useState, useCallback, useEffect, useContext, createContext, useRef } from "react";
import ReactFlow, {
  Background, Controls, Panel,
  useNodesState, useEdgesState,
  addEdge, Handle, Position, MarkerType, BackgroundVariant,
  type Node, type Edge, type Connection, type NodeProps, type Viewport,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Plus, Save, Trash2, X, Link2, Check, Loader2, Send,
  Lock, Unlock, LayoutGrid, GitBranch, ChevronDown, ChevronUp,
  ArrowDownToLine, ArrowUpFromLine, Star, PlayCircle,
  Camera, Paperclip, Clock, Zap, User, Users,
} from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/types";
import { generateId } from "@/lib/utils";

// ── Zones ─────────────────────────────────────────────────────
const ZONE_W = 520;
const ZONES = [
  { idx: 0, status: "todo"        as const, label: "Chuẩn bị",       sublabel: "Chuẩn bị & khởi động",    color: "#3B82F6", bg: "rgba(59,130,246,0.04)" },
  { idx: 1, status: "in_progress" as const, label: "Đang thực hiện", sublabel: "Song song hoặc tuần tự",   color: "#F59E0B", bg: "rgba(245,158,11,0.04)" },
  { idx: 2, status: "done"        as const, label: "Hoàn thành",      sublabel: "Bước kết thúc quy trình", color: "#22C55E", bg: "rgba(34,197,94,0.04)"  },
] as const;
type ZoneStatus = typeof ZONES[number]["status"];
function zoneByX(x: number): ZoneStatus {
  if (x < ZONE_W)     return "todo";
  if (x < ZONE_W * 2) return "in_progress";
  return "done";
}
const STATUS_CFG = {
  todo:        { label: "Chuẩn bị",       color: "#3B82F6" },
  in_progress: { label: "Đang thực hiện", color: "#F59E0B" },
  done:        { label: "Hoàn thành",      color: "#22C55E" },
  blocked:     { label: "Bị chặn",         color: "#EF4444" },
} as const;
type NodeStatus = keyof typeof STATUS_CFG;

const EVAL_3T = [
  { key: "tot"        as const, label: "Tốt",        color: "#22C55E" },
  { key: "trung_binh" as const, label: "Trung bình", color: "#F59E0B" },
  { key: "te"         as const, label: "Tệ",          color: "#EF4444" },
];
type Eval3T = "tot" | "trung_binh" | "te";
type ArrowType      = "closed" | "open" | "none";
type LineType       = "smoothstep" | "straight" | "step";
type ArrowDirection = "forward" | "backward" | "both";

const HANDLE_SIDE_MAP: Record<string, "left" | "right" | "top" | "bottom"> = {
  sl: "left", sr: "right", st: "top", sb: "bottom",
  tl: "left", tr: "right", tt: "top", tb: "bottom",
};
const SOURCE_HANDLE_BY_SIDE: Record<string, string> = { left: "sl", right: "sr", top: "st", bottom: "sb" };
const TARGET_HANDLE_BY_SIDE: Record<string, string> = { left: "tl", right: "tr", top: "tt", bottom: "tb" };
const FLIP_HANDLE: Record<string, string> = { sl: "tl", sr: "tr", st: "tt", sb: "tb", tl: "sl", tr: "sr", tt: "st", tb: "sb" };

interface ProofItem {
  id: string; name: string; mimeType: string; dataUrl: string;
}
interface UserBasic {
  id: string; name: string; avatar?: string; department?: string;
}

// ── Node data ─────────────────────────────────────────────────
interface WFNodeData {
  label: string;
  department: string;
  status: NodeStatus;
  description: string;
  showStatus: boolean;
  locked: boolean;
  assigneeId?: string;
  assigneeName?: string;
  roleRequired?: string;
  deadline?: string;
  kpiTarget?: number;
  kpiUnit?: string;
  output?: string;
  progress?: number;
  eval3T?: Eval3T;
  evalNote?: string;
  proofs?: ProofItem[];
  /** Số node con — để hiện badge quy trình con */
  childCount?: number;
}

// ── Context ───────────────────────────────────────────────────
interface BuilderCtx {
  toggleLock: (id: string) => void;
  deleteNode: (id: string) => void;
  canEdit: boolean;
}
const BuilderContext = createContext<BuilderCtx | null>(null);

// ── Deadline helpers ──────────────────────────────────────────
function daysRemaining(deadline?: string): number | null {
  if (!deadline) return null;
  const d = new Date(deadline), t = new Date();
  t.setHours(0,0,0,0); d.setHours(0,0,0,0);
  return Math.ceil((d.getTime() - t.getTime()) / 86400000);
}
function deadlineInfo(days: number | null) {
  if (days === null) return null;
  if (days < 0)  return { color: "#EF4444", bg: "#FFF1F2", label: `Quá hạn ${Math.abs(days)} ngày` };
  if (days === 0) return { color: "#EF4444", bg: "#FFF1F2", label: "Hết hạn hôm nay"              };
  if (days === 1) return { color: "#EF4444", bg: "#FFF1F2", label: "Còn 1 ngày"                    };
  if (days <= 3)  return { color: "#F59E0B", bg: "#FFFBEB", label: `Còn ${days} ngày`               };
  return                  { color: "#22C55E", bg: "#F0FDF4", label: `Còn ${days} ngày`               };
}

// ── Auto-computations ─────────────────────────────────────────
function autoOutputSummary(progress: number, proofs: ProofItem[]): { text: string; color: string; bg: string } {
  const p = progress ?? 0;
  const n = proofs?.length ?? 0;
  if (p === 0)                        return { text: "Chưa bắt đầu",                        color: "#94a3b8", bg: "#f8fafc"  };
  if (p === 100 && n > 0)             return { text: `Hoàn thành — ${n} minh chứng`,         color: "#22C55E", bg: "#F0FDF4" };
  if (p === 100 && n === 0)           return { text: "Hoàn thành — thiếu minh chứng",         color: "#F59E0B", bg: "#FFFBEB" };
  if (p >= 80  && n > 0)              return { text: `${p}% — có ${n} minh chứng`,            color: "#3B82F6", bg: "#EFF6FF" };
  if (p >= 80  && n === 0)            return { text: `${p}% — chưa có minh chứng`,            color: "#F59E0B", bg: "#FFFBEB" };
  if (p >= 50)                        return { text: `Đang thực hiện — ${p}%`,                color: "#F59E0B", bg: "#FFFBEB" };
  return                                     { text: `Mới bắt đầu — ${p}%`,                  color: "#94a3b8", bg: "#f1f5f9" };
}

function auto3TSuggest(progress: number, deadline?: string, proofs?: ProofItem[]): Eval3T | null {
  const days = daysRemaining(deadline);
  const p = progress ?? 0;
  const n = proofs?.length ?? 0;
  if (p === 0 && n === 0) return null;
  if (p === 100 && n > 0  && (days === null || days >= 0)) return "tot";
  if (p === 100)                                            return "trung_binh"; // done but no proof / late
  if (days !== null && days < 0  && p < 95)               return "te";
  if (days !== null && days <= 1 && p < 70)               return "te";
  if (p >= 80  && n > 0)                                   return "tot";
  if (p >= 80  && n === 0)                                 return "trung_binh";
  if (p >= 45)                                             return "trung_binh";
  return "te";
}

function autoInputStatus(predecessors: Node[]): { text: string; color: string; bg: string; ready: boolean } {
  if (predecessors.length === 0)
    return { text: "Bước đầu tiên — nhận đầu vào từ nhiệm vụ chính", color: "#F59E0B", bg: "#FFFBEB", ready: true };
  const done = predecessors.filter((n) => {
    const d = n.data as WFNodeData;
    return (d.progress ?? 0) === 100 || d.status === "done";
  });
  const withProofs = done.filter((n) => (n.data as WFNodeData).proofs?.length);
  if (done.length === predecessors.length && withProofs.length === done.length)
    return { text: "Đủ điều kiện — tất cả bước trước hoàn thành có minh chứng", color: "#22C55E", bg: "#F0FDF4", ready: true };
  if (done.length === predecessors.length)
    return { text: "Tạm đủ điều kiện — một số bước chưa có minh chứng",         color: "#F59E0B", bg: "#FFFBEB", ready: true };
  return { text: `Chưa đủ điều kiện — còn ${predecessors.length - done.length} bước trước chưa xong`, color: "#EF4444", bg: "#FFF1F2", ready: false };
}

// ── Zone components ───────────────────────────────────────────
function ZoneBandLayer({ vp }: { vp: Viewport }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {ZONES.map((z) => (
        <div key={z.status} style={{
          position: "absolute",
          left: z.idx * ZONE_W * vp.zoom + vp.x, top: 0, bottom: 0,
          width: ZONE_W * vp.zoom,
          background: z.bg,
          borderRight: z.idx < 2 ? `2px dashed ${z.color}28` : "none",
        }} />
      ))}
    </div>
  );
}
function ZoneHeader({ vp, viewMode }: { vp: Viewport; viewMode: "zones" | "classic" }) {
  if (viewMode !== "zones") return null;
  return (
    <div style={{ position: "relative", height: 44, borderBottom: "1px solid #e2e8f0", overflow: "hidden", flexShrink: 0, background: "#ffffff" }}>
      {ZONES.map((z) => (
        <div key={z.status} style={{
          position: "absolute",
          left: z.idx * ZONE_W * vp.zoom + vp.x, width: ZONE_W * vp.zoom, top: 0, bottom: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
          borderRight: z.idx < 2 ? `1px solid ${z.color}25` : "none",
          background: `${z.color}06`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: z.color }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: z.color }} />
            {z.label}
          </div>
          <p style={{ fontSize: 9, color: `${z.color}99`, fontWeight: 500, whiteSpace: "nowrap", margin: 0 }}>{z.sublabel}</p>
        </div>
      ))}
    </div>
  );
}

// ── Handle style ──────────────────────────────────────────────
const hStyle = (color: string): React.CSSProperties => ({
  background: "#ffffff", border: `2px solid ${color}`, width: 10, height: 10,
});

// ── Node card ─────────────────────────────────────────────────
function WFNodeCard({ data, id, selected }: NodeProps) {
  const d   = data as WFNodeData;
  const cfg = STATUS_CFG[d.status] ?? STATUS_CFG.todo;
  const ctx = useContext(BuilderContext);
  const [expand,  setExpand]  = useState(false);
  const [hovered, setHovered] = useState(false);

  const days     = daysRemaining(d.deadline);
  const dlInfo   = deadlineInfo(days);
  const eval3T   = d.eval3T ? EVAL_3T.find((e) => e.key === d.eval3T) : null;
  const prfCount = d.proofs?.length ?? 0;
  const outSummary = autoOutputSummary(d.progress ?? 0, d.proofs ?? []);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#ffffff",
        border: `1.5px solid ${selected ? cfg.color : "#e2e8f0"}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 12, minWidth: 200, maxWidth: 240,
        cursor: d.locked ? "not-allowed" : "grab",
        boxShadow: selected ? `0 0 0 2px ${cfg.color}40, 0 4px 20px rgba(0,0,0,.14)` : "0 2px 10px rgba(0,0,0,.08)",
        transition: "box-shadow 0.15s", overflow: "hidden", position: "relative",
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Left}   id="tl" style={{ ...hStyle(cfg.color), top: "33%" }} />
      <Handle type="target" position={Position.Top}    id="tt" style={{ ...hStyle(cfg.color), left: "33%" }} />
      <Handle type="target" position={Position.Right}  id="tr" style={{ ...hStyle(cfg.color), top: "67%" }} />
      <Handle type="target" position={Position.Bottom} id="tb" style={{ ...hStyle(cfg.color), left: "67%" }} />
      <Handle type="source" position={Position.Right}  id="sr" style={{ ...hStyle(cfg.color), top: "33%" }} />
      <Handle type="source" position={Position.Bottom} id="sb" style={{ ...hStyle(cfg.color), left: "33%" }} />
      <Handle type="source" position={Position.Left}   id="sl" style={{ ...hStyle(cfg.color), top: "67%" }} />
      <Handle type="source" position={Position.Top}    id="st" style={{ ...hStyle(cfg.color), left: "67%" }} />

      {/* Quick actions on hover */}
      {hovered && ctx?.canEdit && (
        <div style={{ position: "absolute", top: 5, right: 5, zIndex: 10, display: "flex", gap: 3 }}
          onMouseDown={(e) => e.stopPropagation()}>
          <button title={d.locked ? "Mở khoá" : "Khoá"} onClick={(e) => { e.stopPropagation(); ctx?.toggleLock(id); }}
            style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid #e2e8f0", background: d.locked ? "#FFF1F2" : "#f8fafc", color: d.locked ? "#EF4444" : "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {d.locked ? <Unlock size={10} /> : <Lock size={10} />}
          </button>
          <button title="Xoá" onClick={(e) => { e.stopPropagation(); ctx?.deleteNode(id); }}
            style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={10} />
          </button>
        </div>
      )}

      {/* Deadline bar */}
      {dlInfo && (
        <div style={{ padding: "3px 10px", fontSize: 9.5, fontWeight: 700, background: dlInfo.bg, color: dlInfo.color, display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${dlInfo.color}20` }}>
          <Clock size={9} />{dlInfo.label}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "8px 12px 5px", display: "flex", alignItems: "flex-start", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 12.5, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-word", margin: 0 }}>{d.label}</p>
          {d.department && <p style={{ fontSize: 10, color: "#64748b", margin: "1px 0 0" }}>{d.department}</p>}
          {/* Assignee */}
          {d.assigneeName && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: cfg.color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={8} style={{ color: cfg.color }} />
              </div>
              <span style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>{d.assigneeName}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0, alignItems: "center", marginTop: 1 }}>
          {d.locked && <Lock size={11} style={{ color: "#94a3b8" }} />}
          {eval3T && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 6, background: `${eval3T.color}18`, color: eval3T.color }}>
              {eval3T.label}
            </span>
          )}
        </div>
      </div>

      {/* Indicator pills */}
      <div style={{ display: "flex", gap: 4, padding: "0 10px 6px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#3B82F6", background: "#EFF6FF", padding: "2px 6px", borderRadius: 5 }}>
          <ArrowDownToLine size={9} /><span>Đầu vào</span>
        </div>
        {(d.progress ?? 0) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: outSummary.color, background: outSummary.bg, padding: "2px 6px", borderRadius: 5 }}>
            <PlayCircle size={9} /><span>{outSummary.text}</span>
          </div>
        )}
        {d.kpiTarget && (
          <div style={{ fontSize: 9, color: "#8B5CF6", background: "#F5F3FF", padding: "2px 6px", borderRadius: 5 }}>
            KPI {d.kpiTarget} {d.kpiUnit}
          </div>
        )}
        {prfCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#0284c7", background: "#f0f9ff", padding: "2px 6px", borderRadius: 5 }}>
            <Paperclip size={9} /><span>{prfCount} MC</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {(d.progress ?? 0) > 0 && (
        <div style={{ height: 3, background: "#f1f5f9", margin: "0 10px 6px" }}>
          <div style={{ height: "100%", width: `${d.progress}%`, background: cfg.color, borderRadius: 2 }} />
        </div>
      )}

      {/* Sub-workflow badge */}
      {(d.childCount ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px 6px", fontSize: 9.5, fontWeight: 700, color: "#8B5CF6" }}>
          <GitBranch size={9} />⊞ {d.childCount} bước con
        </div>
      )}

      {/* Description toggle */}
      {d.description && (
        <div style={{ padding: "0 10px 7px" }}>
          <button onClick={(e) => { e.stopPropagation(); setExpand((v) => !v); }}
            style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, color: "#64748b", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
            {expand ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expand ? "Ẩn bớt" : "Nội dung"}
          </button>
          {expand && <p style={{ fontSize: 11, color: "#475569", lineHeight: 1.45, margin: "4px 0 0" }}>{d.description}</p>}
        </div>
      )}
    </div>
  );
}
const NODE_TYPES = { wfNode: WFNodeCard };

// ── Workflow ↔ ReactFlow conversion ───────────────────────────
function toRFNodes(wf: Workflow, showStatus: boolean): Node[] {
  const src: WorkflowNode[] = wf.nodes?.length
    ? wf.nodes
    : (wf.steps ?? []).map((s, i) => ({
        id: s.id, name: s.name, description: s.description,
        department: wf.department, status: "todo" as const,
        position: { x: i * 280, y: 80 },
      }));
  return src.map((n) => {
    const locked = !!(n as any).locked;
    return {
      id: n.id, type: "wfNode", position: n.position, draggable: !locked,
      data: {
        label: n.name, department: n.department ?? "",
        status: n.status ?? "todo", description: n.description ?? "",
        showStatus, locked,
        assigneeId:   (n as any).assigneeId ?? "",
        assigneeName: (n as any).assigneeName ?? "",
        roleRequired: (n as any).roleRequired ?? "",
        deadline:  (n as any).deadline ?? "",
        kpiTarget: (n as any).kpiTarget,
        kpiUnit:   (n as any).kpiUnit ?? "",
        output:    (n as any).output  ?? "",
        progress:  (n as any).progress ?? 0,
        eval3T:    (n as any).eval3T,
        evalNote:  (n as any).evalNote ?? "",
        proofs:    (n as any).proofs  ?? [],
      } satisfies WFNodeData,
    };
  });
}

function toRFEdges(wf: Workflow): Edge[] {
  const src: WorkflowEdge[] = wf.edges?.length
    ? wf.edges.filter((e) => !e.target.startsWith("ext::"))
    : (wf.steps ?? []).slice(0, -1).map((s, i) => ({
        id: `e-${s.id}-${wf.steps[i + 1].id}`,
        source: s.id, target: wf.steps[i + 1].id,
      }));
  return src.map((e) =>
    buildEdge(e.id, e.source, e.target, !!e.required, e.label,
      (e as any).arrowType ?? "closed", (e as any).lineType ?? "smoothstep",
      (e as any).arrowDirection ?? "forward",
      (e as any).sourceHandle ?? null, (e as any).targetHandle ?? null)
  );
}

function buildEdge(
  id: string, source: string, target: string,
  required: boolean, label?: string,
  arrowType: ArrowType = "closed", lineType: LineType = "smoothstep",
  arrowDirection: ArrowDirection = "forward",
  sourceHandle?: string | null, targetHandle?: string | null,
): Edge {
  const color = required ? "#3B82F6" : "#94A3B8";
  let markerEnd:   Edge["markerEnd"];
  let markerStart: Edge["markerStart"];
  if (arrowType !== "none") {
    const mtype = arrowType === "closed" ? MarkerType.ArrowClosed : MarkerType.Arrow;
    if (arrowDirection !== "backward") markerEnd   = { type: mtype, color };
    if (arrowDirection !== "forward")  markerStart = { type: mtype, color };
  }
  return {
    id, source, target, type: lineType,
    label: required ? "Phải xong trước" : label,
    labelStyle: required ? { fontSize: 10, fontWeight: 600, fill: "#3B82F6" } : { fontSize: 10, fill: "#94A3B8" },
    labelBgStyle: required ? { fill: "#EFF6FF", fillOpacity: 1 } : { fill: "#ffffff", fillOpacity: 0.85 },
    markerEnd,
    markerStart,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
    style: { strokeWidth: required ? 2.5 : 1.5, stroke: color, strokeDasharray: required ? undefined : "5 4" },
    data: { required, arrowType, lineType, arrowDirection, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null },
  };
}

function fromRF(rfNodes: Node[], rfEdges: Edge[], extEdges: WorkflowEdge[]) {
  const nodes: WorkflowNode[] = rfNodes.map((n) => {
    const d = n.data as WFNodeData;
    return {
      id: n.id, name: d.label,
      description: d.description || undefined, department: d.department || undefined,
      status: d.status, position: n.position, locked: d.locked,
      assigneeId:   d.assigneeId    || undefined,
      assigneeName: d.assigneeName  || undefined,
      roleRequired: (d.roleRequired || undefined) as any,
      deadline:  d.deadline  || undefined,
      kpiTarget: d.kpiTarget,
      kpiUnit:   d.kpiUnit   || undefined,
      output:    d.output    || undefined,
      progress:  d.progress,
      eval3T:    d.eval3T,
      evalNote:  d.evalNote  || undefined,
      proofs:    d.proofs?.length ? d.proofs : undefined,
    } as any;
  });
  const edges: WorkflowEdge[] = [
    ...rfEdges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      required: !!(e.data?.required),
      label: typeof e.label === "string" && !e.data?.required ? e.label : undefined,
      arrowType: e.data?.arrowType, lineType: e.data?.lineType,
      arrowDirection: e.data?.arrowDirection,
      sourceHandle: e.data?.sourceHandle || undefined,
      targetHandle: e.data?.targetHandle || undefined,
    } as any)),
    ...extEdges,
  ];
  return { nodes, edges };
}

function snapNodesToZones(nodes: Node[]): Node[] {
  const counts: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
  return nodes.map((n) => {
    const zoneIdx = ZONES.findIndex((z) => z.status === n.data.status);
    if (zoneIdx === -1) return n;
    const col = counts[n.data.status] ?? 0;
    counts[n.data.status] = col + 1;
    return { ...n, position: { x: zoneIdx * ZONE_W + 40 + (col % 2) * 240, y: 80 + Math.floor(col / 2) * 160 } };
  });
}

// ── Node Editor ───────────────────────────────────────────────
type EditorTab = "chung" | "dau_vao" | "dau_ra" | "danh_gia";

function NodeEditor({
  node, allWorkflows, extEdges, viewMode, users,
  onUpdate, onDelete, onClose, onAddExtEdge, onRemoveExtEdge, predecessors,
  onEditSubWorkflow,
}: {
  node: Node; allWorkflows: Workflow[]; extEdges: WorkflowEdge[];
  viewMode: "zones" | "classic"; users: UserBasic[];
  onUpdate: (id: string, p: Partial<WFNodeData>) => void;
  onDelete: (id: string) => void; onClose: () => void;
  onAddExtEdge: (e: WorkflowEdge) => void; onRemoveExtEdge: (id: string) => void;
  predecessors: Node[];
  onEditSubWorkflow?: (nodeId: string) => void;
}) {
  const [tab, setTab]             = useState<EditorTab>("chung");
  const [showExtForm, setShowExt] = useState(false);
  const [extWfId, setExtWfId]     = useState("");
  const [extNodeId, setExtNodeId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef  = useRef<HTMLInputElement>(null);

  const d = node.data as WFNodeData;
  const nodeExtEdges = extEdges.filter((e) => e.source === node.id);
  const targetWf     = allWorkflows.find((w) => w.id === extWfId);
  const currentZone  = ZONES.find((z) => z.status === d.status);

  // Auto-computed values
  const days        = daysRemaining(d.deadline);
  const dlInfo      = deadlineInfo(days);
  const outSummary  = autoOutputSummary(d.progress ?? 0, d.proofs ?? []);
  const suggested3T = auto3TSuggest(d.progress ?? 0, d.deadline, d.proofs ?? []);
  const inputStatus = autoInputStatus(predecessors);

  function addExtLink() {
    if (!extWfId || !extNodeId) return;
    onAddExtEdge({ id: `ext-${generateId("e")}`, source: node.id, target: `ext::${extWfId}::${extNodeId}` });
    setExtWfId(""); setExtNodeId(""); setShowExt(false);
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const current = d.proofs ?? [];
    const batch: ProofItem[] = [];
    let done = 0;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        batch.push({ id: generateId("prf"), name: file.name, mimeType: file.type, dataUrl: ev.target?.result as string });
        if (++done === files.length) onUpdate(node.id, { proofs: [...current, ...batch] });
      };
      reader.readAsDataURL(file);
    });
  }

  function setAssignee(userId: string) {
    const u = users.find((u) => u.id === userId);
    onUpdate(node.id, { assigneeId: userId, assigneeName: u?.name ?? "" });
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 12.5,
    border: "1px solid #e2e8f0", borderRadius: 8,
    background: "#f8fafc", color: "#0f172a",
    boxSizing: "border-box", outline: "none", fontFamily: "inherit",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
    color: "#64748b", marginBottom: 5, textTransform: "uppercase",
  };
  const autoBanner = (text: string, color: string, bg: string, onClick?: () => void) => (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: bg, border: `1px solid ${color}30`, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Zap size={11} style={{ color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#475569" }}>{text}</span>
        </div>
        {onClick && (
          <button onClick={onClick} style={{ padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: color, color: "#fff", flexShrink: 0 }}>
            Áp dụng
          </button>
        )}
      </div>
    </div>
  );

  const TABS = [
    { key: "chung"   as EditorTab, icon: <GitBranch size={12} />,       label: "Chung"   },
    { key: "dau_vao" as EditorTab, icon: <ArrowDownToLine size={12} />, label: "Đầu vào" },
    { key: "dau_ra"  as EditorTab, icon: <ArrowUpFromLine size={12} />, label: "Đầu ra"  },
    { key: "danh_gia"as EditorTab, icon: <Star size={12} />,            label: "3T"      },
  ];

  return (
    <div style={{
      position: "absolute", right: 0, top: 0, bottom: 0, width: 310,
      background: "#ffffff", borderLeft: "1px solid #e2e8f0",
      overflowY: "auto", zIndex: 30,
      boxShadow: "-6px 0 28px rgba(0,0,0,.12)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Chỉnh sửa bước</span>
            {d.locked && <span style={{ fontSize: 10, background: "#f1f5f9", color: "#64748b", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>Khoá</span>}
          </div>
          <button onClick={onClose} style={{ padding: 5, borderRadius: 7, cursor: "pointer", background: "#f1f5f9", border: "none", color: "#64748b", lineHeight: 0 }}>
            <X size={14} />
          </button>
        </div>
        {dlInfo && (
          <div style={{ marginBottom: 8, padding: "5px 9px", borderRadius: 7, background: dlInfo.bg, border: `1px solid ${dlInfo.color}30`, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: dlInfo.color }}>
            <Clock size={11} />{dlInfo.label}
          </div>
        )}
        {viewMode === "zones" && currentZone && (
          <div style={{ marginBottom: 8, padding: "5px 9px", borderRadius: 7, background: `${currentZone.color}10`, border: `1px solid ${currentZone.color}30`, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: currentZone.color }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: currentZone.color }}>{currentZone.label}</span>
            <span style={{ fontSize: 10, color: `${currentZone.color}80` }}>· kéo để đổi vùng</span>
          </div>
        )}
        {/* Sub-workflow button */}
        {onEditSubWorkflow && (
          <button
            onClick={() => onEditSubWorkflow(node.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", marginBottom: 8, padding: "7px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, border: `1.5px solid ${(d.childCount ?? 0) > 0 ? "#8B5CF6" : "#e2e8f0"}`, background: (d.childCount ?? 0) > 0 ? "#F5F3FF" : "#f8fafc", color: (d.childCount ?? 0) > 0 ? "#8B5CF6" : "#64748b", cursor: "pointer" }}
          >
            <GitBranch size={12} />
            {(d.childCount ?? 0) > 0 ? `⊞ Sửa quy trình con (${d.childCount} bước)` : "⊞ Thêm quy trình con"}
          </button>
        )}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "7px 4px", fontSize: 10.5, fontWeight: 600,
              border: "none", background: "transparent", cursor: "pointer",
              color: tab === t.key ? "#3B82F6" : "#94a3b8",
              borderBottom: `2px solid ${tab === t.key ? "#3B82F6" : "transparent"}`,
            }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: "14px 16px", overflowY: "auto" }}>

        {/* ── Tab: Chung ── */}
        {tab === "chung" && (<>
          <label style={lbl}>Tên bước</label>
          <input value={d.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })}
            style={{ ...inp, marginBottom: 12 }} placeholder="Tên bước..." disabled={d.locked} />

          <label style={lbl}>Đơn vị / Phòng ban</label>
          <input value={d.department} onChange={(e) => onUpdate(node.id, { department: e.target.value })}
            style={{ ...inp, marginBottom: 12 }} placeholder="VD: Phòng Kinh doanh" disabled={d.locked} />

          <label style={lbl}>Vai trò yêu cầu (template)</label>
          <select
            value={d.roleRequired ?? ""}
            onChange={(e) => onUpdate(node.id, { roleRequired: e.target.value || undefined })}
            disabled={d.locked}
            style={{ ...inp, marginBottom: 12 }}
          >
            <option value="">— Bất kỳ (gán tự do) —</option>
            <option value="staff">Nhân viên (Staff)</option>
            <option value="teamLead">Trưởng/Phó phòng (TeamLead)</option>
            <option value="director">Ban Giám đốc (Director)</option>
            <option value="hrAdmin">Hành chính nhân sự (HRAdmin)</option>
            <option value="financeViewer">Tài chính — Theo dõi</option>
            <option value="financeAuditor">Tài chính — Kiểm tra</option>
            <option value="financeSupervisor">Tài chính — Giám sát</option>
          </select>
          {d.roleRequired && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "5px 9px", borderRadius: 7, background: "#f0f9ff", border: "1px solid #bae6fd", fontSize: 11, color: "#0369a1" }}>
              <User size={11} style={{ flexShrink: 0 }} />
              Khi tạo task từ quy trình này, chỉ những người có vai trò <strong style={{ marginLeft: 3 }}>{d.roleRequired}</strong> mới xuất hiện trong dropdown chọn người thực hiện.
            </div>
          )}

          {viewMode === "classic" && (<>
            <label style={lbl}>Trạng thái</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
              {(Object.entries(STATUS_CFG) as [NodeStatus, { label: string; color: string }][]).map(([key, { label: l2, color }]) => (
                <button key={key} onClick={() => !d.locked && onUpdate(node.id, { status: key })} style={{
                  padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: d.locked ? "not-allowed" : "pointer",
                  border: d.status === key ? `2px solid ${color}` : "1px solid #e2e8f0",
                  background: d.status === key ? `${color}18` : "#f8fafc",
                  color: d.status === key ? color : "#94a3b8",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {d.status === key && <Check size={9} />}{l2}
                </button>
              ))}
            </div>
          </>)}

          <button onClick={() => onUpdate(node.id, { locked: !d.locked })} style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: `1px solid ${d.locked ? "#FCA5A5" : "#e2e8f0"}`,
            background: d.locked ? "#FFF1F2" : "#f8fafc",
            color: d.locked ? "#EF4444" : "#475569", cursor: "pointer", marginBottom: 10, boxSizing: "border-box",
          }}>
            {d.locked ? <Unlock size={13} /> : <Lock size={13} />}
            {d.locked ? "Mở khoá bước này" : "Khoá bước này"}
          </button>

          {/* Cross-workflow links */}
          <label style={{ ...lbl, marginTop: 4 }}>Liên kết quy trình khác</label>
          {nodeExtEdges.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {nodeExtEdges.map((e) => {
                const [, wfId, nId] = e.target.split("::");
                const lw = allWorkflows.find((w) => w.id === wfId);
                const ls = lw?.nodes?.find((n) => n.id === nId) ?? lw?.steps?.find((s) => s.id === nId);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "#f1f5f9", borderRadius: 6, fontSize: 11 }}>
                    <Link2 size={10} style={{ color: "#3B82F6", flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#0f172a" }}>
                      {lw?.name ?? wfId} → {ls?.name ?? nId}
                    </span>
                    <button onClick={() => onRemoveExtEdge(e.id)} style={{ cursor: "pointer", color: "#94A3B8", padding: 2, background: "transparent", border: "none", lineHeight: 0 }}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {showExtForm ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 10, background: "#f8fafc" }}>
              <select value={extWfId} onChange={(e) => { setExtWfId(e.target.value); setExtNodeId(""); }} style={{ ...inp, marginBottom: 6 }}>
                <option value="">-- Chọn quy trình --</option>
                {allWorkflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {targetWf && (
                <select value={extNodeId} onChange={(e) => setExtNodeId(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
                  <option value="">-- Chọn bước --</option>
                  {(targetWf.nodes?.length ? targetWf.nodes : targetWf.steps).map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setShowExt(false); setExtWfId(""); setExtNodeId(""); }}
                  style={{ flex: 1, padding: 6, borderRadius: 6, fontSize: 11, border: "1px solid #e2e8f0", cursor: "pointer", background: "#f8fafc", color: "#64748b" }}>Huỷ</button>
                <button onClick={addExtLink} disabled={!extWfId || !extNodeId}
                  style={{ flex: 1, padding: 6, borderRadius: 6, fontSize: 11, border: "none", cursor: "pointer", background: "#3B82F6", color: "#fff", opacity: (!extWfId || !extNodeId) ? 0.45 : 1 }}>Thêm</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowExt(true)} style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              padding: "7px 10px", borderRadius: 8, fontSize: 12,
              border: "1px dashed #e2e8f0", background: "#f8fafc",
              color: "#3B82F6", cursor: "pointer", marginBottom: 12, boxSizing: "border-box",
            }}>
              <Link2 size={13} /> Thêm liên kết quy trình khác
            </button>
          )}
          <button onClick={() => onDelete(node.id)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            width: "100%", padding: 8, borderRadius: 8, fontSize: 12,
            border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#EF4444",
            cursor: "pointer", boxSizing: "border-box",
          }}>
            <Trash2 size={13} /> Xóa bước này
          </button>
        </>)}

        {/* ── Tab: Đầu vào ── */}
        {tab === "dau_vao" && (<>
          {/* Người phụ trách */}
          <label style={lbl}>Người phụ trách</label>
          {users.length > 0 ? (
            <select value={d.assigneeId ?? ""} onChange={(e) => setAssignee(e.target.value)}
              style={{ ...inp, marginBottom: 12 }} disabled={d.locked}>
              <option value="">-- Chưa phân công --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ""}</option>)}
            </select>
          ) : (
            <input value={d.assigneeName ?? ""} onChange={(e) => onUpdate(node.id, { assigneeName: e.target.value })}
              style={{ ...inp, marginBottom: 12 }} placeholder="Tên người phụ trách..." disabled={d.locked} />
          )}
          {d.assigneeName && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "7px 10px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3B82F620", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={13} style={{ color: "#3B82F6" }} />
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: 0 }}>{d.assigneeName}</p>
                <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>Phụ trách bước này</p>
              </div>
            </div>
          )}

          {/* Auto input status */}
          <label style={lbl}>Trạng thái đầu vào</label>
          {autoBanner(inputStatus.text, inputStatus.color, inputStatus.bg)}

          {/* Predecessor cards */}
          {predecessors.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Thông tin từ bước trước
              </div>
              {predecessors.map((prev) => {
                const pd = prev.data as WFNodeData;
                const prevOut = autoOutputSummary(pd.progress ?? 0, pd.proofs ?? []);
                return (
                  <div key={prev.id} style={{ padding: "9px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 6, fontSize: 11 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_CFG[pd.status]?.color ?? "#94a3b8", flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{pd.label}</span>
                      {pd.assigneeName && <span style={{ fontSize: 10, color: "#64748b" }}>· {pd.assigneeName}</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: prevOut.bg, color: prevOut.color, fontWeight: 600 }}>
                        {prevOut.text}
                      </span>
                      {pd.deadline && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "#f1f5f9", color: "#64748b" }}>Hạn: {pd.deadline}</span>}
                      {pd.kpiTarget && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "#F5F3FF", color: "#8B5CF6" }}>KPI: {pd.kpiTarget} {pd.kpiUnit}</span>}
                      {(pd.proofs?.length ?? 0) > 0 && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "#f0f9ff", color: "#0284c7" }}>
                          {pd.proofs?.length} minh chứng
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "9px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, marginBottom: 14, fontSize: 11, color: "#92400e" }}>
              Đây là bước đầu tiên — thông tin đầu vào lấy từ nhiệm vụ chính (mã, hạn hoàn thành, KPI...).
            </div>
          )}

          <label style={lbl}>Hạn hoàn thành</label>
          <input type="date" value={d.deadline ?? ""} onChange={(e) => onUpdate(node.id, { deadline: e.target.value })}
            style={{ ...inp, marginBottom: 12 }} disabled={d.locked} />

          <label style={lbl}>KPI cần đạt</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input type="number" min={0} value={d.kpiTarget ?? ""} onChange={(e) => onUpdate(node.id, { kpiTarget: Number(e.target.value) || undefined })}
              style={{ ...inp, flex: "0 0 80px" }} placeholder="Số" disabled={d.locked} />
            <input value={d.kpiUnit ?? ""} onChange={(e) => onUpdate(node.id, { kpiUnit: e.target.value })}
              style={{ ...inp, flex: 1 }} placeholder="đơn vị (điểm, sản phẩm...)" disabled={d.locked} />
          </div>
        </>)}

        {/* ── Tab: Đầu ra ── */}
        {tab === "dau_ra" && (<>
          {/* Auto output summary */}
          <label style={lbl}>Đầu ra (tự động)</label>
          <div style={{ padding: "8px 10px", borderRadius: 8, background: outSummary.bg, border: `1px solid ${outSummary.color}30`, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowUpFromLine size={12} style={{ color: outSummary.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: outSummary.color }}>{outSummary.text}</span>
          </div>

          <label style={lbl}>Nội dung thực thi</label>
          <textarea value={d.description} onChange={(e) => onUpdate(node.id, { description: e.target.value })}
            placeholder="Mô tả công việc cần thực hiện..." rows={3}
            style={{ ...inp, resize: "vertical", marginBottom: 12 }} disabled={d.locked} />

          <label style={lbl}>Tiến độ (%)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <input type="range" min={0} max={100} step={5} value={d.progress ?? 0}
              onChange={(e) => onUpdate(node.id, { progress: Number(e.target.value) })}
              style={{ flex: 1 }} disabled={d.locked} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", minWidth: 36, textAlign: "right" }}>{d.progress ?? 0}%</span>
          </div>

          <label style={lbl}>Mô tả kết quả bàn giao</label>
          <textarea value={d.output ?? ""} onChange={(e) => onUpdate(node.id, { output: e.target.value })}
            placeholder="Mô tả kết quả đầu ra, sản phẩm bàn giao..." rows={3}
            style={{ ...inp, resize: "vertical", marginBottom: 12 }} disabled={d.locked} />

          {/* Proof documents */}
          <label style={lbl}>Tài liệu minh chứng</label>
          {!d.locked && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button onClick={() => fileRef.current?.click()} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "7px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: "1px dashed #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer",
              }}>
                <Paperclip size={12} /> Tệp đính kèm
              </button>
              <button onClick={() => camRef.current?.click()} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "7px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: "1px dashed #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer",
              }}>
                <Camera size={12} /> Máy ảnh
              </button>
              <input ref={fileRef} type="file" multiple accept="*/*" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
            </div>
          )}
          {(d.proofs ?? []).length === 0 ? (
            <p style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", marginBottom: 6 }}>Chưa có minh chứng</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(d.proofs ?? []).map((prf) => {
                const isImg = prf.mimeType.startsWith("image/");
                return (
                  <div key={prf.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                    {isImg
                      ? <img src={prf.dataUrl} alt={prf.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, background: "#eff6ff", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Paperclip size={14} style={{ color: "#3B82F6" }} />
                        </div>
                    }
                    <span style={{ flex: 1, fontSize: 11, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prf.name}</span>
                    {!d.locked && (
                      <button onClick={() => onUpdate(node.id, { proofs: (d.proofs ?? []).filter((p) => p.id !== prf.id) })}
                        style={{ padding: 3, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", lineHeight: 0 }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {/* ── Tab: Đánh giá 3T ── */}
        {tab === "danh_gia" && (<>
          {/* Auto suggestion */}
          {suggested3T && (() => {
            const ev = EVAL_3T.find((e) => e.key === suggested3T)!;
            const reasons: string[] = [];
            if (d.progress !== undefined) reasons.push(`tiến độ ${d.progress}%`);
            if (d.deadline) reasons.push(`còn ${days ?? "?"} ngày`);
            if ((d.proofs?.length ?? 0) > 0) reasons.push(`${d.proofs?.length} minh chứng`);
            return autoBanner(
              `Gợi ý: ${ev.label} (${reasons.join(" · ")})`,
              ev.color, `${ev.color}12`,
              d.locked ? undefined : () => onUpdate(node.id, { eval3T: suggested3T }),
            );
          })()}

          <label style={lbl}>Mức đánh giá</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {EVAL_3T.map((ev) => (
              <button key={ev.key} onClick={() => !d.locked && onUpdate(node.id, { eval3T: d.eval3T === ev.key ? undefined : ev.key })} style={{
                padding: "10px 6px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: d.locked ? "not-allowed" : "pointer",
                border: d.eval3T === ev.key ? `2px solid ${ev.color}` : "1px solid #e2e8f0",
                background: d.eval3T === ev.key ? `${ev.color}18` : "#f8fafc",
                color: d.eval3T === ev.key ? ev.color : "#94a3b8",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
                {d.eval3T === ev.key && <Check size={10} />}
                {ev.label}
              </button>
            ))}
          </div>

          {/* Progress × Proof breakdown */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 11 }}>
            <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 8px", fontSize: 11 }}>Căn cứ đánh giá</p>
            {[
              { label: "Tiến độ",      val: `${d.progress ?? 0}%`,                         color: STATUS_CFG[d.status]?.color ?? "#94a3b8" },
              { label: "Minh chứng",   val: `${d.proofs?.length ?? 0} tệp`,                color: (d.proofs?.length ?? 0) > 0 ? "#22C55E" : "#94a3b8" },
              { label: "Thời gian",    val: days !== null ? `còn ${days} ngày` : "Chưa đặt", color: days !== null && days < 0 ? "#EF4444" : days !== null && days <= 3 ? "#F59E0B" : "#22C55E" },
              { label: "Người phụ trách", val: d.assigneeName || "Chưa phân công",         color: d.assigneeName ? "#3B82F6" : "#94a3b8" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ color: "#64748b" }}>{label}</span>
                <span style={{ fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>

          <label style={lbl}>Ghi chú đánh giá</label>
          <textarea value={d.evalNote ?? ""} onChange={(e) => onUpdate(node.id, { evalNote: e.target.value })}
            placeholder="Nhận xét, lý do đánh giá..." rows={4}
            style={{ ...inp, resize: "vertical" }} disabled={d.locked} />
        </>)}
      </div>
    </div>
  );
}

// ── Edge hint ─────────────────────────────────────────────────
const SIDE_ICONS: Record<string, string> = { left: "←", right: "→", top: "↑", bottom: "↓" };
const SIDES = ["left", "right", "top", "bottom"] as const;

function EdgeHint({ edge, onToggleRequired, onChangeStyle, onFlipEdge, onDeleteEdge, onClose }: {
  edge: Edge;
  onToggleRequired: () => void;
  onChangeStyle: (a?: ArrowType, l?: LineType, dir?: ArrowDirection, src?: string | null, tgt?: string | null) => void;
  onFlipEdge: () => void;
  onDeleteEdge: () => void;
  onClose: () => void;
}) {
  const required       = !!(edge.data?.required);
  const arrowType      = (edge.data?.arrowType      ?? "closed")     as ArrowType;
  const lineType       = (edge.data?.lineType        ?? "smoothstep") as LineType;
  const arrowDirection = (edge.data?.arrowDirection  ?? "forward")    as ArrowDirection;
  const srcHandle      = (edge.data?.sourceHandle    ?? null)         as string | null;
  const tgtHandle      = (edge.data?.targetHandle    ?? null)         as string | null;

  const currentSrcSide = srcHandle ? HANDLE_SIDE_MAP[srcHandle] : null;
  const currentTgtSide = tgtHandle ? HANDLE_SIDE_MAP[tgtHandle] : null;

  const ARROWS: { key: ArrowType; label: string }[] = [
    { key: "closed", label: "▶ Mũi tên" }, { key: "open", label: "→ Mở" }, { key: "none", label: "— Không" },
  ];
  const LINES: { key: LineType; label: string }[] = [
    { key: "smoothstep", label: "⌒ Cong" }, { key: "straight", label: "— Thẳng" }, { key: "step", label: "⌐ Bậc" },
  ];
  const DIRECTIONS: { key: ArrowDirection; label: string }[] = [
    { key: "forward",  label: "→ Xuôi"    },
    { key: "backward", label: "← Ngược"   },
    { key: "both",     label: "↔ Hai chiều" },
  ];

  const btnBase: React.CSSProperties = {
    width: "100%", marginBottom: 4, padding: "5px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600,
    textAlign: "left", cursor: "pointer",
  };
  const sideBtnBase: React.CSSProperties = {
    flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 12, fontWeight: 700,
    cursor: "pointer", textAlign: "center" as const,
  };

  return (
    <div style={{
      position: "absolute", left: "50%", bottom: 72, transform: "translateX(-50%)",
      zIndex: 30, background: "#ffffff", border: "1px solid #e2e8f0",
      borderRadius: 14, padding: "12px 14px", boxShadow: "0 4px 24px rgba(0,0,0,.13)",
      minWidth: 420,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Tuỳ chỉnh đường kết nối</span>
        <button onClick={onClose} style={{ padding: 4, borderRadius: 6, border: "none", background: "#f1f5f9", color: "#64748b", cursor: "pointer", lineHeight: 0 }}><X size={13} /></button>
      </div>

      {/* Row 1: Arrow direction + Flip */}
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>Hướng mũi tên</p>
        <div style={{ display: "flex", gap: 5 }}>
          {DIRECTIONS.map((d) => (
            <button key={d.key} onClick={() => onChangeStyle(undefined, undefined, d.key)} style={{
              flex: 1, padding: "5px 6px", borderRadius: 7, fontSize: 10.5, fontWeight: 700,
              border: arrowDirection === d.key ? "1.5px solid #F59E0B" : "1px solid #e2e8f0",
              background: arrowDirection === d.key ? "#FFFBEB" : "#f8fafc",
              color: arrowDirection === d.key ? "#D97706" : "#64748b", cursor: "pointer",
            }}>{d.label}</button>
          ))}
          <button onClick={onFlipEdge} title="Đảo nguồn ↔ đích" style={{
            padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700,
            border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b",
            cursor: "pointer", whiteSpace: "nowrap",
          }}>⇄ Đảo chiều</button>
        </div>
      </div>

      {/* Row 2: Arrow style + Line type */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>Đầu mũi tên</p>
          {ARROWS.map((a) => (
            <button key={a.key} onClick={() => onChangeStyle(a.key)} style={{
              ...btnBase,
              border: arrowType === a.key ? "1.5px solid #3B82F6" : "1px solid #e2e8f0",
              background: arrowType === a.key ? "#EFF6FF" : "#f8fafc",
              color: arrowType === a.key ? "#3B82F6" : "#64748b",
            }}>{a.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>Dạng đường</p>
          {LINES.map((l) => (
            <button key={l.key} onClick={() => onChangeStyle(undefined, l.key)} style={{
              ...btnBase,
              border: lineType === l.key ? "1.5px solid #8B5CF6" : "1px solid #e2e8f0",
              background: lineType === l.key ? "#F5F3FF" : "#f8fafc",
              color: lineType === l.key ? "#8B5CF6" : "#64748b",
            }}>{l.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>Điều kiện</p>
          <button onClick={onToggleRequired} style={{
            ...btnBase,
            border: `1.5px solid ${required ? "#3B82F6" : "#e2e8f0"}`,
            background: required ? "#EFF6FF" : "#f8fafc",
            color: required ? "#3B82F6" : "#64748b",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {required ? <Lock size={11} /> : <Unlock size={11} />}
            {required ? "Bắt buộc" : "Tuỳ chọn"}
          </button>
          <button onClick={onDeleteEdge} style={{
            ...btnBase, marginBottom: 0,
            border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#EF4444",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <Trash2 size={11} /> Xoá
          </button>
        </div>
      </div>

      {/* Row 3: Connection point (source side + target side) */}
      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Vị trí kết nối với node</p>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 9.5, fontWeight: 600, color: "#3B82F6", marginBottom: 4 }}>Đầu nguồn</p>
            <div style={{ display: "flex", gap: 3 }}>
              {SIDES.map((side) => (
                <button key={side} onClick={() => onChangeStyle(undefined, undefined, undefined, SOURCE_HANDLE_BY_SIDE[side], undefined)} style={{
                  ...sideBtnBase,
                  border: currentSrcSide === side ? "1.5px solid #3B82F6" : "1px solid #e2e8f0",
                  background: currentSrcSide === side ? "#EFF6FF" : "#f8fafc",
                  color: currentSrcSide === side ? "#3B82F6" : "#94a3b8",
                }} title={side}>{SIDE_ICONS[side]}</button>
              ))}
              {srcHandle && (
                <button onClick={() => onChangeStyle(undefined, undefined, undefined, null, undefined)} style={{
                  ...sideBtnBase, flex: "unset", padding: "4px 6px",
                  border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", fontSize: 9,
                }} title="Tự động">Auto</button>
              )}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 9.5, fontWeight: 600, color: "#8B5CF6", marginBottom: 4 }}>Đầu đích</p>
            <div style={{ display: "flex", gap: 3 }}>
              {SIDES.map((side) => (
                <button key={side} onClick={() => onChangeStyle(undefined, undefined, undefined, undefined, TARGET_HANDLE_BY_SIDE[side])} style={{
                  ...sideBtnBase,
                  border: currentTgtSide === side ? "1.5px solid #8B5CF6" : "1px solid #e2e8f0",
                  background: currentTgtSide === side ? "#F5F3FF" : "#f8fafc",
                  color: currentTgtSide === side ? "#8B5CF6" : "#94a3b8",
                }} title={side}>{SIDE_ICONS[side]}</button>
              ))}
              {tgtHandle && (
                <button onClick={() => onChangeStyle(undefined, undefined, undefined, undefined, null)} style={{
                  ...sideBtnBase, flex: "unset", padding: "4px 6px",
                  border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", fontSize: 9,
                }} title="Tự động">Auto</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────
export interface WorkflowBuilderProps {
  workflow: Workflow;
  allWorkflows: Workflow[];
  canEdit: boolean;
  canApprove?: boolean;
  users?: UserBasic[];
  onSave: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => Promise<void>;
  /** Draft mode: when set, "Xác nhận" calls this instead of onSave (no DB write). */
  onConfirm?: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  /** Called when user wants to cancel out of draft mode. */
  onCancelDraft?: () => void;
}

// ── Main component ────────────────────────────────────────────
export default function WorkflowBuilder({ workflow, allWorkflows, canEdit, canApprove, users = [], onSave, onConfirm, onCancelDraft }: WorkflowBuilderProps) {
  const [viewMode, setViewMode] = useState<"zones" | "classic">("zones");
  const [vp, setVp]             = useState<Viewport>({ x: 40, y: 40, zoom: 1 });

  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(workflow, false));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(workflow));
  const [extEdges, setExtEdges]          = useState<WorkflowEdge[]>(
    (workflow.edges ?? []).filter((e) => e.target.startsWith("ext::"))
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [dirty,  setDirty]        = useState(false);
  const [showAddMenu, setShowAdd] = useState(false);

  // ── Sub-workflow state ─────────────────────────────────────────
  /** null = top-level; nodeId = đang sửa quy trình con của node đó */
  const [parentNodeId,   setParentNodeId]   = useState<string | null>(null);
  const [parentNodeName, setParentNodeName] = useState<string>("");
  /** Lưu trạng thái top-level khi drill vào sub-workflow */
  const savedTopLevelRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  /** Map: nodeId → {nodes, edges} của quy trình con đã lưu */
  const [childDataMap, setChildDataMap] = useState<Map<string, { nodes: Node[]; edges: Edge[] }>>(new Map());
  /** nodeId đang được highlight vì một node khác đang kéo vào */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function enterSubWorkflow(nodeId: string) {
    const nodeName = nodes.find((n) => n.id === nodeId)?.data.label ?? "";
    savedTopLevelRef.current = { nodes: [...nodes], edges: [...edges] };
    const child = childDataMap.get(nodeId) ?? { nodes: [], edges: [] };
    setParentNodeId(nodeId);
    setParentNodeName(nodeName);
    setNodes(child.nodes);
    setEdges(child.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  function exitSubWorkflow() {
    if (!parentNodeId || !savedTopLevelRef.current) return;
    // Lưu trạng thái con hiện tại
    const childCount = nodes.length;
    setChildDataMap((prev) => new Map(prev).set(parentNodeId, { nodes: [...nodes], edges: [...edges] }));
    // Khôi phục top-level + cập nhật badge
    const restoredNodes = savedTopLevelRef.current.nodes.map((n) =>
      n.id === parentNodeId
        ? { ...n, data: { ...n.data, childCount } satisfies WFNodeData }
        : n
    );
    setNodes(restoredNodes);
    setEdges(savedTopLevelRef.current.edges);
    setParentNodeId(null);
    setParentNodeName("");
    savedTopLevelRef.current = null;
    setSelectedNodeId(null);
    setDirty(true);
  }

  const selectedNode   = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge   = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const otherWorkflows = allWorkflows.filter((w) => w.id !== workflow.id && w.status === "published");
  const predecessors   = selectedNode
    ? edges.filter((e) => e.target === selectedNode.id).map((e) => nodes.find((n) => n.id === e.source)).filter(Boolean) as Node[]
    : [];

  useEffect(() => {
    let ns = toRFNodes(workflow, false);
    if (!workflow.nodes?.length) ns = snapNodesToZones(ns);
    setNodes(ns);
    setEdges(toRFEdges(workflow));
    setExtEdges((workflow.edges ?? []).filter((e) => e.target.startsWith("ext::")));
    setSelectedNodeId(null); setSelectedEdgeId(null); setDirty(false);
  }, [workflow.id]);

  useEffect(() => {
    const showStatus = viewMode === "classic";
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, showStatus } })));
    setSelectedEdgeId(null);
  }, [viewMode]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(
      buildEdge(
        `e-${connection.source}-${connection.target}-${Date.now()}`,
        connection.source!, connection.target!, false,
        undefined, "closed", "smoothstep", "forward",
        connection.sourceHandle, connection.targetHandle,
      ),
      eds
    ));
    setDirty(true);
  }, [setEdges]);

  function handleNodeClick(_: React.MouseEvent, node: Node) { setSelectedNodeId(node.id); setSelectedEdgeId(null); }
  function handleNodeDragStop(_: React.MouseEvent, node: Node) {
    if (viewMode === "zones") {
      const newStatus = zoneByX(node.position.x);
      if (node.data.status !== newStatus)
        setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, data: { ...n.data, status: newStatus } } : n));
    }

    // Drag-to-parent: phát hiện node bị thả lên node khác → thêm vào quy trình con
    if (canEdit && !parentNodeId) {
      const NODE_W = 220, NODE_H = 120;
      const cx = node.position.x + NODE_W / 2;
      const cy = node.position.y + NODE_H / 2;
      setDropTargetId(null);
      for (const other of nodes) {
        if (other.id === node.id) continue;
        const ox = other.position.x, oy = other.position.y;
        const inside = cx > ox + 10 && cx < ox + NODE_W - 10 && cy > oy + 10 && cy < oy + NODE_H - 10;
        if (inside) {
          const confirmed = window.confirm(
            `Thêm "${node.data.label}" vào quy trình con của "${other.data.label}"?`
          );
          if (confirmed) {
            const existing = childDataMap.get(other.id) ?? { nodes: [], edges: [] };
            const childX = (existing.nodes.length % 3) * 260 + 40;
            const childY = Math.floor(existing.nodes.length / 3) * 160 + 80;
            const childNode = { ...node, position: { x: childX, y: childY } };
            const newChildData = { nodes: [...existing.nodes, childNode], edges: existing.edges };
            const newChildCount = newChildData.nodes.length;
            setChildDataMap((prev) => new Map(prev).set(other.id, newChildData));
            setNodes((ns) => ns
              .filter((n) => n.id !== node.id)
              .map((n) => n.id === other.id
                ? { ...n, data: { ...n.data, childCount: newChildCount } satisfies WFNodeData }
                : n
              )
            );
            setEdges((es) => es.filter((e) => e.source !== node.id && e.target !== node.id));
            setSelectedNodeId(null);
            setDirty(true);
          }
          return;
        }
      }
    }

    setDirty(true);
  }

  function handleNodeDrag(_: React.MouseEvent, node: Node) {
    if (!canEdit || parentNodeId) return;
    const NODE_W = 220, NODE_H = 120;
    const cx = node.position.x + NODE_W / 2;
    const cy = node.position.y + NODE_H / 2;
    let target: string | null = null;
    for (const other of nodes) {
      if (other.id === node.id) continue;
      const ox = other.position.x, oy = other.position.y;
      if (cx > ox + 10 && cx < ox + NODE_W - 10 && cy > oy + 10 && cy < oy + NODE_H - 10) {
        target = other.id; break;
      }
    }
    setDropTargetId(target);
  }
  function handlePaneClick() { setSelectedNodeId(null); setSelectedEdgeId(null); }
  function handleEdgeClick(_: React.MouseEvent, edge: Edge) { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }

  function toggleEdgeRequired() {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.map((e) => {
      if (e.id !== selectedEdgeId) return e;
      const d = e.data as { required: boolean; arrowType: ArrowType; lineType: LineType; arrowDirection?: ArrowDirection; sourceHandle?: string; targetHandle?: string };
      return buildEdge(e.id, e.source, e.target, !d.required, undefined, d.arrowType, d.lineType, d.arrowDirection ?? "forward", d.sourceHandle, d.targetHandle);
    }));
    setDirty(true);
  }
  function changeEdgeStyle(arrowType?: ArrowType, lineType?: LineType, arrowDirection?: ArrowDirection, srcHandle?: string | null, tgtHandle?: string | null) {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.map((e) => {
      if (e.id !== selectedEdgeId) return e;
      const d = e.data as { required: boolean; arrowType: ArrowType; lineType: LineType; arrowDirection?: ArrowDirection; sourceHandle?: string | null; targetHandle?: string | null };
      return buildEdge(
        e.id, e.source, e.target, d.required, undefined,
        arrowType ?? d.arrowType, lineType ?? d.lineType,
        arrowDirection ?? d.arrowDirection ?? "forward",
        srcHandle !== undefined ? srcHandle : d.sourceHandle,
        tgtHandle !== undefined ? tgtHandle : d.targetHandle,
      );
    }));
    setDirty(true);
  }
  function flipEdge() {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.map((e) => {
      if (e.id !== selectedEdgeId) return e;
      const d = e.data as { required: boolean; arrowType: ArrowType; lineType: LineType; arrowDirection?: ArrowDirection; sourceHandle?: string | null; targetHandle?: string | null };
      return buildEdge(
        e.id, e.target, e.source, d.required, undefined,
        d.arrowType, d.lineType,
        d.arrowDirection ?? "forward",
        d.targetHandle ? FLIP_HANDLE[d.targetHandle] : null,
        d.sourceHandle ? FLIP_HANDLE[d.sourceHandle] : null,
      );
    }));
    setDirty(true);
  }
  function deleteEdge(id: string) { setEdges((eds) => eds.filter((e) => e.id !== id)); setSelectedEdgeId(null); setDirty(true); }

  function updateNodeData(id: string, patch: Partial<WFNodeData>) {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== id) return n;
      const newData = { ...n.data, ...patch } as WFNodeData;
      return { ...n, data: newData, draggable: !newData.locked };
    }));
    setDirty(true);
  }
  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setExtEdges((es) => es.filter((e) => e.source !== id));
    setSelectedNodeId(null); setDirty(true);
  }
  function toggleLock(id: string) {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== id) return n;
      const locked = !n.data.locked;
      return { ...n, data: { ...n.data, locked }, draggable: !locked };
    }));
    setDirty(true);
  }
  function addNode(zoneIdx = 0) {
    const id = generateId("wn");
    const status = ZONES[zoneIdx]?.status ?? "todo";
    const count  = nodes.filter((n) => n.data.status === status).length;
    const x = viewMode === "zones"
      ? zoneIdx * ZONE_W + 40 + (count % 2) * 260
      : (nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.x)) : -280) + 280;
    const y = viewMode === "zones" ? 80 + Math.floor(count / 2) * 160 : 80 + (nodes.length % 3) * 140;
    setNodes((ns) => [...ns, {
      id, type: "wfNode", position: { x, y },
      data: {
        label: `Bước ${nodes.length + 1}`, department: "", status, description: "",
        showStatus: viewMode === "classic", locked: false,
        assigneeId: "", assigneeName: "",
        deadline: "", kpiTarget: undefined, kpiUnit: "",
        output: "", progress: 0, eval3T: undefined, evalNote: "", proofs: [],
      } satisfies WFNodeData,
    }]);
    setSelectedNodeId(id); setDirty(true);
  }
  function addExtEdge(edge: WorkflowEdge)  { setExtEdges((es) => [...es, edge]); setDirty(true); }
  function removeExtEdge(id: string)        { setExtEdges((es) => es.filter((e) => e.id !== id)); setDirty(true); }

  async function handleSave() {
    const { nodes: wn, edges: we } = fromRF(nodes, edges, extEdges);
    // Embed child data into nodes
    const wfNodes: WorkflowNode[] = wn.map((n) => {
      const childInfo = childDataMap.get(n.id);
      if (!childInfo?.nodes.length) return n;
      const { nodes: childWfNodes, edges: childWfEdges } = fromRF(childInfo.nodes, childInfo.edges, []);
      return { ...n, childNodes: childWfNodes, childEdges: childWfEdges } as WorkflowNode;
    });
    if (onConfirm) {
      onConfirm(wfNodes, we);
      return;
    }
    setSaving(true);
    try { await onSave(wfNodes, we); setDirty(false); }
    finally { setSaving(false); }
  }

  return (
    <BuilderContext.Provider value={{ toggleLock, deleteNode, canEdit }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <ZoneHeader vp={vp} viewMode={viewMode} />
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {viewMode === "zones" && <ZoneBandLayer vp={vp} />}
          <div style={{ position: "absolute", inset: 0 }}>
            <ReactFlow
              nodes={nodes.map((n) => dropTargetId === n.id ? { ...n, style: { ...(n.style ?? {}), outline: "3px solid #8B5CF6", borderRadius: 12 } } : n)}
              edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={canEdit ? onConnect : undefined}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={canEdit ? (_, node) => { if ((node.data as WFNodeData).childCount) enterSubWorkflow(node.id); } : undefined}
              onEdgeClick={canEdit ? handleEdgeClick : undefined}
              onPaneClick={handlePaneClick}
              onNodeDrag={canEdit && !parentNodeId ? handleNodeDrag : undefined}
              onNodeDragStop={canEdit ? handleNodeDragStop : undefined}
              nodeTypes={NODE_TYPES}
              nodesDraggable={canEdit} nodesConnectable={canEdit} elementsSelectable
              fitView fitViewOptions={{ padding: 0.25 }}
              proOptions={{ hideAttribution: true }}
              style={{ background: "transparent" }}
              onMove={(_, v) => setVp(v)}
              onInit={(rf) => setTimeout(() => setVp(rf.getViewport()), 80)}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#e2e8f0" />
              <Controls />

              {/* Breadcrumb — hiện khi đang sửa sub-workflow */}
              {parentNodeId && (
                <Panel position="top-center">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 12px", boxShadow: "0 2px 10px rgba(0,0,0,.1)", fontSize: 12 }}>
                    <button onClick={exitSubWorkflow} style={{ color: "#3B82F6", fontWeight: 700, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>← Quy trình chính</button>
                    <span style={{ color: "#94a3b8" }}>›</span>
                    <span style={{ fontWeight: 700, color: "#8B5CF6", display: "flex", alignItems: "center", gap: 4 }}>
                      <GitBranch size={12} />⊞ {parentNodeName}
                    </span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>({nodes.length} bước)</span>
                  </div>
                </Panel>
              )}

              {canEdit && (
                <Panel position="top-left">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ display: "flex", borderRadius: 8, border: "1px solid #e2e8f0", background: "#ffffff", overflow: "hidden" }}>
                      {(["zones", "classic"] as const).map((mode) => (
                        <button key={mode} onClick={() => setViewMode(mode)} style={{
                          display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", fontSize: 11, fontWeight: 600,
                          border: "none", cursor: "pointer",
                          background: viewMode === mode ? "#3B82F6" : "transparent",
                          color: viewMode === mode ? "#fff" : "#94a3b8",
                        }}>
                          {mode === "zones" ? <LayoutGrid size={13} /> : <GitBranch size={13} />}
                          {mode === "zones" ? "Theo vùng" : "Tự do"}
                        </button>
                      ))}
                    </div>
                    <div style={{ position: "relative" }}>
                      {viewMode === "zones" ? (<>
                        <button onClick={() => setShowAdd((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "#3B82F6", color: "#fff", cursor: "pointer", boxShadow: "0 2px 8px rgba(59,130,246,.3)" }}>
                          <Plus size={14} /> Thêm bước ▾
                        </button>
                        {showAddMenu && (
                          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,.12)", minWidth: 180, zIndex: 50, overflow: "hidden" }}>
                            {ZONES.map((zone) => (
                              <button key={zone.status} onClick={() => { addNode(zone.idx); setShowAdd(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", background: "transparent", color: "#0f172a", cursor: "pointer", textAlign: "left" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = `${zone.color}10`)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: zone.color, flexShrink: 0 }} />{zone.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </>) : (
                        <button onClick={() => addNode()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "#3B82F6", color: "#fff", cursor: "pointer", boxShadow: "0 2px 8px rgba(59,130,246,.3)" }}>
                          <Plus size={14} /> Thêm bước
                        </button>
                      )}
                    </div>
                    {onConfirm ? (<>
                      {onCancelDraft && (
                        <button onClick={onCancelDraft} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>
                          <X size={14} /> Hủy
                        </button>
                      )}
                      <button onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "#6366F1", color: "#fff", cursor: "pointer", boxShadow: "0 2px 8px rgba(99,102,241,.3)" }}>
                        <Check size={14} /> Xác nhận điều chỉnh
                      </button>
                    </>) : dirty && (
                      <button onClick={handleSave} disabled={saving} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: "none", background: saving ? "#86EFAC" : (canApprove ? "#22C55E" : "#F59E0B"),
                        color: "#fff", cursor: saving ? "wait" : "pointer",
                        boxShadow: `0 2px 8px ${canApprove ? "rgba(34,197,94,.3)" : "rgba(245,158,11,.3)"}`,
                      }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : canApprove ? <Save size={14} /> : <Send size={14} />}
                        {saving ? "Đang lưu..." : canApprove ? "Lưu & Xuất bản" : "Lưu & Gửi duyệt"}
                      </button>
                    )}
                  </div>
                </Panel>
              )}

              {viewMode === "classic" && (
                <Panel position="bottom-left">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 10px", padding: "7px 11px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                    {(Object.entries(STATUS_CFG) as [NodeStatus, { label: string; color: string }][]).map(([, { label, color }]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 500 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {canEdit && (
                <Panel position="bottom-right">
                  <div style={{ padding: "7px 11px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,.06)", fontSize: 10, color: "#64748b" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <svg width={28} height={6}><line x1="0" y1="3" x2="28" y2="3" stroke="#3B82F6" strokeWidth="2.5" /></svg>
                      <span style={{ fontWeight: 600 }}>Phải hoàn thành trước</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      <svg width={28} height={6}><line x1="0" y1="3" x2="28" y2="3" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
                      <span>Không bắt buộc · click để tuỳ chỉnh</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, borderTop: "1px solid #f1f5f9", paddingTop: 4 }}>
                      {EVAL_3T.map((ev) => (
                        <div key={ev.key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: ev.color }} />
                          <span>{ev.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              )}

              {nodes.length === 0 && canEdit && (
                <Panel position="top-center">
                  <div style={{ marginTop: 80, padding: "12px 20px", background: "#ffffff", border: "1.5px dashed #e2e8f0", borderRadius: 12, fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
                    {viewMode === "zones" ? <>Nhấn <strong>Thêm bước ▾</strong> và chọn vùng để bắt đầu.</> : <>Nhấn <strong>Thêm bước</strong> để bắt đầu xây dựng sơ đồ.</>}
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {selectedNode && (
            <NodeEditor
              node={selectedNode} allWorkflows={otherWorkflows} extEdges={extEdges}
              viewMode={viewMode} users={users}
              onUpdate={updateNodeData} onDelete={deleteNode}
              onClose={() => setSelectedNodeId(null)}
              onAddExtEdge={addExtEdge} onRemoveExtEdge={removeExtEdge}
              predecessors={predecessors}
              onEditSubWorkflow={canEdit ? enterSubWorkflow : undefined}
            />
          )}

          {selectedEdge && canEdit && (
            <EdgeHint
              edge={selectedEdge}
              onToggleRequired={toggleEdgeRequired}
              onChangeStyle={changeEdgeStyle}
              onFlipEdge={flipEdge}
              onDeleteEdge={() => deleteEdge(selectedEdgeId!)}
              onClose={() => setSelectedEdgeId(null)}
            />
          )}
        </div>
      </div>
    </BuilderContext.Provider>
  );
}
