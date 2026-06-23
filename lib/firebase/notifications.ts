/**
 * lib/firebase/notifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper tập trung cho toàn bộ hệ thống thông báo.
 *
 * Cách dùng:
 *   import { notify, notifyMany } from "@/lib/firebase/notifications";
 *
 * Mọi module (firestore, finance, workNodes, ...) đều import từ đây.
 * Tránh duplicate code viết notification ở nhiều chỗ.
 */

import { doc, setDoc, getDocs, collection, query, where, writeBatch } from "firebase/firestore";
import { getDb } from "./config";
import { generateId } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types";

// ─── Core helpers ─────────────────────────────────────────────────────────────

type NotifPayload = Omit<Notification, "id" | "userId" | "read" | "createdAt">;

/** Gửi thông báo đến 1 người */
export async function notify(userId: string, payload: NotifPayload): Promise<void> {
  if (!userId) return;
  const db  = getDb();
  const id  = generateId("notif");
  const now = new Date().toISOString();
  await setDoc(doc(db, "notifications", userId, "items", id), {
    id,
    userId,
    read: false,
    createdAt: now,
    ...payload,
  } satisfies Notification);
}

/** Gửi thông báo đến nhiều người cùng lúc (batch write, bỏ qua trùng userId) */
export async function notifyMany(
  userIds: string[],
  payload: NotifPayload
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  const db  = getDb();
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  for (const userId of unique) {
    const id = generateId("notif");
    batch.set(doc(db, "notifications", userId, "items", id), {
      id,
      userId,
      read: false,
      createdAt: now,
      ...payload,
    } satisfies Notification);
  }
  await batch.commit();
}

/** Lấy userId của tất cả user có role trong danh sách (dùng cho finance approvals) */
export async function getUserIdsByRoles(roles: string[]): Promise<string[]> {
  const db   = getDb();
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "in", roles))
  );
  return snap.docs.map((d) => d.id);
}

// ─── Task notifications ───────────────────────────────────────────────────────

export function notifTaskCreated(opts: {
  recipientIds: string[];
  taskId: string;
  taskName: string;
  creatorName: string;
}) {
  return notifyMany(opts.recipientIds, {
    type: "task_created",
    title: "Nhiệm vụ mới được tạo",
    body: `"${opts.taskName}" vừa được tạo bởi ${opts.creatorName}. Bạn có liên quan đến nhiệm vụ này.`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: false,
  });
}

export function notifTaskAssigned(opts: {
  recipientId: string;
  taskId: string;
  taskName: string;
  assigner: string;
}) {
  return notify(opts.recipientId, {
    type: "task_assigned",
    title: "Bạn được phân công nhiệm vụ",
    body: `${opts.assigner} đã phân công bạn vào nhiệm vụ "${opts.taskName}".`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: true,
  });
}

export function notifApprovalRequest(opts: {
  recipientIds: string[];
  taskId: string;
  taskName: string;
  submitterName: string;
}) {
  return notifyMany(opts.recipientIds, {
    type: "approval_request",
    title: "Yêu cầu phê duyệt nhiệm vụ",
    body: `${opts.submitterName} đã nộp nhiệm vụ "${opts.taskName}" để xét duyệt. Vui lòng kiểm tra và phê duyệt.`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "urgent",
    actionRequired: true,
  });
}

export function notifTaskCompleted(opts: {
  recipientIds: string[];
  taskId: string;
  taskName: string;
  completerName: string;
}) {
  return notifyMany(opts.recipientIds, {
    type: "task_completed",
    title: "Nhiệm vụ đã hoàn thành",
    body: `Nhiệm vụ "${opts.taskName}" đã được hoàn thành bởi ${opts.completerName}.`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: false,
  });
}

export function notifStatusChanged(opts: {
  recipientIds: string[];
  taskId: string;
  taskName: string;
  newStatus: string;
  actorName: string;
}) {
  const statusLabel: Record<string, string> = {
    todo: "Chờ thực hiện", in_progress: "Đang thực hiện",
    review: "Đang xét duyệt", done: "Hoàn thành", cancelled: "Đã hủy",
  };
  return notifyMany(opts.recipientIds, {
    type: "status_changed",
    title: "Cập nhật trạng thái nhiệm vụ",
    body: `Nhiệm vụ "${opts.taskName}" chuyển sang "${statusLabel[opts.newStatus] ?? opts.newStatus}" bởi ${opts.actorName}.`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "low",
    actionRequired: false,
  });
}

// ─── Finance — Tạm ứng ───────────────────────────────────────────────────────

export function notifAdvanceCreated(opts: {
  approverIds: string[];
  taskId: string;
  taskName: string;
  requesterName: string;
  amount: number;
  advanceId: string;
}) {
  const vnd = (n: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
  return notifyMany(opts.approverIds, {
    type: "advance_created",
    title: "Yêu cầu tạm ứng mới",
    body: `${opts.requesterName} xin tạm ứng ${vnd(opts.amount)} cho nhiệm vụ "${opts.taskName}". Vui lòng phê duyệt.`,
    link: `/finance?tab=advances&task=${opts.taskId}`,
    taskId: opts.taskId,
    priority: "urgent",
    actionRequired: true,
  });
}

export function notifAdvanceApproved(opts: {
  recipientId: string;
  taskId: string;
  taskName: string;
  approverName: string;
  amount: number;
}) {
  const vnd = (n: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
  return notify(opts.recipientId, {
    type: "advance_approved",
    title: "Đơn tạm ứng được duyệt",
    body: `${opts.approverName} đã duyệt khoản tạm ứng ${vnd(opts.amount)} cho nhiệm vụ "${opts.taskName}".`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: false,
  });
}

export function notifAdvanceRejected(opts: {
  recipientId: string;
  taskId: string;
  taskName: string;
  reason: string;
}) {
  return notify(opts.recipientId, {
    type: "advance_rejected",
    title: "Đơn tạm ứng bị từ chối",
    body: `Đơn tạm ứng cho nhiệm vụ "${opts.taskName}" bị từ chối. Lý do: ${opts.reason}`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "urgent",
    actionRequired: false,
  });
}

export function notifAdvanceSettlementSubmitted(opts: {
  approverIds: string[];
  taskId: string;
  taskName: string;
  requesterName: string;
  advanceId: string;
}) {
  return notifyMany(opts.approverIds, {
    type: "advance_settlement_submitted",
    title: "Yêu cầu quyết toán tạm ứng",
    body: `${opts.requesterName} đã nộp quyết toán tạm ứng cho nhiệm vụ "${opts.taskName}". Vui lòng xem xét.`,
    link: `/finance?tab=advances&task=${opts.taskId}`,
    taskId: opts.taskId,
    priority: "urgent",
    actionRequired: true,
  });
}

export function notifAdvanceSettlementResult(opts: {
  recipientId: string;
  taskId: string;
  taskName: string;
  approved: boolean;
  reason?: string;
}) {
  return notify(opts.recipientId, {
    type: opts.approved ? "advance_settlement_approved" : "advance_settlement_rejected",
    title: opts.approved ? "Quyết toán tạm ứng được duyệt" : "Quyết toán tạm ứng bị từ chối",
    body: opts.approved
      ? `Quyết toán tạm ứng cho nhiệm vụ "${opts.taskName}" đã được phê duyệt.`
      : `Quyết toán tạm ứng cho nhiệm vụ "${opts.taskName}" bị từ chối. Lý do: ${opts.reason ?? ""}`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: !opts.approved,
  });
}

// ─── Finance — Hoàn ứng ──────────────────────────────────────────────────────

export function notifReimbursementSubmitted(opts: {
  approverIds: string[];
  taskId: string;
  taskName: string;
  requesterName: string;
  amount: number;
}) {
  const vnd = (n: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
  return notifyMany(opts.approverIds, {
    type: "reimbursement_submitted",
    title: "Yêu cầu hoàn ứng mới",
    body: `${opts.requesterName} yêu cầu hoàn ứng ${vnd(opts.amount)} cho nhiệm vụ "${opts.taskName}".`,
    link: `/finance?tab=reimbursements&task=${opts.taskId}`,
    taskId: opts.taskId,
    priority: "urgent",
    actionRequired: true,
  });
}

export function notifReimbursementApproved(opts: {
  recipientId: string;
  taskId: string;
  taskName: string;
  approverName: string;
}) {
  return notify(opts.recipientId, {
    type: "reimbursement_approved",
    title: "Yêu cầu hoàn ứng được duyệt",
    body: `${opts.approverName} đã duyệt yêu cầu hoàn ứng cho nhiệm vụ "${opts.taskName}". Chờ chi trả.`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: false,
  });
}

export function notifReimbursementPaid(opts: {
  recipientId: string;
  taskId: string;
  taskName: string;
  amount: number;
}) {
  const vnd = (n: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
  return notify(opts.recipientId, {
    type: "reimbursement_paid",
    title: "Hoàn ứng đã được chi trả",
    body: `Khoản hoàn ứng ${vnd(opts.amount)} cho nhiệm vụ "${opts.taskName}" đã được thanh toán.`,
    link: `/tasks/${opts.taskId}`,
    taskId: opts.taskId,
    priority: "normal",
    actionRequired: false,
  });
}

// ─── WorkNode ─────────────────────────────────────────────────────────────────

export function notifNodeUnlocked(opts: {
  recipientId: string;
  nodeId: string;
  nodeName: string;
  rootTaskId: string;
}) {
  return notify(opts.recipientId, {
    type: "node_unlocked",
    title: "Công việc đã được mở khóa",
    body: `Node "${opts.nodeName}" đã sẵn sàng để bắt đầu thực hiện.`,
    link: `/tasks/${opts.rootTaskId}?node=${opts.nodeId}`,
    taskId: opts.rootTaskId,
    priority: "normal",
    actionRequired: true,
  });
}

export function notifNodeSubmitted(opts: {
  approverIds: string[];
  nodeId: string;
  nodeName: string;
  rootTaskId: string;
  submitterName: string;
}) {
  return notifyMany(opts.approverIds, {
    type: "node_submitted",
    title: "Yêu cầu nghiệm thu công việc",
    body: `${opts.submitterName} đã nộp nghiệm thu node "${opts.nodeName}". Vui lòng kiểm tra đầu ra và phê duyệt.`,
    link: `/tasks/${opts.rootTaskId}?node=${opts.nodeId}&remind=1`,
    taskId: opts.rootTaskId,
    priority: "urgent",
    actionRequired: true,
  });
}

export function notifNodeEvaluated(opts: {
  recipientId: string;
  nodeId: string;
  nodeName: string;
  rootTaskId: string;
  passed: boolean;
  rating: number;
  evaluatorName: string;
  note?: string;
}) {
  return notify(opts.recipientId, {
    type: opts.passed ? "node_approved" : "node_rejected",
    title: opts.passed ? `Node được duyệt (${opts.rating}★)` : `Node bị từ chối (${opts.rating}★)`,
    body: opts.passed
      ? `${opts.evaluatorName} đã phê duyệt node "${opts.nodeName}". ${opts.note ?? ""}`
      : `${opts.evaluatorName} từ chối node "${opts.nodeName}". Vui lòng chỉnh sửa và nộp lại. ${opts.note ?? ""}`,
    link: `/tasks/${opts.rootTaskId}?node=${opts.nodeId}${opts.passed ? "" : "&remind=1"}`,
    taskId: opts.rootTaskId,
    priority: opts.passed ? "normal" : "urgent",
    actionRequired: !opts.passed,
  });
}
