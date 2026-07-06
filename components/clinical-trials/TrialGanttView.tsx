"use client";

import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import {
  format, startOfMonth, endOfMonth, addMonths, differenceInDays, parseISO, isValid,
  startOfQuarter, endOfQuarter, addQuarters, startOfYear, endOfYear, addYears,
} from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { parseTrialPeriod } from "@/lib/utils/clinicalTrialPeriod";
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

type ZoomLevel = "month" | "quarter" | "year";

// Mật độ px/ngày theo từng mức zoom — Năm mặc định để cả nhiều năm gọn trong màn hình,
// Tháng chi tiết hơn nhưng cần cuộn ngang.
const ZOOM_PX_PER_DAY: Record<ZoomLevel, number> = {
  month: 1.85,
  quarter: 0.7,
  year: 0.22,
};

const ZOOM_LABEL: Record<ZoomLevel, string> = {
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

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

interface Column {
  label: string;
  days: number; // số ngày thực tế của cột (dùng để tính bề rộng tỉ lệ, khớp vị trí bar)
}

/** Sinh danh sách cột tiêu đề (tháng/quý/năm) trong khoảng [start, end], bề rộng tỉ lệ theo số ngày thực. */
function buildColumns(start: Date, end: Date, zoom: ZoomLevel): Column[] {
  const columns: Column[] = [];

  if (zoom === "year") {
    let cursor = startOfYear(start);
    while (cursor <= end) {
      const colEnd = endOfYear(cursor);
      const clampStart = cursor < start ? start : cursor;
      const clampEnd = colEnd > end ? end : colEnd;
      columns.push({ label: format(cursor, "yyyy"), days: differenceInDays(clampEnd, clampStart) + 1 });
      cursor = addYears(cursor, 1);
    }
  } else if (zoom === "quarter") {
    let cursor = startOfQuarter(start);
    while (cursor <= end) {
      const colEnd = endOfQuarter(cursor);
      const clampStart = cursor < start ? start : cursor;
      const clampEnd = colEnd > end ? end : colEnd;
      columns.push({ label: `Q${Math.floor(cursor.getMonth() / 3) + 1}/${format(cursor, "yyyy")}`, days: differenceInDays(clampEnd, clampStart) + 1 });
      cursor = addQuarters(cursor, 1);
    }
  } else {
    let cursor = startOfMonth(start);
    while (cursor <= end) {
      const colEnd = endOfMonth(cursor);
      const clampStart = cursor < start ? start : cursor;
      const clampEnd = colEnd > end ? end : colEnd;
      columns.push({ label: format(cursor, "MM/yyyy", { locale: vi }), days: differenceInDays(clampEnd, clampStart) + 1 });
      cursor = addMonths(cursor, 1);
    }
  }

  return columns;
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
  const [zoom, setZoom] = useState<ZoomLevel>("year");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { rows, noDateTrials } = useMemo(() => {
    const rows: GanttRow[] = [];
    const noDateTrials: ClinicalTrial[] = [];
    for (const trial of trials) {
      const startRaw = parseTrialPeriod(trial.startPeriod);
      const endRaw = parseTrialPeriod(trial.endPeriod);
      if (!startRaw || !endRaw) {
        noDateTrials.push(trial);
        continue;
      }
      const start = startOfMonth(startRaw < endRaw ? startRaw : endRaw);
      const end = endOfMonth(startRaw < endRaw ? endRaw : startRaw);
      const firstEnrollmentAt = parseTrialPeriod(trial.firstEnrollmentDate);
      rows.push({ trial, start, end, firstEnrollmentAt });
    }
    return { rows, noDateTrials };
  }, [trials]);

  // Luôn bao gồm "hôm nay" trong khoảng hiển thị, kể cả khi nằm ngoài phạm vi start/end của các nghiên cứu
  const { ganttStart, ganttEnd } = useMemo(() => {
    if (rows.length === 0) {
      return { ganttStart: startOfMonth(addMonths(today, -1)), ganttEnd: endOfMonth(addMonths(today, 5)) };
    }
    const minDate = rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start);
    const maxDate = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
    const s = startOfMonth(addMonths(minDate < today ? minDate : today, -1));
    const e = endOfMonth(addMonths(maxDate > today ? maxDate : today, 1));
    return { ganttStart: s, ganttEnd: e };
  }, [rows, today]);

  const columns = useMemo(() => buildColumns(ganttStart, ganttEnd, zoom), [ganttStart, ganttEnd, zoom]);
  const totalDays = differenceInDays(ganttEnd, ganttStart) + 1;

  function pct(date: Date): number {
    return Math.max(0, Math.min(100, (differenceInDays(date, ganttStart) / totalDays) * 100));
  }
  function widthPct(start: Date, end: Date): number {
    const w = ((differenceInDays(end, start) + 1) / totalDays) * 100;
    return Math.max(0.4, w);
  }

  const todayPct = pct(today);
  const timelineWidth = Math.max(700, Math.round(totalDays * ZOOM_PX_PER_DAY[zoom]));

  // Tự động cuộn để "hôm nay" nằm giữa khung nhìn mỗi khi đổi zoom hoặc dữ liệu thay đổi
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayPx = (todayPct / 100) * timelineWidth;
    el.scrollLeft = Math.max(0, todayPx - el.clientWidth / 2);
  }, [zoom, timelineWidth, todayPct]);

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

  function jumpToToday() {
    const el = scrollRef.current;
    if (!el) return;
    const todayPx = (todayPct / 100) * timelineWidth;
    el.scrollTo({ left: Math.max(0, todayPx - el.clientWidth / 2), behavior: "smooth" });
  }

  return (
    <div className="flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Toolbar: zoom + jump-to-today */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700">
        <div className="flex text-xs rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {(["month", "quarter", "year"] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn(
                "px-3 py-1.5 font-medium transition",
                zoom === z
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
        <button
          onClick={jumpToToday}
          className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium transition"
        >
          Hôm nay
        </button>
      </div>

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
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: timelineWidth }}>
            {/* Period headers (tháng/quý/năm tuỳ zoom) */}
            <div
              className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 shrink-0 sticky top-0 z-10"
              style={{ height: HEADER_H }}
            >
              {columns.map((col, i) => (
                <div
                  key={`${col.label}-${i}`}
                  className="border-r border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0"
                  style={{ width: `${(col.days / totalDays) * 100}%` }}
                >
                  {col.label}
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
