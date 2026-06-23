/**
 * lib/firebase/workNodes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Toàn bộ logic CRUD + trigger cho hệ thống WorkNode (mô hình quản trị 3T).
 *
 * Firestore Schema:
 *   /workNodes/{nodeId}   — Collection phẳng, quan hệ cây qua ancestors[]
 *
 * Triết lý quản trị:
 *   [ĐẦU VÀO] → [NỘI DUNG] → [ĐẦU RA] → [TIÊU CHÍ 3T]
 *
 * Tối ưu query:
 *   • Subtree của node X  : where("ancestors", "array-contains", nodeX_id)
 *   • Tất cả node của task: where("rootTaskId", "==", taskId)         ← cần index
 *   • Nodes chờ unlock    : where("prerequisites", "array-contains", doneId)
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import { generateId } from "@/lib/utils";
import { notifNodeUnlocked, notifNodeSubmitted, notifNodeEvaluated } from "./notifications";
import type {
  WorkNode, NodeStatus, NodeChecklistItem, OutputAttachment,
  T1Timeliness, T2Quality, T3Resources, InputResource,
  PrerequisiteMode,
} from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NODES = "workNodes";

function now(): string {
  return new Date().toISOString();
}

/** Xóa các trường undefined trước khi ghi Firestore */
function stripUndef<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

// ─── Tính toán 3T ────────────────────────────────────────────────────────────

/** T1: So sánh thời điểm hoàn thành với deadline */
function computeT1(completedAt: string, dueDate: string): T1Timeliness {
  const done = new Date(completedAt).getTime();
  const due  = new Date(dueDate).getTime();
  if (done <= due) {
    return { completedAt, dueDate, status: "on_time" };
  }
  const diffMs   = done - due;
  const lateDays  = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const lateHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return { completedAt, dueDate, status: "late", lateDays, lateHours };
}

/** T3: So sánh chi phí thực tế với ngân sách */
function computeT3(budgeted: number, actual: number): T3Resources {
  const variance    = actual - budgeted;
  const variancePct = budgeted > 0 ? (variance / budgeted) * 100 : 0;
  const status: T3Resources["status"] =
    variance < 0 ? "under_budget" : variance === 0 ? "on_budget" : "over_budget";
  return {
    budgeted,
    actual,
    variance,
    variancePct: Math.round(variancePct * 100) / 100,
    status,
  };
}

// ─── Prerequisite trigger ─────────────────────────────────────────────────────

/**
 * Sau khi node `doneNodeId` hoàn thành, tìm tất cả node đang "locked"
 * có `doneNodeId` trong prerequisites. Với mỗi node đó, kiểm tra xem
 * điều kiện mở khóa (ALL / ANY) đã thỏa chưa → nếu có: unlock + notify.
 */
async function triggerUnlockDependents(doneNodeId: string): Promise<void> {
  const db = getDb();

  // Lấy tất cả node đang locked có prerequisite = doneNodeId
  const q = query(
    collection(db, NODES),
    where("prerequisites", "array-contains", doneNodeId),
    where("status", "==", "locked")
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  // Lấy trạng thái của tất cả prerequisite-node một lần (batch getDoc)
  const batch = writeBatch(db);
  const unlockedNodes: WorkNode[] = [];

  for (const docSnap of snap.docs) {
    const node = docSnap.data() as WorkNode;
    const prereqs = node.prerequisites;

    const prereqStatuses = await Promise.all(
      prereqs.map(async (pid) => {
        const pSnap = await getDoc(doc(db, NODES, pid));
        return (pSnap.data() as WorkNode | undefined)?.status ?? "locked";
      })
    );

    const allDone = prereqStatuses.every((s) => s === "completed");
    const anyDone = prereqStatuses.some((s) => s === "completed");
    const shouldUnlock = node.prerequisiteMode === "ALL" ? allDone : anyDone;

    if (shouldUnlock) {
      batch.update(docSnap.ref, { status: "pending", updatedAt: now() });
      unlockedNodes.push(node);
    }
  }

  await batch.commit();

  // Notify mỗi assignee sau khi batch commit thành công
  await Promise.all(
    unlockedNodes.map((node) =>
      notifNodeUnlocked({
        recipientId: node.assigneeId,
        nodeId: node.id,
        nodeName: node.name,
        rootTaskId: node.rootTaskId,
      }).catch(() => {})
    )
  );
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export interface CreateNodePayload {
  rootTaskId: string;
  parentId?: string | null;
  name: string;
  description?: string;
  assigneeId: string;
  assigneeName: string;
  approverIds?: string[];
  inputResources?: InputResource[];
  prerequisites?: string[];
  prerequisiteMode?: PrerequisiteMode;
  startDate?: string;
  dueDate: string;
  checklist?: Array<{ label: string }>;
  createdBy: string;
  createdByName: string;
}

export async function createWorkNode(
  payload: CreateNodePayload
): Promise<WorkNode> {
  const db    = getDb();
  const nodeId = generateId("node");
  const ts     = now();

  // Xác định ancestors từ parentId
  let ancestors: string[] = [payload.rootTaskId];
  let depth = 1;

  if (payload.parentId) {
    const parentSnap = await getDoc(doc(db, NODES, payload.parentId));
    if (!parentSnap.exists()) throw new Error("Parent node không tồn tại.");
    const parent = parentSnap.data() as WorkNode;
    ancestors = [...parent.ancestors, payload.parentId];
    depth     = parent.depth + 1;
  }

  // Tính ngân sách từ InputResource type=budget
  const inputResources = payload.inputResources ?? [];
  const budget = inputResources
    .filter((r) => r.type === "budget")
    .reduce((s, r) => s + (r.amount ?? 0), 0) || undefined;

  // Nếu có prerequisites chưa hoàn thành → khóa node
  const prereqs = payload.prerequisites ?? [];
  let initialStatus: NodeStatus = "pending";

  if (prereqs.length > 0) {
    const prereqDocs = await Promise.all(
      prereqs.map((pid) => getDoc(doc(db, NODES, pid)))
    );
    const prereqStatuses = prereqDocs.map(
      (s) => (s.data() as WorkNode | undefined)?.status ?? "locked"
    );
    const mode = payload.prerequisiteMode ?? "ALL";
    const allDone = prereqStatuses.every((s) => s === "completed");
    const anyDone = prereqStatuses.some((s) => s === "completed");
    const isUnlocked = mode === "ALL" ? allDone : anyDone;
    initialStatus = isUnlocked ? "pending" : "locked";
  }

  // Xây dựng checklist
  const checklist: NodeChecklistItem[] = (payload.checklist ?? []).map((c) => ({
    id: generateId("chk"),
    label: c.label,
    completed: false,
  }));

  const node: WorkNode = {
    id: nodeId,
    rootTaskId: payload.rootTaskId,
    parentId: payload.parentId ?? null,
    ancestors,
    depth,
    name: payload.name,
    ...(payload.description ? { description: payload.description } : {}),
    assigneeId: payload.assigneeId,
    assigneeName: payload.assigneeName,
    approverIds: payload.approverIds ?? [],
    inputResources,
    prerequisites: prereqs,
    prerequisiteMode: payload.prerequisiteMode ?? "ALL",
    ...(payload.startDate ? { startDate: payload.startDate } : {}),
    dueDate: payload.dueDate,
    ...(budget !== undefined ? { budget } : {}),
    checklist,
    status: initialStatus,
    progress: 0,
    outputAttachments: [],
    createdAt: ts,
    updatedAt: ts,
    createdBy: payload.createdBy,
    createdByName: payload.createdByName,
  };

  await setDoc(doc(db, NODES, nodeId), stripUndef(node));
  return node;
}

// ─── READ ─────────────────────────────────────────────────────────────────────

export async function getWorkNode(nodeId: string): Promise<WorkNode | null> {
  const snap = await getDoc(doc(getDb(), NODES, nodeId));
  return snap.exists() ? (snap.data() as WorkNode) : null;
}

/** Lấy tất cả node của một task (index: rootTaskId) */
export async function getNodesByTask(rootTaskId: string): Promise<WorkNode[]> {
  const snap = await getDocs(
    query(collection(getDb(), NODES), where("rootTaskId", "==", rootTaskId))
  );
  return snap.docs.map((d) => d.data() as WorkNode);
}

/** Lấy toàn bộ cây con của một node (index: ancestors array-contains) */
export async function getSubtree(nodeId: string): Promise<WorkNode[]> {
  const snap = await getDocs(
    query(collection(getDb(), NODES), where("ancestors", "array-contains", nodeId))
  );
  return snap.docs.map((d) => d.data() as WorkNode);
}

// ─── UPDATE (checklist, cost, progress) ──────────────────────────────────────

export async function updateNodeChecklist(
  nodeId: string,
  checklist: NodeChecklistItem[]
): Promise<void> {
  const completedCount = checklist.filter((c) => c.completed).length;
  const progress = checklist.length > 0
    ? Math.round((completedCount / checklist.length) * 100)
    : 0;
  await updateDoc(doc(getDb(), NODES, nodeId), {
    checklist,
    progress,
    updatedAt: now(),
  });
}

export async function updateNodeCost(
  nodeId: string,
  actualCost: number
): Promise<{ t3Resources: T3Resources } | null> {
  const node = await getWorkNode(nodeId);
  if (!node) return null;
  const budget = node.budget ?? 0;
  const t3Resources = budget > 0 ? computeT3(budget, actualCost) : undefined;
  await updateDoc(doc(getDb(), NODES, nodeId), stripUndef({
    actualCost,
    t3Resources,
    updatedAt: now(),
  }));
  return t3Resources ? { t3Resources } : null;
}

export async function addOutputAttachment(
  nodeId: string,
  attachment: Omit<OutputAttachment, "id">
): Promise<OutputAttachment> {
  const node = await getWorkNode(nodeId);
  if (!node) throw new Error("Node không tồn tại.");
  const newAttachment: OutputAttachment = { id: generateId("att"), ...attachment };
  const updated = [...node.outputAttachments, newAttachment];
  await updateDoc(doc(getDb(), NODES, nodeId), {
    outputAttachments: updated,
    updatedAt: now(),
  });
  return newAttachment;
}

export async function removeOutputAttachment(
  nodeId: string,
  attachmentId: string
): Promise<void> {
  const node = await getWorkNode(nodeId);
  if (!node) throw new Error("Node không tồn tại.");
  await updateDoc(doc(getDb(), NODES, nodeId), {
    outputAttachments: node.outputAttachments.filter((a) => a.id !== attachmentId),
    updatedAt: now(),
  });
}

// ─── SUBMIT FOR REVIEW ────────────────────────────────────────────────────────

/**
 * Người thực hiện nộp nghiệm thu.
 * VALIDATION: outputAttachments phải có ít nhất 1 mục.
 */
export async function submitNodeForReview(nodeId: string): Promise<void> {
  const node = await getWorkNode(nodeId);
  if (!node) throw new Error("Node không tồn tại.");

  if (!["in_progress", "rejected"].includes(node.status)) {
    throw new Error(`Không thể nộp nghiệm thu khi node đang ở trạng thái "${node.status}".`);
  }

  // ── VALIDATION bắt buộc ──────────────────────────────────────
  if (node.outputAttachments.length === 0) {
    throw new Error(
      "Bắt buộc phải có ít nhất một Đầu ra (file, link hoặc text) trước khi nộp nghiệm thu."
    );
  }

  await updateDoc(doc(getDb(), NODES, nodeId), {
    status: "review",
    updatedAt: now(),
  });

  if (node.approverIds?.length) {
    await notifNodeSubmitted({
      approverIds: node.approverIds,
      nodeId,
      nodeName: node.name,
      rootTaskId: node.rootTaskId,
      submitterName: node.assigneeName,
    }).catch(() => {});
  }
}

// ─── EVALUATE (T2) ────────────────────────────────────────────────────────────

/**
 * Người phê duyệt đánh giá chất lượng (T2) và quyết định accept / reject.
 */
export async function evaluateNode(
  nodeId: string,
  payload: {
    verdict: "pass" | "fail";
    rating: 1 | 2 | 3 | 4 | 5;
    evaluatorId: string;
    evaluatorName: string;
    note?: string;
    rejectedReason?: string;
  }
): Promise<WorkNode> {
  const node = await getWorkNode(nodeId);
  if (!node) throw new Error("Node không tồn tại.");
  if (node.status !== "review") {
    throw new Error("Chỉ có thể đánh giá node đang ở trạng thái 'review'.");
  }

  const evaluatedAt = now();
  const t2Quality: T2Quality = {
    rating: payload.rating,
    verdict: payload.verdict,
    evaluatorId: payload.evaluatorId,
    evaluatorName: payload.evaluatorName,
    evaluatedAt,
    ...(payload.note ? { note: payload.note } : {}),
  };

  if (payload.verdict === "fail") {
    await updateDoc(doc(getDb(), NODES, nodeId), {
      status: "rejected",
      t2Quality,
      updatedAt: evaluatedAt,
    });
    await notifNodeEvaluated({
      recipientId: node.assigneeId,
      nodeId,
      nodeName: node.name,
      rootTaskId: node.rootTaskId,
      passed: false,
      rating: payload.rating,
      evaluatorName: payload.evaluatorName,
      note: payload.rejectedReason ?? payload.note,
    }).catch(() => {});
    return (await getWorkNode(nodeId))!;
  }

  // verdict === "pass" → complete node + tính T1 + T3 + trigger unlock
  const completed = await completeNode(nodeId, t2Quality);
  await notifNodeEvaluated({
    recipientId: node.assigneeId,
    nodeId,
    nodeName: node.name,
    rootTaskId: node.rootTaskId,
    passed: true,
    rating: payload.rating,
    evaluatorName: payload.evaluatorName,
    note: payload.note,
  }).catch(() => {});
  return completed;
}

// ─── COMPLETE (T1 + T3 auto-calc + trigger) ───────────────────────────────────

async function completeNode(
  nodeId: string,
  t2Quality?: T2Quality
): Promise<WorkNode> {
  const node = await getWorkNode(nodeId);
  if (!node) throw new Error("Node không tồn tại.");

  const completedAt = now();

  // T1 — Tiến độ
  const t1Timeliness = computeT1(completedAt, node.dueDate);

  // T3 — Tài nguyên (chỉ tính nếu có budget và actualCost)
  const t3Resources = (node.budget && node.actualCost !== undefined)
    ? computeT3(node.budget, node.actualCost)
    : undefined;

  const updates: Partial<WorkNode> = {
    status: "completed",
    progress: 100,
    t1Timeliness,
    ...(t2Quality ? { t2Quality } : {}),
    ...(t3Resources ? { t3Resources } : {}),
    updatedAt: completedAt,
  };

  await updateDoc(doc(getDb(), NODES, nodeId), stripUndef(updates as object));

  // Trigger: mở khóa các node dependent
  await triggerUnlockDependents(nodeId);

  return (await getWorkNode(nodeId))!;
}
