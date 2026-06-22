"use client";

/**
 * Widget tóm tắt tài chính cho Dashboard chính.
 * Hiển thị: số đơn tạm ứng chờ duyệt, tổng chờ hoàn ứng, chi tiêu tháng này.
 * Click "Xem tất cả" → /finance
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { DollarSign, CreditCard, Wallet, TrendingDown, Clock, ArrowRight, AlertTriangle } from "lucide-react";
import {
  subscribeAllAdvanceRequests,
  subscribeAllReimbursementRequests,
  subscribeRecentTransactions,
} from "@/lib/firebase/finance";
import type { AdvanceRequest, ReimbursementRequest, FinancialTransaction } from "@/types";
import { cn } from "@/lib/utils";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
const vnd = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} tr`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : n.toString();

function StatRow({
  icon: Icon, iconColor, iconBg, label, value, alert,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; value: string; alert?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 px-3 py-2.5 rounded-xl",
      alert ? "bg-amber-50 dark:bg-amber-900/20" : "bg-[var(--muted)]/40"
    )}>
      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
      </div>
      <span className="flex-1 text-xs text-[var(--muted-foreground)] truncate">{label}</span>
      <span className={cn("text-sm font-bold", alert ? "text-amber-700 dark:text-amber-400" : "text-[var(--foreground)]")}>
        {value}
      </span>
    </div>
  );
}

export default function FinancialOverviewWidget() {
  const [advances,       setAdvances]       = useState<AdvanceRequest[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);
  const [transactions,   setTransactions]   = useState<FinancialTransaction[]>([]);

  useEffect(() => {
    const u1 = subscribeAllAdvanceRequests(setAdvances);
    const u2 = subscribeAllReimbursementRequests(setReimbursements);
    const u3 = subscribeRecentTransactions(setTransactions, 200);
    return () => { u1(); u2(); u3(); };
  }, []);

  // KPI aggregates
  const pendingAdvCount  = advances.filter((a) => a.status === "PENDING").length;
  const pendingAdvAmount = advances.filter((a) => a.status === "PENDING").reduce((s, a) => s + a.amount, 0);
  const pendingReimbAmt  = reimbursements.filter((r) => ["SUBMITTED", "APPROVED"].includes(r.status)).reduce((s, r) => s + r.amount, 0);

  const now = new Date();
  const monthRange = { start: startOfMonth(now), end: endOfMonth(now) };
  const expenseThisMonth = transactions
    .filter((t) => t.direction === "DEBIT")
    .filter((t) => { try { return isWithinInterval(parseISO(t.createdAt), monthRange); } catch { return false; } })
    .reduce((s, t) => s + t.amount, 0);

  const totalLiveAdvanced = advances
    .filter((a) => a.status === "APPROVED")
    .reduce((s, a) => s + a.remainingAmount, 0);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-[var(--foreground)]">Tài chính</span>
        </div>
        <Link
          href="/finance"
          className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
        >
          Xem tất cả <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Alert: đơn chờ duyệt */}
      {pendingAdvCount > 0 && (
        <Link href="/finance" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              {pendingAdvCount} đơn tạm ứng chờ duyệt
            </p>
            <p className="text-[10px] text-amber-600 dark:text-amber-500 truncate">
              Tổng: {new Intl.NumberFormat("vi-VN").format(pendingAdvAmount)} đ
            </p>
          </div>
        </Link>
      )}

      {/* Stat rows */}
      <div className="flex flex-col gap-1.5 flex-1">
        <StatRow
          icon={CreditCard}
          iconBg="bg-blue-50 dark:bg-blue-900/30"
          iconColor="#3B82F6"
          label="Số dư tạm ứng khả dụng"
          value={vnd(totalLiveAdvanced) + " đ"}
        />
        <StatRow
          icon={Wallet}
          iconBg="bg-purple-50 dark:bg-purple-900/30"
          iconColor="#8B5CF6"
          label="Chờ hoàn ứng"
          value={vnd(pendingReimbAmt) + " đ"}
          alert={pendingReimbAmt > 0}
        />
        <StatRow
          icon={TrendingDown}
          iconBg="bg-red-50 dark:bg-red-900/30"
          iconColor="#EF4444"
          label="Chi tiêu tháng này"
          value={vnd(expenseThisMonth) + " đ"}
        />
      </div>

      {/* Mini bar: tỷ lệ advance đã dùng */}
      {(() => {
        const totalApproved = advances.filter((a) => a.status === "APPROVED").reduce((s, a) => s + a.amount, 0);
        const totalUsed     = advances.filter((a) => a.status === "APPROVED").reduce((s, a) => s + a.usedAmount, 0);
        if (totalApproved === 0) return null;
        const pct = Math.min(Math.round((totalUsed / totalApproved) * 100), 100);
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
              <span>Tạm ứng đã chi</span>
              <span className={pct >= 80 ? "text-red-500 font-semibold" : ""}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-blue-500")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
