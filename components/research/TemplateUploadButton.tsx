"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Download, CheckCircle2, Loader2, FileText, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TemplateInfo {
  url: string | null;
  name?: string;
}

interface Props {
  /** Called when a new template URL is available */
  onUpdated?: (url: string) => void;
  /** Show compact inline variant (for use inside modal header) */
  compact?: boolean;
}

export function TemplateUploadButton({ onUpdated, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [info, setInfo] = useState<TemplateInfo>({ url: null });

  useEffect(() => {
    fetch("/api/upload/template")
      .then(r => r.json())
      .then((d: TemplateInfo) => setInfo(d))
      .catch(() => {});
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload/template", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Upload thất bại");
      }
      const data = await res.json() as { url: string; name: string };
      setInfo({ url: data.url, name: data.name });
      onUpdated?.(data.url);
      toast.success("Đã cập nhật file mẫu đề cương");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload thất bại");
    } finally {
      setUploading(false);
    }
  }

  // ── compact variant: small button used inside RegisterTopicModal header ──
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {info.url && (
          <a href={info.url} download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition">
            <Download className="w-3.5 h-3.5" />
            Tải file mẫu
          </a>
        )}
        {!info.url && (
          <span className="text-xs text-slate-400 italic">Chưa có file mẫu</span>
        )}
      </div>
    );
  }

  // ── full admin variant ──
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white">File mẫu đề cương NCKH</p>
            {info.url ? (
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <a href={info.url} target="_blank" rel="noopener noreferrer" download
                  className="text-xs text-violet-600 hover:underline truncate max-w-[280px]">
                  {info.name ?? info.url}
                </a>
              </div>
            ) : (
              <p className="text-xs text-amber-500 mt-1">Chưa có file mẫu — tác giả sẽ không tải được mẫu</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {info.url && (
            <a href={info.url} download
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <Download className="w-3 h-3" /> Tải về
            </a>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-60",
              info.url
                ? "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                : "bg-violet-600 hover:bg-violet-700 text-white",
            )}
          >
            {uploading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Đang tải...</>
              : info.url
                ? <><Pencil className="w-3 h-3" /> Thay file mẫu</>
                : <><Upload className="w-3 h-3" /> Upload file mẫu</>
            }
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-3 pl-12">
        Chấp nhận PDF, DOC, DOCX · File này sẽ hiển thị cho tác giả download khi đăng ký đề cương
      </p>
    </div>
  );
}
