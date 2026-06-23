"use client";

import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type Viewport,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Plus, Save, Trash2, X, Link2, Check, Loader2, Send,
  Lock, Unlock, LayoutGrid, GitBranch,
} from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/types";
import { generateId } from "@/lib/utils";

// ── Zone constants ────────────────────────────────────────────
const ZONE_W = 500; // flow units per zone

const ZONES = [
  {
    idx: 0, status: "todo" as const,
    label: "Chuẩn bị", sublabel: "Chuẩn bị & khởi động",
    color: "#3B82F6", bg: "rgba(59,130,246,0.05)",
  },
  {
    idx: 1, status: "in_progress" as const,
    label: "Đang thực hiện", sublabel: "Song song hoặc tuần tự",
    color: "#F59E0B", bg: "rgba(245,158,11,0.05)",
  },
  {
    idx: 2, status: "done" as const,
    label: "Hoàn thành", sublabel: "Bước kết thúc quy trình",
    color: "#22C55E", bg: "rgba(34,197,94,0.05)",
  },
] as const;

type ZoneStatus = typeof ZONES[number]["status"];

function zoneByX(x: number): ZoneStatus {
  if (x < ZONE_W)       return "todo";
  if (x < ZONE_W * 2)   return "in_progress";
  return "done";
}

// ── Status config (classic mode keeps all 4) ──────────────────
const STATUS_CFG = {
  todo:        { label: "Chuẩn bị",       color: "#3B82F6" },
  in_progress: { label: "Đang thực hiện", color: "#F59E0B" },
  done:        { label: "Hoàn thành",      color: "#22C55E" },
  blocked:     { label: "Bị chặn",         color: "#EF4444" },
} as const;
type NodeStatus = keyof typeof STATUS_CFG;

// ── Zone bands (pure visual, rendered behind ReactFlow) ───────
function ZoneBandLayer({ vp }: { vp: Viewport }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {ZONES.map((zone) => {
        const left  = zone.idx * ZONE_W * vp.zoom + vp.x;
        const width = ZONE_W * vp.zoom;
        return (
          <div
            key={zone.status}
            style={{
              position: "absolute",
              left,
              top: 0,
              bottom: 0,
              width,
              background: zone.bg,
              borderRight: zone.idx < 2 ? `2px dashed ${zone.color}28` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Zone header (above canvas, synced to viewport) ────────────
function ZoneHeader({ vp, viewMode }: { vp: Viewport; viewMode: "zones" | "classic" }) {
  if (viewMode !== "zones") return null;
  return (
    <div
      style={{
        position: "relative",
        height: 44,
        borderBottom: "1px solid var(--border, #e2e8f0)",
        overflow: "hidden",
        flexShrink: 0,
        background: "var(--card, #ffffff)",
      }}
    >
      {ZONES.map((zone) => {
        const left  = zone.idx * ZONE_W * vp.zoom + vp.x;
        const width = ZONE_W * vp.zoom;
        return (
          <div
            key={zone.status}
            style={{
              position: "absolute",
              left,
              width,
              top: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              borderRight: zone.idx < 2 ? `1px solid ${zone.color}25` : "none",
              background: `${zone.color}05`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: zone.color,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: zone.color,
                }}
              />
              {zone.label}
            </div>
            <p
              style={{
                fontSize: 9,
                color: `${zone.color}99`,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {zone.sublabel}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom node card ──────────────────────────────────────────
function WFNodeCard({ data, selected }: NodeProps) {
  const cfg = STATUS_CFG[data.status as NodeStatus] ?? STATUS_CFG.todo;

  return (
    <div
      style={{
        background: "var(--card, #ffffff)",
        border: `1.5px solid ${selected ? cfg.color : "var(--border, #e2e8f0)"}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 164,
        maxWidth: 220,
        cursor: "grab",
        boxShadow: selected
          ? `0 0 0 2px ${cfg.color}40, 0 4px 20px rgba(0,0,0,.14)`
          : "0 2px 10px rgba(0,0,0,.08)",
        transition: "box-shadow 0.15s",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: cfg.color, width: 11, height: 11, border: "2px solid white" }}
      />

      <p
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: "var(--foreground, #0f172a)",
          marginBottom: 2,
          lineHeight: 1.35,
          wordBreak: "break-word",
        }}
      >
        {data.label}
      </p>

      {data.department && (
        <p style={{ fontSize: 10, color: "var(--muted-foreground, #64748b)", marginTop: 3 }}>
          {data.department}
        </p>
      )}

      {data.showStatus && (
        <span
          style={{
            display: "inline-block",
            marginTop: 7,
            padding: "2px 9px",
            borderRadius: 100,
            fontSize: 10,
            fontWeight: 600,
            background: `${cfg.color}18`,
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: cfg.color, width: 11, height: 11, border: "2px solid white" }}
      />
    </div>
  );
}

const NODE_TYPES = { wfNode: WFNodeCard };

// ── Convert workflow → ReactFlow ──────────────────────────────
function toRFNodes(wf: Workflow, showStatus: boolean): Node[] {
  const src: WorkflowNode[] = wf.nodes?.length
    ? wf.nodes
    : (wf.steps ?? []).map((s, i) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        department: wf.department,
        status: "todo" as const,
        position: { x: i * 280, y: 80 },
      }));

  return src.map((n) => ({
    id: n.id,
    type: "wfNode",
    position: n.position,
    data: {
      label: n.name,
      department: n.department ?? "",
      status: n.status ?? "todo",
      description: n.description ?? "",
      showStatus,
    },
  }));
}

function toRFEdges(wf: Workflow): Edge[] {
  const src: WorkflowEdge[] = wf.edges?.length
    ? wf.edges.filter((e) => !e.target.startsWith("ext::"))
    : (wf.steps ?? []).slice(0, -1).map((s, i) => ({
        id: `e-${s.id}-${wf.steps[i + 1].id}`,
        source: s.id,
        target: wf.steps[i + 1].id,
      }));

  return src.map((e) => edgeStyle(e.id, e.source, e.target, !!e.required, e.label));
}

function edgeStyle(
  id: string,
  source: string,
  target: string,
  required: boolean,
  label?: string,
): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    label: required ? "Phải xong trước" : label,
    labelStyle: required
      ? { fontSize: 10, fontWeight: 600, fill: "#3B82F6" }
      : { fontSize: 10, fill: "#94A3B8" },
    labelBgStyle: required
      ? { fill: "#EFF6FF", fillOpacity: 0.9 }
      : { fill: "transparent" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: required ? "#3B82F6" : "#94A3B8",
    },
    style: {
      strokeWidth: required ? 2.5 : 1.5,
      stroke: required ? "#3B82F6" : "#94A3B8",
      strokeDasharray: required ? undefined : "5 4",
    },
    data: { required },
  };
}

function fromRF(
  rfNodes: Node[],
  rfEdges: Edge[],
  extEdges: WorkflowEdge[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = rfNodes.map((n) => ({
    id: n.id,
    name: n.data.label as string,
    description: (n.data.description as string) || undefined,
    department: (n.data.department as string) || undefined,
    status: n.data.status as NodeStatus,
    position: n.position,
  }));

  const edges: WorkflowEdge[] = [
    ...rfEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      required: !!(e.data?.required),
      label: typeof e.label === "string" && !e.data?.required ? e.label : undefined,
    })),
    ...extEdges,
  ];

  return { nodes, edges };
}

// ── Snap nodes to correct zone x-range ───────────────────────
function snapNodesToZones(nodes: Node[]): Node[] {
  const counts: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
  return nodes.map((n) => {
    const status = (n.data.status as string) in counts ? n.data.status as string : "todo";
    const zoneIdx = ZONES.findIndex((z) => z.status === status);
    if (zoneIdx === -1) return n;
    const zoneStart = zoneIdx * ZONE_W;
    const col = counts[status] ?? 0;
    counts[status] = col + 1;
    const x = zoneStart + 40 + (col % 2) * 220;
    const y = 80 + Math.floor(col / 2) * 140;
    return { ...n, position: { x, y } };
  });
}

// ── Node editor panel ─────────────────────────────────────────
function NodeEditor({
  node,
  allWorkflows,
  extEdges,
  viewMode,
  onUpdate,
  onDelete,
  onClose,
  onAddExtEdge,
  onRemoveExtEdge,
}: {
  node: Node;
  allWorkflows: Workflow[];
  extEdges: WorkflowEdge[];
  viewMode: "zones" | "classic";
  onUpdate: (id: string, patch: Partial<Node["data"]>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddExtEdge: (edge: WorkflowEdge) => void;
  onRemoveExtEdge: (edgeId: string) => void;
}) {
  const [showExtForm, setShowExtForm] = useState(false);
  const [extWfId, setExtWfId]         = useState("");
  const [extNodeId, setExtNodeId]     = useState("");

  const nodeExtEdges = extEdges.filter((e) => e.source === node.id);
  const targetWf = allWorkflows.find((w) => w.id === extWfId);
  const currentZone = ZONES.find((z) => z.status === node.data.status);

  function addExtLink() {
    if (!extWfId || !extNodeId) return;
    onAddExtEdge({ id: `ext-${generateId("e")}`, source: node.id, target: `ext::${extWfId}::${extNodeId}` });
    setExtWfId(""); setExtNodeId(""); setShowExtForm(false);
  }

  const s: React.CSSProperties = {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 280,
    background: "var(--card, #ffffff)",
    borderLeft: "1px solid var(--border, #e2e8f0)",
    overflowY: "auto", zIndex: 20, padding: "16px",
    boxShadow: "-4px 0 24px rgba(0,0,0,.10)", boxSizing: "border-box",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
    color: "var(--muted-foreground, #64748b)", marginBottom: 5, textTransform: "uppercase",
  };
  const input: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: "1px solid var(--border, #e2e8f0)", borderRadius: 8,
    background: "var(--background, #f8fafc)", color: "var(--foreground, #0f172a)",
    marginBottom: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={s}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)" }}>Chỉnh sửa bước</span>
        <button onClick={onClose} style={{ padding: 4, borderRadius: 6, cursor: "pointer", background: "transparent", border: "none", color: "var(--muted-foreground)" }}>
          <X size={16} />
        </button>
      </div>

      {/* Zone badge (zone mode) */}
      {viewMode === "zones" && currentZone && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
            padding: "6px 10px", borderRadius: 8, background: `${currentZone.color}10`,
            border: `1px solid ${currentZone.color}30`,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: currentZone.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: currentZone.color }}>
            {currentZone.label}
          </span>
          <span style={{ fontSize: 10, color: `${currentZone.color}80` }}>· kéo để thay đổi vùng</span>
        </div>
      )}

      {/* Name */}
      <label style={label}>Tên bước</label>
      <input
        value={node.data.label as string}
        onChange={(e) => onUpdate(node.id, { label: e.target.value })}
        style={input}
        placeholder="Tên bước..."
      />

      {/* Department */}
      <label style={label}>Đơn vị / Phòng ban</label>
      <input
        value={node.data.department as string}
        onChange={(e) => onUpdate(node.id, { department: e.target.value })}
        style={input}
        placeholder="VD: Phòng Kinh doanh"
      />

      {/* Status selector — classic mode only */}
      {viewMode === "classic" && (
        <>
          <label style={label}>Trạng thái</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
            {(Object.entries(STATUS_CFG) as [NodeStatus, { label: string; color: string }][]).map(
              ([key, { label: lbl, color }]) => (
                <button
                  key={key}
                  onClick={() => onUpdate(node.id, { status: key })}
                  style={{
                    padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                    border: node.data.status === key ? `2px solid ${color}` : "1px solid var(--border, #e2e8f0)",
                    background: node.data.status === key ? `${color}18` : "transparent",
                    color: node.data.status === key ? color : "var(--muted-foreground)",
                    display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s",
                  }}
                >
                  {node.data.status === key && <Check size={9} />}
                  {lbl}
                </button>
              )
            )}
          </div>
        </>
      )}

      {/* Description */}
      <label style={label}>Mô tả</label>
      <textarea
        value={node.data.description as string}
        onChange={(e) => onUpdate(node.id, { description: e.target.value })}
        placeholder="Mô tả ngắn về bước này..."
        rows={3}
        style={{ ...input, resize: "vertical", marginBottom: 14 }}
      />

      {/* Cross-workflow links */}
      <label style={label}>Liên kết quy trình khác</label>
      {nodeExtEdges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {nodeExtEdges.map((e) => {
            const [, wfId, nodeId] = e.target.split("::");
            const lw = allWorkflows.find((w) => w.id === wfId);
            const ls = lw?.nodes?.find((n) => n.id === nodeId) ?? lw?.steps?.find((s) => s.id === nodeId);
            return (
              <div
                key={e.id}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                  background: "var(--muted, #f1f5f9)", borderRadius: 6, fontSize: 11,
                }}
              >
                <Link2 size={10} style={{ color: "#3B82F6", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--foreground)" }}>
                  {lw?.name ?? wfId} → {ls?.name ?? nodeId}
                </span>
                <button
                  onClick={() => onRemoveExtEdge(e.id)}
                  style={{ cursor: "pointer", color: "#94A3B8", padding: 2, background: "transparent", border: "none", lineHeight: 0 }}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showExtForm ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px", marginBottom: 12 }}>
          <select
            value={extWfId}
            onChange={(e) => { setExtWfId(e.target.value); setExtNodeId(""); }}
            style={{ ...input, marginBottom: 6 }}
          >
            <option value="">-- Chọn quy trình --</option>
            {allWorkflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {targetWf && (
            <select
              value={extNodeId}
              onChange={(e) => setExtNodeId(e.target.value)}
              style={{ ...input, marginBottom: 8 }}
            >
              <option value="">-- Chọn bước --</option>
              {(targetWf.nodes?.length ? targetWf.nodes : targetWf.steps).map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { setShowExtForm(false); setExtWfId(""); setExtNodeId(""); }}
              style={{ flex: 1, padding: "6px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--muted-foreground)" }}
            >Huỷ</button>
            <button
              onClick={addExtLink}
              disabled={!extWfId || !extNodeId}
              style={{ flex: 1, padding: "6px", borderRadius: 6, fontSize: 11, border: "none", cursor: "pointer", background: "#3B82F6", color: "#fff", opacity: (!extWfId || !extNodeId) ? 0.45 : 1 }}
            >Thêm liên kết</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowExtForm(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            padding: "7px 10px", borderRadius: 8, fontSize: 12,
            border: "1px dashed var(--border)", background: "transparent",
            color: "#3B82F6", cursor: "pointer", marginBottom: 14, boxSizing: "border-box",
          }}
        >
          <Link2 size={13} /> Thêm liên kết quy trình khác
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(node.id)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", padding: "8px", borderRadius: 8, fontSize: 12,
          border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#EF4444",
          cursor: "pointer", boxSizing: "border-box", marginTop: 4,
        }}
      >
        <Trash2 size={13} /> Xóa bước này
      </button>
    </div>
  );
}

// ── Edge hint panel ───────────────────────────────────────────
function EdgeHint({
  edge,
  onToggleRequired,
  onDeleteEdge,
  onClose,
}: {
  edge: Edge;
  onToggleRequired: () => void;
  onDeleteEdge: () => void;
  onClose: () => void;
}) {
  const required = !!(edge.data?.required);
  return (
    <div
      style={{
        position: "absolute", left: "50%", bottom: 80, transform: "translateX(-50%)",
        zIndex: 30, background: "var(--card, #fff)", border: "1px solid var(--border, #e2e8f0)",
        borderRadius: 12, padding: "12px 16px", boxShadow: "0 4px 20px rgba(0,0,0,.12)",
        display: "flex", alignItems: "center", gap: 10, minWidth: 280,
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>
          Điều kiện kết nối
        </p>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          {required ? "Bước trước phải hoàn thành trước" : "Không có điều kiện bắt buộc"}
        </p>
      </div>
      <button
        onClick={onToggleRequired}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 10px",
          borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${required ? "#3B82F6" : "var(--border)"}`,
          background: required ? "#EFF6FF" : "transparent",
          color: required ? "#3B82F6" : "var(--muted-foreground)",
        }}
      >
        {required ? <Lock size={12} /> : <Unlock size={12} />}
        {required ? "Bắt buộc" : "Tuỳ chọn"}
      </button>
      <button
        onClick={onDeleteEdge}
        style={{ padding: 6, borderRadius: 8, border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#EF4444", cursor: "pointer" }}
      >
        <Trash2 size={13} />
      </button>
      <button
        onClick={onClose}
        style={{ padding: 6, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", cursor: "pointer" }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────
export interface WorkflowBuilderProps {
  workflow: Workflow;
  allWorkflows: Workflow[];
  canEdit: boolean;
  canApprove?: boolean;
  onSave: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => Promise<void>;
}

// ── Main WorkflowBuilder ──────────────────────────────────────
export default function WorkflowBuilder({
  workflow,
  allWorkflows,
  canEdit,
  canApprove,
  onSave,
}: WorkflowBuilderProps) {
  const [viewMode, setViewMode] = useState<"zones" | "classic">("zones");
  const [vp, setVp]             = useState<Viewport>({ x: 40, y: 40, zoom: 1 });

  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(workflow, viewMode === "classic"));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(workflow));
  const [extEdges, setExtEdges]          = useState<WorkflowEdge[]>(
    (workflow.edges ?? []).filter((e) => e.target.startsWith("ext::"))
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty]   = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const otherWorkflows = allWorkflows.filter((w) => w.id !== workflow.id && w.status === "published");

  // ── Reload when workflow changes ──────────────────────────
  useEffect(() => {
    const showStatus = viewMode === "classic";
    let ns = toRFNodes(workflow, showStatus);
    if (viewMode === "zones") ns = snapNodesToZones(ns);
    setNodes(ns);
    setEdges(toRFEdges(workflow));
    setExtEdges((workflow.edges ?? []).filter((e) => e.target.startsWith("ext::")));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDirty(false);
  }, [workflow.id]);

  // ── Update showStatus flag when view mode changes ─────────
  useEffect(() => {
    const showStatus = viewMode === "classic";
    setNodes((ns) => {
      let updated = ns.map((n) => ({ ...n, data: { ...n.data, showStatus } }));
      if (viewMode === "zones") {
        updated = snapNodesToZones(updated);
        setDirty(true);
      }
      return updated;
    });
    setSelectedEdgeId(null);
  }, [viewMode]);

  // ── Edge connect ──────────────────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          edgeStyle(
            `e-${connection.source}-${connection.target}-${Date.now()}`,
            connection.source!,
            connection.target!,
            false,
          ),
          eds
        )
      );
      setDirty(true);
    },
    [setEdges]
  );

  // ── Node events ───────────────────────────────────────────
  function handleNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function handleNodeDragStop(_: React.MouseEvent, node: Node) {
    if (viewMode === "zones") {
      const newStatus = zoneByX(node.position.x);
      if (node.data.status !== newStatus) {
        setNodes((ns) =>
          ns.map((n) => n.id === node.id ? { ...n, data: { ...n.data, status: newStatus } } : n)
        );
      }
    }
    setDirty(true);
  }

  function handlePaneClick() {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  // ── Edge events ───────────────────────────────────────────
  function handleEdgeClick(_: React.MouseEvent, edge: Edge) {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }

  function toggleEdgeRequired() {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((e) =>
        e.id === selectedEdgeId
          ? edgeStyle(e.id, e.source, e.target, !e.data?.required)
          : e
      )
    );
    setDirty(true);
  }

  function deleteEdge(edgeId: string) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
    setDirty(true);
  }

  // ── Node CRUD ─────────────────────────────────────────────
  function updateNodeData(id: string, patch: Partial<Node["data"]>) {
    setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    setDirty(true);
  }

  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setExtEdges((es) => es.filter((e) => e.source !== id));
    setSelectedNodeId(null);
    setDirty(true);
  }

  function addNode(zoneIdx = 0) {
    const id = generateId("wn");
    const status = ZONES[zoneIdx]?.status ?? "todo";
    const nodesInZone = nodes.filter((n) => n.data.status === status).length;
    const x = viewMode === "zones"
      ? zoneIdx * ZONE_W + 40 + (nodesInZone % 2) * 220
      : (nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.x)) : -280) + 280;
    const y = viewMode === "zones" ? 80 + Math.floor(nodesInZone / 2) * 140 : 80 + (nodes.length % 3) * 120;

    const newNode: Node = {
      id, type: "wfNode",
      position: { x, y },
      data: {
        label: `Bước ${nodes.length + 1}`,
        department: "",
        status,
        description: "",
        showStatus: viewMode === "classic",
      },
    };
    setNodes((ns) => [...ns, newNode]);
    setSelectedNodeId(id);
    setDirty(true);
  }

  function addExtEdge(edge: WorkflowEdge) { setExtEdges((es) => [...es, edge]); setDirty(true); }
  function removeExtEdge(id: string)       { setExtEdges((es) => es.filter((e) => e.id !== id)); setDirty(true); }

  // ── Save ──────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      const { nodes: wn, edges: we } = fromRF(nodes, edges, extEdges);
      await onSave(wn, we);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  // ── Add-node dropdown state ───────────────────────────────
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      {/* Zone header bar */}
      <ZoneHeader vp={vp} viewMode={viewMode} />

      {/* Canvas area */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {/* Zone band layer — behind ReactFlow */}
        {viewMode === "zones" && <ZoneBandLayer vp={vp} />}

        {/* ReactFlow */}
        <div style={{ position: "absolute", inset: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={canEdit ? onConnect : undefined}
            onNodeClick={handleNodeClick}
            onEdgeClick={canEdit ? handleEdgeClick : undefined}
            onPaneClick={handlePaneClick}
            onNodeDragStop={canEdit ? handleNodeDragStop : undefined}
            nodeTypes={NODE_TYPES}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            style={{ background: "transparent" }}
            onMove={(_, v) => setVp(v)}
            onInit={(rf) => setTimeout(() => setVp(rf.getViewport()), 80)}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="var(--border, #e2e8f0)"
            />
            <Controls />

            {/* ── Toolbar ── */}
            {canEdit && (
              <Panel position="top-left">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {/* View mode toggle */}
                  <div
                    style={{
                      display: "flex", borderRadius: 8,
                      border: "1px solid var(--border, #e2e8f0)",
                      background: "var(--card, #fff)",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => setViewMode("zones")}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 10px", fontSize: 11, fontWeight: 600,
                        border: "none", cursor: "pointer", transition: "all 0.15s",
                        background: viewMode === "zones" ? "#3B82F6" : "transparent",
                        color: viewMode === "zones" ? "#fff" : "var(--muted-foreground)",
                      }}
                    >
                      <LayoutGrid size={13} /> Theo vùng
                    </button>
                    <button
                      onClick={() => setViewMode("classic")}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 10px", fontSize: 11, fontWeight: 600,
                        border: "none", cursor: "pointer", transition: "all 0.15s",
                        background: viewMode === "classic" ? "#3B82F6" : "transparent",
                        color: viewMode === "classic" ? "#fff" : "var(--muted-foreground)",
                      }}
                    >
                      <GitBranch size={13} /> Tự do
                    </button>
                  </div>

                  {/* Add node */}
                  <div style={{ position: "relative" }}>
                    {viewMode === "zones" ? (
                      <>
                        <button
                          onClick={() => setShowAddMenu((v) => !v)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: "none", background: "#3B82F6", color: "#fff",
                            cursor: "pointer", boxShadow: "0 2px 8px rgba(59,130,246,.3)",
                          }}
                        >
                          <Plus size={14} /> Thêm bước ▾
                        </button>
                        {showAddMenu && (
                          <div
                            style={{
                              position: "absolute", top: "calc(100% + 6px)", left: 0,
                              background: "var(--card, #fff)", border: "1px solid var(--border)",
                              borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,.12)",
                              minWidth: 180, zIndex: 50, overflow: "hidden",
                            }}
                          >
                            {ZONES.map((zone) => (
                              <button
                                key={zone.status}
                                onClick={() => { addNode(zone.idx); setShowAddMenu(false); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  width: "100%", padding: "8px 12px", fontSize: 12, fontWeight: 600,
                                  border: "none", background: "transparent", color: "var(--foreground)",
                                  cursor: "pointer", textAlign: "left",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = `${zone.color}10`)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: zone.color, flexShrink: 0 }} />
                                {zone.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => addNode()}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: "none", background: "#3B82F6", color: "#fff",
                          cursor: "pointer", boxShadow: "0 2px 8px rgba(59,130,246,.3)",
                        }}
                      >
                        <Plus size={14} /> Thêm bước
                      </button>
                    )}
                  </div>

                  {/* Save */}
                  {dirty && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: "none",
                        background: saving ? "#86EFAC" : (canApprove ? "#22C55E" : "#F59E0B"),
                        color: "#fff", cursor: saving ? "wait" : "pointer",
                        boxShadow: `0 2px 8px ${canApprove ? "rgba(34,197,94,.3)" : "rgba(245,158,11,.3)"}`,
                        transition: "background 0.2s",
                      }}
                    >
                      {saving
                        ? <Loader2 size={14} className="animate-spin" />
                        : canApprove ? <Save size={14} /> : <Send size={14} />
                      }
                      {saving
                        ? "Đang lưu..."
                        : canApprove ? "Lưu & Xuất bản" : "Lưu & Gửi duyệt"
                      }
                    </button>
                  )}
                </div>
              </Panel>
            )}

            {/* Zone legend (classic mode) / Edge hint */}
            {viewMode === "classic" && (
              <Panel position="bottom-left">
                <div
                  style={{
                    display: "flex", flexWrap: "wrap", gap: "5px 10px",
                    padding: "7px 11px", background: "var(--card, #fff)",
                    border: "1px solid var(--border, #e2e8f0)", borderRadius: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                  }}
                >
                  {(Object.entries(STATUS_CFG) as [NodeStatus, { label: string; color: string }][]).map(
                    ([, { label, color }]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 500 }}>{label}</span>
                      </div>
                    )
                  )}
                </div>
              </Panel>
            )}

            {/* Edge legend */}
            {canEdit && (
              <Panel position="bottom-right">
                <div
                  style={{
                    padding: "7px 11px", background: "var(--card, #fff)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,.06)", fontSize: 10,
                    color: "var(--muted-foreground)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                    <svg width={28} height={6}><line x1="0" y1="3" x2="28" y2="3" stroke="#3B82F6" strokeWidth="2.5" /></svg>
                    <span style={{ fontWeight: 600 }}>Phải hoàn thành trước</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width={28} height={6}><line x1="0" y1="3" x2="28" y2="3" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
                    <span>Không bắt buộc · <em>click mũi tên để đổi</em></span>
                  </div>
                </div>
              </Panel>
            )}

            {/* Empty hint */}
            {nodes.length === 0 && canEdit && (
              <Panel position="top-center">
                <div
                  style={{
                    marginTop: 80, padding: "12px 20px",
                    background: "var(--card)",
                    border: "1.5px dashed var(--border)",
                    borderRadius: 12, fontSize: 13,
                    color: "var(--muted-foreground)", textAlign: "center",
                  }}
                >
                  {viewMode === "zones"
                    ? <>Nhấn <strong>Thêm bước ▾</strong> và chọn vùng để bắt đầu.</>
                    : <>Nhấn <strong>Thêm bước</strong> để bắt đầu xây dựng sơ đồ.</>
                  }
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Node editor panel */}
        {selectedNode && (
          <NodeEditor
            node={selectedNode}
            allWorkflows={otherWorkflows}
            extEdges={extEdges}
            viewMode={viewMode}
            onUpdate={updateNodeData}
            onDelete={deleteNode}
            onClose={() => setSelectedNodeId(null)}
            onAddExtEdge={addExtEdge}
            onRemoveExtEdge={removeExtEdge}
          />
        )}

        {/* Edge hint panel */}
        {selectedEdge && canEdit && (
          <EdgeHint
            edge={selectedEdge}
            onToggleRequired={toggleEdgeRequired}
            onDeleteEdge={() => deleteEdge(selectedEdgeId!)}
            onClose={() => setSelectedEdgeId(null)}
          />
        )}
      </div>
    </div>
  );
}
