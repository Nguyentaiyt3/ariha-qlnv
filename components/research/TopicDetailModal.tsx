"use client";

import { useState } from "react";
import {
  X, FlaskConical, Users, MessageSquare, FileText, ExternalLink,
  CheckCircle2, AlertCircle, History, File, AlertTriangle, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEPT_BY_ABBR } from "@/lib/research-departments";
import type { ResearchTopic, IntakeLog } from "@/types";

// ─── File preview overlay ─────────────────────────────────────

function FilePreviewOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm">
      {/* toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-700 shrink-0">
        <p className="text-sm text-slate-300 truncate max-w-lg">{url.split("/").pop()}</p>
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Mở tab mới
          </a>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-3.5 h-3.5" />
            Đóng
          </button>
        </div>
      </div>
      {/* preview */}
      <iframe
        src={url}
        className="flex-1 w-full border-0"
        title="Xem trước file đề cương"
        allow="fullscreen"
      />
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────

function SectionHeader({ label, sub, icon: Icon }: { label: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ReadField({ label, value, mono, pre }: { label: string; value?: string | null; mono?: boolean; pre?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      {value ? (
        pre
          ? <pre className={cn("text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap font-sans leading-relaxed", mono && "font-mono text-xs")}>{value}</pre>
          : <p  className={cn("text-sm text-slate-800 dark:text-slate-100", mono && "font-mono")}>{value}</p>
      ) : (
        <p className="text-sm text-slate-300 dark:text-slate-600 italic">—</p>
      )}
    </div>
  );
}

const DIVIDER = <div className="border-t border-slate-100 dark:border-slate-800" />;

// ─── Intake log timeline ──────────────────────────────────────

const LOG_META: Record<IntakeLog["action"], { label: string; dot: string; text: string; icon: React.ElementType }> = {
  accepted:           { label: "Tiếp nhận",          dot: "bg-green-500",  text: "text-green-600 dark:text-green-400",  icon: CheckCircle2 },
  revision_requested: { label: "Yêu cầu chỉnh sửa",  dot: "bg-orange-400", text: "text-orange-500 dark:text-orange-400", icon: AlertCircle  },
};

function IntakeTimeline({ logs }: { logs: IntakeLog[] }) {
  if (!logs.length) return (
    <p className="text-xs text-slate-400 italic py-1">Chưa có thao tác nào được ghi lại.</p>
  );
  return (
    <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
      {[...logs].reverse().map(log => {
        const meta = LOG_META[log.action];
        const Icon = meta.icon;
        return (
          <li key={log.id} className="ml-4">
            <div className={cn("absolute -left-[7px] w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900", meta.dot)} />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className={cn("w-3.5 h-3.5 shrink-0", meta.text)} />
                <span className={cn("text-xs font-semibold", meta.text)}>{meta.label}</span>
                <span className="text-[11px] text-slate-400">
                  {log.userName} · {new Date(log.timestamp).toLocaleString("vi-VN")}
                </span>
              </div>
              {log.note && (
                <p className="text-xs text-slate-600 dark:text-slate-300 italic pl-5">{log.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Main modal ───────────────────────────────────────────────

interface Props {
  topic: ResearchTopic;
  onClose: () => void;
}

export function TopicDetailModal({ topic, onClose }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const dept = topic.department ? DEPT_BY_ABBR[topic.department] : undefined;
  const deptLabel = dept ? `${dept.abbr} — ${dept.name}` : topic.department;

  // Parse member list: memberNames is one name per line, memberDepartments one dept per line
  const memberNames = topic.memberNames?.split("\n").filter(Boolean) ?? [];
  const memberDepts = topic.memberDepartments?.split("\n").filter(Boolean) ?? [];

  const logs = topic.intakeLogs ?? [];
  const hasRevision = (topic.intakeRevisionCount ?? 0) > 0;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-500 shrink-0" />
              Nội dung đăng ký đề cương
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Xem xét để tiếp nhận hoặc yêu cầu chỉnh sửa</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Revision warning ── */}
        {hasRevision && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                Nộp lại lần {topic.intakeRevisionCount} sau yêu cầu chỉnh sửa
              </p>
              {topic.intakeNote && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 italic">"{topic.intakeNote}"</p>
              )}
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="p-6 space-y-8 overflow-y-auto">

          {/* A — Thông tin đề tài */}
          <section>
            <SectionHeader icon={FlaskConical} label="A. Thông tin đề tài" sub="Tên đề tài, đơn vị và kế hoạch hoàn tất" />
            <div className="space-y-4">
              <ReadField label="Tên đề tài *" value={topic.title} />
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Khoa/phòng chủ nhiệm *" value={deptLabel} />
                <ReadField label="Kế hoạch thời điểm hoàn tất *" value={topic.completionTimeline} />
              </div>
              {topic.submissionType && (
                <ReadField
                  label="Loại nộp"
                  value={topic.submissionType === "new" ? "Nộp mới" : "Nộp lại / Bổ sung"}
                />
              )}
            </div>
          </section>

          {DIVIDER}

          {/* B — Nhóm nghiên cứu */}
          <section>
            <SectionHeader icon={Users} label="B. Nhóm nghiên cứu" sub="Chủ nhiệm và thành viên tham gia" />
            <div className="space-y-4">
              <ReadField label="Chủ nhiệm đề tài *" value={topic.principalInvestigatorName} />

              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1.5">
                  Thành viên tham gia <span className="font-normal">(trừ chủ nhiệm)</span>
                </p>
                {memberNames.length > 0 ? (
                  <div className="space-y-1.5">
                    {memberNames.map((name, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                        <span className="text-xs text-slate-400 w-4 shrink-0">{i + 1}.</span>
                        <span className="text-sm text-slate-800 dark:text-slate-100 flex-1">{name}</span>
                        {memberDepts[i] && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{memberDepts[i]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 dark:text-slate-600 italic py-1">Chưa có thành viên</p>
                )}
              </div>
            </div>
          </section>

          {DIVIDER}

          {/* C — Người nộp */}
          <section>
            <SectionHeader icon={MessageSquare} label="C. Người nộp đăng ký" sub="Người trực tiếp điền và nộp form" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ReadField label="Họ và tên *"   value={topic.submitterName} />
              <ReadField label="Email *"        value={topic.submitterEmail} />
              <ReadField label="Số điện thoại" value={topic.submitterPhone} />
            </div>
          </section>

          {DIVIDER}

          {/* D — Hồ sơ đề cương */}
          <section>
            <SectionHeader icon={FileText} label="D. Hồ sơ đề cương" sub="File đề cương tác giả đã nộp" />
            {topic.proposalFileUrl ? (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">File đề cương đã đính kèm</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{topic.proposalFileUrl}</p>
                </div>
                <button
                  onClick={() => setPreviewUrl(topic.proposalFileUrl!)}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Xem file
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
                <File className="w-5 h-5 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
                  Tác giả chưa đính kèm file đề cương
                </p>
              </div>
            )}
          </section>

          {DIVIDER}

          {/* E — Đề xuất phản biện */}
          {(topic.proposedReviewers || topic.excludedReviewers) && (
            <>
              <section>
                <SectionHeader icon={Users} label="E. Đề xuất người bình duyệt" sub="Không bắt buộc" />
                <div className="space-y-4">
                  {topic.proposedReviewers && (
                    <ReadField label="Đề xuất danh sách người bình duyệt" value={topic.proposedReviewers} pre />
                  )}
                  {topic.excludedReviewers && (
                    <ReadField label="Danh sách không mong muốn là người bình duyệt" value={topic.excludedReviewers} pre />
                  )}
                </div>
              </section>
              {DIVIDER}
            </>
          )}

          {/* F — Ghi chú */}
          {topic.registrationNotes && (
            <>
              <section>
                <SectionHeader icon={MessageSquare} label="F. Ghi chú" />
                <ReadField label="Ghi chú" value={topic.registrationNotes} pre />
              </section>
              {DIVIDER}
            </>
          )}

          {/* Lịch sử tiếp nhận */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Lịch sử tiếp nhận</p>
            </div>
            <IntakeTimeline logs={logs} />
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            Nộp lúc {new Date(topic.createdAt).toLocaleString("vi-VN")}
            {topic.updatedAt && ` · Cập nhật ${new Date(topic.updatedAt).toLocaleString("vi-VN")}`}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>

    {previewUrl && (
      <FilePreviewOverlay url={previewUrl} onClose={() => setPreviewUrl(null)} />
    )}
    </>
  );
}
