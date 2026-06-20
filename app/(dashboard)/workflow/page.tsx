"use client";

import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { GitBranch, Save, Plus, Trash2 } from "lucide-react";
import { getWorkflows, saveWorkflow } from "@/lib/firebase/firestore";
import type { Workflow } from "@/types";
import { generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";

const NODE_TYPES = ["Bắt đầu", "Nhiệm vụ", "Phê duyệt", "Kết thúc"];
const NODE_COLORS: Record<string, string> = {
  "Bắt đầu": "#22c55e",
  "Kết thúc": "#ef4444",
  "Phê duyệt": "#8b5cf6",
  "Nhiệm vụ": "#3b82f6",
};

function buildNode(label: string, position: { x: number; y: number }): Node {
  return {
    id: generateId("node"),
    type: "default",
    data: { label },
    position,
    style: {
      background: NODE_COLORS[label] ?? "#3b82f6",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "10px 18px",
      fontSize: 13,
      fontWeight: 600,
      minWidth: 120,
    },
  };
}

const INITIAL_NODES: Node[] = [
  buildNode("Bắt đầu", { x: 200, y: 50 }),
  buildNode("Nhiệm vụ", { x: 200, y: 170 }),
  buildNode("Phê duyệt", { x: 200, y: 290 }),
  buildNode("Kết thúc", { x: 200, y: 410 }),
];

const INITIAL_EDGES: Edge[] = [
  { id: "e1-2", source: INITIAL_NODES[0].id, target: INITIAL_NODES[1].id, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e2-3", source: INITIAL_NODES[1].id, target: INITIAL_NODES[2].id, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e3-4", source: INITIAL_NODES[2].id, target: INITIAL_NODES[3].id, markerEnd: { type: MarkerType.ArrowClosed } },
];

export default function WorkflowPage() {
  const { currentUser } = useAuthStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [workflowName, setWorkflowName] = useState("Quy trình mới");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWorkflows().then(setWorkflows).catch(console.error);
  }, []);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds),
      ),
    [setEdges],
  );

  const addNode = (type: string) => {
    setNodes((nds) => [
      ...nds,
      buildNode(type, { x: 100 + Math.random() * 200, y: 100 + nds.length * 80 }),
    ]);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      const wf: Workflow = {
        id: selectedWorkflow || generateId("workflow"),
        name: workflowName,
        nodes: nodes as Workflow["nodes"],
        edges: edges as Workflow["edges"],
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflow(wf);
      if (!selectedWorkflow) {
        setWorkflows((ws) => [...ws, wf]);
        setSelectedWorkflow(wf.id);
      }
      toast.success("Đã lưu workflow");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const loadWorkflow = (id: string) => {
    const wf = workflows.find((w) => w.id === id);
    if (!wf) return;
    setNodes(wf.nodes as Node[]);
    setEdges(wf.edges as Edge[]);
    setWorkflowName(wf.name);
    setSelectedWorkflow(id);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--card)] flex-wrap">
        <h1 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2 mr-4">
          <GitBranch className="w-5 h-5 text-blue-500" />
          Workflow Builder
        </h1>

        {/* Load existing */}
        <select
          value={selectedWorkflow}
          onChange={(e) => e.target.value ? loadWorkflow(e.target.value) : null}
          className="px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Chọn workflow --</option>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          placeholder="Tên workflow..."
          className="px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
        />

        {/* Add nodes */}
        <div className="flex gap-1.5 flex-wrap">
          {NODE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] hover:border-blue-300 text-[var(--foreground)] hover:text-blue-600 transition-colors"
              style={{ borderColor: NODE_COLORS[type] + "40" }}
            >
              <Plus className="w-3 h-3" />
              {type}
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-60"
        >
          {saving ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Lưu
        </button>
      </div>

      {/* ReactFlow canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          deleteKeyCode="Delete"
        >
          <Background color="var(--border)" gap={16} />
          <Controls />
          <MiniMap nodeColor={(n) => (n.style?.background as string) ?? "#3b82f6"} />
        </ReactFlow>
      </div>
    </div>
  );
}
