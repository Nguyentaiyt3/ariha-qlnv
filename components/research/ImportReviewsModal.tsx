"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import type { ResearchReview, ResearchTopic, ReviewScores, ReviewVerdict, ReviewGrade } from "@/types";

// ─── Excel column mapping ──────────────────────────────────────
// Matches "PHIẾU NHẬN XÉT ĐỀ TÀI CẤP CƠ SỞ NĂM 2025 (Câu trả lời).xlsx"

function mapVerdict(raw: string): ReviewVerdict {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "ĐẠT") return "pass";
  if (s.includes("KHÔNG ĐẠT")) return "fail";
  if (s.includes("CHỈNH SỬA") || s.includes("NẾU")) return "pass_if_revised";
  if (s.startsWith("ĐẠT")) return "pass_if_revised";
  return "fail";
}

function mapGrade(raw: string): ReviewGrade {
  const s = (raw ?? "").trim();
  if (/xuất sắc/i.test(s))  return "excellent";
  if (/giỏi/i.test(s))      return "good";
  if (/khá/i.test(s))       return "average";
  return "fail";
}

function parseScore(v: unknown): number {
  const n = Number(v);
  return isNaN(n) || n < 1 || n > 5 ? 0 : n;
}

interface ParsedRow {
  rowNum: number;
  timestamp: string;
  reviewerName: string;
  reviewerEmail: string;
  topicTitle: string;
  piName: string;
  topicFileUrl: string;
  scores: ReviewScores;
  urgency: string;
  methodFit: string;
  novelty: string;
  significance: string;
  revisionPoints: string;
  verdictRaw: string;
  verdict: ReviewVerdict;
  additionalComments: string;
  gradeRaw: string;
  grade: ReviewGrade;
  needResubmit: boolean;
  submitterEmail: string;
  // match result
  matchedTopic?: ResearchTopic;
  matchError?: string;
}

function parseExcelRows(data: unknown[][]): ParsedRow[] {
  // Skip header row (index 0)
  const rows: ParsedRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.every(c => c === null || c === undefined || c === "")) continue;

    const scores: ReviewScores = {
      datvande:       parseScore(row[6]),
      muctieu:        parseScore(row[7]),
      ppThietke:      parseScore(row[8]),
      ppQuytrinh:     parseScore(row[9]),
      ketqua:         parseScore(row[10]),
      ketluanBandluan: parseScore(row[11]),
      cachTrinhbay:   parseScore(row[12]),
    };
    const verdictRaw = String(row[18] ?? "");
    const gradeRaw   = String(row[20] ?? "");

    rows.push({
      rowNum: i + 1,
      timestamp:    String(row[0] ?? ""),
      reviewerName: String(row[1] ?? "").trim(),
      reviewerEmail: String(row[2] ?? "").trim(),
      topicTitle:   String(row[3] ?? "").trim(),
      piName:       String(row[4] ?? "").trim(),
      topicFileUrl: String(row[5] ?? "").trim(),
      scores,
      urgency:      String(row[13] ?? "").trim(),
      methodFit:    String(row[14] ?? "").trim(),
      novelty:      String(row[15] ?? "").trim(),
      significance: String(row[16] ?? "").trim(),
      revisionPoints:  String(row[17] ?? "").trim(),
      verdictRaw,
      verdict: mapVerdict(verdictRaw),
      additionalComments: String(row[19] ?? "").trim(),
      gradeRaw,
      grade:    mapGrade(gradeRaw),
      needResubmit: String(row[22] ?? "").trim() !== "",
      submitterEmail: String(row[23] ?? "").trim(),
    });
  }
  return rows;
}

function matchToTopics(rows: ParsedRow[], topics: ResearchTopic[]): ParsedRow[] {
  return rows.map(row => {
    const titleLower = row.topicTitle.toLowerCase();
    const match = topics.find(t =>
      t.title.toLowerCase() === titleLower ||
      t.title.toLowerCase().includes(titleLower.slice(0, 30)) ||
      titleLower.includes(t.title.toLowerCase().slice(0, 30))
    );
    if (match) return { ...row, matchedTopic: match };
    return { ...row, matchError: `Không tìm thấy đề tài khớp với tên "${row.topicTitle.slice(0, 40)}..."` };
  });
}

// ─── Row preview card ──────────────────────────────────────────

function RowCard({ row, expanded, onToggle }: { row: ParsedRow; expanded: boolean; onToggle: () => void }) {
  const totalScore = Object.values(row.scores).reduce((s, v) => s + v, 0);
  const hasAllScores = Object.values(row.scores).every(v => v > 0);
  return (
    <div className={cn("border rounded-xl overflow-hidden",
      row.matchError ? "border-red-200 dark:border-red-800" : "border-slate-200 dark:border-slate-700"
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
      >
        {row.matchError
          ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          : <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.topicTitle || "—"}</p>
          <p className="text-xs text-slate-400 truncate">Phản biện: {row.reviewerName} · Điểm: {hasAllScores ? `${totalScore}/35` : "?"} · {row.verdictRaw || "?"}</p>
        </div>
        <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold",
          row.matchError
            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        )}>
          {row.matchError ? "Lỗi" : "Sẵn sàng"}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-slate-700/50 pt-3">
          {row.matchError && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{row.matchError}</div>
          )}
          {row.matchedTopic && (
            <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
              Khớp: <strong>{row.matchedTopic.title}</strong>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-slate-400">Chủ nhiệm:</span> <span className="text-slate-600 dark:text-slate-300">{row.piName}</span></div>
            <div><span className="text-slate-400">Phản biện:</span> <span className="text-slate-600 dark:text-slate-300">{row.reviewerName}</span></div>
            <div><span className="text-slate-400">Email PB:</span> <span className="text-slate-600 dark:text-slate-300">{row.reviewerEmail}</span></div>
            <div><span className="text-slate-400">Tổng điểm:</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{totalScore}/35</span></div>
            <div><span className="text-slate-400">Kết luận:</span> <span className="text-slate-600 dark:text-slate-300">{row.verdictRaw}</span></div>
            <div><span className="text-slate-400">Xếp loại:</span> <span className="text-slate-600 dark:text-slate-300">{row.gradeRaw}</span></div>
          </div>
          {row.revisionPoints && (
            <div className="text-xs text-slate-500 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-700 dark:text-amber-400">Điểm chỉnh sửa:</span> {row.revisionPoints.slice(0, 150)}{row.revisionPoints.length > 150 ? "..." : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────

interface Props {
  topics: ResearchTopic[];
  onClose: () => void;
  onImported: (updates: { topicId: string; reviews: ResearchReview[] }[]) => void;
}

export function ImportReviewsModal({ topics, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const readyRows  = rows?.filter(r => !r.matchError) ?? [];
  const errorRows  = rows?.filter(r => !!r.matchError) ?? [];

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      // Dynamic import xlsx to keep bundle size small
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "buffer" });
      // Use the first sheet
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const parsed = parseExcelRows(data as unknown[][]);
      const matched = matchToTopics(parsed, topics);
      setRows(matched);
    } catch (e) {
      toast.error("Không đọc được file Excel");
    } finally {
      setParsing(false);
    }
  }, [topics]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".xlsx") || file?.name.endsWith(".xls")) handleFile(file);
    else toast.error("Vui lòng chọn file .xlsx hoặc .xls");
  }, [handleFile]);

  async function handleImport() {
    if (!readyRows.length) return;
    setImporting(true);
    try {
      // Group by topic
      const byTopic = new Map<string, { topicId: string; reviews: ResearchReview[] }>();
      for (const row of readyRows) {
        const topic = row.matchedTopic!;
        if (!byTopic.has(topic.id)) {
          byTopic.set(topic.id, { topicId: topic.id, reviews: [...(topic.reviews ?? [])] });
        }
        const entry = byTopic.get(topic.id)!;
        const totalScore = Object.values(row.scores).reduce((s, v) => s + v, 0);
        const newReview: ResearchReview = {
          id: generateId("rev"),
          stage: "proposal",
          reviewerType: "external",
          reviewerName: row.reviewerName,
          reviewerEmail: row.reviewerEmail,
          topicFileUrl:  row.topicFileUrl || undefined,
          assignedAt:    row.timestamp || new Date().toISOString(),
          submittedAt:   row.timestamp || new Date().toISOString(),
          scores:        row.scores,
          urgency:       row.urgency || undefined,
          methodFit:     row.methodFit || undefined,
          novelty:       row.novelty || undefined,
          significance:  row.significance || undefined,
          revisionPoints: row.revisionPoints || undefined,
          additionalComments: row.additionalComments || undefined,
          verdict:       row.verdict,
          grade:         row.grade,
          needResubmit:  row.needResubmit,
          score:         totalScore,
          recommendation: row.verdict === "pass" ? "pass" : row.verdict === "fail" ? "fail" : "revise",
          comments:      row.revisionPoints || undefined,
          status:        "submitted",
        };
        // Avoid duplicate: same reviewer + same topic
        const isDup = entry.reviews.some(r =>
          r.reviewerEmail === row.reviewerEmail || r.reviewerName === row.reviewerName
        );
        if (!isDup) entry.reviews.push(newReview);
      }
      onImported([...byTopic.values()]);
      toast.success(`Đã import ${readyRows.length} phiếu phản biện`);
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
            <h2 className="font-bold text-slate-800 dark:text-white">Import phiếu phản biện từ Excel</h2>
            <p className="text-xs text-slate-400 mt-0.5">Hỗ trợ format "PHIẾU NHẬN XÉT ĐỀ TÀI CẤP CƠ SỞ" xuất từ Google Forms</p>
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
            {parsing ? (
              <Loader2 className="w-8 h-8 text-violet-500 mx-auto animate-spin mb-2" />
            ) : (
              <FileSpreadsheet className="w-8 h-8 text-slate-400 group-hover:text-violet-500 mx-auto mb-2 transition" />
            )}
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {parsing ? "Đang đọc file..." : fileName ? fileName : "Kéo thả file .xlsx hoặc click để chọn"}
            </p>
            <p className="text-xs text-slate-400 mt-1">Cột A–X theo định dạng Google Forms xuất ra</p>
          </div>

          {/* Summary stats */}
          {rows && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{rows.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">Tổng hàng đọc được</p>
              </div>
              <div className={cn("rounded-xl p-3 text-center", readyRows.length > 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-slate-50 dark:bg-slate-800/50")}>
                <p className={cn("text-2xl font-bold", readyRows.length > 0 ? "text-green-600 dark:text-green-400" : "text-slate-400")}>{readyRows.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">Sẵn sàng import</p>
              </div>
              <div className={cn("rounded-xl p-3 text-center", errorRows.length > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-slate-50 dark:bg-slate-800/50")}>
                <p className={cn("text-2xl font-bold", errorRows.length > 0 ? "text-red-500" : "text-slate-400")}>{errorRows.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">Không khớp đề tài</p>
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
                {errorRows.length} phiếu không tìm được đề tài tương ứng trong hệ thống — sẽ bị bỏ qua khi import. Bạn có thể tạo đề tài trước rồi import lại.
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
              : <><Upload className="w-4 h-4" /> Import {readyRows.length > 0 ? `${readyRows.length} phiếu` : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
