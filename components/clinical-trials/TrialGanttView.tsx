"use client";

import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, addMonths, differenceInDays, parseISO, isValid } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CLINICAL_TRIAL_STATUS_LABEL, CLINICAL_TRIAL_PIPELINE, CLINICAL_TRIAL_TERMINAL_BRANCHES } from "@/types";
import type { ClinicalTrial, ClinicalTrialStatus } from "@/types";

const STATUS_ORDER: ClinicalTrialStatus[] = [...CLINICAL_TRIAL_PIPELINE, ...CLINICAL_TRIAL_TERMINAL_BRANCHES];

const STATUS_COLOR: Record<ClinicalTrialStatus, { track: string; bar: string }> = {
  feasibility:            { track: "bg-slate-100 dark:bg-slate-700",   bar: "bg-slate-400" },
  awaiting_sponsor:       { track: "bg-amber-50 dark:bg-amber-900/20", bar: "bg-amber-400" },
  preparing_ethics:       { track: "bg-orange-50 dark:bg-orange-900/20", bar: "bg-orange-400" },
  national_ethics_met:    { track: "bg-yellow-50 dark:bg-yellow-900/20", bar: "bg-yellow-400" },
  lec_approved:           { track: "bg-lime-50 dark:bg-lime-900/20",   bar: "bg-lime-500" },
  awaiting_moh:           { track: "bg-teal-50 dark:bg-teal-900/20",   bar: "bg-teal-400" },
  pre_deployment:         { track: "bg-indigo-50 dark:bg-indigo-900/20", bar: "bg-indigo-400" },
  running_pre_enroll:     { track: "bg-sky-50 dark:bg-sky-900/20",     bar: "bg-sky-500" },
  running_enrolled:       { track: "bg-blue-50 dark:bg-blue-900/20",   bar: "bg-blue-600" },
  completed:              { track: "bg-green-50 dark:bg-green-900/20", bar: "bg-green-600" },
  terminated_no_efficacy: { track: "bg-red-50 dark:bg-red-900/20",     bar: "bg-red-500" },
  not_feasible:           { track: "bg-rose-50 dark:bg-rose-900/20",   bar: "bg-rose-500" },
};

const UNKNOWN_COLOR = { track: "bg-slate-100 dark:bg-slate-700", bar: "bg-slate-300 dark:bg-slate-600" };

function colorOf(status: ClinicalTrialStatus | "unknown") {
  return status === "unknown" ? UNKNOWN_COLOR : STATUS_COLOR[status];
}

const ROW_H = 44;
const HEADER_H = 40;
const LABEL_W = 240;
const MONTH_W = 56; // px per month column

interface TrialGanttViewProps {
  trials: ClinicalTrial[];
  onSelectTrial: (trial: ClinicalTrial) => void;
}

interface GanttRow {
  trial: ClinicalTrial;
  start: Date;
  end: Date;
  firstEnrollmentAt: Date | null;
}

function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d");
}

const ROMAN_QUARTER: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
const QUARTER_START_MONTH = [-1, 0, 3, 6, 9]; // index 1-4 -> month (0-indexed); index 0 unused

/**
 * Dữ liệu startPeriod/endPeriod thực tế không thống nhất định dạng — có thể là
 * "M/YYYY", "Quý N/YYYY" (số hoặc số La Mã, có/không dấu, viết tắt "Q"), "DD/MM/YYYY",
 * chỉ năm, có tiền tố "Dự kiến"/"Tháng", hoặc câu tự do có chứa ngày (vd "Đã ngừng thu tuyển ngày 23/8/2025").
 * Parser này thử lần lượt từ chặt chẽ nhất đến "cứu vãn" ngày nhúng trong câu.
 */
function parsePeriod(raw?: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Ngày đầy đủ (3 phần số) — ưu tiên DD/MM/YYYY, fallback MM/DD/YYYY nếu DD/MM không hợp lệ
  let m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) return new Date(year, b - 1, a);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return new Date(year, a - 1, b);
  }

  // Chuẩn hoá + bỏ tiền tố quen thuộc cho các bước còn lại
  let s = stripDiacritics(trimmed).toLowerCase().trim();
  s = s.replace(/^du\s+kien\s+/, "");
  s = s.replace(/^thang\s+/, "");

  // 2. Định dạng quý: "Quý IV/2023", "Q4/2024", "Quý 3/2024 (ghi chú)"...
  m = s.match(/^q[a-z]*\s*([ivx]+|\d)\s*\/\s*(\d{4})/);
  if (m) {
    const qRaw = m[1];
    const quarter = /^\d+$/.test(qRaw) ? parseInt(qRaw, 10) : ROMAN_QUARTER[qRaw];
    const year = parseInt(m[2], 10);
    if (quarter >= 1 && quarter <= 4) return new Date(year, QUARTER_START_MONTH[quarter], 1);
  }

  // 3. M/YYYY
  m = s.match(/^(\d{1,2})\/(\d{4})/);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) return new Date(year, month - 1, 1);
  }

  // 4. Chỉ có năm
  m = s.match(/^(\d{4})/);
  if (m) return new Date(parseInt(m[1], 10), 0, 1);

  // 5. Cứu vãn: tìm ngày DD/MM/YYYY nhúng trong câu tự do
  m = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(year, month - 1, day);
  }

  return null;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

interface Segment {
  start: Date;
  end: Date;
  status: ClinicalTrialStatus | "unknown";
  faded?: boolean; // phần dự kiến trong tương lai (chưa xảy ra)
}

/**
 * Chia bar của 1 nghiên cứu thành nhiều đoạn theo statusHistory (nếu có ghi log).
 * - Nghiên cứu chưa có lịch sử (dữ liệu cũ / import) → 1 đoạn duy nhất theo status hiện tại (Phase 1).
 * - Có lịch sử → mỗi lần đổi trạng thái là 1 đoạn màu riêng; phần trước lần ghi log đầu tiên
 *   (không rõ đã trải qua giai đoạn nào) hiển thị xám trung tính "unknown".
 * - Đoạn cuối cùng (trạng thái hiện tại) được tách phần đã qua (đậm) và phần dự kiến còn lại (nhạt) theo "hôm nay".
 */
function buildSegments(trial: ClinicalTrial, barStart: Date, barEnd: Date, today: Date): Segment[] {
  const history = (trial.statusHistory || [])
    .map((h) => ({ status: h.status, changedAt: parseISO(h.changedAt) }))
    .filter((h) => isValid(h.changedAt))
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());

  function splitTrailing(start: Date, end: Date, status: ClinicalTrialStatus): Segment[] {
    if (start >= end) return [{ start, end, status }];
    if (today <= start) return [{ start, end, status, faded: true }];
    if (today >= end) return [{ start, end, status }];
    return [
      { start, end: today, status },
      { start: today, end, status, faded: true },
    ];
  }

  if (history.length === 0) {
    return splitTrailing(barStart, barEnd, trial.status);
  }

  const segments: Segment[] = [];
  const firstChange = history[0].changedAt;
  if (firstChange > barStart) {
    segments.push({ start: barStart, end: firstChange < barEnd ? firstChange : barEnd, status: "unknown" });
  }

  for (let i = 0; i < history.length; i++) {
    const segStart = history[i].changedAt < barStart ? barStart : history[i].changedAt;
    const segEndRaw = i + 1 < history.length ? history[i + 1].changedAt : barEnd;
    const segEnd = segEndRaw > barEnd ? barEnd : segEndRaw;
    if (segStart >= segEnd && i !== history.length - 1) continue;
    const isLast = i === history.length - 1;
    if (isLast) {
      segments.push(...splitTrailing(segStart, segEnd, history[i].status));
    } else {
      segments.push({ start: segStart, end: segEnd, status: history[i].status });
    }
  }
  return segments;
}

function buildMonths(start: Date, end: Date): { label: string }[] {
  const months: { label: string }[] = [];
  let cursor = startOfMonth(start);
  const last = startOfMonth(end);
  while (cursor <= last) {
    months.push({ label: format(cursor, "MM/yyyy", { locale: vi }) });
    cursor = addMonths(cursor, 1);
  }
  return months;
}

const PHASE_GROUPS: { label: string; icon: string; statuses: ClinicalTrialStatus[] }[] = [
  {
    label: "Chuẩn bị",
    icon: "🟡",
    statuses: ["feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met", "lec_approved", "awaiting_moh", "pre_deployment"],
  },
  { label: "Đang chạy", icon: "🟢", statuses: ["running_pre_enroll", "running_enrolled"] },
  { label: "Kết thúc", icon: "⚫", statuses: ["completed", "terminated_no_efficacy", "not_feasible"] },
];

export function TrialGanttView({ trials, onSelectTrial }: TrialGanttViewProps) {
  const today = useMemo(() => new Date(), []);

  const { rows, noDateTrials } = useMemo(() => {
    const rows: GanttRow[] = [];
    const noDateTrials: ClinicalTrial[] = [];
    for (const trial of trials) {
      const startRaw = parsePeriod(trial.startPeriod);
      const endRaw = parsePeriod(trial.endPeriod);
      if (!startRaw || !endRaw) {
        noDateTrials.push(trial);
        continue;
      }
      const start = startOfMonth(startRaw < endRaw ? startRaw : endRaw);
      const end = endOfMonth(startRaw < endRaw ? endRaw : startRaw);
      const firstEnrollmentAt = parsePeriod(trial.firstEnrollmentDate);
      rows.push({ trial, start, end, firstEnrollmentAt });
    }
    return { rows, noDateTrials };
  }, [trials]);

  const { ganttStart, ganttEnd, months, totalMonths } = useMemo(() => {
    if (rows.length === 0) {
      const s = startOfMonth(addMonths(today, -1));
      const e = endOfMonth(addMonths(today, 5));
      return { ganttStart: s, ganttEnd: e, months: buildMonths(s, e), totalMonths: monthsBetween(s, e) + 1 };
    }
    const minDate = rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start);
    const maxDate = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
    const s = startOfMonth(addMonths(minDate, -1));
    const e = endOfMonth(addMonths(maxDate, 1));
    return { ganttStart: s, ganttEnd: e, months: buildMonths(s, e), totalMonths: monthsBetween(s, e) + 1 };
  }, [rows, today]);

  const totalDays = differenceInDays(ganttEnd, ganttStart) + 1;

  function pct(date: Date): number {
    return Math.max(0, Math.min(100, (differenceInDays(date, ganttStart) / totalDays) * 100));
  }
  function widthPct(start: Date, end: Date): number {
    const w = ((differenceInDays(end, start) + 1) / totalDays) * 100;
    return Math.max(0.4, w);
  }

  const todayPct = pct(today);
  const timelineWidth = Math.max(800, totalMonths * MONTH_W);

  const groupedRows = PHASE_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((r) => (group.statuses as string[]).includes(r.trial.status))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
  }));

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400">
        <p className="text-sm">Chưa có nghiên cứu nào có đủ thời gian bắt đầu/kết thúc để hiển thị Gantt.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex overflow-hidden">
        {/* Left: trial label column (fixed) */}
        <div className="shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700" style={{ width: LABEL_W }}>
          <div
            className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 flex items-center gap-2"
            style={{ height: HEADER_H }}
          >
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nghiên cứu</span>
            <span className="ml-auto text-xs text-slate-400">{rows.length}</span>
          </div>

          <div>
            {groupedRows.map((group) => (
              <div key={group.label}>
                {group.rows.length > 0 && (
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700/60 text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span>{group.icon}</span> {group.label} ({group.rows.length})
                  </div>
                )}
                {group.rows.map(({ trial }) => (
                  <button
                    key={trial.id}
                    onClick={() => onSelectTrial(trial)}
                    className="w-full flex flex-col justify-center px-3 text-left border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
                    style={{ height: ROW_H }}
                  >
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {trial.abbreviation || trial.code}
                    </span>
                    {trial.principalInvestigatorName && (
                      <span className="text-[11px] text-slate-400 truncate">{trial.principalInvestigatorName}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right: timeline (scrollable horizontally) */}
        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: timelineWidth }}>
            {/* Month headers */}
            <div
              className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 shrink-0 sticky top-0 z-10"
              style={{ height: HEADER_H }}
            >
              {months.map((m) => (
                <div
                  key={m.label}
                  className="border-r border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0"
                  style={{ width: MONTH_W }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="relative">
              {/* Today vertical line */}
              {todayPct > 0 && todayPct < 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-400 dark:bg-blue-500 z-10 pointer-events-none"
                  style={{ left: `${todayPct}%` }}
                />
              )}

              {groupedRows.map((group) => (
                <div key={group.label}>
                  {group.rows.length > 0 && (
                    <div
                      className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/30"
                      style={{ height: 30 }}
                    />
                  )}
                  {group.rows.map(({ trial, start, end, firstEnrollmentAt }) => {
                    const segments = buildSegments(trial, start, end, today);
                    const isOverdue = end < today && trial.status !== "completed" && !(CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(trial.status);
                    const hasHistory = (trial.statusHistory || []).length > 0;
                    const enrollmentClamped =
                      firstEnrollmentAt && firstEnrollmentAt >= start && firstEnrollmentAt <= end ? firstEnrollmentAt : null;

                    return (
                      <div key={trial.id} className="relative border-b border-slate-100 dark:border-slate-700/60" style={{ height: ROW_H }}>
                        {segments.map((seg, i) => {
                          const leftP = pct(seg.start);
                          const widthP = widthPct(seg.start, seg.end);
                          const colors = colorOf(seg.status);
                          return (
                            <button
                              key={i}
                              onClick={() => onSelectTrial(trial)}
                              title={`${trial.code} — ${seg.status === "unknown" ? "Chưa theo dõi trạng thái" : CLINICAL_TRIAL_STATUS_LABEL[seg.status]}${seg.faded ? " (dự kiến)" : ""}\n${format(seg.start, "dd/MM/yyyy")} → ${format(seg.end, "dd/MM/yyyy")}`}
                              className="absolute inset-y-0 flex items-center group"
                              style={{ left: `${leftP}%`, width: `${widthP}%`, minWidth: 4 }}
                            >
                              <div
                                className={cn(
                                  "w-full group-hover:ring-2 ring-blue-400 transition",
                                  colors.bar,
                                  i === 0 && "rounded-l-md",
                                  i === segments.length - 1 && "rounded-r-md",
                                  seg.faded && "opacity-40"
                                )}
                                style={{ height: 20 }}
                              />
                            </button>
                          );
                        })}
                        {!hasHistory && widthPct(start, end) > 6 && (
                          <span
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white truncate pointer-events-none z-10"
                            style={{ left: `calc(${pct(start)}% + 8px)`, textShadow: "0 0 4px rgba(0,0,0,0.5)", maxWidth: "90%" }}
                          >
                            {CLINICAL_TRIAL_STATUS_LABEL[trial.status]}
                          </span>
                        )}
                        {isOverdue && (
                          <span
                            className="absolute -top-1 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white dark:ring-slate-800 z-10"
                            style={{ left: `calc(${pct(end)}% - 4px)` }}
                          />
                        )}
                        {enrollmentClamped && (
                          <span
                            title={`Thu tuyển bệnh nhân đầu tiên: ${format(enrollmentClamped, "dd/MM/yyyy")}`}
                            className="absolute top-1/2 w-2.5 h-2.5 rotate-45 bg-violet-500 ring-2 ring-white dark:ring-slate-800 z-20"
                            style={{ left: `calc(${pct(enrollmentClamped)}% - 5px)`, marginTop: -18 }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-t border-slate-100 dark:border-slate-700">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={cn("w-3 h-2.5 rounded-sm", STATUS_COLOR[s].bar)} />
            {CLINICAL_TRIAL_STATUS_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className={cn("w-3 h-2.5 rounded-sm", UNKNOWN_COLOR.bar)} /> Chưa theo dõi trạng thái
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="w-3 h-2.5 rounded-sm bg-blue-600 opacity-40" /> Dự kiến (chưa xảy ra)
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-blue-500 ml-auto">
          <span className="w-0.5 h-4 bg-blue-400 inline-block" /> Hôm nay
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-red-500">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Trễ hạn dự kiến
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-violet-500">
          <span className="w-2 h-2 rotate-45 bg-violet-500 inline-block" /> Thu tuyển bệnh nhân đầu tiên
        </span>
      </div>

      {/* Trials without dates */}
      {noDateTrials.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Chưa có đủ thời gian bắt đầu/kết thúc ({noDateTrials.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {noDateTrials.map((trial) => (
              <button
                key={trial.id}
                onClick={() => onSelectTrial(trial)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
              >
                {trial.abbreviation || trial.code}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
