"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FlaskConical, Plus, Loader2, Search, Building2, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { getClinicalTrials } from "@/lib/firebase/firestore";
import { TrialFormModal } from "@/components/clinical-trials/TrialFormModal";
import { CLINICAL_TRIAL_STATUS_LABEL, CLINICAL_TRIAL_TERMINAL_BRANCHES } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus } from "@/types";

const STATUS_BADGE: Record<ClinicalTrialStatus, string> = {
  feasibility:            "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  awaiting_sponsor:       "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  preparing_ethics:       "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  national_ethics_met:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  lec_approved:           "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  awaiting_moh:           "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pre_deployment:         "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  running_pre_enroll:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  running_enrolled:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  completed:              "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  terminated_no_efficacy: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  not_feasible:           "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

interface StatCardProps {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}
function StatCard({ label, value, active, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition bg-[var(--card)] border-[var(--border)] hover:opacity-80",
        active && "ring-2 ring-violet-400 ring-offset-1",
      )}
    >
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
      <p className="text-2xl font-bold mt-1 leading-none text-slate-700 dark:text-slate-200">{value}</p>
    </button>
  );
}

export default function ClinicalTrialsPage() {
  const { currentUser } = useAuthStore();
  const [trials, setTrials] = useState<ClinicalTrial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClinicalTrialStatus | "all" | "running" | "ended">("all");
  const [showForm, setShowForm] = useState(false);

  const canCreate = !!currentUser && hasPermission(currentUser.role, "trial:create");

  useEffect(() => {
    getClinicalTrials().then((data) => { setTrials(data); setLoading(false); });
  }, []);

  const stats = useMemo(() => {
    const running = trials.filter((t) => t.status === "running_pre_enroll" || t.status === "running_enrolled").length;
    const pending = trials.filter((t) =>
      !["running_pre_enroll", "running_enrolled", "completed", ...CLINICAL_TRIAL_TERMINAL_BRANCHES].includes(t.status)
    ).length;
    const completed = trials.filter((t) => t.status === "completed").length;
    const ended = trials.filter((t) => (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(t.status)).length;
    return { total: trials.length, running, pending, completed, ended };
  }, [trials]);

  const filtered = useMemo(() => {
    let list = trials;
    if (statusFilter === "running") {
      list = list.filter((t) => t.status === "running_pre_enroll" || t.status === "running_enrolled");
    } else if (statusFilter === "ended") {
      list = list.filter((t) => t.status === "completed" || (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(t.status));
    } else if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.code?.toLowerCase().includes(q) ||
        t.abbreviation?.toLowerCase().includes(q) ||
        t.sponsor?.toLowerCase().includes(q) ||
        t.department?.toLowerCase().includes(q) ||
        t.principalInvestigatorName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [trials, statusFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-violet-500" />
            Thử nghiệm lâm sàng
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Quản lý & theo dõi các nghiên cứu thử nghiệm lâm sàng</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> Đăng ký TNLS
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng số"        value={stats.total}     active={statusFilter === "all"}     onClick={() => setStatusFilter("all")} />
        <StatCard label="Đang chạy"      value={stats.running}   active={statusFilter === "running"} onClick={() => setStatusFilter("running")} />
        <StatCard label="Đang chuẩn bị"  value={stats.pending} />
        <StatCard label="Đã kết thúc"    value={stats.completed + stats.ended} active={statusFilter === "ended"} onClick={() => setStatusFilter("ended")} />
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã, tên, PI, khoa, tài trợ..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Chưa có thử nghiệm lâm sàng nào</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/clinical-trials/${t.id}`}
              className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-[var(--card)] p-4 hover:border-blue-300 dark:hover:border-blue-600 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-white">
                      {t.abbreviation || t.code}
                    </span>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", STATUS_BADGE[t.status])}>
                      {CLINICAL_TRIAL_STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{t.title}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
                    {t.principalInvestigatorName && (
                      <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{t.principalInvestigatorName}</span>
                    )}
                    {t.department && (
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{t.department}</span>
                    )}
                    {t.sponsor && <span>{t.sponsor}</span>}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && currentUser && (
        <TrialFormModal
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          onClose={() => setShowForm(false)}
          onSaved={(t) => setTrials((prev) => [t, ...prev])}
        />
      )}
    </div>
  );
}
