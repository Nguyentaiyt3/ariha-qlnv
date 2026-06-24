// Finance adapter - stubs for development
export async function getFinanceData() { return []; }
export async function subscribeAllAdvanceRequests(cb) { cb([]); return () => {}; }
export async function subscribeMyAdvanceRequests(userId, cb) { cb([]); return () => {}; }
export async function subscribeAllReimbursementRequests(cb) { cb([]); return () => {}; }
export async function subscribeMyReimbursementRequests(userId, cb) { cb([]); return () => {}; }
export async function subscribeRecentTransactions(cb) { cb([]); return () => {}; }
export async function subscribeAllFinancialSummaries(cb) { cb([]); return () => {}; }
export async function subscribeAllTransactionsForReport(cb) { cb([]); return () => {}; }
export async function subscribeOpeningBalance(cb) { cb(null); return () => {}; }
export async function saveOpeningBalance(data) {}
export async function approveAdvanceRequest(id) {}
export async function rejectAdvanceRequest(id) {}
export async function approveAdvanceSettlement(id) {}
export async function rejectAdvanceSettlement(id) {}
export async function approveReimbursement(id) {}
export async function markReimbursementPaid(id) {}
export async function createAdvanceRequest(data) { return {}; }
export async function createReimbursementRequest(data) { return {}; }
export async function createTransaction(data) { return {}; }
