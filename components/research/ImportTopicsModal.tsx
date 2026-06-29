"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import { buildInitialSteps } from "@/lib/research";
import { researchFileUrl } from "@/lib/researchFileUrl";
import type { ResearchTopic } from "@/types";

// ─── Column mapping (sheet "Đăng ký Q1" / "Bản sao Đăng ký Q2") ─
// Col 1  Dấu thời gian
// Col 2  Địa chỉ email (submitter auto)
// Col 3  Tên đề tài *
// Col 4  Chủ nhiệm đề tài *
// Col 5  Thành viên tham gia (multiline)
// Col 6  Khoa/phòng *
// Col 7  Liệt kê Khoa/phòng các thành viên
// Col 8  Đính kèm file đề cương
// Col 9  Họ và tên người điền
// Col 10 Email người điền
// Col 11 Số điện thoại
// Col 12 Ghi chú
// Col 13 Kế hoạch thời điểm hoàn tất
// Col 14 Đề xuất người bình duyệt
// Col 15 Không mong muốn bình duyệt
// Col 16 Loại nộp ("Nộp mới" | other)

function cell(row: unknown[], idx: number): string {
  return String((row as unknown[])[idx - 1] ?? "").trim();
}

interface ParsedRow {
  rowNum: number;
  timestamp: string;
  title: string;
  piName: string;
  memberNames: string;
  department: string;
  memberDepartments: string;
  proposalFileUrl: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string;
  notes: string;
  completionTimeline: string;
  proposedReviewers: string;
  excludedReviewers: string;
  submissionType: "new" | "resubmit";
  // validation
  valid: boolean;
  errors: string[];
  duplicate?: boolean;
}

function parseRows(data: unknown[][]): ParsedRow[] {
  const result: ParsedRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.every(c => c === null || c === undefined || c === "")) continue;

    const title    = cell(row, 3);
    const piName   = cell(row, 4);
    const dept     = cell(row, 6);
    const errors: string[] = [];
    if (!title)  errors.push("Thiếu tên đề tài");
    if (!piName) errors.push("Thiếu chủ nhiệm");
    if (!dept)   errors.push("Thiếu khoa/phòng");

    const subType = cell(row, 16).toLowerCase().includes("mới") ? "new" : "resubmit";

    result.push({
      rowNum: i + 1,
      timestamp:        cell(row, 1),
      title,
      piName,
      memberNames:      cell(row, 5),
      department:       dept,
      memberDepartments: cell(row, 7),
      proposalFileUrl:  cell(row, 8),
      submitterName:    cell(row, 9),
      submitterEmail:   cell(row, 10),
      submitterPhone:   cell(row, 11),
      notes:            cell(row, 12),
      completionTimeline: cell(row, 13),
      proposedReviewers: cell(row, 14),
      excludedReviewers: cell(row, 15),
      submissionType:   subType,
      valid: errors.length === 0,
      errors,
    });
  }

  // Mark duplicates within the batch
  const seen = new Map<string, number>();
  for (const r of result) {
    const key = r.title.toLowerCase().slice(0, 60);
    const prev = seen.get(key);
    if (prev !== undefined) r.duplicate = true;
    else seen.set(key, r.rowNum);
  }
  return result;
}

// ─── Row preview card ──────────────────────────────────────────

function RowCard({ row, expanded, onToggle }: { row: ParsedRow; expanded: boolean; onToggle: () => void }) {
  const isOk = row.valid && !row.duplicate;
  return (
    <div className={cn("border rounded-xl overflow-hidden",
      isOk
        ? "border-slate-200 dark:border-slate-700"
        : "border-red-200 dark:border-red-800"
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
      >
        {isOk
          ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.title || "(Không có tên)"}</p>
          <p className="text-xs text-slate-400 truncate">
            {row.piName || "—"} · {row.department || "—"} · {row.completionTimeline || "—"}
          </p>
        </div>
        <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold",
          isOk
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        )}>
          {row.duplicate ? "Trùng" : row.valid ? "Sẵn sàng" : "Lỗi"}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700/50 pt-3 space-y-2">
          {row.errors.map((e, i) => (
            <div key={i} className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5">{e}</div>
          ))}
          {row.duplicate && (
            <div className="text-xs text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
              Tên đề tài trùng với một dòng khác trong batch — sẽ bị bỏ qua
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
            <div><span className="text-slate-400">Chủ nhiệm:</span> <span className="text-slate-600 dark:text-slate-300">{row.piName}</span></div>
            <div><span className="text-slate-400">Khoa/phòng:</span> <span className="text-slate-600 dark:text-slate-300">{row.department}</span></div>
            <div><span className="text-slate-400">Người nộp:</span> <span className="text-slate-600 dark:text-slate-300">{row.submitterName}</span></div>
            <div><span className="text-slate-400">Loại nộp:</span> <span className="text-slate-600 dark:text-slate-300">{row.submissionType === "new" ? "Nộp mới" : "Nộp lại"}</span></div>
            <div><span className="text-slate-400">Hoàn tất:</span> <span className="text-slate-600 dark:text-slate-300">{row.completionTimeline}</span></div>
            <div><span className="text-slate-400">Thành viên:</span> <span className="text-slate-600 dark:text-slate-300">{row.memberNames ? `${row.memberNames.split("\n").length} người` : "—"}</span></div>
          </div>
          {row.proposalFileUrl && (
            <a href={researchFileUrl(row.proposalFileUrl)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline mt-1">
              Xem file đề cương →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────

interface Props {
  creatorId: string;
  creatorName: string;
  existingTopics: ResearchTopic[];
  onClose: () => void;
  onImported: (topics: ResearchTopic[]) => void;
}

export function ImportTopicsModal({ creatorId, creatorName, existingTopics, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const readyRows  = rows?.filter(r => r.valid && !r.duplicate) ?? [];
  const errorRows  = rows?.filter(r => !r.valid || r.duplicate) ?? [];

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "buffer" });

      // Prefer "Đăng ký Q1" or first sheet
      const sheetName =
        wb.SheetNames.find(n => n.includes("Q1") && n.toLowerCase().includes("ng k")) ||
        wb.SheetNames.find(n => n.toLowerCase().includes("ng k")) ||
        wb.SheetNames[0];

      const ws   = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const parsed = parseRows(data as unknown[][]);
      setRows(parsed);
    } catch {
      toast.error("Không đọc được file Excel");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.match(/\.xlsx?$/i)) handleFile(file);
    else toast.error("Vui lòng chọn file .xlsx hoặc .xls");
  }, [handleFile]);

  async function handleImport() {
    if (!readyRows.length) return;
    setImporting(true);
    try {
      const now = new Date().toISOString();
      const existingTitles = new Set(existingTopics.map(t => t.title.toLowerCase()));

      const newTopics: ResearchTopic[] = readyRows.map(row => ({
        id:    generateId("rsch"),
        title: row.title,
        principalInvestigatorId: creatorId,
        principalInvestigatorName: row.piName,
        memberIds:         [],
        memberNames:       row.memberNames || undefined,
        memberDepartments: row.memberDepartments || undefined,
        department:        row.department,
        year:              new Date().getFullYear(),
        stage:             "init" as const,
        currentStep:       "approve_task" as const,
        steps:             buildInitialSteps(),
        reviews:           [],
        councilSessions:   [],
        certificates:      [],
        documents:         [],
        approvedToExecute: false,

        submitterName:     row.submitterName    || undefined,
        submitterEmail:    row.submitterEmail   || undefined,
        submitterPhone:    row.submitterPhone   || undefined,
        proposalFileUrl:   row.proposalFileUrl  || undefined,
        completionTimeline: row.completionTimeline || undefined,
        proposedReviewers: row.proposedReviewers || undefined,
        excludedReviewers: row.excludedReviewers || undefined,
        submissionType:    row.submissionType,
        registrationNotes: row.notes || undefined,

        createdBy:     creatorId,
        createdByName: creatorName,
        createdAt:     row.timestamp || now,
      }));

      const skipped = newTopics.filter(t => existingTitles.has(t.title.toLowerCase()));
      const toCreate = newTopics.filter(t => !existingTitles.has(t.title.toLowerCase()));

      onImported(toCreate);
      if (skipped.length) toast.warning(`${skipped.length} đề tài đã tồn tại — bỏ qua`);
      toast.success(`Đã import ${toCreate.length} đề tài`);
    } catch {
      toast.error("Import thất bại");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white">Import đăng ký đề tài từ Excel</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Hỗ trợ sheet "Đăng ký Q1" / "Bản sao Đăng ký Q2" (Google Forms export)
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">

          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 rounded-xl p-8 text-center cursor-pointer transition group"
          >
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {parsing
              ? <Loader2 className="w-8 h-8 text-violet-500 mx-auto animate-spin mb-2" />
              : <FileSpreadsheet className="w-8 h-8 text-slate-400 group-hover:text-violet-500 mx-auto mb-2 transition" />
            }
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {parsing ? "Đang đọc file..." : fileName || "Kéo thả file .xlsx hoặc click để chọn"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Cột A–P theo định dạng Google Forms "ĐĂNG KÝ ĐỀ TÀI NGHIÊN CỨU"
            </p>
          </div>

          {/* Stats */}
          {rows && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{rows.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">Tổng hàng đọc</p>
              </div>
              <div className={cn("rounded-xl p-3 text-center", readyRows.length > 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-slate-50 dark:bg-slate-800/50")}>
                <p className={cn("text-2xl font-bold", readyRows.length > 0 ? "text-green-600 dark:text-green-400" : "text-slate-400")}>{readyRows.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">Sẵn sàng import</p>
              </div>
              <div className={cn("rounded-xl p-3 text-center", errorRows.length > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-slate-50 dark:bg-slate-800/50")}>
                <p className={cn("text-2xl font-bold", errorRows.length > 0 ? "text-red-500" : "text-slate-400")}>{errorRows.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">Lỗi / Trùng</p>
              </div>
            </div>
          )}

          {/* Row list */}
          {rows && rows.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <RowCard
                  key={i}
                  row={row}
                  expanded={expanded === i}
                  onToggle={() => setExpanded(expanded === i ? null : i)}
                />
              ))}
            </div>
          )}

          {rows && errorRows.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                {errorRows.length} dòng có lỗi hoặc trùng sẽ bị bỏ qua.
                Các dòng còn lại ({readyRows.length}) vẫn được import bình thường.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Đóng
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !readyRows.length}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2">
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang import...</>
              : <><Upload className="w-4 h-4" /> Import {readyRows.length > 0 ? `${readyRows.length} đề tài` : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
