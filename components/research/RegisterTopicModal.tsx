"use client";

import { useState, useRef, useCallback } from "react";
import {
  X, Loader2, Plus, Trash2, Link2, FileText, Users,
  FlaskConical, MessageSquare, Download, Upload,
  CheckCircle2, XCircle, File,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect } from "react";
import { DEPARTMENTS, COMPLETION_QUARTERS, COMPLETION_YEARS } from "@/lib/research-departments";
import { buildInitialSteps } from "@/lib/research";
import { saveResearchTopic } from "@/lib/firebase/firestore";
import type { ResearchTopic } from "@/types";

// ─── Helpers ───────────────────────────────────────────────────

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

const INPUT_CLS  = "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-300 dark:placeholder:text-slate-600";
const SELECT_CLS = "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500";

function DeptSelect({ value, onChange, placeholder = "Chọn khoa/phòng" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLS}>
      <option value="">{placeholder}</option>
      {DEPARTMENTS.map(d => (
        <option key={d.abbr} value={d.abbr}>{d.abbr} — {d.name}</option>
      ))}
    </select>
  );
}

// ─── Member row ────────────────────────────────────────────────

interface MemberEntry { id: string; name: string; dept: string; }

function MemberRow({ member, onChange, onRemove, index }: {
  member: MemberEntry;
  onChange: (id: string, field: "name" | "dept", val: string) => void;
  onRemove: (id: string) => void;
  index: number;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-slate-400 w-5 pt-2.5 shrink-0">{index + 1}.</span>
      <input
        value={member.name}
        onChange={e => onChange(member.id, "name", e.target.value)}
        placeholder="Họ và tên thành viên"
        className={cn(INPUT_CLS, "flex-1")}
      />
      <div className="w-52 shrink-0">
        <DeptSelect value={member.dept} onChange={v => onChange(member.id, "dept", v)} placeholder="Khoa/phòng" />
      </div>
      <button type="button" onClick={() => onRemove(member.id)}
        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition shrink-0">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── File uploader ─────────────────────────────────────────────

interface UploadedFile { name: string; url: string; size: number; }

function useTemplateUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/upload/template")
      .then(r => r.json())
      .then((d: { url: string | null }) => setUrl(d.url))
      .catch(() => {});
  }, []);
  return url;
}
const ALLOWED_EXT  = ".pdf,.doc,.docx";
const MAX_MB       = 20;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProposalFileField({
  value, onChange,
}: {
  value: UploadedFile | null;
  onChange: (f: UploadedFile | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft]   = useState("");
  const [dragOver, setDragOver]   = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File quá lớn — tối đa ${MAX_MB}MB`);
      return;
    }
    setUploading(true);
    setProgress(10);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "proposals");

      // Simulate progress while uploading
      const interval = setInterval(() => setProgress(p => Math.min(p + 15, 85)), 300);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      clearInterval(interval);
      setProgress(100);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload thất bại");
      }
      const data = await res.json();
      onChange({ name: file.name, url: data.url, size: file.size });
      toast.success("Upload thành công");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload thất bại");
      onChange(null);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  function handleUrlSave() {
    const url = urlDraft.trim();
    if (!url) return;
    onChange({ name: "Link đề cương", url, size: 0 });
    setShowUrlInput(false);
  }

  // ── Uploaded state ──
  if (value) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-xl px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{value.name}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {value.size > 0 && (
              <span className="text-xs text-slate-400">{formatSize(value.size)}</span>
            )}
            <a href={value.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-violet-600 hover:underline">
              Xem file
            </a>
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition shrink-0"
          title="Xoá file">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Upload zone ──
  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition",
          dragOver
            ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/20"
            : "border-slate-300 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40",
          uploading && "pointer-events-none opacity-60",
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
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Kéo thả file vào đây hoặc <span className="text-violet-600 font-medium">click để chọn</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX · Tối đa {MAX_MB}MB</p>
          </>
        )}
      </div>

      {/* URL fallback */}
      <div>
        <button
          type="button"
          onClick={() => setShowUrlInput(v => !v)}
          className="text-xs text-slate-400 hover:text-violet-600 flex items-center gap-1 transition"
        >
          <Link2 className="w-3 h-3" />
          {showUrlInput ? "Ẩn" : "Hoặc nhập link Google Drive / OneDrive"}
        </button>
        {showUrlInput && (
          <div className="flex gap-2 mt-2">
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
    </div>
  );
}

// ─── Helpers to parse stored strings back to form state ────────

function parseMembers(names?: string, depts?: string): MemberEntry[] {
  const nameList = names?.split("\n").filter(Boolean) ?? [];
  const deptList = depts?.split("\n").filter(Boolean) ?? [];
  return nameList.map((name, i) => ({ id: generateId("mbr"), name, dept: deptList[i] ?? "" }));
}

function parseTimeline(tl?: string): { q: string; y: number } {
  const match = tl?.match(/^(.+),\s*năm\s*(\d{4})$/);
  return {
    q: match?.[1] ?? "Quý III",
    y: match?.[2] ? parseInt(match[2]) : new Date().getFullYear(),
  };
}

// ─── Main component ────────────────────────────────────────────

interface Props {
  defaultPI?: string;
  defaultDept?: string;
  defaultTaskId?: string;
  creatorId: string;
  creatorName: string;
  /** When provided the modal operates in edit mode */
  initialData?: ResearchTopic;
  onClose: () => void;
  onCreated: (t: ResearchTopic) => void;
}

export function RegisterTopicModal({
  defaultPI = "", defaultDept = "", defaultTaskId,
  creatorId, creatorName, initialData, onClose, onCreated,
}: Props) {
  const isEdit = !!initialData;
  const templateUrl = useTemplateUrl();

  const initTimeline = parseTimeline(initialData?.completionTimeline);

  // A — Đề tài
  const [title, setTitle]   = useState(initialData?.title ?? "");
  const [dept, setDept]     = useState(initialData?.department ?? defaultDept);
  const [completionQ, setQ] = useState<string>(initTimeline.q);
  const [completionY, setY] = useState<number>(initTimeline.y);

  // B — Nhóm nghiên cứu
  const [piName, setPiName]   = useState(initialData?.principalInvestigatorName ?? defaultPI);
  const [members, setMembers] = useState<MemberEntry[]>(() =>
    initialData ? parseMembers(initialData.memberNames, initialData.memberDepartments) : []
  );

  // C — Người điền form
  const [submitterName,  setSubmitterName]  = useState(initialData?.submitterName  ?? defaultPI);
  const [submitterEmail, setSubmitterEmail] = useState(initialData?.submitterEmail ?? "");
  const [submitterPhone, setSubmitterPhone] = useState(initialData?.submitterPhone ?? "");

  // D — File đề cương
  const [proposalFile, setProposalFile] = useState<UploadedFile | null>(
    initialData?.proposalFileUrl
      ? { name: "File đề cương đã nộp", url: initialData.proposalFileUrl, size: 0 }
      : null
  );

  // E — Phản biện
  const [proposedReviewers, setProposedReviewers] = useState(initialData?.proposedReviewers ?? "");
  const [excludedReviewers, setExcludedReviewers] = useState(initialData?.excludedReviewers ?? "");

  // F — Ghi chú
  const [notes, setNotes]                   = useState(initialData?.registrationNotes ?? "");
  const [submissionType, setSubmissionType] = useState<"new" | "resubmit">(initialData?.submissionType ?? "new");

  const [saving, setSaving] = useState(false);

  function addMember() {
    setMembers(m => [...m, { id: generateId("mbr"), name: "", dept: "" }]);
  }
  function updateMember(id: string, field: "name" | "dept", val: string) {
    setMembers(m => m.map(x => x.id === id ? { ...x, [field]: val } : x));
  }
  function removeMember(id: string) {
    setMembers(m => m.filter(x => x.id !== id));
  }

  const canSubmit = title.trim().length > 0 && piName.trim().length > 0 && dept.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) { toast.error("Vui lòng điền đủ thông tin bắt buộc (*)"); return; }
    setSaving(true);

    const timeline = `${completionQ}, năm ${completionY}`;
    const memberNamesList = members.filter(m => m.name.trim()).map(m => m.name.trim()).join("\n");
    const memberDeptsList = members.filter(m => m.dept.trim()).map(m => m.dept.trim()).join("\n");

    try {
      if (isEdit && initialData) {
        // ── Edit mode: PATCH existing topic ──
        const updates: Partial<ResearchTopic> = {
          title:                    title.trim(),
          principalInvestigatorName: piName.trim(),
          memberNames:               memberNamesList || undefined,
          memberDepartments:         memberDeptsList || undefined,
          department:                dept,
          completionTimeline:        timeline,
          submitterName:             submitterName.trim()  || undefined,
          submitterEmail:            submitterEmail.trim() || undefined,
          submitterPhone:            submitterPhone.trim() || undefined,
          proposalFileUrl:           proposalFile?.url     || undefined,
          proposedReviewers:         proposedReviewers.trim() || undefined,
          excludedReviewers:         excludedReviewers.trim() || undefined,
          submissionType,
          registrationNotes:         notes.trim() || undefined,
          updatedAt:                 new Date().toISOString(),
        };
        const res = await fetch(`/api/research/${initialData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error("Cập nhật thất bại");
        toast.success("Đã cập nhật đề cương");
        onCreated({ ...initialData, ...updates });
      } else {
        // ── Create mode: POST new topic ──
        const topic: ResearchTopic = {
          id:    generateId("rsch"),
          title: title.trim(),
          principalInvestigatorId:   creatorId,
          principalInvestigatorName: piName.trim(),
          memberIds:         [],
          memberNames:       memberNamesList || undefined,
          memberDepartments: memberDeptsList || undefined,
          department:        dept,
          year:              new Date().getFullYear(),
          stage:             "init",
          currentStep:       "approve_task",
          steps:             buildInitialSteps(),
          reviews:           [],
          councilSessions:   [],
          certificates:      [],
          documents:         [],
          approvedToExecute: false,
          submitterName:     submitterName.trim()  || undefined,
          submitterEmail:    submitterEmail.trim() || undefined,
          submitterPhone:    submitterPhone.trim() || undefined,
          proposalFileUrl:   proposalFile?.url     || undefined,
          completionTimeline: timeline,
          proposedReviewers: proposedReviewers.trim() || undefined,
          excludedReviewers: excludedReviewers.trim() || undefined,
          submissionType,
          registrationNotes: notes.trim() || undefined,
          taskId:            defaultTaskId || undefined,
          intakeStatus:      "awaiting",
          createdBy:         creatorId,
          createdByName:     creatorName,
          createdAt:         new Date().toISOString(),
        };
        await saveResearchTopic(topic);
        toast.success("Đã nộp đăng ký đề cương — đang chờ phê duyệt");
        onCreated(topic);
      }
    } catch {
      toast.error(isEdit ? "Cập nhật thất bại" : "Nộp thất bại, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-500" />
              {isEdit ? "Sửa đề cương nghiên cứu khoa học" : "Đăng ký đề cương nghiên cứu khoa học"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? "Cập nhật thông tin đề tài · Lịch sử tiếp nhận vẫn được giữ nguyên" : "Đề tài NCKH cấp cơ sở · Chờ phê duyệt sau khi nộp"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">

          {/* ── A ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={FlaskConical} label="A. Thông tin đề tài" sub="Tên đề tài, đơn vị và kế hoạch hoàn tất" />
            <div className="space-y-4">
              <Field label="Tên đề tài" required>
                <textarea value={title} onChange={e => setTitle(e.target.value)} rows={3}
                  placeholder="VD: Đánh giá hiệu quả điều trị ung thư phổi không tế bào nhỏ..."
                  className={cn(INPUT_CLS, "resize-none")} />
              </Field>

              <Field label="Khoa/phòng chủ nhiệm" required>
                <DeptSelect value={dept} onChange={setDept} />
              </Field>

              <Field label="Kế hoạch thời điểm hoàn tất" required>
                <div className="flex gap-2">
                  <select value={completionQ} onChange={e => setQ(e.target.value)} className={cn(SELECT_CLS, "flex-1")}>
                    {COMPLETION_QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                  <span className="flex items-center text-sm text-slate-500 shrink-0 px-1">năm</span>
                  <select value={completionY} onChange={e => setY(Number(e.target.value))} className={cn(SELECT_CLS, "w-28 shrink-0")}>
                    {COMPLETION_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </Field>
            </div>
          </section>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* ── B ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={Users} label="B. Nhóm nghiên cứu" sub="Chủ nhiệm và thành viên tham gia" />
            <div className="space-y-4">
              <Field label="Chủ nhiệm đề tài" required>
                <input value={piName} onChange={e => setPiName(e.target.value)}
                  placeholder="Họ và tên chủ nhiệm" className={INPUT_CLS} />
              </Field>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Thành viên tham gia
                  <span className="ml-1 text-xs font-normal text-slate-400">(trừ chủ nhiệm)</span>
                </label>
                <div className="space-y-2">
                  {members.map((m, i) => (
                    <MemberRow key={m.id} member={m} index={i}
                      onChange={updateMember} onRemove={removeMember} />
                  ))}
                  {members.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-1">Chưa có thành viên</p>
                  )}
                </div>
                <button type="button" onClick={addMember}
                  className="mt-2 flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium transition">
                  <Plus className="w-4 h-4" /> Thêm thành viên
                </button>
              </div>
            </div>
          </section>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* ── C ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader
              icon={MessageSquare}
              label="C. Người nộp đăng ký"
              sub="Người trực tiếp điền và nộp form — có thể là thư ký hoặc thành viên nhóm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Họ và tên" required>
                <input value={submitterName} onChange={e => setSubmitterName(e.target.value)}
                  placeholder="Họ và tên" className={INPUT_CLS} />
              </Field>
              <Field label="Email" required>
                <input type="email" value={submitterEmail} onChange={e => setSubmitterEmail(e.target.value)}
                  placeholder="email@bv.com" className={INPUT_CLS} />
              </Field>
              <Field label="Số điện thoại">
                <input type="tel" value={submitterPhone} onChange={e => setSubmitterPhone(e.target.value)}
                  placeholder="0909..." className={INPUT_CLS} />
              </Field>
            </div>
          </section>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* ── D ───────────────────────────────────────────────── */}
          <section>
            <div className="flex items-start justify-between mb-4">
              <SectionHeader
                icon={FileText}
                label="D. Hồ sơ đề cương"
                sub="Upload file đề cương đã soạn theo mẫu"
              />
              {/* Template download — dynamic URL */}
              {templateUrl ? (
                <a
                  href={templateUrl}
                  download
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải file mẫu đề cương
                </a>
              ) : (
                <span className="shrink-0 text-xs text-slate-400 italic">Chưa có file mẫu</span>
              )}
            </div>

            {/* Template hint banner */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300 mb-3">
              <File className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {templateUrl
                  ? <>Tải <strong>file mẫu đề cương</strong> về, điền đầy đủ thông tin, rồi upload lại tại đây.</>
                  : <>Chưa có file mẫu — liên hệ quản trị viên để cập nhật.</>
                }
                {" "}Định dạng chấp nhận: PDF, DOC, DOCX · Tối đa {MAX_MB}MB.
              </span>
            </div>

            <ProposalFileField value={proposalFile} onChange={setProposalFile} />
          </section>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* ── E ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader
              icon={Users}
              label="E. Đề xuất người bình duyệt"
              sub="Không bắt buộc — ít nhất 2 người nếu có đề xuất"
            />
            <div className="space-y-4">
              <Field label="Đề xuất danh sách người bình duyệt"
                hint="Mỗi người một dòng — VD: Nguyễn Văn A - Khoa HSTC - 0909xxx">
                <textarea value={proposedReviewers} onChange={e => setProposedReviewers(e.target.value)} rows={3}
                  placeholder={"Nguyễn Văn A - Khoa Hồi sức\nTrần Thị B - Khoa Nội tim mạch"}
                  className={cn(INPUT_CLS, "resize-none")} />
              </Field>
              <Field label="Danh sách không mong muốn là người bình duyệt" hint="Không bắt buộc">
                <textarea value={excludedReviewers} onChange={e => setExcludedReviewers(e.target.value)} rows={2}
                  placeholder="Mỗi người một dòng..."
                  className={cn(INPUT_CLS, "resize-none")} />
              </Field>
            </div>
          </section>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* ── F ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={MessageSquare} label="F. Ghi chú & Loại nộp" />
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Loại nộp</label>
                <div className="flex gap-3">
                  {(["new", "resubmit"] as const).map(type => (
                    <label key={type}
                      className={cn(
                        "flex-1 flex items-center gap-2.5 border rounded-xl px-4 py-3 cursor-pointer transition",
                        submissionType === type
                          ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-500"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                      )}>
                      <input type="radio" name="submissionType" value={type}
                        checked={submissionType === type}
                        onChange={() => setSubmissionType(type)}
                        className="accent-violet-600" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {type === "new" ? "Nộp mới" : "Nộp lại / Bổ sung"}
                      </span>
                    </label>
                  ))}
                </div>
                <p className={cn("text-xs mt-1.5",
                  submissionType === "resubmit" ? "text-amber-500" : "text-slate-400"
                )}>
                  {submissionType === "new"
                    ? "Đây là lần đầu bạn nộp đề cương này."
                    : "Đề cương đã nộp trước đây và đang bổ sung/chỉnh sửa."}
                </p>
              </div>

              <Field label="Ghi chú">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Ghi chú thêm nếu có..."
                  className={cn(INPUT_CLS, "resize-none")} />
              </Field>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Huỷ
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || !canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {isEdit ? "Đang lưu..." : "Đang nộp..."}</>
              : <><FlaskConical className="w-4 h-4" /> {isEdit ? "Lưu thay đổi" : "Nộp đăng ký"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
