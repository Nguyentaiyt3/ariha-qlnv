"use client";

import { CheckCircle2, Clock, Lock, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/common/UserAvatar";
import { computeInputState } from "@/lib/workflow-engine";
import type { TaskStep, User } from "@/types";

// ── Colour palette cycling every 5 steps ──────────────────────
const PALETTE = [
  { gradient: "linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)", shadow: "rgba(251,191,36,0.35)" },
  { gradient: "linear-gradient(135deg, #FB923C 0%, #EA580C 100%)", shadow: "rgba(251,146,60,0.35)" },
  { gradient: "linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)", shadow: "rgba(74,222,128,0.35)" },
  { gradient: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)", shadow: "rgba(45,212,191,0.35)" },
  { gradient: "linear-gradient(135deg, #818CF8 0%, #3730A3 100%)", shadow: "rgba(129,140,248,0.35)" },
];

const LOCKED_BG = "linear-gradient(135deg, #CBD5E1 0%, #94A3B8 100%)";

// ── Extract short label from step name (B01, B02…) ────────────
function stepLabel(step: TaskStep, idx: number): string {
  const m = step.name.match(/^(B\d{2,3})/i);
  return m ? m[1].toUpperCase() : `B${String(idx + 1).padStart(2, "0")}`;
}

// ── Clean step title (strip leading B0X: prefix) ──────────────
function stepTitle(step: TaskStep): string {
  return step.name.replace(/^B\d{2,3}[:\s–-]+\s*/i, "").trim() || step.name;
}

// ── Status icon below card ────────────────────────────────────
function StatusIcon({ status, locked }: { status: TaskStep["status"]; locked: boolean }) {
  if (status === "completed")
    return (
      <div className="w-9 h-9 rounded-full bg-white border-2 border-green-400 flex items-center justify-center shadow-sm">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
      </div>
    );
  if (locked)
    return (
      <div className="w-9 h-9 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center shadow-sm">
        <Lock className="w-4 h-4 text-slate-400" />
      </div>
    );
  if (status === "in_progress")
    return (
      <div className="w-9 h-9 rounded-full bg-white border-2 border-amber-400 flex items-center justify-center shadow-sm">
        <Clock className="w-4 h-4 text-amber-500" />
      </div>
    );
  return (
    <div className="w-9 h-9 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm">
      <Circle className="w-4 h-4 text-slate-300" />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────
interface Props {
  steps: TaskStep[];
  users: User[];
  onStepClick?: (stepId: string) => void;
}

// ── Main component ────────────────────────────────────────────
export function StepTimelineView({ steps, users, onStepClick }: Props) {
  if (steps.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-6 pt-2">
      <div className="flex items-start gap-0 min-w-max px-2">
        {steps.map((step, idx) => {
          const palette      = PALETTE[idx % PALETTE.length];
          const isDone       = step.status === "completed" || step.progress >= 100;
          const isRunning    = !isDone && step.status === "in_progress";
          const inputState   = computeInputState(step, steps);
          const isLocked     = !isDone && !isRunning && !inputState.ready;
          const assignee     = users.find(u => u.id === step.assigneeId);
          const label        = stepLabel(step, idx);
          const title        = stepTitle(step);
          const pct          = Math.min(100, Math.max(0, step.progress ?? 0));
          const cardBg       = isLocked ? LOCKED_BG : palette.gradient;
          const cardShadow   = isLocked ? "none" : `0 4px 16px ${palette.shadow}`;
          const cardOpacity  = isLocked ? 0.65 : 1;
          const isLast       = idx === steps.length - 1;

          return (
            <div key={step.id} className="flex items-start">
              {/* ── Card column ── */}
              <div className="flex flex-col items-center gap-2 w-[152px]">

                {/* Step label badge */}
                <div className={cn(
                  "px-3 py-0.5 rounded-full text-[11px] font-bold tracking-wide border",
                  isDone
                    ? "bg-green-50 text-green-700 border-green-300"
                    : isRunning
                      ? "bg-amber-50 text-amber-700 border-amber-300"
                      : isLocked
                        ? "bg-slate-100 text-slate-400 border-slate-200"
                        : "bg-violet-50 text-violet-700 border-violet-200"
                )}>
                  {label}
                </div>

                {/* Main coloured card */}
                <button
                  onClick={() => onStepClick?.(step.id)}
                  disabled={!onStepClick}
                  className="w-full rounded-2xl p-3.5 text-left transition-transform hover:scale-[1.03] active:scale-[0.98] focus:outline-none"
                  style={{
                    background: cardBg,
                    boxShadow: cardShadow,
                    opacity: cardOpacity,
                    minHeight: 130,
                  }}
                >
                  {/* Title */}
                  <p className="text-white font-bold text-xs leading-snug line-clamp-3 drop-shadow-sm">
                    {title}
                  </p>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white/70 text-[10px]">Tiến độ</span>
                      <span className={cn(
                        "text-[10px] font-bold",
                        isDone ? "text-white" : "text-white/90"
                      )}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white/80 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Assignee */}
                  {assignee && (
                    <div className="flex items-center gap-1.5 mt-2.5">
                      <UserAvatar user={assignee} size="xs" />
                      <span className="text-white/80 text-[10px] truncate max-w-[90px]">
                        {assignee.name}
                      </span>
                    </div>
                  )}
                </button>

                {/* Status icon */}
                <StatusIcon status={step.status} locked={isLocked} />

              </div>

              {/* ── Arrow connector ── */}
              {!isLast && (
                <div className="flex items-center self-stretch mt-[36px]">
                  <ChevronRight className="w-5 h-5 text-slate-300 mx-0.5 shrink-0" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 px-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Hoàn thành</span>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-400" /> Đang thực hiện</span>
        <span className="flex items-center gap-1"><Circle className="w-3.5 h-3.5 text-slate-300" /> Chưa bắt đầu</span>
        <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-slate-400" /> Chờ bước trước</span>
      </div>
    </div>
  );
}
