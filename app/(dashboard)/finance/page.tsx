"use client";

/**
 * app/(dashboard)/finance/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Trang theo dõi tài chính toàn hệ thống.
 *
 * Hiển thị:
 *  • KPI cards: tổng tạm ứng lưu hành / chờ duyệt / chờ hoàn ứng / giao dịch tháng
 *  • Biểu đồ: dòng tiền 6 tháng, phân loại chi tiêu
 *  • Tabs: Đơn tạm ứng | Đơn hoàn ứng | Giao dịch gần đây
 *  • Approve / Reject / Pay trực tiếp trên trang (director/hrAdmin)
 */

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign, CreditCard, Wallet, TrendingUp, TrendingDown,
  Clock, CheckCircle2, XCircle, AlertTriangle, ArrowUpCircle,
  ArrowDownCircle, Check, X, Loader2, RefreshCw, FileText,
  ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Filter, Search, Receipt, QrCode,
  BarChart3, Pencil, Save,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  subscribeAllAdvanceRequests,
  subscribeMyAdvanceRequests,
  subscribeAllFinancialSummaries,
  subscribeRecentTransactions,
  subscribeAllTransactionsForReport,
  subscribeOpeningBalance,
  saveOpeningBalance,
  type FinancialOpeningBalance,
  approveAdvanceRequest,
  rejectAdvanceRequest,
  approveAdvanceSettlement,
  rejectAdvanceSettlement,
} from "@/lib/firebase/finance";
import type { AdvanceRequest, FinancialTransaction, TaskFinancialSummary, CostItem } from "@/types";
import {
  format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear, subQuarters, subYears, addMonths, addQuarters, addYears,
} from "date-fns";
import { vi } from "date-fns/locale";
import { ClinicalTrialPaymentApprovals } from "@/components/finance/ClinicalTrialPaymentApprovals";
import { DistributionApprovalsList } from "@/components/finance/DistributionApprovalsList";
import { EditDeleteRequestsList } from "@/components/finance/EditDeleteRequestsList";
import { SettlementConfirmationUI } from "@/components/finance/SettlementConfirmation";

// ── Hằng & helpers ─────────────────────────────────────────────────────────────

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

const PALETTE = {
  blue:   "#3B82F6",
  purple: "#8B5CF6",
  green:  "#22C55E",
  amber:  "#F59E0B",
  red:    "#EF4444",
  cyan:   "#06B6D4",
  slate:  "#94A3B8",
};

const PIE_COLORS = [PALETTE.blue, PALETTE.purple, PALETTE.green, PALETTE.amber, PALETTE.cyan, PALETTE.red];

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, iconBg, iconColor, trend, alert,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  trend?: "up" | "down" | "neutral";
  alert?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl p-4 border flex gap-3 items-start",
      "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
      alert && "border-red-300 dark:border-red-800"
    )}>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon className="w-5 h-5" style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-slate-800 dark:text-white leading-none">{value}</p>
        {sub && (
          <p className={cn(
            "text-[11px] mt-1 flex items-center gap-1",
            trend === "up" ? "text-green-600" :
            trend === "down" ? "text-red-500" : "text-slate-400"
          )}>
            {trend === "up" && <TrendingUp className="w-3 h-3" />}
            {trend === "down" && <TrendingDown className="w-3 h-3" />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Badge trạng thái ──────────────────────────────────────────────────────────
const ADV_STATUS: Record<AdvanceRequest["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:             { label: "Chờ duyệt",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",  icon: <Clock className="w-3 h-3" /> },
  APPROVED:            { label: "Đã duyệt",      cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED:            { label: "Từ chối",       cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",         icon: <XCircle className="w-3 h-3" /> },
  PENDING_SETTLEMENT:  { label: "Chờ thanh toán", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",   icon: <Receipt className="w-3 h-3" /> },
  SETTLED:             { label: "Đã quyết toán", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",    icon: <Check className="w-3 h-3" /> },
};

const TX_SOURCE: Record<FinancialTransaction["fundSource"], { label: string; cls: string }> = {
  ADVANCE:       { label: "Tạm ứng",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  OUT_OF_POCKET: { label: "Tự ứng",   cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  REVENUE:       { label: "Thu về",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

// ── Reject dialog ─────────────────────────────────────────────────────────────
function RejectDialog({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-white">Lý do từ chối</h3>
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Nhập lý do từ chối..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Huỷ
          </button>
          <button onClick={() => { if (reason.trim()) onConfirm(reason.trim()); }}
            disabled={!reason.trim()}
            className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition">
            Từ chối
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FinanceDashboardPage() {
  const { currentUser } = useAuthStore();

  const [advances,       setAdvances]       = useState<AdvanceRequest[]>([]);
  const [transactions,   setTransactions]   = useState<FinancialTransaction[]>([]);
  const [allSummaries,   setAllSummaries]   = useState<TaskFinancialSummary[]>([]);

  const [reportTx,           setReportTx]           = useState<FinancialTransaction[]>([]);
  const [reportPeriodType,   setReportPeriodType]   = useState<"month" | "quarter" | "year">("month");
  const [reportPeriodOffset, setReportPeriodOffset] = useState(0);
  const [openingBal,         setOpeningBal]         = useState<FinancialOpeningBalance | null>(null);
  const [editingOpening,     setEditingOpening]     = useState(false);
  const [openingInput,       setOpeningInput]       = useState("");
  const [savingOpening,      setSavingOpening]      = useState(false);
  const [detailFilter,       setDetailFilter]       = useState<"ALL" | "CREDIT" | "DEBIT">("ALL");
  const [detailSearch,       setDetailSearch]       = useState("");
  const [showPrePeriod,      setShowPrePeriod]      = useState(false);
  const [trendRange,         setTrendRange]         = useState<"3m" | "6m" | "12m" | "3y">("6m");

  const [activeTab, setActiveTab] = useState<"advances" | "transactions" | "tasks" | "trial-payments">("advances");
  const [advFilter, setAdvFilter] = useState<AdvanceRequest["status"] | "ALL">("ALL");
  const [search,    setSearch]    = useState("");

  // Pending UI
  const [rejectTarget,   setRejectTarget]   = useState<{ type: "advance" | "settlement"; id: string; taskId?: string } | null>(null);
  const [loadingId,      setLoadingId]      = useState<string | null>(null);
  const [expandedAdvId,  setExpandedAdvId]  = useState<string | null>(null);

  // Payment editing
  const [editingPayment, setEditingPayment] = useState<any>(null);

  // Clinical trial pending payments
  const [pendingTrialPayments, setPendingTrialPayments] = useState<any[]>([]);
  const [pendingTrialPaymentsLoading, setPendingTrialPaymentsLoading] = useState(false);

  const canApprove = currentUser && ["director", "hrAdmin", "teamLead"].includes(currentUser.role);

  // ── Subscriptions realtime (phân quyền: approver thấy tất cả, staff thấy của mình) ──
  useEffect(() => {
    if (!currentUser) return;
    const isApprover = ["director", "hrAdmin", "teamLead"].includes(currentUser.role);
    const unsub1 = isApprover
      ? subscribeAllAdvanceRequests(setAdvances)
      : subscribeMyAdvanceRequests(currentUser.id, setAdvances);
    const unsub3 = subscribeRecentTransactions(setTransactions, 100);
    const unsub4 = isApprover ? subscribeAllFinancialSummaries(setAllSummaries) : () => {};
    const unsub5 = isApprover ? subscribeAllTransactionsForReport(setReportTx) : () => {};
    const unsub6 = isApprover ? subscribeOpeningBalance(setOpeningBal) : () => {};
    return () => { unsub1(); unsub3(); unsub4(); unsub5(); unsub6(); };
  }, [currentUser]);

  // Gọi lại sau khi duyệt hoàn tất bàn giao (ghi nhận thu Viện ARiHA) để bảng "Chi tiết phát sinh trong kỳ" cập nhật ngay
  function refetchTransactions() {
    subscribeAllTransactionsForReport(setReportTx);
    subscribeRecentTransactions(setTransactions, 100);
  }

  // ── Fetch pending clinical trial payments ──
  useEffect(() => {
    if (!currentUser || !["director", "hrAdmin", "teamLead"].includes(currentUser.role)) return;
    const fetchPendingPayments = async () => {
      setPendingTrialPaymentsLoading(true);
      try {
        const response = await fetch("/api/clinical-trials/payments/approvals?status=pending");
        if (response.ok) {
          const data = await response.json();
          setPendingTrialPayments(data || []);
        }
      } catch (error) {
        console.error("Failed to fetch pending payments:", error);
      } finally {
        setPendingTrialPaymentsLoading(false);
      }
    };
    fetchPendingPayments();
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchPendingPayments, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // ── KPI aggregates ────────────────────────────────────────────────────────
  // Chỉ tính APPROVED + PENDING_SETTLEMENT — SETTLED đã quyết toán xong, không còn lưu hành.
  // "Tạm ứng đang lưu hành" chỉ tính mode=ADVANCE (tự ứng chưa từng nhận tiền công ty).
  const totalAdvanced     = advances
    .filter((a) => (a.mode ?? "ADVANCE") === "ADVANCE" && ["APPROVED", "PENDING_SETTLEMENT"].includes(a.status))
    .reduce((s, a) => s + a.amount, 0);
  // "Chờ duyệt" gộp cả 2 hình thức — cùng là bước duyệt-trước-khi-chi trong luồng thống nhất.
  const pendingAdvCount   = advances.filter((a) => a.status === "PENDING").length;
  const pendingAdvAmount  = advances.filter((a) => a.status === "PENDING").reduce((s, a) => s + a.amount, 0);
  // "Chờ hoàn ứng": đơn tự ứng đã nộp quyết toán, chờ duyệt chi.
  const pendingReimb      = advances
    .filter((a) => a.mode === "SELF_PAID" && a.status === "PENDING_SETTLEMENT")
    .reduce((s, a) => s + (a.settlementAmountUsed ?? 0), 0);

  // ── Phân quyền giao dịch: approver thấy tất cả, staff chỉ thấy của mình ──
  const isApproverView = currentUser && ["director", "hrAdmin", "teamLead"].includes(currentUser.role);
  const myTx = isApproverView
    ? transactions
    : transactions.filter((t) => t.createdBy === currentUser?.id);

  const thisMonth = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
  const txThisMonth = myTx.filter((t) => {
    try { return isWithinInterval(parseISO(t.createdAt), thisMonth); } catch { return false; }
  });
  // Chỉ tính giao dịch đánh dấu isDisbursement (tiền công ty thực sự rời đi lúc duyệt tạm ứng/hoàn ứng) —
  // không cộng các giao dịch "chi từ tạm ứng" (chỉ là phân loại lại khoản đã tính, không phải chi mới).
  const expenseThisMonth = txThisMonth.filter((t) => t.direction === "DEBIT" && t.isDisbursement).reduce((s, t) => s + t.amount, 0);

  // ── Tổng hợp toàn đơn vị từ TaskFinancialSummary (denormalized, realtime) ──
  const orgTotalRevenue = allSummaries.reduce((acc, s) => acc + s.totalRevenue, 0);
  const orgTotalExpense = allSummaries.reduce((acc, s) => acc + s.totalExpense, 0);
  const orgNetCashFlow  = orgTotalRevenue - orgTotalExpense;
  const orgOutOfPocket  = allSummaries.reduce((acc, s) => acc + s.totalOutOfPocket, 0);
  const orgBudgetTotal  = allSummaries.reduce((acc, s) => acc + (s.budget ?? 0), 0);
  const netCashFlowAll  = isApproverView ? orgNetCashFlow
    : myTx.filter((t) => t.fundSource === "REVENUE" && t.status === "VALID").reduce((s, t) => s + t.amount, 0)
      - myTx.filter((t) => t.direction === "DEBIT" && t.status === "VALID" && t.isDisbursement).reduce((s, t) => s + t.amount, 0);

  // ── Báo cáo tài chính theo kỳ ────────────────────────────────────────────
  // Dùng reportTx (toàn bộ VALID, 5000) cho approver; myTx cho staff.
  const baseTxForReport = isApproverView ? reportTx : myTx.filter(t => t.status === "VALID");
  // Sắp xếp ASC để tính tồn đầu (running balance)
  const sortedForReport = [...baseTxForReport].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function getPeriodRange(type: typeof reportPeriodType, offset: number) {
    const now = new Date();
    if (type === "month") {
      const base = offset >= 0 ? addMonths(now, offset) : subMonths(now, -offset);
      return {
        start: startOfMonth(base),
        end:   endOfMonth(base),
        label: format(base, "'Tháng' MM/yyyy", { locale: vi }),
      };
    }
    if (type === "quarter") {
      const base = offset >= 0 ? addQuarters(now, offset) : subQuarters(now, -offset);
      const q = Math.floor(base.getMonth() / 3) + 1;
      return {
        start: startOfQuarter(base),
        end:   endOfQuarter(base),
        label: `Quý ${q}/${format(base, "yyyy")}`,
      };
    }
    const base = offset >= 0 ? addYears(now, offset) : subYears(now, -offset);
    return {
      start: startOfYear(base),
      end:   endOfYear(base),
      label: format(base, "'Năm' yyyy"),
    };
  }

  const { start: rStart, end: rEnd, label: rLabel } = getPeriodRange(reportPeriodType, reportPeriodOffset);
  const rStartIso = rStart.toISOString();
  const rEndIso   = rEnd.toISOString();

  const prePeriodTx  = sortedForReport.filter((t) => t.createdAt < rStartIso);
  const periodTx     = sortedForReport.filter((t) => t.createdAt >= rStartIso && t.createdAt <= rEndIso);

  // Chi chỉ tính giao dịch isDisbursement (tiền công ty thực sự rời đi) — xem ghi chú ở expenseThisMonth.
  const txNetBefore = prePeriodTx.reduce((s, t) => s + (t.direction === "CREDIT" ? t.amount : (t.isDisbursement ? -t.amount : 0)), 0);
  const openingAmount = openingBal?.amount ?? 0;
  const tonDau      = openingAmount + txNetBefore;
  const phatSinhThu = periodTx.filter((t) => t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
  const phatSinhChi = periodTx.filter((t) => t.direction === "DEBIT" && t.isDisbursement).reduce((s, t)  => s + t.amount, 0);
  const tonCuoi     = tonDau + phatSinhThu - phatSinhChi;

  async function handleSaveOpening() {
    const num = parseFloat(openingInput.replace(/[^0-9.-]/g, ""));
    if (isNaN(num)) return;
    setSavingOpening(true);
    try {
      await saveOpeningBalance(num, currentUser!.id);
      setEditingOpening(false);
      toast.success("Đã lưu tồn đầu kỳ.");
    } catch { toast.error("Lưu thất bại."); }
    finally { setSavingOpening(false); }
  }

  // Revenue breakdown by category (%)
  const revCatMap: Record<string, number> = {};
  periodTx.filter((t) => t.direction === "CREDIT").forEach((t) => {
    const key = t.category || (t.fundSource === "REVENUE" ? "Doanh thu dịch vụ" : "Khác");
    revCatMap[key] = (revCatMap[key] ?? 0) + t.amount;
  });
  const revBreakdown = Object.entries(revCatMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, pct: phatSinhThu > 0 ? Math.round((value / phatSinhThu) * 100) : 0 }));

  // Revenue breakdown by fundSource
  const revSourceMap: Record<string, number> = {};
  periodTx.filter((t) => t.direction === "CREDIT").forEach((t) => {
    const key = t.fundSource === "REVENUE" ? "Doanh thu" : t.fundSource === "ADVANCE" ? "Hoàn tạm ứng" : "Hoàn tự ứng";
    revSourceMap[key] = (revSourceMap[key] ?? 0) + t.amount;
  });
  const revSourceBreakdown = Object.entries(revSourceMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, pct: phatSinhThu > 0 ? Math.round((value / phatSinhThu) * 100) : 0 }));

  // Expense breakdown by category (%)
  const expCatMap: Record<string, number> = {};
  periodTx.filter((t) => t.direction === "DEBIT").forEach((t) => {
    expCatMap[t.category || "Khác"] = (expCatMap[t.category || "Khác"] ?? 0) + t.amount;
  });
  const expBreakdown = Object.entries(expCatMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, pct: phatSinhChi > 0 ? Math.round((value / phatSinhChi) * 100) : 0 }));

  // Expense breakdown by fundSource
  const expSourceMap: Record<string, number> = {};
  periodTx.filter((t) => t.direction === "DEBIT").forEach((t) => {
    const key = t.fundSource === "ADVANCE" ? "Từ tạm ứng" : t.fundSource === "OUT_OF_POCKET" ? "Tự ứng" : "Khác";
    expSourceMap[key] = (expSourceMap[key] ?? 0) + t.amount;
  });
  const expSourceBreakdown = Object.entries(expSourceMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, pct: phatSinhChi > 0 ? Math.round((value / phatSinhChi) * 100) : 0 }));

  // ── Tra cứu tên nhiệm vụ từ allSummaries ──────────────────────────────────
  const taskNameById: Record<string, string> = Object.fromEntries(
    allSummaries.map((s) => [s.taskId, s.taskName ?? s.taskId])
  );

  // ── Bảng chi tiết giao dịch trong kỳ ────────────────────────────────────
  const detailTx = periodTx
    .filter((t) => detailFilter === "ALL" || (detailFilter === "CREDIT" ? t.direction === "CREDIT" : t.direction === "DEBIT"))
    .filter((t) => {
      if (!detailSearch.trim()) return true;
      const q = detailSearch.toLowerCase();
      return (
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.createdByName.toLowerCase().includes(q) ||
        (t.taskName ?? taskNameById[t.taskId] ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ── Trend chart data — dynamic range ─────────────────────────────────────
  const txForTrend = baseTxForReport;
  const isYearlyTrend = trendRange === "3y";
  const trendMonthCount = trendRange === "3m" ? 3 : trendRange === "12m" ? 12 : 6;
  const cashFlowData = isYearlyTrend
    ? Array.from({ length: 3 }, (_, i) => {
        const yearDate = subYears(new Date(), 2 - i);
        const label = format(yearDate, "yyyy");
        const range = { start: startOfYear(yearDate), end: endOfYear(yearDate) };
        const bucketTx = txForTrend.filter((t) => {
          try { return isWithinInterval(parseISO(t.createdAt), range); } catch { return false; }
        });
        const chi = bucketTx.filter((t) => t.direction === "DEBIT" && t.isDisbursement).reduce((s, t) => s + t.amount, 0);
        const thu = bucketTx.filter((t) => t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
        return { label, chi: Math.round(chi / 1000), thu: Math.round(thu / 1000) };
      })
    : Array.from({ length: trendMonthCount }, (_, i) => {
        const monthDate = subMonths(new Date(), trendMonthCount - 1 - i);
        const label = format(monthDate, "MM/yyyy", { locale: vi });
        const range = { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
        const bucketTx = txForTrend.filter((t) => {
          try { return isWithinInterval(parseISO(t.createdAt), range); } catch { return false; }
        });
        const chi = bucketTx.filter((t) => t.direction === "DEBIT" && t.isDisbursement).reduce((s, t) => s + t.amount, 0);
        const thu = bucketTx.filter((t) => t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
        return { label, chi: Math.round(chi / 1000), thu: Math.round(thu / 1000) };
      });

  // ── Category pie data ─────────────────────────────────────────────────────
  const categoryMap: Record<string, number> = {};
  myTx.filter((t) => t.direction === "DEBIT").forEach((t) => {
    categoryMap[t.category] = (categoryMap[t.category] ?? 0) + t.amount;
  });
  const categoryData = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, value]) => ({ name, value: Math.round(value / 1000) }));

  // ── Source breakdown ──────────────────────────────────────────────────────
  const sourceData = [
    { name: "Tạm ứng", value: myTx.filter((t) => t.fundSource === "ADVANCE" && t.direction === "DEBIT").reduce((s, t) => s + t.amount, 0) },
    { name: "Tự ứng",  value: myTx.filter((t) => t.fundSource === "OUT_OF_POCKET").reduce((s, t) => s + t.amount, 0) },
    { name: "Thu về",  value: myTx.filter((t) => t.fundSource === "REVENUE").reduce((s, t) => s + t.amount, 0) },
  ].filter((d) => d.value > 0).map((d) => ({ ...d, value: Math.round(d.value / 1000) }));

  // ── Filtered lists ────────────────────────────────────────────────────────
  const searchLower = search.toLowerCase();
  const filteredAdvances = advances
    .filter((a) => advFilter === "ALL" || a.status === advFilter)
    .filter((a) => !searchLower || a.purpose.toLowerCase().includes(searchLower) || a.requestedByName.toLowerCase().includes(searchLower));

  const filteredTx = myTx.filter(
    (t) => !searchLower || t.description.toLowerCase().includes(searchLower) || t.category.toLowerCase().includes(searchLower) || t.createdByName.toLowerCase().includes(searchLower)
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleApproveAdv(adv: AdvanceRequest) {
    if (!currentUser) return;
    setLoadingId(adv.id);
    try {
      await approveAdvanceRequest(adv.id, currentUser.id, currentUser.name);
      toast.success(`Đã duyệt đơn tạm ứng ${vnd(adv.amount)} cho ${adv.requestedByName}.`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoadingId(null); }
  }

  async function handleRejectAdv(id: string, reason: string) {
    setLoadingId(id);
    try {
      await rejectAdvanceRequest(id, reason);
      toast.success("Đã từ chối đơn tạm ứng.");
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoadingId(null); setRejectTarget(null); }
  }

  async function handleApproveSettlement(adv: AdvanceRequest) {
    if (!currentUser) return;
    setLoadingId(adv.id);
    try {
      await approveAdvanceSettlement(adv.id, currentUser.id, currentUser.name);
      toast.success(`Đã duyệt thanh toán cho ${adv.requestedByName}.`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoadingId(null); }
  }

  async function handleRejectSettlement(id: string, reason: string) {
    setLoadingId(id);
    try {
      await rejectAdvanceSettlement(id, reason);
      toast.success("Đã từ chối thanh toán. Nhân viên cần nộp lại.");
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoadingId(null); setRejectTarget(null); }
  }

  // ── Custom tooltip cho chart ──────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: {name: string; value: number; color: string}[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {p.value.toLocaleString("vi-VN")} nghìn đ
          </p>
        ))}
      </div>
    );
  };

  if (!currentUser) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            Theo dõi tài chính
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Tổng hợp tạm ứng, hoàn ứng và dòng tiền toàn hệ thống
          </p>
        </div>
        <div className="text-xs text-slate-400 hidden md:block">
          Cập nhật realtime
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 ml-1.5 animate-pulse" />
        </div>
      </div>

      {/* ── Alert: Pending Clinical Trial Payments ── */}
      {canApprove && pendingTrialPayments.length > 0 && (
        <div
          onClick={() => setActiveTab("trial-payments")}
          className="rounded-xl p-4 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 border-2 border-red-300 dark:border-red-800 cursor-pointer hover:shadow-lg dark:hover:shadow-red-900/20 transition-all transform hover:scale-[1.01]"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-800 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-300" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-red-700 dark:text-red-300">
                  ⚠️ Có {pendingTrialPayments.length} đề nghị thanh toán thử nghiệm chờ phê duyệt
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400">Tổng số tiền</p>
                  <p className="text-base font-bold text-red-700 dark:text-red-300">
                    {vnd(pendingTrialPayments.reduce((sum, p) => sum + (p.totalAmount || 0), 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400">Số đề nghị</p>
                  <p className="text-base font-bold text-red-700 dark:text-red-300">
                    {pendingTrialPayments.length}
                  </p>
                </div>
                <div className="sm:col-span-1 col-span-2 sm:col-span-auto">
                  <p className="text-xs text-red-600 dark:text-red-400">Hành động</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab("trial-payments");
                    }}
                    className="mt-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Xem ngay →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Tổng tạm ứng đang lưu hành"
          value={vnd(totalAdvanced)}
          sub={(() => {
            const isAdvanceMode = (a: AdvanceRequest) => (a.mode ?? "ADVANCE") === "ADVANCE";
            const active = advances.filter((a) => isAdvanceMode(a) && ["APPROVED", "PENDING_SETTLEMENT"].includes(a.status)).length;
            const settled = advances.filter((a) => isAdvanceMode(a) && a.status === "SETTLED").length;
            if (active === 0 && settled > 0) return `${settled} đơn đã quyết toán`;
            if (active > 0 && settled > 0) return `${active} đang hoạt động · ${settled} đã quyết toán`;
            return active > 0 ? `${active} đơn đang hoạt động` : "Không có đơn nào";
          })()}
          icon={CreditCard}
          iconBg="bg-blue-50 dark:bg-blue-900/30"
          iconColor={PALETTE.blue}
        />
        <KpiCard
          label="Đề nghị chờ duyệt"
          value={pendingAdvCount.toString()}
          sub={pendingAdvCount > 0 ? `Tổng: ${vnd(pendingAdvAmount)}` : "Không có đơn chờ"}
          icon={Clock}
          iconBg={pendingAdvCount > 0 ? "bg-amber-50 dark:bg-amber-900/30" : "bg-slate-50 dark:bg-slate-800"}
          iconColor={pendingAdvCount > 0 ? PALETTE.amber : PALETTE.slate}
          alert={pendingAdvCount > 3}
        />
        <KpiCard
          label="Chờ hoàn ứng"
          value={vnd(pendingReimb)}
          sub={`${advances.filter((a) => a.mode === "SELF_PAID" && a.status === "PENDING_SETTLEMENT").length} đơn chưa thanh toán`}
          icon={Wallet}
          iconBg="bg-purple-50 dark:bg-purple-900/30"
          iconColor={PALETTE.purple}
        />
        <KpiCard
          label="Chi tiêu tháng này"
          value={vnd(expenseThisMonth)}
          sub={`${txThisMonth.length} giao dịch`}
          icon={TrendingDown}
          iconBg="bg-red-50 dark:bg-red-900/30"
          iconColor={PALETTE.red}
          trend={expenseThisMonth > 0 ? "down" : "neutral"}
        />
        <KpiCard
          label="Chênh lệch thu - chi"
          value={netCashFlowAll > 0 ? `+${vnd(netCashFlowAll)}` : vnd(netCashFlowAll)}
          sub={netCashFlowAll > 0 ? "Lời" : netCashFlowAll < 0 ? "Lỗ" : "Hòa vốn"}
          icon={netCashFlowAll >= 0 ? TrendingUp : TrendingDown}
          iconBg={
            netCashFlowAll > 0
              ? "bg-green-50 dark:bg-green-900/30"
              : netCashFlowAll < 0
                ? "bg-red-50 dark:bg-red-900/30"
                : "bg-slate-50 dark:bg-slate-800"
          }
          iconColor={netCashFlowAll > 0 ? PALETTE.green : netCashFlowAll < 0 ? PALETTE.red : PALETTE.slate}
          trend={netCashFlowAll > 0 ? "up" : netCashFlowAll < 0 ? "down" : "neutral"}
        />
      </div>

      {/* ── Báo cáo tài chính theo kỳ ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-5">
        {/* Header + period picker */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Báo cáo tài chính</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Loại kỳ */}
            <div className="flex text-xs rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {(["month", "quarter", "year"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setReportPeriodType(t); setReportPeriodOffset(0); }}
                  className={cn(
                    "px-3 py-1.5 font-medium transition",
                    reportPeriodType === t
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >
                  {t === "month" ? "Tháng" : t === "quarter" ? "Quý" : "Năm"}
                </button>
              ))}
            </div>
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setReportPeriodOffset((o) => o - 1)}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
              <span className="min-w-28 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 px-1">
                {rLabel}
              </span>
              <button
                onClick={() => setReportPeriodOffset((o) => Math.min(0, o + 1))}
                disabled={reportPeriodOffset >= 0}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 transition"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Sổ quỹ: 4 ô ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tồn đầu kỳ — có thể nhập số lần đầu */}
          <div className={cn("rounded-xl p-3 space-y-1", "bg-slate-50 dark:bg-slate-800")}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Tồn đầu kỳ</p>
              {isApproverView && !editingOpening && (
                <button
                  onClick={() => { setOpeningInput((openingBal?.amount ?? 0).toString()); setEditingOpening(true); }}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  title="Nhập số dư đầu kỳ"
                >
                  <Pencil className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>
            {editingOpening ? (
              <div className="space-y-1.5">
                <input
                  type="number"
                  value={openingInput}
                  onChange={(e) => setOpeningInput(e.target.value)}
                  placeholder="0"
                  className="w-full px-2 py-1 text-sm border border-blue-400 rounded-lg bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveOpening(); if (e.key === "Escape") setEditingOpening(false); }}
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleSaveOpening}
                    disabled={savingOpening}
                    className="flex-1 flex items-center justify-center gap-1 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-[11px] font-semibold transition"
                  >
                    {savingOpening ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Lưu
                  </button>
                  <button
                    onClick={() => setEditingOpening(false)}
                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className={cn("text-base font-bold leading-tight", tonDau >= 0 ? "text-slate-700 dark:text-slate-200" : "text-red-500")}>
                  {vnd(tonDau)}
                </p>
                <p className="text-[10px] text-slate-400">
                  {openingBal ? `Tồn đầu: ${vnd(openingBal.amount)}` : "Chưa nhập tồn đầu"}
                  {txNetBefore !== 0 && ` · PS trước kỳ: ${txNetBefore > 0 ? "+" : ""}${vnd(txNetBefore)}`}
                </p>
              </>
            )}
          </div>

          {/* Phát sinh thu */}
          <div className="rounded-xl p-3 space-y-0.5 bg-green-50 dark:bg-green-900/20">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Phát sinh thu</p>
            <p className="text-base font-bold leading-tight text-green-600">+{vnd(phatSinhThu)}</p>
            <p className="text-[10px] text-slate-400">{periodTx.filter((t) => t.direction === "CREDIT").length} giao dịch</p>
          </div>

          {/* Phát sinh chi */}
          <div className="rounded-xl p-3 space-y-0.5 bg-red-50 dark:bg-red-900/20">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Phát sinh chi</p>
            <p className="text-base font-bold leading-tight text-red-500">-{vnd(phatSinhChi)}</p>
            <p className="text-[10px] text-slate-400">{periodTx.filter((t) => t.direction === "DEBIT").length} giao dịch</p>
          </div>

          {/* Tồn cuối kỳ */}
          <div className={cn("rounded-xl p-3 space-y-0.5",
            tonCuoi > 0 ? "bg-green-50 dark:bg-green-900/20" : tonCuoi < 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-slate-50 dark:bg-slate-800")}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Tồn cuối kỳ</p>
            <p className={cn("text-base font-bold leading-tight",
              tonCuoi > 0 ? "text-green-600" : tonCuoi < 0 ? "text-red-500" : "text-slate-500")}>
              {tonCuoi > 0 ? "+" : ""}{vnd(tonCuoi)}
            </p>
            <p className="text-[10px] text-slate-400">{tonCuoi > 0 ? "Lời" : tonCuoi < 0 ? "Lỗ" : "Hòa vốn"}</p>
          </div>
        </div>

        {/* ── Phân tích nguồn thu & nguồn chi — luôn hiển thị ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Nguồn thu */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              Phân tích nguồn thu
              <span className="text-[11px] font-normal text-slate-400">({vnd(phatSinhThu)})</span>
            </p>
            {phatSinhThu === 0 ? (
              <div className="h-24 flex items-center justify-center">
                <p className="text-xs text-slate-400">Không có thu trong {rLabel.toLowerCase()}.</p>
              </div>
            ) : (
              <div className="flex gap-3 items-start">
                <div className="shrink-0" style={{ width: 110, height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={48} paddingAngle={2} innerRadius={24}>
                        {revBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => vnd(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5 py-1">
                  {revBreakdown.map(({ name, value, pct }, i) => (
                    <div key={name} className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-500 dark:text-slate-400 truncate flex-1" title={name}>{name}</span>
                      <span className="font-bold text-slate-700 dark:text-white shrink-0">{pct}%</span>
                      <span className="text-slate-400 shrink-0 text-[10px]">{Math.round(value/1000)}k</span>
                    </div>
                  ))}
                  {revSourceBreakdown.length > 1 && (
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
                      {revSourceBreakdown.map(({ name, pct }, i) => (
                        <div key={name} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[(revBreakdown.length + i) % PIE_COLORS.length] }} />
                          {name}: <span className="font-semibold text-slate-500">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Nguồn chi */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              Phân tích nguồn chi
              <span className="text-[11px] font-normal text-slate-400">({vnd(phatSinhChi)})</span>
            </p>
            {phatSinhChi === 0 ? (
              <div className="h-24 flex items-center justify-center">
                <p className="text-xs text-slate-400">Không có chi trong {rLabel.toLowerCase()}.</p>
              </div>
            ) : (
              <div className="flex gap-3 items-start">
                <div className="shrink-0" style={{ width: 110, height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={48} paddingAngle={2} innerRadius={24}>
                        {expBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => vnd(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5 py-1">
                  {expBreakdown.map(({ name, value, pct }, i) => (
                    <div key={name} className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-500 dark:text-slate-400 truncate flex-1" title={name}>{name}</span>
                      <span className="font-bold text-slate-700 dark:text-white shrink-0">{pct}%</span>
                      <span className="text-slate-400 shrink-0 text-[10px]">{Math.round(value/1000)}k</span>
                    </div>
                  ))}
                  {expSourceBreakdown.length > 1 && (
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
                      {expSourceBreakdown.map(({ name, pct }, i) => (
                        <div key={name} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[(expBreakdown.length + i) % PIE_COLORS.length] }} />
                          {name}: <span className="font-semibold text-slate-500">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Xu hướng — tuỳ chỉnh khoảng thời gian ── */}
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Xu hướng thu chi
              <span className="text-[11px] font-normal text-slate-400 ml-1">(nghìn đ)</span>
            </p>
            <div className="flex text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {([["3m","3 tháng"],["6m","6 tháng"],["12m","12 tháng"],["3y","3 năm"]] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setTrendRange(k)}
                  className={cn(
                    "px-2.5 py-1 font-medium transition",
                    trendRange === k
                      ? "bg-blue-600 text-white"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >{lbl}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cashFlowData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradChi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.red} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PALETTE.red} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradThu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.green} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PALETTE.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="chi" name="Chi" stroke={PALETTE.red} fill="url(#gradChi)" strokeWidth={2} />
              <Area type="monotone" dataKey="thu" name="Thu" stroke={PALETTE.green} fill="url(#gradThu)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1">
            {[{ color: PALETTE.red, label: "Chi tiêu" }, { color: PALETTE.green, label: "Thu về" }].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bảng chi tiết giao dịch trong kỳ ── */}
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          {/* Header + bộ lọc */}
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Chi tiết phát sinh trong kỳ
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                {periodTx.length} giao dịch
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Tìm kiếm */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Tìm danh mục, mô tả, người..."
                  className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                />
              </div>
              {/* Filter Thu/Chi */}
              <div className="flex text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {([["ALL","Tất cả"], ["CREDIT","Thu"], ["DEBIT","Chi"]] as const).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setDetailFilter(k)}
                    className={cn(
                      "px-2.5 py-1.5 font-medium transition",
                      detailFilter === k
                        ? k === "CREDIT" ? "bg-green-600 text-white"
                          : k === "DEBIT" ? "bg-red-500 text-white"
                          : "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >{lbl}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Bảng */}
          {detailTx.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {periodTx.length === 0 ? `Không có giao dịch trong ${rLabel.toLowerCase()}.` : "Không có kết quả phù hợp."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-left">
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Ngày</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Tên nhiệm vụ</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Người thực hiện</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Danh mục</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Nguồn quỹ</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400 max-w-xs">Mô tả</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">Số tiền</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 dark:text-slate-400 text-center">CT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {detailTx.map((t) => {
                    const isCredit = t.direction === "CREDIT";
                    const taskName = t.taskName ?? taskNameById[t.taskId] ?? t.taskId;
                    const fundLabel = t.fundSource === "ADVANCE" ? "Tạm ứng"
                      : t.fundSource === "OUT_OF_POCKET" ? "Tự ứng" : "Doanh thu";
                    const fundCls = t.fundSource === "ADVANCE"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : t.fundSource === "OUT_OF_POCKET"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition group">
                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                          {format(parseISO(t.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </td>
                        <td className="px-3 py-2.5 max-w-[160px]">
                          <Link href={`/tasks/${t.taskId}`}
                            className="text-blue-600 hover:underline dark:text-blue-400 line-clamp-1"
                            title={taskName}>
                            {taskName}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.createdByName}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{t.category}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", fundCls)}>{fundLabel}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 max-w-xs">
                          <span className="line-clamp-2" title={t.description}>{t.description || "—"}</span>
                        </td>
                        <td className={cn("px-3 py-2.5 text-right font-semibold whitespace-nowrap",
                          isCredit ? "text-green-600" : "text-red-500")}>
                          {isCredit ? "+" : "-"}{vnd(t.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {t.proofs?.length > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-semibold">
                              {t.proofs.length}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Dòng tổng cộng */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <td colSpan={6} className="px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Tổng ({detailTx.length} giao dịch)
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(() => {
                        const thu = detailTx.filter(t => t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
                        const chi = detailTx.filter(t => t.direction === "DEBIT").reduce((s, t) => s + t.amount, 0);
                        const net = thu - chi;
                        return (
                          <div className="space-y-0.5">
                            {thu > 0 && <div className="text-[11px] font-semibold text-green-600">+{vnd(thu)}</div>}
                            {chi > 0 && <div className="text-[11px] font-semibold text-red-500">-{vnd(chi)}</div>}
                            <div className={cn("text-xs font-bold border-t border-slate-200 dark:border-slate-700 pt-0.5",
                              net >= 0 ? "text-green-600" : "text-red-500")}>
                              {net > 0 ? "+" : ""}{vnd(net)}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Tồn đầu kỳ — chi tiết (collapsible) */}
          {prePeriodTx.length > 0 || openingBal ? (
            <div className="border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowPrePeriod((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <span className="flex items-center gap-1.5">
                  {showPrePeriod ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Chi tiết tồn đầu kỳ
                  <span className="text-slate-400">
                    ({openingBal ? `Tồn đầu: ${vnd(openingBal.amount)}` : "Không có tồn đầu"}
                    {prePeriodTx.length > 0 ? ` + ${prePeriodTx.length} GD trước kỳ` : ""})
                  </span>
                </span>
                <span className={cn("font-semibold", tonDau >= 0 ? "text-slate-700 dark:text-slate-200" : "text-red-500")}>
                  = {vnd(tonDau)}
                </span>
              </button>
              {showPrePeriod && (
                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                  {openingBal && (
                    <div className="px-4 py-2 bg-blue-50/50 dark:bg-blue-900/10 flex items-center justify-between text-[11px]">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">Tồn đầu kỳ gốc (nhập tay)</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300">+{vnd(openingBal.amount)}</span>
                    </div>
                  )}
                  {prePeriodTx.length > 0 && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 text-left">
                          <th className="px-3 py-2 font-semibold text-slate-400">Ngày</th>
                          <th className="px-3 py-2 font-semibold text-slate-400">Tên nhiệm vụ</th>
                          <th className="px-3 py-2 font-semibold text-slate-400">Danh mục</th>
                          <th className="px-3 py-2 font-semibold text-slate-400 text-right">Số tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                        {[...prePeriodTx]
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                                {format(parseISO(t.createdAt), "dd/MM/yyyy", { locale: vi })}
                              </td>
                              <td className="px-3 py-2">
                                <Link href={`/tasks/${t.taskId}`} className="text-blue-600 hover:underline dark:text-blue-400 line-clamp-1">
                                  {t.taskName ?? taskNameById[t.taskId] ?? t.taskId}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-slate-500">{t.category}</td>
                              <td className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap",
                                t.direction === "CREDIT" ? "text-green-600" : "text-red-500")}>
                                {t.direction === "CREDIT" ? "+" : "-"}{vnd(t.amount)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Search + Tabs ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Search */}
        <div className="px-4 pt-4 pb-0 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo tên, phân loại, người tạo..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-4 mt-3">
          {[
            { key: "advances", label: `Tạm ứng / Tự ứng`, count: advances.filter((a) => a.status === "PENDING").length },
            { key: "transactions", label: `Giao dịch (${myTx.length})`, count: 0 },
            ...(isApproverView && allSummaries.length > 0
              ? [{ key: "tasks", label: `Theo nhiệm vụ (${allSummaries.length})`, count: 0 }]
              : []
            ),
            ...(isApproverView
              ? [{ key: "trial-payments", label: `Thanh toán TNLS`, count: 0 }]
              : []
            ),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition border-b-2 flex items-center gap-1.5",
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Đơn tạm ứng ── */}
        {activeTab === "advances" && (
          <div>
            {/* Filter chips */}
            <div className="flex gap-1.5 px-4 py-3 flex-wrap">
              {(["ALL", "PENDING", "APPROVED", "PENDING_SETTLEMENT", "REJECTED", "SETTLED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAdvFilter(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-medium transition",
                    advFilter === s
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  {s === "ALL" ? `Tất cả (${advances.length})` : ADV_STATUS[s].label}
                  {s !== "ALL" && <span className="ml-1">({advances.filter((a) => a.status === s).length})</span>}
                </button>
              ))}
            </div>

            {filteredAdvances.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-10">Không có đơn tạm ứng nào.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAdvances.map((adv) => {
                  const s          = ADV_STATUS[adv.status];
                  const isLoading  = loadingId === adv.id;
                  const isExpanded = expandedAdvId === adv.id;
                  const isSelfPaidMode = (adv.mode ?? "ADVANCE") === "SELF_PAID";
                  // Tạm ứng: tài khoản thu thập lúc đề nghị. Tự ứng: tài khoản thu thập lúc nộp quyết toán.
                  const ba         = isSelfPaidMode ? adv.settlementBankAccount : adv.bankAccount;
                  const qrAmount   = isSelfPaidMode ? (adv.settlementAmountUsed ?? 0) : adv.amount;
                  const qrPurpose  = isSelfPaidMode ? `Hoàn ứng: ${adv.purpose}` : adv.purpose;
                  const qrUrl      = ba
                    ? `https://img.vietqr.io/image/${ba.bankId}-${ba.accountNumber}-compact2.png` +
                      `?amount=${qrAmount}&addInfo=${encodeURIComponent(qrPurpose)}&accountName=${encodeURIComponent(ba.accountName)}`
                    : "";
                  // Tạm ứng tự hiện QR lúc PENDING (chờ duyệt chi); Tự ứng tự hiện lúc PENDING_SETTLEMENT (chờ duyệt hoàn ứng).
                  const autoShowStatus = isSelfPaidMode ? "PENDING_SETTLEMENT" : "PENDING";
                  const showQrPanel = (adv.status === autoShowStatus && !!ba) || (isExpanded && !!ba);

                  return (
                    <div key={adv.id} className={cn(adv.status === autoShowStatus && ba ? "bg-amber-50/30 dark:bg-amber-900/5" : "")}>
                      {/* ── Main row ── */}
                      <div className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
                        {/* Icon */}
                        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 mt-0.5">
                          <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0",
                              (adv.mode ?? "ADVANCE") === "ADVANCE" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700")}>
                              {(adv.mode ?? "ADVANCE") === "ADVANCE" ? "Tạm ứng" : "Tự ứng"}
                            </span>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{adv.purpose}</p>
                            <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium", s.cls)}>
                              {s.icon} {s.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {adv.requestedByName} ·{" "}
                            {format(parseISO(adv.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                            {adv.stepName && (
                              <span className="ml-1 text-slate-500">· Bước: <strong>{adv.stepName}</strong></span>
                            )}
                          </p>
                          {adv.status === "APPROVED" && (
                            <div className="flex gap-3 mt-1 text-[11px]">
                              <span className="text-slate-500">Đã chi: <strong className="text-red-600">{vnd(adv.usedAmount)}</strong></span>
                              <span className="text-slate-500">Còn lại: <strong className="text-green-600">{vnd(adv.remainingAmount)}</strong></span>
                            </div>
                          )}
                          {adv.status === "PENDING_SETTLEMENT" && (
                            <div className="mt-1 text-[11px] text-blue-600 dark:text-blue-400 space-y-0.5">
                              <p>Đã chi: <strong>{vnd(adv.settlementAmountUsed ?? 0)}</strong></p>
                              {adv.mode === "SELF_PAID" && adv.settlementBankAccount && (
                                <p className="text-slate-400">
                                  Chuyển hoàn ứng tới: <strong>{adv.settlementBankAccount.bankName} · {adv.settlementBankAccount.accountNumber} · {adv.settlementBankAccount.accountName}</strong>
                                </p>
                              )}
                              {adv.settlementNotes && <p className="text-slate-400">Ghi chú: {adv.settlementNotes}</p>}
                              {adv.settlementProofs && adv.settlementProofs.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {adv.settlementProofs.map((p) => (
                                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer"
                                      className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:underline bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                                      <FileText className="w-2.5 h-2.5" /> {p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {adv.status === "SETTLED" && adv.settlementDifference !== undefined && (
                            <p className="text-[11px] mt-1 text-slate-400">
                              Quyết toán:{" "}
                              <span className={cn("font-semibold",
                                adv.settlementDifference > 0 ? "text-orange-600" :
                                adv.settlementDifference < 0 ? "text-blue-600" : "text-green-600"
                              )}>
                                {adv.settlementDifference === 0 ? "Cân bằng" :
                                 adv.settlementDifference > 0 ? `Trả lại ${vnd(adv.settlementDifference)}` :
                                 `Nhận thêm ${vnd(Math.abs(adv.settlementDifference))}`}
                              </span>
                            </p>
                          )}
                          <Link href={`/tasks/${adv.taskId}`} className="text-[10px] text-blue-500 hover:underline mt-0.5 inline-block">
                            → Xem nhiệm vụ
                          </Link>
                        </div>

                        {/* Amount + Actions */}
                        <div className="text-right shrink-0 space-y-1.5">
                          <p className="text-base font-bold text-slate-800 dark:text-white">{vnd(adv.amount)}</p>
                          {canApprove && adv.status === "PENDING" && (
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => handleApproveAdv(adv)}
                                disabled={!!isLoading}
                                className="px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1"
                              >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Duyệt
                              </button>
                              <button
                                onClick={() => setRejectTarget({ type: "advance", id: adv.id })}
                                disabled={!!isLoading}
                                className="px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-[11px] font-medium transition flex items-center gap-1"
                              >
                                <X className="w-3 h-3" /> Từ chối
                              </button>
                            </div>
                          )}
                          {canApprove && adv.status === "PENDING_SETTLEMENT" && (
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => handleApproveSettlement(adv)}
                                disabled={!!isLoading}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1"
                              >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Duyệt TT
                              </button>
                              <button
                                onClick={() => setRejectTarget({ type: "settlement", id: adv.id })}
                                disabled={!!isLoading}
                                className="px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-[11px] font-medium transition flex items-center gap-1"
                              >
                                <X className="w-3 h-3" /> Từ chối
                              </button>
                            </div>
                          )}
                          {/* Toggle chi tiết chỉ hiện khi không tự động hiện sẵn */}
                          {adv.status !== autoShowStatus && ba && (
                            <button
                              onClick={() => setExpandedAdvId(isExpanded ? null : adv.id)}
                              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition ml-auto"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              {isExpanded ? "Ẩn TK" : "Xem TK"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ── Bank info + QR (tự hiện khi PENDING, toggle khi trạng thái khác) ── */}
                      {showQrPanel && (
                        <div className="mx-4 mb-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800 shadow-sm">
                          <div className="flex flex-col sm:flex-row gap-4 items-start">
                            {/* Bank details */}
                            <div className="flex-1 space-y-2 min-w-0">
                              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                <CreditCard className="w-3.5 h-3.5" />
                                {isSelfPaidMode ? "Thông tin chuyển khoản hoàn ứng" : "Thông tin chuyển khoản tạm ứng"}
                              </p>
                              <div className="space-y-1.5">
                                <div className="flex justify-between gap-4 items-center">
                                  <span className="text-[11px] text-slate-500">Ngân hàng</span>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{ba.bankName}</span>
                                </div>
                                <div className="flex justify-between gap-4 items-center">
                                  <span className="text-[11px] text-slate-500">Số tài khoản</span>
                                  <span className="font-mono font-bold text-slate-800 dark:text-white text-sm tracking-widest">{ba.accountNumber}</span>
                                </div>
                                <div className="flex justify-between gap-4 items-center">
                                  <span className="text-[11px] text-slate-500">Chủ tài khoản</span>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase">{ba.accountName}</span>
                                </div>
                                <div className="flex justify-between gap-4 items-center pt-1.5 border-t border-slate-100 dark:border-slate-700">
                                  <span className="text-[11px] text-slate-500">Số tiền</span>
                                  <span className="font-bold text-amber-600 text-base">{vnd(qrAmount)}</span>
                                </div>
                                <div className="pt-1">
                                  <p className="text-[10px] text-slate-400 mb-0.5">Nội dung chuyển khoản:</p>
                                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium break-all bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded-lg">{qrPurpose}</p>
                                </div>
                              </div>
                            </div>

                            {/* QR Code */}
                            <div className="flex flex-col items-center gap-1.5 shrink-0">
                              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                <QrCode className="w-3 h-3" /> Quét để chuyển khoản
                              </p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={qrUrl}
                                alt="QR chuyển khoản"
                                className="w-44 h-44 object-contain rounded-xl border-2 border-amber-200 dark:border-amber-700 bg-white p-1"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).alt = "Không tải được QR";
                                  (e.target as HTMLImageElement).className = "w-44 h-44 flex items-center justify-center text-xs text-red-400";
                                }}
                              />
                              <p className="text-[10px] text-slate-400 text-center">{ba.bankName}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Đơn hoàn ứng ── */}
        {/* ── Tab: Giao dịch gần đây ── */}
        {activeTab === "transactions" && (
          <div>
            {filteredTx.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-10">Chưa có giao dịch nào.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTx.slice(0, 50).map((tx) => {
                  const src = TX_SOURCE[tx.fundSource];
                  return (
                    <div key={tx.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        tx.direction === "DEBIT"
                          ? "bg-red-50 dark:bg-red-900/20"
                          : "bg-green-50 dark:bg-green-900/20"
                      )}>
                        {tx.direction === "DEBIT"
                          ? <ArrowDownCircle className="w-4 h-4 text-red-500" />
                          : <ArrowUpCircle className="w-4 h-4 text-green-500" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{tx.description}</p>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md", src.cls)}>
                            {src.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {tx.category} · {tx.createdByName} ·{" "}
                          {format(parseISO(tx.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-bold", tx.direction === "DEBIT" ? "text-red-600" : "text-green-600")}>
                          {tx.direction === "DEBIT" ? "−" : "+"}{vnd(tx.amount)}
                        </p>
                        <Link href={`/tasks/${tx.taskId}`}
                          className="text-[10px] text-blue-500 hover:underline">
                          Task →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Theo nhiệm vụ ── */}
        {activeTab === "tasks" && isApproverView && (
          <div className="p-4 space-y-3">
            {/* Tổng cộng */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center text-xs">
              {[
                { label: "Tổng ngân sách",  value: vnd(orgBudgetTotal),   color: "text-slate-700 dark:text-slate-200" },
                { label: "Tổng chi",         value: vnd(orgTotalExpense),  color: "text-red-600" },
                { label: "Tổng thu",         value: vnd(orgTotalRevenue),  color: "text-green-600" },
                { label: "Chênh lệch",       value: (orgNetCashFlow > 0 ? "+" : "") + vnd(orgNetCashFlow),
                  color: orgNetCashFlow > 0 ? "text-green-600 font-bold" : orgNetCashFlow < 0 ? "text-red-500 font-bold" : "text-slate-500" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-slate-400">{label}</p>
                  <p className={cn("text-sm font-semibold", color)}>{value}</p>
                </div>
              ))}
            </div>

            {allSummaries.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Chưa có nhiệm vụ nào phát sinh tài chính.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Nhiệm vụ</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Ngân sách</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Tạm ứng</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Chi</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Thu</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Chênh lệch</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[...allSummaries].sort((a, b) => (b.totalExpense + b.totalRevenue) - (a.totalExpense + a.totalRevenue)).map((s) => {
                      const net = s.netCashFlow;
                      return (
                        <tr key={s.taskId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group">
                          <td className="px-3 py-2.5">
                            <Link href={`/tasks/${s.taskId}`}
                              className="font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition line-clamp-1">
                              {s.taskName ?? s.taskId}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{s.budget > 0 ? vnd(s.budget) : "—"}</td>
                          <td className="px-3 py-2.5 text-right text-blue-600">{s.totalAdvanced > 0 ? vnd(s.totalAdvanced) : "—"}</td>
                          <td className="px-3 py-2.5 text-right text-red-500">{s.totalExpense > 0 ? vnd(s.totalExpense) : "—"}</td>
                          <td className="px-3 py-2.5 text-right text-green-600">{s.totalRevenue > 0 ? vnd(s.totalRevenue) : "—"}</td>
                          <td className={cn("px-3 py-2.5 text-right font-semibold",
                            net > 0 ? "text-green-600" : net < 0 ? "text-red-500" : "text-slate-400")}>
                            {net !== 0 ? (net > 0 ? "+" : "") + vnd(net) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                              s.financialStatus === "SETTLED"
                                ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                : s.financialStatus === "RECONCILING"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            )}>
                              {s.financialStatus === "SETTLED" ? "Đã QT" : s.financialStatus === "RECONCILING" ? "Đang QT" : "Hoạt động"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Thanh toán thử nghiệm lâm sàng ── */}
        {activeTab === "trial-payments" && isApproverView && (
          <div className="p-4 space-y-6">
            <DistributionApprovalsList onApproved={refetchTransactions} />
            <ClinicalTrialPaymentApprovals
              approverUserId={currentUser?.id || ""}
              approverName={currentUser?.name || ""}
              approverRole={currentUser?.role}
              approverPosition={currentUser?.position}
              canApprove={true}
              onEditPayment={(payment) => setEditingPayment(payment)}
            />
          </div>
        )}
      </div>

      {/* ── Reject dialog ── */}
      {rejectTarget && (
        <RejectDialog
          onConfirm={async (reason) => {
            if (rejectTarget.type === "advance") {
              await handleRejectAdv(rejectTarget.id, reason);
            } else {
              await handleRejectSettlement(rejectTarget.id, reason);
            }
          }}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* ── Payment Detail Modal ── */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                Đề nghị thanh toán: {editingPayment.paymentName || `Thanh toán ${editingPayment.batchNo || "1"}`}
              </h2>
              <button
                onClick={() => setEditingPayment(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Mã TNLS</p>
                <p className="font-medium text-slate-800 dark:text-white">{editingPayment.trialCode}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Tên thử nghiệm</p>
                <p className="font-medium text-slate-800 dark:text-white">{editingPayment.trialName}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Ngày</p>
                <p className="font-medium text-slate-800 dark:text-white">
                  {editingPayment.date ? new Date(editingPayment.date).toLocaleDateString("vi-VN") : "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Số tiền</p>
                <p className="font-medium text-slate-800 dark:text-white">
                  {vnd(editingPayment.totalAmount || 0)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Người đề nghị</p>
                <p className="font-medium text-slate-800 dark:text-white">{editingPayment.submitterName || "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Trạng thái</p>
                <p className="font-medium text-slate-800 dark:text-white">
                  {editingPayment.status === "approved" && "✓ Đã duyệt"}
                  {editingPayment.status === "rejected" && "✗ Từ chối"}
                  {!editingPayment.status || editingPayment.status === "pending" ? "⏳ Chờ duyệt" : ""}
                </p>
              </div>
            </div>

            {/* Cost Splitting */}
            {editingPayment.costItems && editingPayment.costItems.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Phân chia chi phí</p>
                <div className="space-y-2 text-sm">
                  {editingPayment.costItems.map((item: CostItem) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-2 rounded">
                      <div>
                        <p className="text-slate-600 dark:text-slate-400">{item.name}</p>
                        {item.unit && <p className="text-xs text-slate-500 dark:text-slate-400">→ {item.unit}</p>}
                      </div>
                      <span className="font-medium text-slate-800 dark:text-white">
                        {vnd(editingPayment.totalAmount && item.percentage
                          ? (editingPayment.totalAmount * item.percentage) / 100
                          : item.amount || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phase 4: Settlement Confirmation */}
            {editingPayment.status === "approved" && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <SettlementConfirmationUI
                  payment={editingPayment}
                  trialId={editingPayment.trialId}
                  onSettlementUpdated={() => {
                    // Refresh payment data
                    setEditingPayment(null);
                  }}
                />
              </div>
            )}

            {editingPayment.note && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">Ghi chú</p>
                <p className="text-sm text-slate-800 dark:text-white mt-1">{editingPayment.note}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setEditingPayment(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
