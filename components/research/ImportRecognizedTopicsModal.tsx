"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Archive, FileDown } from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import { RESEARCH_STEPS } from "@/lib/research";
import { normText } from "@/lib/researchUtils";
import type { ResearchTopic, ResearchCertificate, ResearchCouncilSession, User } from "@/types";

// ─── Column mapping (template tự thiết kế — xem hướng dẫn trong modal) ──
// Col 1  Mã đề tài (tuỳ chọn)
// Col 2  Tên đề tài *
// Col 3  Chủ nhiệm *
// Col 4  Thành viên (tuỳ chọn — phân cách nhiều người bằng dấu ;)
// Col 5  Đơn vị *
// Col 6  Năm *
// Col 7  Lĩnh vực
// Col 8  Tóm tắt
// Col 9  Ngày họp Hội đồng KHCN
// Col 10 Số QĐ triển khai
// Col 11 Số chứng nhận y đức
// Col 12 Số quyết định công nhận (nếu có)
// Col 13 Ngày công nhận
// Col 14 Đơn vị cấp
// Col 15 Phạm vi ảnh hưởng
// Col 16 Link file đề tài / báo cáo (nếu có)

function cell(row: unknown[], idx: number): string {
  return String((row as unknown[])[idx - 1] ?? "").trim();
}

/** Chuẩn hoá danh sách thành viên từ 1 ô Excel (phân cách bằng ; hoặc xuống dòng) về định dạng lưu
    trữ nội bộ memberNames (nối bằng "\n"), khớp quy ước hiển thị dùng chung toàn module. */
function normalizeMembers(raw: string): string {
  return raw.split(/[;\n]/).map(s => s.trim()).filter(Boolean).join("\n");
}

interface ParsedRow {
  rowNum: number;
  code: string;
  title: string;
  piName: string;
  members: string;
  department: string;
  year: string;
  field: string;
  abstractText: string;
  councilMeetingDate: string;
  agreementCertNumber: string;
  ethicsCertNumber: string;
  recognitionCertNumber: string;
  recognitionDate: string;
  issuedBy: string;
  scope: string;
  fileUrl: string;
  valid: boolean;
  errors: string[];
  duplicate?: boolean;
}

function parseRows(data: unknown[][]): ParsedRow[] {
  const result: ParsedRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.every(c => c === null || c === undefined || c === "")) continue;

    const title  = cell(row, 2);
    const piName = cell(row, 3);
    const dept   = cell(row, 5);
    const year   = cell(row, 6);
    const errors: string[] = [];
    if (!title)  errors.push("Thiếu tên đề tài");
    if (!piName) errors.push("Thiếu chủ nhiệm");
    if (!dept)   errors.push("Thiếu đơn vị");
    if (!year || Number.isNaN(Number(year))) errors.push("Thiếu hoặc sai định dạng năm");

    result.push({
      rowNum: i + 1,
      code: cell(row, 1),
      title,
      piName,
      members: normalizeMembers(cell(row, 4)),
      department: dept,
      year,
      field:              cell(row, 7),
      abstractText:       cell(row, 8),
      councilMeetingDate: cell(row, 9),
      agreementCertNumber: cell(row, 10),
      ethicsCertNumber:   cell(row, 11),
      recognitionCertNumber: cell(row, 12),
      recognitionDate:    cell(row, 13),
      issuedBy:           cell(row, 14),
      scope:              cell(row, 15),
      fileUrl:            cell(row, 16),
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

function RowCard({ row, expanded, onToggle, matchedName }: {
  row: ParsedRow; expanded: boolean; onToggle: () => void; matchedName: string | null;
}) {
  const isOk = row.valid && !row.duplicate;
  return (
    <div className={cn("border rounded-xl overflow-hidden",
      isOk ? "border-slate-200 dark:border-slate-700" : "border-red-200 dark:border-red-800"
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
            {row.piName || "—"}{matchedName && <span className="text-green-600 dark:text-green-400"> (khớp tài khoản: {matchedName})</span>} · {row.department || "—"} · {row.year || "—"}
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
          {!matchedName && row.piName && (
            <div className="text-xs text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
              Không tìm thấy tài khoản khớp tên "{row.piName}" — lưu tên dạng chữ, đề tài sẽ không hiện trong "Đề tài của tôi" của ai
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
            <div><span className="text-slate-400">Mã đề tài:</span> <span className="text-slate-600 dark:text-slate-300">{row.code || "—"}</span></div>
            <div><span className="text-slate-400">Thành viên:</span> <span className="text-slate-600 dark:text-slate-300">{row.members ? `${row.members.split("\n").length} người` : "—"}</span></div>
            <div><span className="text-slate-400">Lĩnh vực:</span> <span className="text-slate-600 dark:text-slate-300">{row.field || "—"}</span></div>
            <div><span className="text-slate-400">Ngày họp HĐ KHCN:</span> <span className="text-slate-600 dark:text-slate-300">{row.councilMeetingDate || "—"}</span></div>
            <div><span className="text-slate-400">Số QĐ triển khai:</span> <span className="text-slate-600 dark:text-slate-300">{row.agreementCertNumber || "—"}</span></div>
            <div><span className="text-slate-400">Số chứng nhận y đức:</span> <span className="text-slate-600 dark:text-slate-300">{row.ethicsCertNumber || "—"}</span></div>
            <div><span className="text-slate-400">Số QĐ công nhận:</span> <span className="text-slate-600 dark:text-slate-300">{row.recognitionCertNumber || "—"}</span></div>
            <div><span className="text-slate-400">Ngày công nhận:</span> <span className="text-slate-600 dark:text-slate-300">{row.recognitionDate || "—"}</span></div>
            <div><span className="text-slate-400">Đơn vị cấp:</span> <span className="text-slate-600 dark:text-slate-300">{row.issuedBy || "—"}</span></div>
            <div><span className="text-slate-400">Phạm vi ảnh hưởng:</span> <span className="text-slate-600 dark:text-slate-300">{row.scope || "—"}</span></div>
          </div>
          {row.fileUrl && (
            <a href={row.fileUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline mt-1">
              Xem file đề tài/báo cáo →
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
  users: User[];
  onClose: () => void;
  onImported: (topics: ResearchTopic[]) => void;
}

export function ImportRecognizedTopicsModal({ creatorId, creatorName, existingTopics, users, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const readyRows  = rows?.filter(r => r.valid && !r.duplicate) ?? [];
  const errorRows  = rows?.filter(r => !r.valid || r.duplicate) ?? [];

  const matchUser = useCallback((piName: string) => {
    const target = normText(piName);
    return users.find(u => normText(u.name) === target) ?? null;
  }, [users]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "buffer" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const parsed = parseRows(data as unknown[][]);
      setRows(parsed);
    } catch {
      toast.error("Không đọc được file Excel");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const headers = [
        "Mã đề tài", "Tên đề tài", "Chủ nhiệm", "Thành viên", "Đơn vị", "Năm", "Lĩnh vực", "Tóm tắt",
        "Ngày họp Hội đồng KHCN", "Số QĐ triển khai", "Số chứng nhận y đức", "Số quyết định công nhận",
        "Ngày công nhận", "Đơn vị cấp", "Phạm vi ảnh hưởng", "Link file đề tài/báo cáo",
      ];
      const example = [
        "DT-2026-001", "Khảo sát tình hình sử dụng thuốc tại khoa Dược", "Nguyễn Văn A",
        "Trần Thị B; Lê Văn C", "Dược", "2026", "Dược lâm sàng", "Tóm tắt nội dung đề tài...",
        "2026-01-15", "12/QĐ-BVTN", "YD-2026-001", "45/QĐ-BVTN", "2026-06-20", "Bệnh viện Thống Nhất",
        "Cấp cơ sở", "https://...",
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws["!cols"] = headers.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Đề tài đã công nhận");
      XLSX.writeFile(wb, "mau-nhap-de-tai-da-cong-nhan.xlsx");
    } catch {
      toast.error("Không tạo được file mẫu");
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

      const newTopics: ResearchTopic[] = readyRows.map(row => {
        const matched = matchUser(row.piName);

        const certificates: ResearchCertificate[] = [];
        if (row.agreementCertNumber) {
          certificates.push({ type: "agreement", number: row.agreementCertNumber });
        }
        if (row.ethicsCertNumber) {
          certificates.push({ type: "ethics", number: row.ethicsCertNumber });
        }
        if (row.recognitionCertNumber || row.recognitionDate || row.issuedBy || row.scope) {
          certificates.push({
            type: "recognition",
            number: row.recognitionCertNumber || undefined,
            issuedAt: row.recognitionDate || undefined,
            issuedBy: row.issuedBy || undefined,
            scope: row.scope || undefined,
          });
        }

        const councilSessions: ResearchCouncilSession[] = row.councilMeetingDate ? [{
          id: generateId("cs"),
          stage: "recognition",
          mode: "in_person",
          scheduledAt: row.councilMeetingDate,
          decision: "passed",
          status: "active",
          createdAt: now,
        }] : [];

        return {
          id: generateId("rsch"),
          code: row.code || undefined,
          title: row.title,
          principalInvestigatorId: matched?.id ?? `archival_${generateId("pi")}`,
          principalInvestigatorName: row.piName,
          memberNames: row.members || undefined,
          department: row.department,
          year: Number(row.year),
          field: row.field || undefined,
          abstract: row.abstractText || undefined,
          stage: "completed" as const,
          currentStep: "r_recognize" as const,
          steps: RESEARCH_STEPS.map(s => ({ key: s.key, status: "passed" as const, completedAt: now })),
          reviews: [],
          councilSessions,
          certificates,
          documents: [],
          approvedToExecute: true,
          finalReportFileUrl: row.fileUrl || undefined,

          createdBy: creatorId,
          createdByName: creatorName,
          createdAt: now,
        };
      });

      const skipped = newTopics.filter(t => existingTitles.has(t.title.toLowerCase()));
      const toCreate = newTopics.filter(t => !existingTitles.has(t.title.toLowerCase()));

      onImported(toCreate);
      if (skipped.length) toast.warning(`${skipped.length} đề tài đã tồn tại — bỏ qua`);
      toast.success(`Đã nhập ${toCreate.length} đề tài đã công nhận`);
    } catch {
      toast.error("Nhập dữ liệu thất bại");
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
            <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Archive className="w-4.5 h-4.5 text-violet-500" /> Nhập đề tài đã công nhận
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chỉ để lưu trữ/tra cứu — không kích hoạt thẩm định hay thông báo gì cả
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">

          {/* Column guide */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-slate-600 dark:text-slate-300">Thứ tự cột trong file Excel (hàng đầu tiên là tiêu đề, bỏ qua khi đọc):</p>
              <button type="button" onClick={handleDownloadTemplate}
                className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 hover:underline whitespace-nowrap">
                <FileDown className="w-3 h-3" /> Tải file mẫu
              </button>
            </div>
            <p>A. Mã đề tài · B. Tên đề tài * · C. Chủ nhiệm * · D. Thành viên (phân cách bằng ;) · E. Đơn vị * · F. Năm * · G. Lĩnh vực · H. Tóm tắt</p>
            <p>I. Ngày họp Hội đồng KHCN · J. Số QĐ triển khai · K. Số chứng nhận y đức · L. Số quyết định công nhận (nếu có) · M. Ngày công nhận · N. Đơn vị cấp · O. Phạm vi ảnh hưởng · P. Link file đề tài/báo cáo</p>
            <p className="italic">* bắt buộc. Các cột còn lại để trống nếu không có dữ liệu.</p>
          </div>

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
                <p className="text-xs text-slate-400 mt-0.5">Sẵn sàng nhập</p>
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
                  matchedName={matchUser(row.piName)?.name ?? null}
                />
              ))}
            </div>
          )}

          {rows && errorRows.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                {errorRows.length} dòng có lỗi hoặc trùng sẽ bị bỏ qua.
                Các dòng còn lại ({readyRows.length}) vẫn được nhập bình thường.
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
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang nhập...</>
              : <><Upload className="w-4 h-4" /> Nhập {readyRows.length > 0 ? `${readyRows.length} đề tài` : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
