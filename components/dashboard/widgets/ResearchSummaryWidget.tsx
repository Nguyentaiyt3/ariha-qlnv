"use client";

import { useEffect, useState } from "react";
import { Microscope, FileText, Search, Award, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { ResearchTopic, ResearchStage } from "@/types";

const STAGE_META: Record<ResearchStage, { label: string; color: string; bg: string }> = {
  init:        { label: "Khởi tạo",    color: "#64748b", bg: "#f1f5f9" },
  proposal:    { label: "Thẩm định đề cương", color: "#3b82f6", bg: "#eff6ff" },
  executing:   { label: "Đang triển khai",    color: "#f59e0b", bg: "#fffbeb" },
  recognition: { label: "Nghiệm thu",          color: "#8b5cf6", bg: "#f5f3ff" },
  completed:   { label: "Hoàn thành",          color: "#22c55e", bg: "#f0fdf4" },
  rejected:    { label: "Từ chối",             color: "#ef4444", bg: "#fef2f2" },
};

const STAGE_ORDER: ResearchStage[] = ["init", "proposal", "executing", "recognition", "completed"];

const P = { violet: "#8B5CF6", blue: "#3B82F6", amber: "#F59E0B", green: "#22C55E", red: "#EF4444" };

export default function ResearchSummaryWidget() {
  const [topics, setTopics]   = useState<ResearchTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/research")
      .then(r => r.json())
      .then((d: { topics: ResearchTopic[] }) => setTopics(d.topics ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const byStage = STAGE_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = topics.filter(t => t.stage === s).length;
    return acc;
  }, {});

  const total       = topics.length;
  const inProgress  = (byStage.proposal ?? 0) + (byStage.executing ?? 0) + (byStage.recognition ?? 0);
  const completed   = byStage.completed ?? 0;
  const pendingReview = topics.filter(t =>
    (t.stage === "proposal" || t.stage === "recognition") &&
    (t.reviews ?? []).filter(r => r.stage === t.stage && r.status === "assigned").length > 0 &&
    (t.reviews ?? []).filter(r => r.stage === t.stage && r.status === "submitted").length < 2
  ).length;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm text-[var(--foreground)] flex items-center gap-1.5">
          <Microscope className="w-4 h-4" style={{ color: P.violet }} />
          NCKH cấp cơ sở
        </h3>
        <Link
          href="/research"
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition hover:opacity-80"
          style={{ background: `${P.violet}15`, color: P.violet }}
        >
          Xem tất cả
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Clock className="w-5 h-5 animate-spin" style={{ color: P.violet, opacity: 0.5 }} />
        </div>
      ) : total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <FileText className="w-8 h-8" style={{ color: P.violet, opacity: 0.3 }} />
          <p className="text-xs text-[var(--muted-foreground)]">Chưa có đề tài nào</p>
          <Link href="/research?create=1" className="text-xs font-semibold" style={{ color: P.violet }}>
            + Đăng ký đề tài
          </Link>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ background: `${P.violet}10` }}>
              <span className="text-lg font-bold leading-none" style={{ color: P.violet }}>{total}</span>
              <span className="text-[9px] text-[var(--muted-foreground)]">Tổng đề tài</span>
            </div>
            <div className="rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ background: `${P.amber}10` }}>
              <span className="text-lg font-bold leading-none" style={{ color: P.amber }}>{inProgress}</span>
              <span className="text-[9px] text-[var(--muted-foreground)]">Đang xử lý</span>
            </div>
            <div className="rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ background: `${P.green}10` }}>
              <span className="text-lg font-bold leading-none" style={{ color: P.green }}>{completed}</span>
              <span className="text-[9px] text-[var(--muted-foreground)]">Hoàn thành</span>
            </div>
          </div>

          {/* Pending review alert */}
          {pendingReview > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: `${P.amber}10`, border: `1px solid ${P.amber}30` }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: P.amber }} />
              <span className="text-[11px] font-medium" style={{ color: P.amber }}>
                {pendingReview} đề tài đang chờ phản biện
              </span>
              <Link href="/research" className="ml-auto text-[10px] font-bold shrink-0" style={{ color: P.amber }}>
                Xem →
              </Link>
            </div>
          )}

          {/* Stage breakdown */}
          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto min-h-0">
            {STAGE_ORDER.filter(s => (byStage[s] ?? 0) > 0).map(s => {
              const meta = STAGE_META[s];
              const count = byStage[s] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-[10px] font-medium w-28 shrink-0 truncate" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${meta.color}20` }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <span className="text-[10px] font-bold w-4 text-right shrink-0" style={{ color: meta.color }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Recent topics */}
          <div className="shrink-0 flex flex-col gap-1 border-t border-[var(--border)] pt-2">
            {topics
              .filter(t => t.stage !== "completed" && t.stage !== "rejected")
              .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
              .slice(0, 3)
              .map(t => {
                const meta = STAGE_META[t.stage];
                return (
                  <Link key={t.id} href={`/research/${t.id}`} className="flex items-center gap-2 group">
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-[var(--foreground)] truncate flex-1 group-hover:underline">
                      {t.title}
                    </span>
                  </Link>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
