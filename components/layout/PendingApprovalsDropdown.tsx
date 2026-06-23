"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, CheckCircle2, DollarSign, Banknote, CreditCard,
  ChevronRight, Loader2, InboxIcon,
} from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { getAllAdvanceRequests, getAllReimbursementRequests } from "@/lib/firebase/finance";
import { formatRelativeTime } from "@/lib/utils";
import type { AdvanceRequest, ReimbursementRequest } from "@/types";

const VND = (n: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND", maximumFractionDigits: 0,
  }).format(n);

type PendingItem =
  | { kind: "task";    id: string; name: string; submittedAt: string; taskId: string }
  | { kind: "advance"; id: string; name: string; amount: number; submittedAt: string; taskId: string }
  | { kind: "settlement"; id: string; name: string; amount: number; submittedAt: string; taskId: string }
  | { kind: "reimbursement"; id: string; name: string; amount: number; submittedAt: string; taskId: string };

const KIND_CONFIG: Record<PendingItem["kind"], { label: string; color: string; icon: React.ReactNode; href: (item: PendingItem) => string }> = {
  task:          { label: "Nhiệm vụ",    color: "bg-violet-100 text-violet-700",  icon: <CheckCircle2 className="w-4 h-4" />,  href: (i) => `/tasks?taskId=${i.taskId}` },
  advance:       { label: "Tạm ứng",     color: "bg-blue-100 text-blue-700",      icon: <DollarSign className="w-4 h-4" />,    href: (i) => `/finance?tab=advances&task=${i.taskId}` },
  settlement:    { label: "Quyết toán",  color: "bg-amber-100 text-amber-700",    icon: <Banknote className="w-4 h-4" />,      href: (i) => `/finance?tab=advances&task=${i.taskId}` },
  reimbursement: { label: "Hoàn ứng",   color: "bg-emerald-100 text-emerald-700", icon: <CreditCard className="w-4 h-4" />,   href: (i) => `/finance?tab=reimbursements&task=${i.taskId}` },
};

interface Props {
  /** Chỉ show với các role này */
  allowedRoles: string[];
  currentRole?: string;
}

export function PendingApprovalsDropdown({ allowedRoles, currentRole }: Props) {
  const router = useRouter();
  const { tasks } = useTaskStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [financeItems, setFinanceItems] = useState<PendingItem[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);

  // Tasks đang chờ phê duyệt (status = "review")
  const pendingTasks: PendingItem[] = tasks
    .filter((t) => t.status === "review")
    .map((t) => ({
      kind: "task",
      id: t.id,
      name: t.name,
      submittedAt: t.updatedAt ?? t.createdAt,
      taskId: t.id,
    }));

  const totalCount = pendingTasks.length + financeItems.length;
  const isAllowed = currentRole && allowedRoles.includes(currentRole);

  // Load finance items khi dropdown mở
  useEffect(() => {
    if (!open || !isAllowed) return;
    setLoading(true);
    Promise.all([
      getAllAdvanceRequests(["PENDING", "PENDING_SETTLEMENT"]),
      getAllReimbursementRequests("SUBMITTED"),
    ])
      .then(([advances, reimbs]) => {
        const adv: PendingItem[] = advances.map((a) => ({
          kind: a.status === "PENDING_SETTLEMENT" ? "settlement" : "advance",
          id: a.id,
          name: a.purpose,
          amount: a.amount,
          submittedAt: a.updatedAt ?? a.createdAt,
          taskId: a.taskId,
        }));
        const rei: PendingItem[] = reimbs.map((r) => ({
          kind: "reimbursement",
          id: r.id,
          name: r.description,
          amount: r.amount,
          submittedAt: r.submittedAt ?? r.createdAt,
          taskId: r.taskId,
        }));
        setFinanceItems([...adv, ...rei]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, isAllowed]);

  // Đóng khi click ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!isAllowed) return null;

  // Tổng count cho badge (dùng pendingTasks + financeItems đã load, hoặc chỉ pendingTasks trước khi load)
  const badgeCount = open ? totalCount : pendingTasks.length;
  if (badgeCount === 0 && !open) return null;

  function handleItemClick(item: PendingItem) {
    setOpen(false);
    router.push(KIND_CONFIG[item.kind].href(item));
  }

  const allItems: PendingItem[] = [...pendingTasks, ...financeItems];

  return (
    <div ref={dropRef} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
          open
            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
            : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30"
        }`}
      >
        <Clock className="w-3.5 h-3.5" />
        {badgeCount > 0 ? `${badgeCount} chờ duyệt` : "Chờ duyệt"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              Mục chờ phê duyệt
            </p>
            {totalCount > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{totalCount} mục cần xử lý</p>
            )}
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Đang tải...</span>
              </div>
            ) : allItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <InboxIcon className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Không có mục nào chờ duyệt</p>
              </div>
            ) : (
              <ul>
                {allItems.map((item) => {
                  const cfg = KIND_CONFIG[item.kind];
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <button
                        onClick={() => handleItemClick(item)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left group"
                      >
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                          {cfg.icon}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-white line-clamp-1 leading-snug">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}>
                              {cfg.label}
                            </span>
                            {"amount" in item && (
                              <span className="text-xs text-slate-500 font-medium">{VND(item.amount)}</span>
                            )}
                            <span className="text-[10px] text-slate-400 ml-auto">
                              {formatRelativeTime(item.submittedAt)}
                            </span>
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 mt-2 transition-colors" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {totalCount > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => { setOpen(false); router.push("/tasks?pendingReview=true"); }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
              >
                Xem tất cả nhiệm vụ chờ duyệt →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
