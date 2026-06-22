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

  // Lấy budget từ task document nếu không truyền vào
  let effectiveBudget = budget;
  if (effectiveBudget === 0) {
    const taskDoc = await getDoc(doc(db, "tasks", taskId));
    effectiveBudget = (taskDoc.data()?.budget as number) ?? 0;
  }

  const summary: TaskFinancialSummary = {
    taskId,
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
    reimbursementRequest = {
      id: reimId,
      taskId: payload.taskId,
      transactionId: txId,
      requestedBy: payload.createdBy,
      requestedByName: payload.createdByName,
      amount: payload.amount,
      description: payload.description,
      proofs: payload.proofs ?? [],
      status: hasProofs ? "SUBMITTED" : "DRAFT", // Có chứng từ → nộp ngay
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(
      doc(db, "reimbursementRequests", reimId),
      stripUndef(reimbursementRequest)
    );
  }

  // ── Tạo giao dịch ────────────────────────────────────────────
  const transaction: FinancialTransaction = {
    id: txId,
    taskId: payload.taskId,
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
      await updateDoc(reimRef, {
        proofs: [...reim.proofs, proof],
        status: reim.status === "DRAFT" ? "SUBMITTED" : reim.status,
        submittedAt: reim.status === "DRAFT" ? new Date().toISOString() : reim.submittedAt,
        updatedAt: new Date().toISOString(),
      });
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
    remainingAmount: adv.amount, // Khi duyệt, số dư = toàn bộ số tiền xin
    updatedAt: now,
  });
}

/** Từ chối đơn tạm ứng */
export async function rejectAdvanceRequest(
  requestId: string,
  reason: string
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "advanceRequests", requestId), {
    status: "REJECTED",
    rejectedReason: reason,
    updatedAt: new Date().toISOString(),
  });
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

  // 2. Lấy tất cả đơn tạm ứng APPROVED của task
  const advSnap = await getDocs(
    query(
      collection(db, "advanceRequests"),
      where("taskId", "==", taskId),
      where("status", "==", "APPROVED"),
    )
  );
  const advances = advSnap.docs.map((d) => d.data() as AdvanceRequest);

  if (advances.length === 0) {
    throw new Error("Không có đơn tạm ứng nào cần quyết toán.");
  }

  // 3. Tính tổng tạm ứng đã cấp
  const totalAdvanced = advances.reduce((s, a) => s + a.amount, 0);

  // 4. Tính tổng thực chi từ tạm ứng (chỉ giao dịch ADVANCE + VALID)
  const txSnap = await getDocs(
    query(
      collection(db, "tasks", taskId, "transactions"),
      where("fundSource", "==", "ADVANCE"),
      where("status", "==", "VALID"),
      where("direction", "==", "DEBIT"),
    )
  );
  const totalActualSpent = txSnap.docs.reduce(
    (s, d) => s + (d.data() as FinancialTransaction).amount, 0
  );

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
  const db = getDb();
  const now = new Date().toISOString();
  await updateDoc(doc(db, "reimbursementRequests", reimbId), {
    status: "APPROVED",
    approvedBy,
    approvedByName,
    approvedAt: now,
    updatedAt: now,
  });
}

/** Xác nhận đã trả tiền hoàn ứng */
export async function markReimbursementPaid(reimbId: string, taskId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await updateDoc(doc(db, "reimbursementRequests", reimbId), {
    status: "PAID",
    paidAt: now,
    updatedAt: now,
  });
  await recomputeFinancialSummary(taskId);
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
  await updateDoc(doc(db, "advanceRequests", advId), {
    status: "PENDING_SETTLEMENT",
    settlementAmountUsed: data.amountUsed,
    settlementProofs: data.proofs,
    settlementNotes: data.notes ?? "",
    settlementSubmittedAt: now,
    updatedAt: now,
  });
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
  await updateDoc(doc(db, "advanceRequests", advId), {
    status: "APPROVED",
    settlementRejectedReason: reason,
    settlementAmountUsed: null,
    settlementProofs: [],
    settlementSubmittedAt: null,
    updatedAt: now,
  });
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

/** Realtime listener giao dịch mới nhất cross-task */
export function subscribeRecentTransactions(
  callback: (data: FinancialTransaction[]) => void,
  limitCount = 50
): () => void {
  const db = getDb();
  return onSnapshot(
    query(
      collectionGroup(db, "transactions"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    ),
    (snap) => callback(snap.docs.map((d) => d.data() as FinancialTransaction))
  );
}
