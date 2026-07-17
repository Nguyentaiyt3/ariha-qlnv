"use client";

import {
  useState, useRef, useCallback, useEffect, useMemo, forwardRef,
  useImperativeHandle,
} from "react";
import {
  Plus, Trash2, Link2, FileText, Users, FlaskConical, Download,
  Upload, CheckCircle2, XCircle, File, Lock, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, Eye, EyeOff,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import { researchFileUrl } from "@/lib/researchFileUrl";
import { DEPARTMENTS, COMPLETION_QUARTERS, COMPLETION_YEARS } from "@/lib/research-departments";
import type { Task } from "@/types";

// ─── Exported types ─────────────────────────────────────────────────────────

export interface ResearchTopicFormData {
  title: string;
  principalInvestigatorName: string;
  department: string;
  field?: string;
  completionTimeline: string;     // "Quý III, năm 2026"
  abstract?: string;
  memberNames?: string;           // newline-joined
  memberDepartments?: string;     // newline-joined
  proposalFileUrl: string;        // required
  submitterName?: string;
  submitterEmail?: string;
  submitterPhone?: string;
  proposedReviewers?: string;
  excludedReviewers?: string;
  linkedTaskId?: string;
  registrationNotes?: string;
}

export interface ResearchTopicFormBodyInitialData {
  title?: string;
  principalInvestigatorName?: string;
  department?: string;
  field?: string;
  abstract?: string;
  memberNames?: string;
  memberDepartments?: string;
  proposalFileUrl?: string;
  submitterName?: string;
  submitterEmail?: string;
  submitterPhone?: string;
  proposedReviewers?: string;
  excludedReviewers?: string;
  completionTimeline?: string;
  registrationNotes?: string;
  intakeNote?: string;
  intakeRevisionCount?: number;
  code?: string;
  year?: number;
}

export interface ResearchTopicFormBodyHandle {
  submit: () => void;
}

export interface ResearchTopicFormBodyProps {
  /** Controls which features are shown */
  mode: "internal" | "public" | "resubmit";

  /** Form element id — parent uses to attach external <button type="submit" form={formId}> */
  formId: string;

  /** Pre-fill (edit / resubmit) */
  initialData?: ResearchTopicFormBodyInitialData;

  /** Internal mode: session user for auto-fill */
  sessionUser?: { id: string; name: string; email?: string; department?: string } | null;
  /** Internal mode: NCKH tasks for smart task-link */
  availableTasks?: Task[];
  /** Internal mode: locked task (from URL param) */
  defaultTaskId?: string;
  /** Internal mode: is this an edit of an existing topic? */
  isEdit?: boolean;
  /** Internal mode: edit of a revision_needed topic */
  isRevisionResubmit?: boolean;

  /** Upload endpoint (different per mode) */
  uploadEndpoint: string;
  /** Template download URL (optional) */
  templateUrl?: string | null;

  /** Called with validated data when form is submitted */
  onSubmit: (data: ResearchTopicFormData) => Promise<void>;
  /** Reports form validity whenever it changes (for parent to control submit button) */
  onValidityChange?: (valid: boolean) => void;
  /** External saving state (to disable fields while parent processes submission) */
  saving?: boolean;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface MemberEntry { id: string; name: string; dept: string; }
interface UploadedFile { name: string; url: string; size: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUARTER_NUM: Record<string, number> = {
  "Quý I": 1, "Quý II": 2, "Quý III": 3, "Quý IV": 4,
};

function quarterFromTaskName(name: string): number | null {
  const m = name.match(/\bQ(\d)\b/i) ?? name.match(/Quý\s+(IV|III|II|I)\b/i);
  if (!m) return null;
  if (/^\d$/.test(m[1])) return parseInt(m[1]);
  return { I: 1, II: 2, III: 3, IV: 4 }[m[1].toUpperCase()] ?? null;
}

function parseTimeline(tl?: string | null): { q: string; y: number } {
  const match = tl?.match(/^(.+),\s*năm\s*(\d{4})$/);
  return {
    q: match?.[1] ?? "Quý III",
    y: match?.[2] ? parseInt(match[2]) : new Date().getFullYear(),
  };
}

function parseMembers(names?: string | null, depts?: string | null): MemberEntry[] {
  const nl = names?.split("\n").map(s => s.trim()).filter(Boolean) ?? [];
  const dl = depts?.split("\n").map(s => s.trim()).filter(Boolean) ?? [];
  return nl.map((name, i) => ({ id: generateId("mbr"), name, dept: dl[i] ?? "" }));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const proxyUrl = researchFileUrl;

// ─── Shared UI ───────────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-300 dark:placeholder:text-slate-600 disabled:opacity-60";
const SELECT_CLS =
  "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60";

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function SectionLabel({ letter, label, sub }: { letter: string; label: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
        {letter}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function DeptSelect({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLS} disabled={disabled}>
      <option value="">— Chọn khoa/phòng —</option>
      {DEPARTMENTS.map(d => (
        <option key={d.abbr} value={d.abbr}>{d.abbr} — {d.name}</option>
      ))}
    </select>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ member, index, onChange, onRemove, disabled }: {
  member: MemberEntry;
  index: number;
  onChange: (id: string, field: "name" | "dept", val: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-slate-400 w-5 pt-2.5 shrink-0">{index + 1}.</span>
      <input
        value={member.name}
        onChange={e => onChange(member.id, "name", e.target.value)}
        placeholder="Họ và tên thành viên"
        className={cn(INPUT_CLS, "flex-1")}
        disabled={disabled}
      />
      <div className="w-52 shrink-0">
        <DeptSelect value={member.dept} onChange={v => onChange(member.id, "dept", v)} disabled={disabled} />
      </div>
      <button
        type="button"
        onClick={() => onRemove(member.id)}
        disabled={disabled}
        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition shrink-0 disabled:opacity-40"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Inline file preview ─────────────────────────────────────────────────────

function InlinePreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  const purl   = proxyUrl(url);
  const isDocx = /\.docx$/i.test(url);
  const isDoc  = /\.doc$/i.test(url) && !isDocx;
  const isPdf  = /\.pdf$/i.test(url);

  useEffect(() => {
    if (isDoc) { setState("error"); setErrMsg("Định dạng .doc không hỗ trợ xem trước — tải xuống để xem"); return; }
    if (!isDocx) { setState("done"); return; } // PDF handled below

    let cancelled = false;
    setState("loading");

    fetch(purl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(async buf => {
        if (cancelled || !containerRef.current) return;
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        await renderAsync(buf, containerRef.current, undefined, {
          className: "docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          breakPages: true,
          useBase64URL: true,
        });
        if (!cancelled) setState("done");
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : "Không tải được file");
          setState("error");
        }
      });

    return () => { cancelled = true; };
  }, [purl, isDocx, isDoc]);

  if (isDoc || state === "error") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 space-y-2">
        <p className="text-sm text-amber-700 dark:text-amber-300">{errMsg || "Không thể xem trước file này"}</p>
        <a href={purl} download target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 underline">
          <Download className="w-3 h-3" /> Tải xuống
        </a>
      </div>
    );
  }

  if (isPdf) {
    return <iframe src={purl} className="w-full h-[480px] rounded-xl border border-slate-200 dark:border-slate-700" title="PDF preview" />;
  }

  return (
    <div className="relative min-h-[200px]">
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10 rounded-xl">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        </div>
      )}
      <div
        ref={containerRef}
        className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-auto max-h-[480px] bg-white dark:bg-slate-900 p-2"
      />
    </div>
  );
}

// ─── ProposalFileField ───────────────────────────────────────────────────────

const ALLOWED_EXT = ".pdf,.doc,.docx";
const MAX_MB      = 20;

function ProposalFileField({
  value, onChange, uploadEndpoint, hasError, onErrorClear, disabled, templateUrl,
}: {
  value: UploadedFile | null;
  onChange: (f: UploadedFile | null) => void;
  uploadEndpoint: string;
  hasError: boolean;
  onErrorClear: () => void;
  disabled?: boolean;
  templateUrl?: string | null;
}) {
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [dragOver, setDragOver]   = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft]   = useState("");

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File quá lớn — tối đa ${MAX_MB}MB`);
      return;
    }
    setUploading(true);
    setProgress(10);
    onErrorClear();
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "proposals");

      const interval = setInterval(() => setProgress(p => Math.min(p + 15, 85)), 300);
      const res = await fetch(uploadEndpoint, { method: "POST", body: form });
      clearInterval(interval);
      setProgress(100);

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Upload thất bại");
      }
      const data = await res.json() as { url: string };
      onChange({ name: file.name, url: data.url, size: file.size });
      setShowPreview(false);
      toast.success("Upload thành công");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload thất bại");
      onChange(null);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [uploadEndpoint, onChange, onErrorClear]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  function handleUrlSave() {
    const url = urlDraft.trim();
    if (!url) return;
    onChange({ name: url.split("/").pop() ?? "Link đề cương", url, size: 0 });
    setShowUrlInput(false);
    setUrlDraft("");
    onErrorClear();
  }

  const purl = value ? proxyUrl(value.url) : "";

  /* ── Has file ── */
  if (value) {
    return (
      <div className="space-y-3">
        <div className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 border",
          hasError
            ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
            : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
        )}>
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{value.name}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {value.size > 0 && (
                <span className="text-xs text-slate-400">{formatSize(value.size)}</span>
              )}
              <button
                type="button"
                onClick={() => setShowPreview(v => !v)}
                className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1"
              >
                {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPreview ? "Ẩn xem trước" : "Xem trước"}
              </button>
              <a
                href={purl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Tải xuống
              </a>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => { onChange(null); setShowPreview(false); }}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition shrink-0"
              title="Xoá file"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>

        {showPreview && (
          <div className="rounded-xl border border-violet-100 dark:border-violet-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800">
              <span className="text-xs font-medium text-violet-700 dark:text-violet-300 truncate">{value.name}</span>
              <a href={purl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-violet-600 hover:underline flex items-center gap-1 ml-2 shrink-0">
                <FileText className="w-3 h-3" /> Mở tab mới
              </a>
            </div>
            <div className="p-2">
              <InlinePreview url={value.url} />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── No file ── */
  return (
    <div className="space-y-2">
      {templateUrl && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <File className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Tải <a href={templateUrl} download className="font-semibold underline hover:no-underline">file mẫu</a>,
            {" "}điền đầy đủ rồi upload lại tại đây. PDF, DOC, DOCX · Tối đa {MAX_MB}MB.
          </span>
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition",
          hasError
            ? "border-red-400 bg-red-50/50 dark:border-red-700 dark:bg-red-900/10"
            : dragOver
              ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/20"
              : "border-slate-300 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40",
          (uploading || disabled) && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXT}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="w-6 h-6 text-violet-500 mx-auto animate-spin" />
            <p className="text-sm text-slate-500">Đang tải lên... {progress}%</p>
            <div className="w-full max-w-xs mx-auto h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <Upload className={cn("w-8 h-8 mx-auto mb-3", hasError ? "text-red-400" : "text-slate-300")} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Kéo thả hoặc <span className="text-violet-600 font-medium">nhấn để chọn file</span>
            </p>
            <p className={cn("text-xs mt-1", hasError ? "text-red-500 font-medium" : "text-slate-400")}>
              {hasError ? "⚠ Bắt buộc phải đính kèm file đề cương" : "PDF, DOC, DOCX · Tối đa " + MAX_MB + "MB"}
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowUrlInput(v => !v)}
        className="text-xs text-slate-400 hover:text-violet-600 flex items-center gap-1 transition"
      >
        <Link2 className="w-3 h-3" />
        {showUrlInput ? "Ẩn" : "Hoặc nhập link Google Drive / OneDrive"}
      </button>
      {showUrlInput && (
        <div className="flex gap-2 mt-1">
          <input
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            placeholder="https://drive.google.com/..."
            className={cn(INPUT_CLS, "flex-1")}
            onKeyDown={e => e.key === "Enter" && handleUrlSave()}
          />
          <button
            type="button"
            onClick={handleUrlSave}
            disabled={!urlDraft.trim()}
            className="px-3 py-2 bg-violet-600 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-violet-700 transition shrink-0"
          >
            Lưu
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ResearchTopicFormBody = forwardRef<ResearchTopicFormBodyHandle, ResearchTopicFormBodyProps>(
  function ResearchTopicFormBody({
    mode, formId, initialData, sessionUser, availableTasks = [], defaultTaskId,
    isEdit = false, isRevisionResubmit = false, uploadEndpoint, templateUrl,
    onSubmit, onValidityChange, saving = false,
  }, ref) {

    const initTl = parseTimeline(initialData?.completionTimeline);

    /* ── Section A ─────────────────────────────────────────────── */
    const [title,  setTitle]  = useState(initialData?.title ?? "");
    const [piName, setPiName] = useState(initialData?.principalInvestigatorName ?? sessionUser?.name ?? "");
    const [dept,   setDept]   = useState(initialData?.department ?? sessionUser?.department ?? "");
    const [field,  setField]  = useState(initialData?.field ?? "");
    const [compQ,  setCompQ]  = useState(initTl.q);
    const [compY,  setCompY]  = useState(initTl.y);
    const [abstract, setAbstract] = useState(initialData?.abstract ?? "");

    /* ── Section B — Members ────────────────────────────────────── */
    const [members, setMembers] = useState<MemberEntry[]>(() =>
      parseMembers(initialData?.memberNames, initialData?.memberDepartments)
    );

    /* ── Section C — File ───────────────────────────────────────── */
    const [proposalFile, setProposalFile] = useState<UploadedFile | null>(
      initialData?.proposalFileUrl
        ? { name: initialData.proposalFileUrl.split("/").pop() ?? "File đề cương", url: initialData.proposalFileUrl, size: 0 }
        : null
    );
    const [fileError, setFileError] = useState(false);

    /* ── Section D — Submitter ──────────────────────────────────── */
    const [subName,  setSubName]  = useState(initialData?.submitterName  ?? sessionUser?.name  ?? "");
    const [subEmail, setSubEmail] = useState(initialData?.submitterEmail ?? sessionUser?.email ?? "");
    const [subPhone, setSubPhone] = useState(initialData?.submitterPhone ?? "");

    /* ── Section E — Reviewers (collapsible in internal) ────────── */
    const [showReviewers,  setShowReviewers]  = useState(mode !== "internal");
    const [proposedRev,    setProposedRev]    = useState(initialData?.proposedReviewers ?? "");
    const [excludedRev,    setExcludedRev]    = useState(initialData?.excludedReviewers ?? "");

    /* ── Notes (public/resubmit only) ───────────────────────────── */
    const [notes, setNotes] = useState(initialData?.registrationNotes ?? "");

    /* ── Task link (internal only) ──────────────────────────────── */
    const [linkedTaskId, setLinkedTaskId] = useState<string | undefined>(defaultTaskId);
    const [autoMatched,  setAutoMatched]  = useState(false);

    /* ── Validity ───────────────────────────────────────────────── */
    const isValid = !saving &&
      title.trim().length > 0 &&
      piName.trim().length > 0 &&
      dept.trim().length > 0 &&
      !!proposalFile;

    useEffect(() => { onValidityChange?.(isValid); }, [isValid, onValidityChange]);

    /* ── NCKH task matching (internal mode) ──────────────────────── */
    const nckhTasks = useMemo<Task[]>(() => {
      if (mode !== "internal" || !sessionUser) return [];
      // Loại Task tự sinh làm hub đồng bộ ngầm cho từng đề tài (hiddenFromTaskList) — Task này có
      // tên "[NCKH] <tên đề tài>" nên khớp nhầm regex /NCKH/i, khiến đề tài MỚI tự gán nhầm vào
      // Task của MỘT đề tài KHÁC đã có từ trước thay vì đúng Task "ô" chung theo quý.
      return availableTasks.filter(t =>
        !t.hiddenFromTaskList &&
        (/NCKH/i.test(t.name) || /NCKH/i.test(t.workflowName ?? "")) &&
        (t.mainPerformerId === sessionUser.id || t.creatorId === sessionUser.id ||
          (t.stakeholders ?? []).some(s => s.userId === sessionUser.id))
      );
    }, [mode, sessionUser, availableTasks]);

    const matchingTasks = useMemo<Task[]>(() => {
      const formQ = QUARTER_NUM[compQ];
      return nckhTasks.filter(t => {
        if (!t.deadlineBase) return false;
        if (new Date(t.deadlineBase).getFullYear() !== compY) return false;
        const tq = quarterFromTaskName(t.name ?? "");
        if (tq !== null && formQ !== undefined && tq !== formQ) return false;
        return true;
      });
    }, [nckhTasks, compQ, compY]);

    useEffect(() => {
      if (mode !== "internal" || isEdit || defaultTaskId) return;
      if (matchingTasks.length === 1) {
        setLinkedTaskId(matchingTasks[0].id);
        setAutoMatched(true);
      } else {
        setAutoMatched(false);
        if (!nckhTasks.some(t => t.id === linkedTaskId)) {
          setLinkedTaskId(undefined);
        }
      }
    }, [matchingTasks, mode, isEdit, defaultTaskId, nckhTasks, linkedTaskId]);

    /* ── Member helpers ─────────────────────────────────────────── */
    function addMember() { setMembers(m => [...m, { id: generateId("mbr"), name: "", dept: "" }]); }
    function updateMember(id: string, f: "name" | "dept", val: string) {
      setMembers(m => m.map(x => x.id === id ? { ...x, [f]: val } : x));
    }
    function removeMember(id: string) { setMembers(m => m.filter(x => x.id !== id)); }

    /* ── Submit ─────────────────────────────────────────────────── */
    async function handleSubmit(e?: React.FormEvent) {
      e?.preventDefault();

      if (!proposalFile) {
        setFileError(true);
        toast.error("Vui lòng đính kèm file đề cương trước khi nộp");
        return;
      }
      if (!title.trim() || !piName.trim() || !dept.trim()) {
        toast.error("Vui lòng điền đủ thông tin bắt buộc (*)");
        return;
      }

      const mNames = members.filter(m => m.name.trim()).map(m => m.name.trim()).join("\n");
      const mDepts = members.filter(m => m.name.trim()).map(m => m.dept.trim()).join("\n");

      await onSubmit({
        title:                     title.trim(),
        principalInvestigatorName: piName.trim(),
        department:                dept,
        field:                     field.trim() || undefined,
        completionTimeline:        `${compQ}, năm ${compY}`,
        abstract:                  abstract.trim() || undefined,
        memberNames:               mNames || undefined,
        memberDepartments:         mDepts || undefined,
        proposalFileUrl:           proposalFile.url,
        submitterName:             subName.trim()  || undefined,
        submitterEmail:            subEmail.trim() || undefined,
        submitterPhone:            subPhone.trim() || undefined,
        proposedReviewers:         proposedRev.trim() || undefined,
        excludedReviewers:         excludedRev.trim() || undefined,
        linkedTaskId:              linkedTaskId,
        registrationNotes:         notes.trim() || undefined,
      });
    }

    useImperativeHandle(ref, () => ({ submit: () => handleSubmit() }), [handleSubmit]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Derived display values ─────────────────────────────────── */
    const resolvedTaskName =
      (defaultTaskId ? availableTasks.find(t => t.id === defaultTaskId)?.name : undefined) ??
      (autoMatched && linkedTaskId ? availableTasks.find(t => t.id === linkedTaskId)?.name : undefined);

    const showTaskLink = mode === "internal" && !isEdit && !defaultTaskId && nckhTasks.length > 0 && matchingTasks.length !== 1;

    // ── Render ────────────────────────────────────────────────────

    return (
      <form id={formId} onSubmit={handleSubmit} className="space-y-8" noValidate>

        {/* Revision notice (resubmit page OR internal edit of revision_needed) */}
        {(isRevisionResubmit || (mode === "resubmit" && initialData?.intakeNote)) && (
          <div className="flex gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Yêu cầu chỉnh sửa
                {initialData?.intakeRevisionCount ? ` lần ${initialData.intakeRevisionCount}` : ""}
                {initialData?.code ? ` — ${initialData.code}` : ""}
              </p>
              {initialData?.intakeNote && (
                <p className="text-amber-600 dark:text-amber-300 whitespace-pre-line">{initialData.intakeNote}</p>
              )}
              <p className="text-amber-500 dark:text-amber-400/70">
                {mode === "resubmit"
                  ? "Sau khi gửi, đề cương sẽ quay về hàng chờ tiếp nhận."
                  : "Sau khi lưu, đề cương sẽ quay về hàng chờ tiếp nhận."}
              </p>
            </div>
          </div>
        )}

        {/* Task context banner (internal mode — locked or auto-matched) */}
        {mode === "internal" && !isEdit && resolvedTaskName && (
          <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-xl text-sm">
            <FlaskConical className="w-4 h-4 text-violet-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-violet-700 dark:text-violet-300">Nhiệm vụ NCKH: </span>
              <span className="text-violet-600 dark:text-violet-400 truncate">{resolvedTaskName}</span>
            </div>
            {defaultTaskId
              ? <span title="Cố định từ trang nhiệm vụ"><Lock className="w-3.5 h-3.5 text-violet-400 shrink-0" /></span>
              : <span className="text-[10px] text-violet-400 shrink-0">Tự động khớp</span>
            }
          </div>
        )}

        {/* ══ A. Thông tin đề tài ══ */}
        <section>
          <SectionLabel letter="A" label="Thông tin đề tài" sub="Tên đề tài, chủ nhiệm và kế hoạch hoàn tất" />
          <div className="space-y-4">

            <Field label="Tên đề tài" required>
              <textarea
                value={title}
                onChange={e => setTitle(e.target.value)}
                rows={3}
                placeholder="VD: Đánh giá hiệu quả điều trị ung thư phổi không tế bào nhỏ..."
                className={cn(INPUT_CLS, "resize-none")}
                disabled={saving}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Chủ nhiệm đề tài" required>
                <input
                  value={piName}
                  onChange={e => setPiName(e.target.value)}
                  placeholder="Họ và tên chủ nhiệm"
                  className={INPUT_CLS}
                  disabled={saving}
                />
              </Field>
              <Field label="Khoa/phòng chủ nhiệm" required>
                <DeptSelect value={dept} onChange={setDept} disabled={saving} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Lĩnh vực nghiên cứu">
                <input
                  value={field}
                  onChange={e => setField(e.target.value)}
                  placeholder="VD: Nội khoa, Ngoại khoa..."
                  className={INPUT_CLS}
                  disabled={saving}
                />
              </Field>
              <Field label="Dự kiến hoàn thành" required>
                <div className="flex gap-2">
                  <select value={compQ} onChange={e => setCompQ(e.target.value)} className={cn(SELECT_CLS, "flex-1")} disabled={saving}>
                    {COMPLETION_QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                  <select value={compY} onChange={e => setCompY(Number(e.target.value))} className={cn(SELECT_CLS, "w-28 shrink-0")} disabled={saving}>
                    {COMPLETION_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </Field>
            </div>

            <Field label="Tóm tắt mục tiêu / phương pháp">
              <textarea
                value={abstract}
                onChange={e => setAbstract(e.target.value)}
                rows={3}
                placeholder="Mô tả ngắn mục tiêu, đối tượng và phương pháp nghiên cứu..."
                className={cn(INPUT_CLS, "resize-none")}
                disabled={saving}
              />
            </Field>

            {/* Smart task-link (internal, create mode, multiple matches or none) */}
            {showTaskLink && (
              <Field label="Liên kết nhiệm vụ NCKH" hint="Hệ thống tự khớp theo quý/năm; bạn có thể điều chỉnh">
                <select
                  value={linkedTaskId ?? ""}
                  onChange={e => { setLinkedTaskId(e.target.value || undefined); setAutoMatched(false); }}
                  className={SELECT_CLS}
                  disabled={saving}
                >
                  <option value="">— Không liên kết —</option>
                  {matchingTasks.length > 0 && (
                    <optgroup label={`✓ Khớp ${compQ}/${compY}`}>
                      {matchingTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  )}
                  {nckhTasks.filter(t => !matchingTasks.some(m => m.id === t.id)).length > 0 && (
                    <optgroup label="Nhiệm vụ NCKH khác">
                      {nckhTasks.filter(t => !matchingTasks.some(m => m.id === t.id)).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {matchingTasks.length > 1 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {matchingTasks.length} nhiệm vụ khớp — vui lòng chọn đúng nhiệm vụ
                  </p>
                )}
              </Field>
            )}
          </div>
        </section>

        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* ══ B. Thành viên ══ */}
        <section>
          <SectionLabel letter="B" label="Thành viên tham gia" sub="Trừ chủ nhiệm — có thể để trống" />
          <div className="space-y-2">
            {members.map((m, i) => (
              <MemberRow key={m.id} member={m} index={i} onChange={updateMember} onRemove={removeMember} disabled={saving} />
            ))}
            {members.length === 0 && (
              <p className="text-xs text-slate-400 italic py-1">Chưa có thành viên</p>
            )}
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={saving}
            className="mt-3 flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium transition disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Thêm thành viên
          </button>
        </section>

        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* ══ C. File đề cương ══ */}
        <section>
          <div className="flex items-start justify-between mb-4">
            <SectionLabel
              letter="C"
              label={<>File đề cương <span className="text-red-500 ml-0.5">*</span></>}
              sub="Upload file theo mẫu quy định — bắt buộc"
            />
          </div>
          <ProposalFileField
            value={proposalFile}
            onChange={f => { setProposalFile(f); if (f) setFileError(false); }}
            uploadEndpoint={uploadEndpoint}
            hasError={fileError}
            onErrorClear={() => setFileError(false)}
            disabled={saving}
            templateUrl={templateUrl}
          />
        </section>

        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* ══ D. Thông tin người nộp ══ */}
        <section>
          <SectionLabel letter="D" label="Thông tin người nộp" sub="Người trực tiếp điền và nộp form" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Họ và tên">
              <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="Họ và tên" className={INPUT_CLS} disabled={saving} />
            </Field>
            <Field label="Email">
              <input type="email" value={subEmail} onChange={e => setSubEmail(e.target.value)} placeholder="email@bv.com" className={INPUT_CLS} disabled={saving} />
            </Field>
            <Field label="Số điện thoại">
              <input type="tel" value={subPhone} onChange={e => setSubPhone(e.target.value)} placeholder="0909..." className={INPUT_CLS} disabled={saving} />
            </Field>
          </div>
          {mode !== "internal" && (
            <div className="mt-4">
              <Field label="Ghi chú">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Thông tin bổ sung nếu có..." className={cn(INPUT_CLS, "resize-none")} disabled={saving} />
              </Field>
            </div>
          )}
        </section>

        {/* ══ E. Phản biện (hidden in resubmit, collapsible in internal, expanded in public) ══ */}
        {mode !== "resubmit" && (
          <>
            <div className="border-t border-slate-100 dark:border-slate-800" />
            <section>
              {mode === "internal" ? (
                <button
                  type="button"
                  onClick={() => setShowReviewers(v => !v)}
                  className="w-full flex items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    E. Đề xuất người bình duyệt
                    <span className="text-xs font-normal text-slate-400">(không bắt buộc)</span>
                  </span>
                  {showReviewers ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
              ) : (
                <SectionLabel letter="E" label="Đề xuất người bình duyệt" sub="Không bắt buộc" />
              )}

              {showReviewers && (
                <div className="mt-4 space-y-4">
                  <Field label="Đề xuất phản biện" hint="Mỗi người một dòng — VD: Nguyễn Văn A - Khoa HSTC">
                    <textarea
                      value={proposedRev}
                      onChange={e => setProposedRev(e.target.value)}
                      rows={3}
                      placeholder={"Nguyễn Văn A - Khoa Hồi sức\nTrần Thị B - Khoa Nội tim mạch"}
                      className={cn(INPUT_CLS, "resize-none")}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="Không mong muốn là phản biện" hint="Không bắt buộc">
                    <textarea
                      value={excludedRev}
                      onChange={e => setExcludedRev(e.target.value)}
                      rows={2}
                      placeholder="Mỗi người một dòng..."
                      className={cn(INPUT_CLS, "resize-none")}
                      disabled={saving}
                    />
                  </Field>
                </div>
              )}
            </section>
          </>
        )}

      </form>
    );
  }
);
