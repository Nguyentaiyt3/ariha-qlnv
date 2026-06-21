"use client";

import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { daysUntilDeadline } from "@/lib/utils";
import Link from "next/link";

const P = { amber: "#F59E0B", pink: "#EC4899", green: "#22C55E", purple: "#8B5CF6" };

function urgencyConfig(days: number) {
  if (days < 0)  return { color: P.pink,  label: `Trễ ${Math.abs(days)}n`,   icon: AlertTriangle };
  if (days === 0) return { color: P.pink,  label: "Hôm nay",                  icon: AlertTriangle };
  if (days <= 2)  return { color: P.amber, label: `Còn ${days} ngày`,         icon: Clock };
  return              { color: P.purple, label: `Còn ${days} ngày`,            icon: Clock };
}

export default function DeadlineAlertWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();

  const urgent = tasks
    .filter((t) => {
      if (t.status === "done" || t.status === "cancelled" || !t.deadlineBase) return false;
      const days  = daysUntilDeadline(t.deadlineBase);
      const isMine = t.mainPerformerId === currentUser?.id ||
        (t.stakeholders ?? []).some((s) => s.userId === currentUser?.id);
      return isMine && days <= 7;
    })
    .sort((a, b) => daysUntilDeadline(a.deadlineBase!) - daysUntilDeadline(b.deadlineBase!))
    .slice(0, 6);

  const overdueCount = urgent.filter((t) => daysUntilDeadline(t.deadlineBase!) < 0).length;
  const todayCount   = urgent.filter((t) => daysUntilDeadline(t.deadlineBase!) === 0).length;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-[var(--foreground)] flex items-center gap-1.5">
          <Clock className="w-4 h-4" style={{ color: P.amber }} />
          Sắp đến hạn
        </h3>
        {urgent.length > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${P.pink}15`, color: P.pink }}>
            {urgent.length} nhiệm vụ
          </span>
        )}
      </div>

      {/* Summary badges */}
      {urgent.length > 0 && (
        <div className="flex gap-2 shrink-0">
          {overdueCount > 0 && (
            <div className="flex-1 rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ background: `${P.pink}12` }}>
              <span className="text-base font-bold leading-none" style={{ color: P.pink }}>{overdueCount}</span>
              <span className="text-[9px] text-[var(--muted-foreground)]">Trễ hạn</span>
            </div>
          )}
          {todayCount > 0 && (
            <div className="flex-1 rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ background: `${P.amber}12` }}>
              <span className="text-base font-bold leading-none" style={{ color: P.amber }}>{todayCount}</span>
              <span className="text-[9px] text-[var(--muted-foreground)]">Hôm nay</span>
            </div>
          )}
          <div className="flex-1 rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ background: `${P.purple}12` }}>
            <span className="text-base font-bold leading-none" style={{ color: P.purple }}>{urgent.length - overdueCount - todayCount}</span>
            <span className="text-[9px] text-[var(--muted-foreground)]">Sắp tới</span>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto min-h-0">
        {urgent.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="w-8 h-8" style={{ color: P.green, opacity: 0.5 }} />
            <p className="text-xs text-[var(--muted-foreground)]">Không có deadline gấp trong 7 ngày tới</p>
          </div>
        ) : (
          urgent.map((t) => {
            const days = daysUntilDeadline(t.deadlineBase!);
            const cfg  = urgencyConfig(days);
            const Icon = cfg.icon;
            return (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[var(--muted)] transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cfg.color}18` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                </div>
                <p className="text-[11px] font-medium text-[var(--foreground)] flex-1 truncate group-hover:text-blue-500 transition-colors">
                  {t.name}
                </p>
                <span className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-lg" style={{ background: `${cfg.color}15`, color: cfg.color }}>
                  {cfg.label}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
