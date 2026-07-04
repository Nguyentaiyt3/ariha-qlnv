"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { getClinicalTrials } from "@/lib/firebase/firestore";
import { TrialFormModal } from "@/components/clinical-trials/TrialFormModal";
import { TrialListItem } from "@/components/clinical-trials/TrialListItem";
import { ImportTrialsModal } from "@/components/clinical-trials/ImportTrialsModal";
import { useDashboardFilter } from "@/stores/useDashboardFilter";
import { CLINICAL_TRIAL_STATUS_LABEL, CLINICAL_TRIAL_TERMINAL_BRANCHES } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus } from "@/types";

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

interface TrialPhase {
  id: "preparing" | "running" | "completed";
  label: string;
  icon: string;
  trials: ClinicalTrial[];
}

function groupTrialsByPhase(trials: ClinicalTrial[]): TrialPhase[] {
  const preparing = trials.filter((t) =>
    ["feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met", "lec_approved", "awaiting_moh", "pre_deployment"].includes(t.status)
  );
  const running = trials.filter((t) =>
    t.status === "running_pre_enroll" || t.status === "running_enrolled"
  );
  const completed = trials.filter((t) =>
    t.status === "completed" || (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(t.status)
  );

  return [
    { id: "preparing", label: "Chuẩn bị", icon: "🟡", trials: preparing },
    { id: "running", label: "Đang chạy", icon: "🟢", trials: running },
    { id: "completed", label: "Kết thúc", icon: "⚫", trials: completed },
  ];
}

export default function ClinicalTrialsPage() {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const { mode, year, month, quarter } = useDashboardFilter();
  const [trials, setTrials] = useState<ClinicalTrial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClinicalTrialStatus | "all" | "running" | "ended">("all");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

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

    // Apply shared period filter — lọc theo startPeriod
    if (mode !== "all") {
      list = list.filter((t) => {
        if (!t.startPeriod) return false;
        const parts = t.startPeriod.split("/");
        if (parts.length !== 2) return false;
        const period = parseInt(parts[0], 10);
        const trialYear = parseInt(parts[1], 10);

        if (mode === "year") {
          return trialYear === year;
        }
        if (mode === "quarter") {
          const trialQuarter = period <= 4 ? period : Math.ceil(period / 3);
          return trialQuarter === quarter && trialYear === year;
        }
        if (mode === "month") {
          if (period > 12) return false;
          return period === month + 1 && trialYear === year;
        }
        return true;
      });
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
  }, [trials, statusFilter, mode, year, month, quarter, search]);

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
        <div className="flex items-center gap-2">
          {canCreate && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition"
              >
                📥 Import Excel
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                <Plus className="w-4 h-4" /> Đăng ký TNLS
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng số"        value={stats.total}     active={statusFilter === "all"}     onClick={() => setStatusFilter("all")} />
        <StatCard label="Đang chạy"      value={stats.running}   active={statusFilter === "running"} onClick={() => setStatusFilter("running")} />
        <StatCard label="Đang chuẩn bị"  value={stats.pending} />
        <StatCard label="Đã kết thúc"    value={stats.completed + stats.ended} active={statusFilter === "ended"} onClick={() => setStatusFilter("ended")} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã, tên, PI, khoa, tài trợ..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Trial List by Phase — 3 column layout */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Chưa có thử nghiệm lâm sàng nào</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {groupTrialsByPhase(filtered).map((phase) => (
            <div
              key={phase.id}
              className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 overflow-hidden"
            >
              {/* Phase header */}
              <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{phase.icon}</span>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{phase.label}</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {phase.trials.length} nghiên cứu
                </p>
              </div>

              {/* Trial cards */}
              {phase.trials.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                  Không có nghiên cứu
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto max-h-[600px]">
                  {phase.trials.map((trial) => (
                    <TrialListItem
                      key={trial.id}
                      trial={trial}
                      onClick={() => router.push(`/clinical-trials/${trial.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
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

      {showImport && currentUser && (
        <ImportTrialsModal
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          creatorId={currentUser.id}
          creatorName={currentUser.name}
          onImported={(newTrials) => {
            setTrials((prev) => {
              // Merge: update existing by code, add new ones
              const codeMap = new Map(prev.map((t) => [t.code, t]));
              newTrials.forEach((t) => codeMap.set(t.code, t));
              return Array.from(codeMap.values());
            });
          }}
        />
      )}
    </div>
  );
}
