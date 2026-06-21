"use client";

import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
} from "reactflow";
import "reactflow/dist/style.css";
import { Plus, Save, Trash2, X, Link2, Check, Loader2 } from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/types";
import { generateId } from "@/lib/utils";

// ── Status config ────────────────────────────────────────────
const STATUS_CFG = {
  todo:        { label: "Chờ thực hiện",  color: "#3B82F6" },
  in_progress: { label: "Đang thực hiện", color: "#F59E0B" },
  done:        { label: "Hoàn thành",     color: "#22C55E" },
  blocked:     { label: "Bị chặn",        color: "#EF4444" },
} as const;
type NodeStatus = keyof typeof STATUS_CFG;

// ── Custom node card ─────────────────────────────────────────
function WFNodeCard({ data, selected }: NodeProps) {
  const cfg = STATUS_CFG[data.status as NodeStatus] ?? { label: data.status, color: "#94A3B8" };

  return (
    <div
      style={{
        background: "var(--card, #ffffff)",
        border: `1.5px solid ${selected ? cfg.color : "var(--border, #e2e8f0)"}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 160,
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

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: cfg.color, width: 11, height: 11, border: "2px solid white" }}
      />
    </div>
  );
}

const NODE_TYPES = { wfNode: WFNodeCard };

// ── Convert workflow → ReactFlow ─────────────────────────────
function toRFNodes(wf: Workflow): Node[] {
  const wfNodes: WorkflowNode[] = wf.nodes?.length
    ? wf.nodes
    : (wf.steps ?? []).map((s, i) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        department: wf.department,
        status: "todo" as NodeStatus,
        position: { x: i * 280, y: 80 },
      }));

  return wfNodes.map((n) => ({
    id: n.id,
    type: "wfNode",
    position: n.position,
    data: {
      label: n.name,
      department: n.department ?? "",
      status: n.status ?? "todo",
      description: n.description ?? "",
    },
  }));
}

function toRFEdges(wf: Workflow): Edge[] {
  const internalEdges: WorkflowEdge[] = wf.edges?.length
    ? wf.edges.filter((e) => !e.target.startsWith("ext::"))
    : (wf.steps ?? []).slice(0, -1).map((s, i) => ({
        id: `e-${s.id}-${wf.steps[i + 1].id}`,
        source: s.id,
        target: wf.steps[i + 1].id,
      }));

  return internalEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 2, stroke: "#64748b" },
  }));
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
      label: typeof e.label === "string" ? e.label : undefined,
    })),
    ...extEdges,
  ];

  return { nodes, edges };
}

// ── Node editor panel ────────────────────────────────────────
function NodeEditor({
  node,
  allWorkflows,
  extEdges,
  onUpdate,
  onDelete,
  onClose,
  onAddExtEdge,
  onRemoveExtEdge,
}: {
  node: Node;
  allWorkflows: Workflow[];
  extEdges: WorkflowEdge[];
  onUpdate: (id: string, patch: Partial<Node["data"]>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddExtEdge: (edge: WorkflowEdge) => void;
  onRemoveExtEdge: (edgeId: string) => void;
}) {
  const [showExtForm, setShowExtForm] = useState(false);
  const [extWfId, setExtWfId] = useState("");
  const [extNodeId, setExtNodeId] = useState("");

  const nodeExtEdges = extEdges.filter((e) => e.source === node.id);
  const targetWf = allWorkflows.find((w) => w.id === extWfId);

  function addExtLink() {
    if (!extWfId || !extNodeId) return;
    onAddExtEdge({
      id: `ext-${generateId("e")}`,
      source: node.id,
      target: `ext::${extWfId}::${extNodeId}`,
    });
    setExtWfId("");
    setExtNodeId("");
    setShowExtForm(false);
  }

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 280,
    background: "var(--card, #ffffff)",
    borderLeft: "1px solid var(--border, #e2e8f0)",
    overflowY: "auto",
    zIndex: 20,
    padding: "16px",
    boxShadow: "-4px 0 24px rgba(0,0,0,.1)",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--muted-foreground, #64748b)",
    marginBottom: 5,
    textTransform: "uppercase",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 8,
    background: "var(--background, #f8fafc)",
    color: "var(--foreground, #0f172a)",
    marginBottom: 14,
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)" }}>Chỉnh sửa bước</span>
        <button
          onClick={onClose}
          style={{ padding: 4, borderRadius: 6, cursor: "pointer", background: "transparent", border: "none", color: "var(--muted-foreground)" }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Name */}
      <label style={labelStyle}>Tên bước</label>
      <input
        value={node.data.label as string}
        onChange={(e) => onUpdate(node.id, { label: e.target.value })}
        style={inputStyle}
        placeholder="Tên bước..."
      />

      {/* Department */}
      <label style={labelStyle}>Đơn vị / Phòng ban</label>
      <input
        value={node.data.department as string}
        onChange={(e) => onUpdate(node.id, { department: e.target.value })}
        style={inputStyle}
        placeholder="VD: Phòng Kinh doanh"
      />

      {/* Status */}
      <label style={labelStyle}>Trạng thái</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
        {(Object.entries(STATUS_CFG) as [NodeStatus, { label: string; color: string }][]).map(
          ([key, { label, color }]) => (
            <button
              key={key}
              onClick={() => onUpdate(node.id, { status: key })}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: node.data.status === key ? `2px solid ${color}` : "1px solid var(--border, #e2e8f0)",
                background: node.data.status === key ? `${color}18` : "transparent",
                color: node.data.status === key ? color : "var(--muted-foreground)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.15s",
              }}
            >
              {node.data.status === key && <Check size={9} />}
              {label}
            </button>
          )
        )}
      </div>

      {/* Description */}
      <label style={labelStyle}>Mô tả</label>
      <textarea
        value={node.data.description as string}
        onChange={(e) => onUpdate(node.id, { description: e.target.value })}
        placeholder="Mô tả ngắn về bước này..."
        rows={3}
        style={{
          ...inputStyle,
          resize: "vertical",
          marginBottom: 14,
        }}
      />

      {/* Cross-workflow links */}
      <label style={labelStyle}>Liên kết quy trình khác</label>

      {nodeExtEdges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {nodeExtEdges.map((e) => {
            const [, wfId, nodeId] = e.target.split("::");
            const linkedWf = allWorkflows.find((w) => w.id === wfId);
            const linkedStep =
              linkedWf?.nodes?.find((n) => n.id === nodeId) ??
              linkedWf?.steps?.find((s) => s.id === nodeId);
            return (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  background: "var(--muted, #f1f5f9)",
                  borderRadius: 6,
                  fontSize: 11,
                }}
              >
                <Link2 size={10} style={{ color: "#3B82F6", flexShrink: 0 }} />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--foreground)",
                  }}
                >
                  {linkedWf?.name ?? wfId} → {linkedStep?.name ?? nodeId}
                </span>
                <button
                  onClick={() => onRemoveExtEdge(e.id)}
                  style={{
                    cursor: "pointer",
                    color: "#94A3B8",
                    padding: 2,
                    background: "transparent",
                    border: "none",
                    lineHeight: 0,
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showExtForm ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px",
            marginBottom: 12,
          }}
        >
          <select
            value={extWfId}
            onChange={(e) => { setExtWfId(e.target.value); setExtNodeId(""); }}
            style={{ ...inputStyle, marginBottom: 6 }}
          >
            <option value="">-- Chọn quy trình --</option>
            {allWorkflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          {targetWf && (
            <select
              value={extNodeId}
              onChange={(e) => setExtNodeId(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
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
              style={{
                flex: 1, padding: "6px", borderRadius: 6, fontSize: 11,
                border: "1px solid var(--border)", cursor: "pointer",
                background: "transparent", color: "var(--muted-foreground)",
              }}
            >
              Huỷ
            </button>
            <button
              onClick={addExtLink}
              disabled={!extWfId || !extNodeId}
              style={{
                flex: 1, padding: "6px", borderRadius: 6, fontSize: 11,
                border: "none", cursor: "pointer",
                background: "#3B82F6", color: "#fff",
                opacity: (!extWfId || !extNodeId) ? 0.45 : 1,
              }}
            >
              Thêm liên kết
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowExtForm(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            fontSize: 12,
            border: "1px dashed var(--border)",
            background: "transparent",
            color: "#3B82F6",
            cursor: "pointer",
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        >
          <Link2 size={13} /> Thêm liên kết quy trình khác
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(node.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          padding: "8px",
          borderRadius: 8,
          fontSize: 12,
          border: "1px solid #FCA5A5",
          background: "#FFF1F2",
          color: "#EF4444",
          cursor: "pointer",
          boxSizing: "border-box",
          marginTop: 4,
        }}
      >
        <Trash2 size={13} /> Xóa bước này
      </button>
    </div>
  );
}

// ── Main WorkflowBuilder ─────────────────────────────────────
export interface WorkflowBuilderProps {
  workflow: Workflow;
  allWorkflows: Workflow[];
  canEdit: boolean;
  onSave: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => Promise<void>;
}

export default function WorkflowBuilder({ workflow, allWorkflows, canEdit, onSave }: WorkflowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(workflow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(workflow));
  const [extEdges, setExtEdges] = useState<WorkflowEdge[]>(
    (workflow.edges ?? []).filter((e) => e.target.startsWith("ext::"))
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const otherWorkflows = allWorkflows.filter((w) => w.id !== workflow.id && w.status === "published");

  useEffect(() => {
    setNodes(toRFNodes(workflow));
    setEdges(toRFEdges(workflow));
    setExtEdges((workflow.edges ?? []).filter((e) => e.target.startsWith("ext::")));
    setSelectedNodeId(null);
    setDirty(false);
  }, [workflow.id]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `e-${connection.source}-${connection.target}-${Date.now()}`,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2, stroke: "#64748b" },
          },
          eds
        )
      );
      setDirty(true);
    },
    [setEdges]
  );

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNodeId(node.id);
  }

  function handlePaneClick() {
    setSelectedNodeId(null);
  }

  function handleNodeDragStop() {
    setDirty(true);
  }

  function updateNodeData(id: string, patch: Partial<Node["data"]>) {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
    setDirty(true);
  }

  function deleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setExtEdges((es) => es.filter((e) => e.source !== id));
    setSelectedNodeId(null);
    setDirty(true);
  }

  function addNode() {
    const id = generateId("wn");
    const maxX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.x)) : -280;
    const newNode: Node = {
      id,
      type: "wfNode",
      position: { x: maxX + 280, y: 80 + (nodes.length % 3) * 120 },
      data: {
        label: `Bước ${nodes.length + 1}`,
        department: "",
        status: "todo",
        description: "",
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    setDirty(true);
  }

  function addExtEdge(edge: WorkflowEdge) {
    setExtEdges((es) => [...es, edge]);
    setDirty(true);
  }

  function removeExtEdge(edgeId: string) {
    setExtEdges((es) => es.filter((e) => e.id !== edgeId));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { nodes: wfNodes, edges: wfEdges } = fromRF(nodes, edges, extEdges);
      await onSave(wfNodes, wfEdges);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={canEdit ? onConnect : undefined}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={NODE_TYPES}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable={true}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--background, #f8fafc)" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="var(--border, #e2e8f0)"
        />
        <Controls />
        <MiniMap
          nodeColor={(n) => STATUS_CFG[n.data?.status as NodeStatus]?.color ?? "#94A3B8"}
          style={{
            background: "var(--card, #fff)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: 8,
          }}
        />

        {/* Toolbar */}
        {canEdit && (
          <Panel position="top-left">
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={addNode}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  background: "#3B82F6",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(59,130,246,.35)",
                }}
              >
                <Plus size={14} /> Thêm bước
              </button>

              {dirty && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    background: saving ? "#86EFAC" : "#22C55E",
                    color: "#fff",
                    cursor: saving ? "wait" : "pointer",
                    boxShadow: "0 2px 8px rgba(34,197,94,.35)",
                    transition: "background 0.2s",
                  }}
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {saving ? "Đang lưu..." : "Lưu sơ đồ"}
                </button>
              )}
            </div>
          </Panel>
        )}

        {/* Status legend */}
        <Panel position="bottom-left">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 12px",
              padding: "8px 12px",
              background: "var(--card, #fff)",
              border: "1px solid var(--border, #e2e8f0)",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,.06)",
              maxWidth: 340,
            }}
          >
            {(Object.entries(STATUS_CFG) as [NodeStatus, { label: string; color: string }][]).map(
              ([, { label, color }]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div
                    style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 500 }}>
                    {label}
                  </span>
                </div>
              )
            )}
          </div>
        </Panel>

        {/* Empty hint */}
        {nodes.length === 0 && canEdit && (
          <Panel position="top-center">
            <div
              style={{
                marginTop: 80,
                padding: "12px 20px",
                background: "var(--card)",
                border: "1.5px dashed var(--border)",
                borderRadius: 12,
                fontSize: 13,
                color: "var(--muted-foreground)",
                textAlign: "center",
              }}
            >
              Nhấn <strong>Thêm bước</strong> để bắt đầu xây dựng sơ đồ quy trình.
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Node editor slide panel */}
      {selectedNode && (
        <NodeEditor
          node={selectedNode}
          allWorkflows={otherWorkflows}
          extEdges={extEdges}
          onUpdate={updateNodeData}
          onDelete={deleteNode}
          onClose={() => setSelectedNodeId(null)}
          onAddExtEdge={addExtEdge}
          onRemoveExtEdge={removeExtEdge}
        />
      )}
    </div>
  );
}
