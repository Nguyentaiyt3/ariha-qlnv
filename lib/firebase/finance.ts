/**
 * Client-safe Finance compatibility layer — calls API routes via fetch.
 */
import type { FinancialTransaction, AdvanceRequest, ReimbursementRequest, TaskFinancialSummary } from "@/types";

export interface FinancialOpeningBalance {
  amount: number;
  date?: string;
  updatedBy?: string;
  updatedAt?: string;
}

async function api<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function apiOrThrow<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Subscriptions (one-shot fetch) ─────────────────────────────────────────

export function subscribeAllAdvanceRequests(cb: (reqs: AdvanceRequest[]) => void) {
  api<{ requests: AdvanceRequest[] }>("/api/finance/advance-requests").then((d) => cb(d?.requests ?? []));
  return () => {};
}

export function subscribeMyAdvanceRequests(userId: string, cb: (reqs: AdvanceRequest[]) => void) {
  api<{ requests: AdvanceRequest[] }>(`/api/finance/advance-requests?userId=${userId}`)
    .then((d) => cb(d?.requests ?? []));
  return () => {};
}

export function subscribeAdvanceRequests(taskId: string, cb: (reqs: AdvanceRequest[]) => void) {
  api<{ requests: AdvanceRequest[] }>(`/api/finance/advance-requests?taskId=${taskId}`)
    .then((d) => cb(d?.requests ?? []));
  return () => {};
}

export function subscribeAllReimbursementRequests(cb: (reqs: ReimbursementRequest[]) => void) {
  api<{ requests: ReimbursementRequest[] }>("/api/finance/reimbursement-requests")
    .then((d) => cb(d?.requests ?? []));
  return () => {};
}

export function subscribeMyReimbursementRequests(userId: string, cb: (reqs: ReimbursementRequest[]) => void) {
  api<{ requests: ReimbursementRequest[] }>(`/api/finance/reimbursement-requests?userId=${userId}`)
    .then((d) => cb(d?.requests ?? []));
  return () => {};
}

export function subscribeReimbursementRequests(taskId: string, cb: (reqs: ReimbursementRequest[]) => void) {
  api<{ requests: ReimbursementRequest[] }>(`/api/finance/reimbursement-requests?taskId=${taskId}`)
    .then((d) => cb(d?.requests ?? []));
  return () => {};
}

export function subscribeRecentTransactions(cb: (txns: FinancialTransaction[]) => void, limit = 20) {
  api<{ transactions: FinancialTransaction[] }>(`/api/finance/transactions?limit=${limit}`)
    .then((d) => cb(d?.transactions ?? []));
  return () => {};
}

export function subscribeTransactions(taskId: string, cb: (txns: FinancialTransaction[]) => void) {
  api<{ transactions: FinancialTransaction[] }>(`/api/finance/transactions?taskId=${taskId}`)
    .then((d) => cb(d?.transactions ?? []));
  return () => {};
}

export function subscribeAllFinancialSummaries(cb: (summaries: TaskFinancialSummary[]) => void) {
  api<{ summaries: TaskFinancialSummary[] }>("/api/finance/summaries")
    .then((d) => cb(d?.summaries ?? []));
  return () => {};
}

export function subscribeFinancialSummary(taskId: string, cb: (s: TaskFinancialSummary | null) => void) {
  api<{ summary: TaskFinancialSummary | null }>(`/api/finance/summaries?taskId=${taskId}`)
    .then((d) => cb(d?.summary ?? null));
  return () => {};
}

export function subscribeAllTransactionsForReport(cb: (txns: FinancialTransaction[]) => void) {
  api<{ transactions: FinancialTransaction[] }>("/api/finance/transactions?limit=5000")
    .then((d) => cb(d?.transactions ?? []));
  return () => {};
}

export function subscribeOpeningBalance(cb: (balance: FinancialOpeningBalance | null) => void) {
  api<{ balance: FinancialOpeningBalance | null }>("/api/finance/opening-balance")
    .then((d) => cb(d?.balance ?? null));
  return () => {};
}

// ── Point queries ───────────────────────────────────────────────────────────

export async function getAllAdvanceRequests(
  statuses?: AdvanceRequest["status"][]
): Promise<AdvanceRequest[]> {
  const url = statuses?.length
    ? `/api/finance/advance-requests?statuses=${statuses.join(",")}`
    : "/api/finance/advance-requests";
  const d = await api<{ requests: AdvanceRequest[] }>(url);
  return d?.requests ?? [];
}

export async function getAllReimbursementRequests(
  status?: ReimbursementRequest["status"]
): Promise<ReimbursementRequest[]> {
  const url = status
    ? `/api/finance/reimbursement-requests?status=${status}`
    : "/api/finance/reimbursement-requests";
  const d = await api<{ requests: ReimbursementRequest[] }>(url);
  return d?.requests ?? [];
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function saveOpeningBalance(
  amount: number,
  updatedBy?: string
): Promise<void> {
  await api("/api/finance/opening-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, updatedBy }),
  });
}

export async function approveAdvanceRequest(
  id: string,
  approvedBy?: string,
  approvedByName?: string
): Promise<void> {
  await apiOrThrow(`/api/finance/advance-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", approvedBy, approvedByName }),
  });
}

export async function rejectAdvanceRequest(id: string, reason?: string): Promise<void> {
  await apiOrThrow(`/api/finance/advance-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", reason }),
  });
}

export async function approveAdvanceSettlement(
  id: string,
  approvedBy?: string,
  approvedByName?: string
): Promise<void> {
  await apiOrThrow(`/api/finance/advance-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approveSettlement", approvedBy, approvedByName }),
  });
}

export async function rejectAdvanceSettlement(id: string, reason?: string): Promise<void> {
  await apiOrThrow(`/api/finance/advance-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rejectSettlement", reason }),
  });
}

export async function submitAdvanceSettlement(
  advId: string,
  data: { amountUsed: number; proofs?: unknown[]; notes?: string }
): Promise<void> {
  await apiOrThrow(`/api/finance/advance-requests/${advId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submitSettlement", ...data }),
  });
}

export async function approveReimbursement(
  id: string,
  approvedBy?: string,
  approvedByName?: string
): Promise<void> {
  await apiOrThrow(`/api/finance/reimbursement-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", approvedBy, approvedByName }),
  });
}

export async function markReimbursementPaid(id: string, _taskId?: string): Promise<void> {
  await apiOrThrow(`/api/finance/reimbursement-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "markPaid" }),
  });
}

export async function rejectReimbursement(id: string, reason: string): Promise<void> {
  await apiOrThrow(`/api/finance/reimbursement-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", reason }),
  });
}

export async function createAdvanceRequest(data: Partial<AdvanceRequest>): Promise<AdvanceRequest | null> {
  return api<AdvanceRequest>("/api/finance/advance-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function createReimbursementRequest(data: Partial<ReimbursementRequest>): Promise<ReimbursementRequest | null> {
  return api<ReimbursementRequest>("/api/finance/reimbursement-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function createTransaction(data: Partial<FinancialTransaction>): Promise<FinancialTransaction | null> {
  return api<FinancialTransaction>("/api/finance/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function addProofToTransaction(
  _taskId: string,
  txId: string,
  proof: Record<string, unknown>
): Promise<void> {
  await apiOrThrow(`/api/finance/transactions/${txId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "addProof", proof }),
  });
}

export async function recomputeFinancialSummary(taskId: string): Promise<TaskFinancialSummary | null> {
  const d = await api<{ summary: TaskFinancialSummary }>(`/api/finance/summaries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId }),
  });
  return d?.summary ?? null;
}

export async function reconcileAdvance(
  taskId: string,
  settledBy: string
): Promise<{
  difference: number;
  settlementType: "RETURN_TO_COMPANY" | "PAY_EMPLOYEE_ADDITIONAL" | "BALANCED";
  totalAdvanced: number;
  totalActualSpent: number;
  settledRequests: string[];
}> {
  const d = await apiOrThrow<{
    details: {
      settlementType: "RETURN_TO_COMPANY" | "PAY_EMPLOYEE_ADDITIONAL" | "BALANCED";
      settledRequests: string[];
    };
  }>(`/api/finance/reconcile/${taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settledBy }),
  });
  return {
    difference: 0,
    settlementType: d.details?.settlementType ?? "BALANCED",
    totalAdvanced: 0,
    totalActualSpent: 0,
    settledRequests: d.details?.settledRequests ?? [],
  };
}

export async function getFinanceData() { return []; }

// ── Constants ───────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "Vật tư & Thiết bị",
  "Nhân công & Dịch vụ",
  "Vận chuyển & Logistics",
  "Ăn uống & Tiếp khách",
  "Thuê mặt bằng & Sự kiện",
  "Marketing & Quảng cáo",
  "Phần mềm & Công nghệ",
  "Đào tạo & Phát triển",
  "Phí hành chính",
  "Chi phí khác",
] as const;
