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
  ChevronDown, ChevronUp, ChevronRight, Filter, Search, Receipt, QrCode,
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
  subscribeAllReimbursementRequests,
  subscribeMyReimbursementRequests,
  subscribeRecentTransactions,
  approveAdvanceRequest,
  rejectAdvanceRequest,
  approveAdvanceSettlement,
  rejectAdvanceSettlement,
  approveReimbursement,
  markReimbursementPaid,
} from "@/lib/firebase/finance";
import type { AdvanceRequest, ReimbursementRequest, FinancialTransaction } from "@/types";
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { vi } from "date-fns/locale";

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

const REIMB_STATUS: Record<ReimbursementRequest["status"], { label: string; cls: string }> = {
  DRAFT:     { label: "Nháp",         cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  SUBMITTED: { label: "Đã nộp",       cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  APPROVED:  { label: "Đã duyệt",     cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  PAID:      { label: "Đã thanh toán", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  REJECTED:  { label: "Từ chối",      cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
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
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);
  const [transactions,   setTransactions]   = useState<FinancialTransaction[]>([]);

  const [activeTab, setActiveTab] = useState<"advances" | "reimbursements" | "transactions">("advances");
  const [advFilter, setAdvFilter] = useState<AdvanceRequest["status"] | "ALL">("ALL");
  const [rmbFilter, setRmbFilter] = useState<ReimbursementRequest["status"] | "ALL">("ALL");
  const [search,    setSearch]    = useState("");

  // Pending UI
  const [rejectTarget,   setRejectTarget]   = useState<{ type: "advance" | "reimb" | "settlement"; id: string; taskId?: string } | null>(null);
  const [loadingId,      setLoadingId]      = useState<string | null>(null);
  const [expandedAdvId,  setExpandedAdvId]  = useState<string | null>(null);

  const canApprove = currentUser && ["director", "hrAdmin", "teamLead"].includes(currentUser.role);

  // ── Subscriptions realtime (phân quyền: approver thấy tất cả, staff thấy của mình) ──
  useEffect(() => {
    if (!currentUser) return;
    const isApprover = ["director", "hrAdmin", "teamLead"].includes(currentUser.role);
    const unsub1 = isApprover
      ? subscribeAllAdvanceRequests(setAdvances)
      : subscribeMyAdvanceRequests(currentUser.id, setAdvances);
    const unsub2 = isApprover
      ? subscribeAllReimbursementRequests(setReimbursements)
      : subscribeMyReimbursementRequests(currentUser.id, setReimbursements);
    const unsub3 = subscribeRecentTransactions(setTransactions, 100);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [currentUser]);

  // ── KPI aggregates ────────────────────────────────────────────────────────
  const totalAdvanced     = advances.filter((a) => ["APPROVED", "PENDING_SETTLEMENT", "SETTLED"].includes(a.status)).reduce((s, a) => s + a.amount, 0);
  const pendingAdvCount   = advances.filter((a) => a.status === "PENDING").length;
  const pendingAdvAmount  = advances.filter((a) => a.status === "PENDING").reduce((s, a) => s + a.amount, 0);
  const pendingReimb      = reimbursements.filter((r) => ["SUBMITTED", "APPROVED"].includes(r.status)).reduce((s, r) => s + r.amount, 0);

  // ── Phân quyền giao dịch: approver thấy tất cả, staff chỉ thấy của mình ──
  const isApproverView = currentUser && ["director", "hrAdmin", "teamLead"].includes(currentUser.role);
  const myTx = isApproverView
    ? transactions
    : transactions.filter((t) => t.createdBy === currentUser?.id);

  const thisMonth = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
  const txThisMonth = myTx.filter((t) => {
    try { return isWithinInterval(parseISO(t.createdAt), thisMonth); } catch { return false; }
  });
  const expenseThisMonth = txThisMonth.filter((t) => t.direction === "DEBIT").reduce((s, t) => s + t.amount, 0);

  // ── 6-month cash flow chart data ──────────────────────────────────────────
  const cashFlowData = Array.from({ length: 6 }, (_, i) => {
    const monthDate = subMonths(new Date(), 5 - i);
    const label = format(monthDate, "MM/yyyy", { locale: vi });
    const range = { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
    const monthTx = myTx.filter((t) => {
      try { return isWithinInterval(parseISO(t.createdAt), range); } catch { return false; }
    });
    const chi = monthTx.filter((t) => t.direction === "DEBIT").reduce((s, t) => s + t.amount, 0);
    const thu = monthTx.filter((t) => t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
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

  const filteredReimbs = reimbursements
    .filter((r) => rmbFilter === "ALL" || r.status === rmbFilter)
    .filter((r) => !searchLower || r.description.toLowerCase().includes(searchLower) || r.requestedByName.toLowerCase().includes(searchLower));
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

  async function handleApproveReimb(reimb: ReimbursementRequest) {
    if (!currentUser) return;
    setLoadingId(reimb.id);
    try {
      await approveReimbursement(reimb.id, currentUser.id, currentUser.name);
      toast.success(`Đã duyệt đơn hoàn ứng ${vnd(reimb.amount)} cho ${reimb.requestedByName}.`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoadingId(null); }
  }

  async function handlePayReimb(reimb: ReimbursementRequest) {
    setLoadingId(reimb.id);
    try {
      await markReimbursementPaid(reimb.id, reimb.taskId);
      toast.success(`Đã xác nhận thanh toán ${vnd(reimb.amount)} cho ${reimb.requestedByName}.`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoadingId(null); }
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

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Tổng tạm ứng đang lưu hành"
          value={vnd(totalAdvanced)}
          sub={`${advances.filter((a) => ["APPROVED", "PENDING_SETTLEMENT"].includes(a.status)).length} đơn đang hoạt động`}
          icon={CreditCard}
          iconBg="bg-blue-50 dark:bg-blue-900/30"
          iconColor={PALETTE.blue}
        />
        <KpiCard
          label="Đơn tạm ứng chờ duyệt"
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
          sub={`${reimbursements.filter((r) => ["SUBMITTED", "APPROVED"].includes(r.status)).length} đơn chưa thanh toán`}
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
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dòng tiền 6 tháng */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
            Dòng tiền 6 tháng gần nhất <span className="text-[11px] font-normal text-slate-400">(đơn vị: nghìn đ)</span>
          </p>
          {cashFlowData.every((d) => d.chi === 0 && d.thu === 0) ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">Chưa có dữ liệu giao dịch.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
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
          )}
          <div className="flex gap-4 mt-2">
            {[
              { color: PALETTE.red, label: "Chi tiêu" },
              { color: PALETTE.green, label: "Thu về" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Phân loại chi tiêu */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
            Phân loại chi tiêu <span className="text-[11px] font-normal text-slate-400">(nghìn đ)</span>
          </p>
          {categoryData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">Chưa có dữ liệu.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={65} paddingAngle={2}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toLocaleString("vi-VN")} nghìn đ`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {categoryData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-slate-500 dark:text-slate-400 truncate flex-1">{d.name}</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{d.value.toLocaleString("vi-VN")}k</span>
                  </div>
                ))}
              </div>
            </>
          )}
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
            { key: "advances", label: `Tạm ứng`, count: advances.filter((a) => a.status === "PENDING").length, badge: "pending" },
            { key: "reimbursements", label: `Hoàn ứng`, count: reimbursements.filter((r) => r.status === "SUBMITTED").length, badge: "pending" },
            { key: "transactions", label: `Giao dịch (${transactions.length})`, count: 0, badge: "" },
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
                  const ba         = adv.bankAccount;
                  const qrUrl      = ba
                    ? `https://img.vietqr.io/image/${ba.bankId}-${ba.accountNumber}-compact2.png` +
                      `?amount=${adv.amount}&addInfo=${encodeURIComponent(adv.purpose)}&accountName=${encodeURIComponent(ba.accountName)}`
                    : "";
                  // PENDING + có tài khoản → luôn hiện QR panel (người duyệt thấy ngay)
                  const showQrPanel = (adv.status === "PENDING" && !!ba) || (isExpanded && !!ba);

                  return (
                    <div key={adv.id} className={cn(adv.status === "PENDING" && ba ? "bg-amber-50/30 dark:bg-amber-900/5" : "")}>
                      {/* ── Main row ── */}
                      <div className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
                        {/* Icon */}
                        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 mt-0.5">
                          <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                          {/* Toggle chi tiết chỉ hiện cho trạng thái đã xử lý */}
                          {adv.status !== "PENDING" && ba && (
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
                                Thông tin chuyển khoản tạm ứng
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
                                  <span className="font-bold text-amber-600 text-base">{vnd(adv.amount)}</span>
                                </div>
                                <div className="pt-1">
                                  <p className="text-[10px] text-slate-400 mb-0.5">Nội dung chuyển khoản:</p>
                                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium break-all bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded-lg">{adv.purpose}</p>
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
        {activeTab === "reimbursements" && (
          <div>
            {/* Filter chips */}
            <div className="flex gap-1.5 px-4 py-3 flex-wrap">
              {(["ALL", "SUBMITTED", "APPROVED", "PAID", "REJECTED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setRmbFilter(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-medium transition",
                    rmbFilter === s
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  {s === "ALL" ? `Tất cả (${reimbursements.length})` : REIMB_STATUS[s].label}
                  {s !== "ALL" && <span className="ml-1">({reimbursements.filter((r) => r.status === s).length})</span>}
                </button>
              ))}
            </div>

            {filteredReimbs.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-10">Không có đơn hoàn ứng nào.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReimbs.map((reimb) => {
                  const s = REIMB_STATUS[reimb.status];
                  const isLoading = loadingId === reimb.id;
                  return (
                    <div key={reimb.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Receipt className="w-4 h-4 text-purple-600" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{reimb.description}</p>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", s.cls)}>{s.label}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {reimb.requestedByName} ·{" "}
                          {format(parseISO(reimb.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </p>
                        {reimb.proofs.length > 0 && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <FileText className="w-3 h-3 inline mr-0.5" />
                            {reimb.proofs.length} chứng từ đính kèm
                          </p>
                        )}
                        <Link href={`/tasks/${reimb.taskId}`}
                          className="text-[10px] text-blue-500 hover:underline mt-0.5 inline-block">
                          → Xem nhiệm vụ
                        </Link>
                      </div>

                      <div className="text-right shrink-0 space-y-1.5">
                        <p className="text-base font-bold text-slate-800 dark:text-white">{vnd(reimb.amount)}</p>
                        {canApprove && (
                          <div className="flex gap-1.5 justify-end flex-wrap">
                            {reimb.status === "SUBMITTED" && (
                              <>
                                <button
                                  onClick={() => handleApproveReimb(reimb)}
                                  disabled={!!isLoading}
                                  className="px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1"
                                >
                                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Duyệt
                                </button>
                                <button
                                  onClick={() => setRejectTarget({ type: "reimb", id: reimb.id, taskId: reimb.taskId })}
                                  disabled={!!isLoading}
                                  className="px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-[11px] font-medium transition"
                                >
                                  <X className="w-3 h-3 inline mr-0.5" /> Từ chối
                                </button>
                              </>
                            )}
                            {reimb.status === "APPROVED" && (
                              <button
                                onClick={() => handlePayReimb(reimb)}
                                disabled={!!isLoading}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1"
                              >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                                Xác nhận trả tiền
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
      </div>

      {/* ── Reject dialog ── */}
      {rejectTarget && (
        <RejectDialog
          onConfirm={async (reason) => {
            if (rejectTarget.type === "advance") {
              await handleRejectAdv(rejectTarget.id, reason);
            } else if (rejectTarget.type === "settlement") {
              await handleRejectSettlement(rejectTarget.id, reason);
            } else {
              // Hoàn ứng từ chối
              setLoadingId(rejectTarget.id);
              try {
                const db = (await import("@/lib/firebase/config")).getDb();
                const { updateDoc, doc } = await import("firebase/firestore");
                await updateDoc(doc(db, "reimbursementRequests", rejectTarget.id), {
                  status: "REJECTED",
                  rejectedReason: reason,
                  updatedAt: new Date().toISOString(),
                });
                toast.success("Đã từ chối đơn hoàn ứng.");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setLoadingId(null);
                setRejectTarget(null);
              }
            }
          }}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
