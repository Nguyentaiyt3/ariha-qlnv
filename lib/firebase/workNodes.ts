/**
 * Client-safe WorkNode compatibility layer — calls API routes via fetch.
 */
import type { WorkNode } from "@/types";

async function api<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getWorkNode(nodeId: string): Promise<WorkNode | null> {
  const data = await api<{ node: WorkNode }>(`/api/work-nodes/${nodeId}`);
  return data?.node ?? null;
}

export async function saveWorkNode(node: WorkNode): Promise<void> {
  await api(`/api/work-nodes/${node.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(node),
  });
}

export async function getWorkNodesByTask(taskId: string): Promise<WorkNode[]> {
  const data = await api<{ nodes: WorkNode[] }>(`/api/work-nodes?taskId=${taskId}`);
  return data?.nodes ?? [];
}
