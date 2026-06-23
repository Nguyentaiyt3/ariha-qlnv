/**
 * lib/firebase/finance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tất cả thao tác Firestore cho module tài chính.
 *
 * Schema Firestore:
 *   /tasks/{taskId}/transactions/{txId}     — Giao dịch thu/chi
 *   /tasks/{taskId}/financialSummary/current — Tổng hợp (denormalized)
 *   /advanceRequests/{reqId}                — Đơn tạm ứng
 *   /reimbursementRequests/{reqId}          — Đơn hoàn ứng
 *
 * Nguyên tắc nhất quán số liệu:
 *   • Mọi thay đổi số dư dùng runTransaction (Firestore atomic transaction)
 *     để tránh race condition khi nhiều người cùng chi tiêu.
 *   • Sau mỗi thay đổi giao dịch, summary được tái tính lại (recompute).
 *   • OUT_OF_POCKET PHẢI có ít nhất 1 chứng từ → status bắt đầu là PENDING_PROOF.
 */

import {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, runTransaction, onSnapshot,
  writeBatch, Timestamp,
} from "firebase/firestore";
import { getDb } from "./config";
import { generateId } from "@/lib/utils";
import {
  notifAdvanceCreated, notifAdvanceApproved, notifAdvanceRejected,
  notifAdvanceSettlementSubmitted, notifAdvanceSettlementResult,
  notifReimbursementSubmitted, notifReimbursementApproved, notifReimbursementPaid,
  getUserIdsByRoles,
} from "./notifications";
import type {
  FinancialTransaction, AdvanceRequest, ReimbursementRequest,
  TaskFinancialSummary, FinancialProof,
} from "@/types";

// ── Hằng số ──────────────────────────────────────────────────────────────────

/** Danh mục chi tiêu mặc định */
export const EXPENSE_CATEGORIES = [
  "Vật tư / Thiết bị",
  "Đi lại / Vận chuyển",
  "Ăn uống / Tiếp khách",
  "Thuê mướn / Dịch vụ",
  "In ấn / Văn phòng phẩm",
  "Sửa chữa / Bảo trì",
  "Khác",
] as const;

// ── Helpers nội bộ ───────────────────────────────────────────────────────────

/** Lấy summary doc ref */
const summaryRef = (db: ReturnType<typeof getDb>, taskId: string) =>
  doc(db, "tasks", taskId, "financialSummary", "current");

/** Strip undefined fields trước khi ghi Firestore */
function stripUndef<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

// ── Tái tính tổng hợp tài chính ──────────────────────────────────────────────

/**
 * Tái tính TaskFinancialSummary từ dữ liệu gốc.
 * Gọi sau mỗi thao tác thay đổi giao dịch hoặc trạng thái tạm ứng.
 */
export async function recomputeFinancialSummary(
  taskId: string,
  budget: number = 0
): Promise<TaskFinancialSummary> {
  const db = getDb();

  // 1. Lấy toàn bộ giao dịch không bị từ chối
  const txSnap = await getDocs(
    query(
      collection(db, "tasks", taskId, "transactions"),
      where("status", "!=", "REJECTED"),
    )
  );
  const transactions = txSnap.docs.map((d) => d.data() as FinancialTransaction);

  // 2. Lấy tổng tạm ứng đã được duyệt (APPROVED hoặc SETTLED)
  const advSnap = await getDocs(
    query(
      collection(db, "advanceRequests"),
      where("taskId", "==", taskId),
      where("status", "in", ["APPROVED", "SETTLED"]),
    )
  );
  const advances = advSnap.docs.map((d) => d.data() as AdvanceRequest);

  // 3. Lấy tổng chờ hoàn ứng (OUT_OF_POCKET chưa PAID)
  const reimSnap = await getDocs(
    query(
      collection(db, "reimbursementRequests"),
      where("taskId", "==", taskId),
      where("status", "in", ["DRAFT", "SUBMITTED", "APPROVED"]),
    )
  );
  const pendingReimbs = reimSnap.docs.map((d) => d.data() as ReimbursementRequest);

  // 4. Tính các tổng
  const totalAdvanced = advances.reduce((s, a) => s + a.amount, 0);

  const totalAdvanceUsed = transactions
    .filter((t) => t.fundSource === "ADVANCE" && t.direction === "DEBIT")
    .reduce((s, t) => s + t.amount, 0);

  const totalOutOfPocket = transactions
    .filter((t) => t.fundSource === "OUT_OF_POCKET" && t.direction === "DEBIT")
    .reduce((s, t) => s + t.amount, 0);

  const totalRevenue = transactions
    .filter((t) => t.fundSource === "REVENUE" && t.direction === "CREDIT")
    .reduce((s, t) => s + t.amount, 0);

  const totalPendingReimbursement = pendingReimbs.reduce((s, r) => s + r.amount, 0);
  const totalExpense = totalAdvanceUsed + totalOutOfPocket;

  // Lấy budget + taskName từ task document
  const taskDoc = await getDoc(doc(db, "tasks", taskId));
  const taskData = taskDoc.data();
  const effectiveBudget = budget > 0 ? budget : ((taskData?.budget as number) ?? 0);
  const taskName = (taskData?.name as string) ?? taskId;

  const summary: TaskFinancialSummary = {
    taskId,
    taskName,
    budget: effectiveBudget,
    totalAdvanced,
    totalAdvanceUsed,
    totalAdvanceRemaining: totalAdvanced - totalAdvanceUsed,
    totalOutOfPocket,
    totalPendingReimbursement,
    totalRevenue,
    totalExpense,
    netCashFlow: totalRevenue - totalExpense,
    budgetUtilizationPct: effectiveBudget > 0
      ? Math.round((totalExpense / effectiveBudget) * 100)
      : 0,
    financialStatus: "ACTIVE",
    lastUpdated: new Date().toISOString(),
  };

  // 5. Lưu summary (merge để không xoá financialStatus đã set)
  await setDoc(summaryRef(db, taskId), summary, { merge: true });
  return summary;
}

// ── Giao dịch tài chính (FinancialTransaction) ───────────────────────────────

/** Lấy danh sách giao dịch của task */
export async function getTransactions(taskId: string): Promise<FinancialTransaction[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "tasks", taskId, "transactions"),
      orderBy("createdAt", "desc"),
    )
  );
  return snap.docs.map((d) => d.data() as FinancialTransaction);
}

/** Subscribe realtime giao dịch */
export function subscribeTransactions(
  taskId: string,
  callback: (txs: FinancialTransaction[]) => void
) {
  const db = getDb();
  return onSnapshot(
    query(
      collection(db, "tasks", taskId, "transactions"),
      orderBy("createdAt", "desc"),
    ),
    (snap) => callback(snap.docs.map((d) => d.data() as FinancialTransaction)),
    (err) => console.error("[subscribeTransactions]", err.code, err.message)
  );
}

/**
 * Tạo giao dịch tài chính mới.
 * Logic nghiệp vụ:
 *  • ADVANCE    → Phải có đơn tạm ứng APPROVED, kiểm tra số dư, trừ remainingAmount
 *  • OUT_OF_POCKET → Status bắt đầu là PENDING_PROOF, tự tạo ReimbursementRequest nháp
 *  • REVENUE    → Không cần chứng từ bắt buộc, status VALID ngay
 */
export async function createTransaction(payload: {
  taskId: string;
  stepId?: string;
  createdBy: string;
  createdByName: string;
  amount: number;
  direction: FinancialTransaction["direction"];
  fundSource: FinancialTransaction["fundSource"];
  category: string;
  description: string;
  advanceRequestId?: string; // Bắt buộc nếu fundSource = ADVANCE
  proofs?: FinancialProof[];
}): Promise<{ transaction: FinancialTransaction; reimbursementRequest?: ReimbursementRequest }> {
  const db = getDb();
  const txId = generateId("tx");
  const now = new Date().toISOString();

  // ── Đọc tên nhiệm vụ để denormalize vào giao dịch ────────────
  const taskSnap = await getDoc(doc(db, "tasks", payload.taskId));
  const taskName = (taskSnap.data()?.name as string | undefined) ?? payload.taskId;

  // ── Validate số tiền ──────────────────────────────────────────
  if (payload.amount <= 0) throw new Error("Số tiền phải lớn hơn 0.");

  // ── Xác định trạng thái ban đầu ──────────────────────────────
  // OUT_OF_POCKET: BẮT BUỘC có chứng từ → PENDING_PROOF nếu thiếu
  // ADVANCE     : Cần kiểm tra số dư → sẽ validate bên dưới
  // REVENUE     : Không yêu cầu chứng từ → VALID ngay
  const hasProofs = (payload.proofs?.length ?? 0) > 0;
  let initialStatus: FinancialTransaction["status"] = "VALID";

  if (payload.fundSource === "OUT_OF_POCKET" && !hasProofs) {
    initialStatus = "PENDING_PROOF";
  }

  let reimbursementRequest: ReimbursementRequest | undefined;

  // ── Xử lý theo từng loại nguồn tiền ──────────────────────────

  if (payload.fundSource === "ADVANCE") {
    // Phải chỉ định đơn tạm ứng và đơn phải được duyệt
    if (!payload.advanceRequestId) {
      throw new Error("Giao dịch từ tạm ứng phải liên kết với đơn tạm ứng đã duyệt.");
    }

    const advRef = doc(db, "advanceRequests", payload.advanceRequestId);

    // runTransaction đảm bảo atomic: đọc → kiểm tra → ghi cùng lúc
    await runTransaction(db, async (t) => {
      const advSnap = await t.get(advRef);
      if (!advSnap.exists()) throw new Error("Đơn tạm ứng không tồn tại.");

      const adv = advSnap.data() as AdvanceRequest;
      if (adv.status !== "APPROVED") {
        throw new Error("Đơn tạm ứng chưa được duyệt hoặc đã quyết toán.");
      }
      if (adv.taskId !== payload.taskId) {
        throw new Error("Đơn tạm ứng không thuộc nhiệm vụ này.");
      }
      if (adv.remainingAmount < payload.amount) {
        throw new Error(
          `Số dư tạm ứng không đủ. Còn lại: ${adv.remainingAmount.toLocaleString("vi-VN")} đ, ` +
          `cần chi: ${payload.amount.toLocaleString("vi-VN")} đ.`
        );
      }

      // Trừ số dư tạm ứng
      t.update(advRef, {
        usedAmount: adv.usedAmount + payload.amount,
        remainingAmount: adv.remainingAmount - payload.amount,
        updatedAt: now,
      });
    });
  }

  if (payload.fundSource === "OUT_OF_POCKET") {
    // Tự động tạo ReimbursementRequest ở trạng thái DRAFT
    const reimId = generateId("reim");
    const reimStatus: ReimbursementRequest["status"] = hasProofs ? "SUBMITTED" : "DRAFT";
    reimbursementRequest = {
      id: reimId,
      taskId: payload.taskId,
      transactionId: txId,
      requestedBy: payload.createdBy,
      requestedByName: payload.createdByName,
      amount: payload.amount,
      description: payload.description,
      proofs: payload.proofs ?? [],
      status: reimStatus,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(
      doc(db, "reimbursementRequests", reimId),
      stripUndef(reimbursementRequest)
    );

    // Nếu đã có chứng từ ngay → thông báo approver luôn
    if (reimStatus === "SUBMITTED") {
      const approverIds = await getUserIdsByRoles(["director", "hrAdmin"]).catch(() => []);
      const toNotify = approverIds.filter((uid) => uid !== payload.createdBy);
      if (toNotify.length > 0) {
        await notifReimbursementSubmitted({
          approverIds: toNotify,
          taskId: payload.taskId,
          taskName: taskName ?? payload.taskId,
          requesterName: payload.createdByName,
          amount: payload.amount,
        }).catch(() => {});
      }
    }
  }

  // ── Tạo giao dịch ────────────────────────────────────────────
  const transaction: FinancialTransaction = {
    id: txId,
    taskId: payload.taskId,
    taskName,
    createdBy: payload.createdBy,
    createdByName: payload.createdByName,
    amount: payload.amount,
    direction: payload.direction,
    fundSource: payload.fundSource,
    category: payload.category,
    description: payload.description,
    proofs: payload.proofs ?? [],
    status: initialStatus,
    createdAt: now,
    updatedAt: now,
    ...(payload.stepId ? { stepId: payload.stepId } : {}),
    ...(payload.advanceRequestId ? { advanceRequestId: payload.advanceRequestId } : {}),
    ...(reimbursementRequest ? { reimbursementRequestId: reimbursementRequest.id } : {}),
  };

  await setDoc(
    doc(db, "tasks", payload.taskId, "transactions", txId),
    stripUndef(transaction)
  );

  // ── Cập nhật summary ─────────────────────────────────────────
  await recomputeFinancialSummary(payload.taskId);

  return { transaction, reimbursementRequest };
}

/** Upload chứng từ vào giao dịch và cập nhật trạng thái */
export async function addProofToTransaction(
  taskId: string,
  transactionId: string,
  proof: FinancialProof
): Promise<void> {
  const db = getDb();
  const txRef = doc(db, "tasks", taskId, "transactions", transactionId);
  const snap = await getDoc(txRef);
  if (!snap.exists()) throw new Error("Giao dịch không tồn tại.");

  const tx = snap.data() as FinancialTransaction;
  const updatedProofs = [...tx.proofs, proof];

  // Nếu đang PENDING_PROOF và đã có chứng từ → chuyển sang VALID
  const newStatus: FinancialTransaction["status"] =
    tx.status === "PENDING_PROOF" && updatedProofs.length > 0 ? "VALID" : tx.status;

  await updateDoc(txRef, {
    proofs: updatedProofs,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  });

  // Nếu là OUT_OF_POCKET và có liên kết ReimbursementRequest → cập nhật luôn
  if (tx.reimbursementRequestId) {
    const reimRef = doc(db, "reimbursementRequests", tx.reimbursementRequestId);
    const reimSnap = await getDoc(reimRef);
    if (reimSnap.exists()) {
      const reim = reimSnap.data() as ReimbursementRequest;
      const wasDraft = reim.status === "DRAFT";
      await updateDoc(reimRef, {
        proofs: [...reim.proofs, proof],
        status: wasDraft ? "SUBMITTED" : reim.status,
        submittedAt: wasDraft ? new Date().toISOString() : reim.submittedAt,
        updatedAt: new Date().toISOString(),
      });

      // Khi DRAFT → SUBMITTED: thông báo approver
      if (wasDraft) {
        const approverIds = await getUserIdsByRoles(["director", "hrAdmin"]).catch(() => []);
        const toNotify = approverIds.filter((uid) => uid !== tx.createdBy);
        if (toNotify.length > 0) {
          const taskSnap = await getDoc(doc(db, "tasks", taskId)).catch(() => null);
          const tName = (taskSnap?.data()?.name as string | undefined) ?? taskId;
          await notifReimbursementSubmitted({
            approverIds: toNotify,
            taskId,
            taskName: tName,
            requesterName: tx.createdByName,
            amount: reim.amount,
          }).catch(() => {});
        }
      }
    }
  }

  await recomputeFinancialSummary(taskId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Sort mới nhất lên đầu (client-side, tránh composite index Firestore) */
function byDateDesc<T extends { createdAt: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Tạm ứng (AdvanceRequest) ──────────────────────────────────────────────────

export async function getAdvanceRequests(taskId: string): Promise<AdvanceRequest[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "advanceRequests"), where("taskId", "==", taskId))
  );
  return byDateDesc(snap.docs.map((d) => d.data() as AdvanceRequest));
}

/** Subscribe realtime đơn tạm ứng của 1 task */
export function subscribeAdvanceRequests(
  taskId: string,
  callback: (requests: AdvanceRequest[]) => void
) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "advanceRequests"), where("taskId", "==", taskId)),
    (snap) => callback(byDateDesc(snap.docs.map((d) => d.data() as AdvanceRequest))),
    (err) => console.error("[subscribeAdvanceRequests]", err.code, err.message)
  );
}

export async function createAdvanceRequest(payload: {
  taskId: string;
  stepId?: string;
  stepName?: string;
  requestedBy: string;
  requestedByName: string;
  amount: number;
  purpose: string;
  bankAccount?: import("@/types").BankAccount;
}): Promise<AdvanceRequest> {
  const db = getDb();
  const id = generateId("adv");
  const now = new Date().toISOString();

  if (payload.amount <= 0) throw new Error("Số tiền tạm ứng phải lớn hơn 0.");

  const request: AdvanceRequest = {
    id,
    taskId: payload.taskId,
    ...(payload.stepId      && { stepId:      payload.stepId }),
    ...(payload.stepName    && { stepName:    payload.stepName }),
    ...(payload.bankAccount && { bankAccount: payload.bankAccount }),
    requestedBy: payload.requestedBy,
    requestedByName: payload.requestedByName,
    amount: payload.amount,
    purpose: payload.purpose,
    status: "PENDING",
    usedAmount: 0,
    remainingAmount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, "advanceRequests", id), stripUndef(request));

  // Thông báo cho director + hrAdmin về đơn tạm ứng mới
  const taskSnap = await getDoc(doc(db, "tasks", payload.taskId)).catch(() => null);
  const taskName = (taskSnap?.data()?.name as string | undefined) ?? payload.taskId;
  const approverIds = await getUserIdsByRoles(["director", "hrAdmin"]).catch(() => []);
  const notifApprovers = approverIds.filter((uid) => uid !== payload.requestedBy);
  if (notifApprovers.length > 0) {
    await notifAdvanceCreated({
      approverIds: notifApprovers,
      taskId: payload.taskId,
      taskName,
      requesterName: payload.requestedByName,
      amount: payload.amount,
      advanceId: id,
    }).catch(() => {});
  }

  return request;
}

/** Duyệt đơn tạm ứng — chỉ director/hrAdmin */
export async function approveAdvanceRequest(
  requestId: string,
  approvedBy: string,
  approvedByName: string
): Promise<void> {
  const db = getDb();
  const ref = doc(db, "advanceRequests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Đơn tạm ứng không tồn tại.");

  const adv = snap.data() as AdvanceRequest;
  if (adv.status !== "PENDING") throw new Error("Chỉ có thể duyệt đơn đang chờ.");

  const now = new Date().toISOString();
  await updateDoc(ref, {
    status: "APPROVED",
    approvedBy,
    approvedByName,
    approvedAt: now,
    remainingAmount: adv.amount,
    updatedAt: now,
  });

  // Thông báo cho người yêu cầu
  const taskSnap = await getDoc(doc(db, "tasks", adv.taskId)).catch(() => null);
  const taskName = (taskSnap?.data()?.name as string | undefined) ?? adv.taskId;
  await notifAdvanceApproved({
    recipientId: adv.requestedBy,
    taskId: adv.taskId,
    taskName,
    approverName: approvedByName,
    amount: adv.amount,
  }).catch(() => {});
}

/** Từ chối đơn tạm ứng */
export async function rejectAdvanceRequest(
  requestId: string,
  reason: string
): Promise<void> {
  const db = getDb();
  const snap = await getDoc(doc(db, "advanceRequests", requestId));
  await updateDoc(doc(db, "advanceRequests", requestId), {
    status: "REJECTED",
    rejectedReason: reason,
    updatedAt: new Date().toISOString(),
  });

  if (snap.exists()) {
    const adv = snap.data() as AdvanceRequest;
    const taskSnap = await getDoc(doc(db, "tasks", adv.taskId)).catch(() => null);
    const taskName = (taskSnap?.data()?.name as string | undefined) ?? adv.taskId;
    await notifAdvanceRejected({
      recipientId: adv.requestedBy,
      taskId: adv.taskId,
      taskName,
      reason,
    }).catch(() => {});
  }
}

// ── Quyết toán hoàn ứng (reconcileAdvance) ───────────────────────────────────

/**
 * Quyết toán cuối task: đối chiếu tạm ứng vs thực chi.
 *
 * Công thức:
 *   difference = totalAdvanced - totalActualSpent
 *   > 0 → Nhân viên còn dư, phải trả lại công ty
 *   < 0 → Nhân viên chi vượt, công ty phải chi thêm
 *   = 0 → Cân bằng hoàn toàn
 *
 * Điều kiện quyết toán:
 *   • Task phải ở trạng thái "done" hoặc "review"
 *   • Không có giao dịch PENDING_PROOF nào (bắt buộc hoàn thiện chứng từ)
 */
export async function reconcileAdvance(
  taskId: string,
  settledBy: string
): Promise<{
  totalAdvanced: number;
  totalActualSpent: number;
  difference: number;
  settlementType: AdvanceRequest["settlementType"];
  settledRequests: string[];
}> {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Kiểm tra không còn giao dịch thiếu chứng từ
  const pendingProofSnap = await getDocs(
    query(
      collection(db, "tasks", taskId, "transactions"),
      where("status", "==", "PENDING_PROOF"),
    )
  );
  if (!pendingProofSnap.empty) {
    throw new Error(
      `Còn ${pendingProofSnap.size} giao dịch chưa có chứng từ hợp lệ. ` +
      "Vui lòng bổ sung chứng từ trước khi quyết toán."
    );
  }

  // 2. Lấy tất cả đơn tạm ứng của task rồi filter client-side
  // (tránh composite index: taskId + status)
  const advSnap = await getDocs(
    query(collection(db, "advanceRequests"), where("taskId", "==", taskId))
  );
  const advances = advSnap.docs
    .map((d) => d.data() as AdvanceRequest)
    .filter((a) => a.status === "APPROVED");

  if (advances.length === 0) {
    throw new Error("Không có đơn tạm ứng nào cần quyết toán.");
  }

  // 3. Tính tổng tạm ứng đã cấp
  const totalAdvanced = advances.reduce((s, a) => s + a.amount, 0);

  // 4. Tính tổng thực chi từ tạm ứng — lấy tất cả tx rồi filter client-side
  // (tránh composite index: fundSource + status + direction)
  const txSnap = await getDocs(
    collection(db, "tasks", taskId, "transactions")
  );
  const totalActualSpent = txSnap.docs
    .map((d) => d.data() as FinancialTransaction)
    .filter((t) => t.fundSource === "ADVANCE" && t.status === "VALID" && t.direction === "DEBIT")
    .reduce((s, t) => s + t.amount, 0);

  // 5. Tính chênh lệch và xác định loại quyết toán
  const difference = totalAdvanced - totalActualSpent;
  let settlementType: AdvanceRequest["settlementType"];
  if (difference > 0) settlementType = "RETURN_TO_COMPANY";
  else if (difference < 0) settlementType = "PAY_EMPLOYEE_ADDITIONAL";
  else settlementType = "BALANCED";

  // 6. Cập nhật tất cả đơn tạm ứng sang SETTLED (batch write)
  const batch = writeBatch(db);
  const settledRequests: string[] = [];

  for (const adv of advances) {
    const advRef = doc(db, "advanceRequests", adv.id);
    // Phân bổ chênh lệch theo tỷ lệ nếu có nhiều đơn
    const advDiff = advances.length === 1
      ? difference
      : Math.round((adv.amount / totalAdvanced) * difference);

    batch.update(advRef, {
      status: "SETTLED",
      settledAt: now,
      settlementDifference: advDiff,
      settlementType,
      updatedAt: now,
    });
    settledRequests.push(adv.id);
  }

  await batch.commit();

  // 7. Cập nhật summary
  const summaryRef2 = doc(db, "tasks", taskId, "financialSummary", "current");
  await updateDoc(summaryRef2, {
    financialStatus: "SETTLED",
    lastUpdated: now,
  });

  return { totalAdvanced, totalActualSpent, difference, settlementType, settledRequests };
}

// ── Subscribe summary realtime ────────────────────────────────────────────────

export function subscribeFinancialSummary(
  taskId: string,
  callback: (summary: TaskFinancialSummary | null) => void
) {
  const db = getDb();
  return onSnapshot(
    doc(db, "tasks", taskId, "financialSummary", "current"),
    (snap) => callback(snap.exists() ? (snap.data() as TaskFinancialSummary) : null),
    (err) => console.error("[subscribeFinancialSummary]", err.code, err.message)
  );
}

/** Lấy summary một lần */
export async function getFinancialSummary(taskId: string): Promise<TaskFinancialSummary | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "tasks", taskId, "financialSummary", "current"));
  return snap.exists() ? (snap.data() as TaskFinancialSummary) : null;
}

/** Realtime listener TẤT CẢ financial summaries của toàn hệ thống (collectionGroup) */
export function subscribeAllFinancialSummaries(
  callback: (summaries: TaskFinancialSummary[]) => void
): () => void {
  const db = getDb();
  return onSnapshot(
    collectionGroup(db, "financialSummary"),
    (snap) => callback(snap.docs.map((d) => d.data() as TaskFinancialSummary)),
    (err) => console.error("[subscribeAllFinancialSummaries]", err.code, err.message)
  );
}

/** Lấy danh sách đơn hoàn ứng của task */
export async function getReimbursementRequests(taskId: string): Promise<ReimbursementRequest[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "reimbursementRequests"), where("taskId", "==", taskId))
  );
  return byDateDesc(snap.docs.map((d) => d.data() as ReimbursementRequest));
}

/** Subscribe realtime đơn hoàn ứng của 1 task */
export function subscribeReimbursementRequests(
  taskId: string,
  callback: (requests: ReimbursementRequest[]) => void
) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "reimbursementRequests"), where("taskId", "==", taskId)),
    (snap) => callback(byDateDesc(snap.docs.map((d) => d.data() as ReimbursementRequest))),
    (err) => console.error("[subscribeReimbursementRequests]", err.code, err.message)
  );
}

/** Duyệt chi hoàn ứng */
export async function approveReimbursement(
  reimbId: string,
  approvedBy: string,
  approvedByName: string
): Promise<void> {
  const db  = getDb();
  const now = new Date().toISOString();
  const snap = await getDoc(doc(db, "reimbursementRequests", reimbId));
  await updateDoc(doc(db, "reimbursementRequests", reimbId), {
    status: "APPROVED", approvedBy, approvedByName, approvedAt: now, updatedAt: now,
  });
  if (snap.exists()) {
    const reim = snap.data() as ReimbursementRequest;
    const taskSnap = await getDoc(doc(db, "tasks", reim.taskId)).catch(() => null);
    const taskName = (taskSnap?.data()?.name as string | undefined) ?? reim.taskId;
    await notifReimbursementApproved({
      recipientId: reim.requestedBy,
      taskId: reim.taskId,
      taskName,
      approverName: approvedByName,
    }).catch(() => {});
  }
}

/** Xác nhận đã trả tiền hoàn ứng */
export async function markReimbursementPaid(reimbId: string, taskId: string): Promise<void> {
  const db  = getDb();
  const now = new Date().toISOString();
  const snap = await getDoc(doc(db, "reimbursementRequests", reimbId));
  await updateDoc(doc(db, "reimbursementRequests", reimbId), {
    status: "PAID", paidAt: now, updatedAt: now,
  });
  await recomputeFinancialSummary(taskId);
  if (snap.exists()) {
    const reim = snap.data() as ReimbursementRequest;
    const taskSnap = await getDoc(doc(db, "tasks", taskId)).catch(() => null);
    const taskName = (taskSnap?.data()?.name as string | undefined) ?? taskId;
    await notifReimbursementPaid({
      recipientId: reim.requestedBy,
      taskId,
      taskName,
      amount: reim.amount,
    }).catch(() => {});
  }
}

// ── Tạo đơn hoàn ứng trực tiếp từ bước (không cần giao dịch trước) ───────────

export async function createDirectReimbursementRequest(data: {
  taskId: string;
  stepId?: string;
  stepName?: string;
  requestedBy: string;
  requestedByName: string;
  amount: number;
  description: string;
  proofs: FinancialProof[];
}): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = generateId("reimb");
  await setDoc(doc(db, "reimbursementRequests", id), {
    id,
    taskId:          data.taskId,
    stepId:          data.stepId   ?? null,
    stepName:        data.stepName ?? null,
    requestedBy:     data.requestedBy,
    requestedByName: data.requestedByName,
    amount:          data.amount,
    description:     data.description,
    proofs:          data.proofs,
    status:          "SUBMITTED",
    submittedAt:     now,
    createdAt:       now,
    updatedAt:       now,
  });

  // Thông báo approver về yêu cầu hoàn ứng mới
  const taskSnap = await getDoc(doc(db, "tasks", data.taskId)).catch(() => null);
  const taskName = (taskSnap?.data()?.name as string | undefined) ?? data.taskId;
  const approverIds = await getUserIdsByRoles(["director", "hrAdmin"]).catch(() => []);
  const toNotify = approverIds.filter((uid) => uid !== data.requestedBy);
  if (toNotify.length > 0) {
    await notifReimbursementSubmitted({
      approverIds: toNotify,
      taskId: data.taskId,
      taskName,
      requesterName: data.requestedByName,
      amount: data.amount,
    }).catch(() => {});
  }

  return id;
}

// ── Per-advance settlement flow ───────────────────────────────────────────────

/**
 * Nhân viên nộp thanh toán sau khi dùng tạm ứng.
 * Chuyển trạng thái: APPROVED → PENDING_SETTLEMENT
 */
export async function submitAdvanceSettlement(
  advId: string,
  data: {
    amountUsed: number;
    proofs: FinancialProof[];
    notes?: string;
  }
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const advSnap = await getDoc(doc(db, "advanceRequests", advId));
  await updateDoc(doc(db, "advanceRequests", advId), {
    status: "PENDING_SETTLEMENT",
    settlementAmountUsed: data.amountUsed,
    settlementProofs: data.proofs,
    settlementNotes: data.notes ?? "",
    settlementSubmittedAt: now,
    updatedAt: now,
  });

  // Thông báo approver về yêu cầu quyết toán
  if (advSnap.exists()) {
    const adv = advSnap.data() as AdvanceRequest;
    const taskSnap = await getDoc(doc(db, "tasks", adv.taskId)).catch(() => null);
    const taskName = (taskSnap?.data()?.name as string | undefined) ?? adv.taskId;
    const approverIds = await getUserIdsByRoles(["director", "hrAdmin"]).catch(() => []);
    const toNotify = approverIds.filter((uid) => uid !== adv.requestedBy);
    if (toNotify.length > 0) {
      await notifAdvanceSettlementSubmitted({
        approverIds: toNotify,
        taskId: adv.taskId,
        taskName,
        requesterName: adv.requestedByName,
        advanceId: advId,
      }).catch(() => {});
    }
  }
}

/**
 * Quản lý duyệt thanh toán.
 * Chuyển trạng thái: PENDING_SETTLEMENT → SETTLED
 * Tính chênh lệch và loại quyết toán.
 */
export async function approveAdvanceSettlement(
  advId: string,
  approvedBy: string,
  approvedByName: string
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const snap = await getDoc(doc(db, "advanceRequests", advId));
  if (!snap.exists()) throw new Error("Không tìm thấy đơn tạm ứng.");
  const adv = snap.data() as AdvanceRequest;
  const amountUsed = adv.settlementAmountUsed ?? 0;
  const difference = adv.amount - amountUsed;
  let settlementType: AdvanceRequest["settlementType"];
  if (difference > 0) settlementType = "RETURN_TO_COMPANY";
  else if (difference < 0) settlementType = "PAY_EMPLOYEE_ADDITIONAL";
  else settlementType = "BALANCED";

  await updateDoc(doc(db, "advanceRequests", advId), {
    status: "SETTLED",
    settledAt: now,
    settlementDifference: difference,
    settlementType,
    settlementApprovedBy: approvedBy,
    settlementApprovedByName: approvedByName,
    updatedAt: now,
  });
  await recomputeFinancialSummary(adv.taskId);

  // Thông báo người yêu cầu: quyết toán được duyệt
  const taskSnap2 = await getDoc(doc(db, "tasks", adv.taskId)).catch(() => null);
  const taskName2 = (taskSnap2?.data()?.name as string | undefined) ?? adv.taskId;
  await notifAdvanceSettlementResult({
    recipientId: adv.requestedBy,
    taskId: adv.taskId,
    taskName: taskName2,
    approved: true,
  }).catch(() => {});
}

/**
 * Quản lý từ chối thanh toán → trả về APPROVED để nhân viên nộp lại.
 */
export async function rejectAdvanceSettlement(
  advId: string,
  reason: string
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const snap = await getDoc(doc(db, "advanceRequests", advId));
  await updateDoc(doc(db, "advanceRequests", advId), {
    status: "APPROVED",
    settlementRejectedReason: reason,
    settlementAmountUsed: null,
    settlementProofs: [],
    settlementSubmittedAt: null,
    updatedAt: now,
  });

  // Thông báo người yêu cầu: quyết toán bị từ chối
  if (snap.exists()) {
    const adv2 = snap.data() as AdvanceRequest;
    const taskSnap3 = await getDoc(doc(db, "tasks", adv2.taskId)).catch(() => null);
    const taskName3 = (taskSnap3?.data()?.name as string | undefined) ?? adv2.taskId;
    await notifAdvanceSettlementResult({
      recipientId: adv2.requestedBy,
      taskId: adv2.taskId,
      taskName: taskName3,
      approved: false,
      reason,
    }).catch(() => {});
  }
}

// ── Cross-task queries (Finance Dashboard) ────────────────────────────────────

/** Lấy tất cả đơn tạm ứng (cross-task), tuỳ chọn lọc theo status */
export async function getAllAdvanceRequests(
  statusFilter?: AdvanceRequest["status"] | AdvanceRequest["status"][]
): Promise<AdvanceRequest[]> {
  const db = getDb();
  const constraints = statusFilter
    ? [where("status", Array.isArray(statusFilter) ? "in" : "==", statusFilter)]
    : [];
  const snap = await getDocs(query(collection(db, "advanceRequests"), ...constraints));
  return byDateDesc(snap.docs.map((d) => d.data() as AdvanceRequest));
}

/** Realtime listener tất cả đơn tạm ứng */
export function subscribeAllAdvanceRequests(
  callback: (data: AdvanceRequest[]) => void,
  statusFilter?: AdvanceRequest["status"] | AdvanceRequest["status"][]
): () => void {
  const db = getDb();
  const constraints = statusFilter
    ? [where("status", Array.isArray(statusFilter) ? "in" : "==", statusFilter)]
    : [];
  return onSnapshot(
    query(collection(db, "advanceRequests"), ...constraints),
    (snap) => callback(byDateDesc(snap.docs.map((d) => d.data() as AdvanceRequest))),
    (err) => console.error("[subscribeAllAdvanceRequests]", err.code, err.message)
  );
}

/** Realtime listener đơn tạm ứng của 1 nhân viên cụ thể */
export function subscribeMyAdvanceRequests(
  userId: string,
  callback: (data: AdvanceRequest[]) => void
): () => void {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "advanceRequests"), where("requestedBy", "==", userId)),
    (snap) => callback(byDateDesc(snap.docs.map((d) => d.data() as AdvanceRequest))),
    (err) => console.error("[subscribeMyAdvanceRequests]", err.code, err.message)
  );
}

/** Realtime listener đơn hoàn ứng của 1 nhân viên cụ thể */
export function subscribeMyReimbursementRequests(
  userId: string,
  callback: (data: ReimbursementRequest[]) => void
): () => void {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "reimbursementRequests"), where("requestedBy", "==", userId)),
    (snap) => callback(byDateDesc(snap.docs.map((d) => d.data() as ReimbursementRequest))),
    (err) => console.error("[subscribeMyReimbursementRequests]", err.code, err.message)
  );
}

/** Lấy tất cả đơn hoàn ứng (cross-task), tuỳ chọn lọc theo status */
export async function getAllReimbursementRequests(
  statusFilter?: ReimbursementRequest["status"] | ReimbursementRequest["status"][]
): Promise<ReimbursementRequest[]> {
  const db = getDb();
  const constraints = statusFilter
    ? [where("status", Array.isArray(statusFilter) ? "in" : "==", statusFilter)]
    : [];
  const snap = await getDocs(query(collection(db, "reimbursementRequests"), ...constraints));
  return byDateDesc(snap.docs.map((d) => d.data() as ReimbursementRequest));
}

/** Realtime listener tất cả đơn hoàn ứng */
export function subscribeAllReimbursementRequests(
  callback: (data: ReimbursementRequest[]) => void
): () => void {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "reimbursementRequests"), orderBy("createdAt", "desc")),
    (snap) => callback(snap.docs.map((d) => d.data() as ReimbursementRequest))
  );
}

/** Lấy giao dịch mới nhất cross-task bằng collectionGroup */
export async function getRecentTransactions(limitCount = 50): Promise<FinancialTransaction[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collectionGroup(db, "transactions"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )
  );
  return snap.docs.map((d) => d.data() as FinancialTransaction);
}

/**
 * Realtime listener giao dịch mới nhất cross-task.
 * Không dùng orderBy/where trên collectionGroup để tránh cần deploy index.
 * Sort + limit thực hiện client-side.
 */
export function subscribeRecentTransactions(
  callback: (data: FinancialTransaction[]) => void,
  limitCount = 50
): () => void {
  const db = getDb();
  return onSnapshot(
    collectionGroup(db, "transactions"),
    (snap) => {
      const sorted = snap.docs
        .map((d) => d.data() as FinancialTransaction)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limitCount);
      callback(sorted);
    },
    (err) => console.error("[subscribeRecentTransactions]", err.code)
  );
}

/**
 * Listener toàn bộ giao dịch VALID cross-task dùng cho báo cáo tài chính.
 * Không dùng where/orderBy (tránh cần composite index chưa deploy).
 * Filter VALID + sort ASC thực hiện client-side.
 */
export function subscribeAllTransactionsForReport(
  callback: (data: FinancialTransaction[]) => void
): () => void {
  const db = getDb();
  return onSnapshot(
    collectionGroup(db, "transactions"),
    (snap) => callback(
      snap.docs
        .map((d) => d.data() as FinancialTransaction)
        .filter((t) => t.status === "VALID")
    ),
    (err) => console.error("[subscribeAllTransactionsForReport]", err.code)
  );
}

// ── Số dư đầu kỳ (Opening Balance) ───────────────────────────────────────────

export interface FinancialOpeningBalance {
  amount: number;       // Số tiền tồn đầu trước khi hệ thống bắt đầu ghi nhận
  asOfDate: string;     // Ngày bắt đầu áp dụng (ISO string)
  updatedBy: string;
  updatedAt: string;
}

const OPENING_BAL_PATH = "financialConfig";
const OPENING_BAL_ID   = "openingBalance";

export async function saveOpeningBalance(
  amount: number,
  userId: string
): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, OPENING_BAL_PATH, OPENING_BAL_ID), {
    amount,
    asOfDate: new Date().toISOString(),
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  } satisfies FinancialOpeningBalance);
}

export function subscribeOpeningBalance(
  callback: (bal: FinancialOpeningBalance | null) => void
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, OPENING_BAL_PATH, OPENING_BAL_ID),
    (snap) => callback(snap.exists() ? (snap.data() as FinancialOpeningBalance) : null),
    (err) => console.error("[subscribeOpeningBalance]", err.code)
  );
}
