"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { saveClinicalTrial, updateClinicalTrial, getClinicalTrials } from "@/lib/firebase/firestore";
import type { ClinicalTrial, ClinicalTrialStatus, ClinicalTrialContact } from "@/types";

interface ImportTrialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorId: string;
  creatorName: string;
  onImported: (trials: ClinicalTrial[]) => void;
}

interface ParsedTrial {
  rowNum: number;
  code?: string;
  title?: string;
  abbreviation?: string;
  nctCode?: string;
  principalInvestigatorName?: string;
  department?: string;
  sponsor?: string;
  cro?: string;
  smo?: string;
  startPeriod?: string;
  endPeriod?: string;
  status?: string;
  craData?: ClinicalTrialContact[];
  crcData?: ClinicalTrialContact[];
  error?: string;
}

const STATUS_OPTIONS: ClinicalTrialStatus[] = [
  "feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met",
  "lec_approved", "awaiting_moh", "pre_deployment",
  "running_pre_enroll", "running_enrolled", "completed",
  "terminated_no_efficacy", "not_feasible",
];

function mapStatus(raw?: string): ClinicalTrialStatus {
  if (!raw) return "feasibility";
  const s = String(raw).trim().toLowerCase();
  const match = STATUS_OPTIONS.find(st => st.includes(s) || s.includes(st));
  return match || "feasibility";
}

function extractContacts(row: Record<string, unknown>, type: "CRA" | "CRC"): ClinicalTrialContact[] | undefined {
  const contacts: ClinicalTrialContact[] = [];
  // Support up to 3 contacts per type
  for (let i = 1; i <= 3; i++) {
    const name = String(row[`${type} Tên ${i}`] ?? "").trim();
    const phone = String(row[`${type} SĐT ${i}`] ?? "").trim();
    const email = String(row[`${type} Email ${i}`] ?? "").trim();
    if (name || phone || email) {
      contacts.push({
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
    }
  }
  return contacts.length > 0 ? contacts : undefined;
}

export function ImportTrialsModal({ isOpen, onClose, creatorId, creatorName, onImported }: ImportTrialsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedTrial[]>([]);
  const [importing, setImporting] = useState(false);

  async function downloadTemplate() {
    try {
      const { utils, writeFile } = await import("xlsx");
      const ws = utils.json_to_sheet([
        {
          "Mã (Code)": "TRIAL-2024-001",
          "Tên (Title)": "Thử nghiệm lâm sàng tên đầu đủ",
          "Viết tắt (Abbreviation)": "TN-001",
          "NCT Code": "NCT05123456",
          "PI": "Tiến sĩ Nguyễn Văn A",
          "Khoa (Department)": "Nội tim mạch",
          "Nhà tài trợ (Sponsor)": "AstraZeneca",
          "CRO": "",
          "SMO": "",
          "Thời gian bắt đầu (Start Period)": "3/2024",
          "Thời gian kết thúc (End Period)": "12/2026",
          "Trạng thái (Status)": "pre_deployment",
          "CRA Tên 1": "Nguyễn Văn A",
          "CRA SĐT 1": "0912345678",
          "CRA Email 1": "cra1@company.com",
          "CRA Tên 2": "",
          "CRA SĐT 2": "",
          "CRA Email 2": "",
          "CRC Tên 1": "Trần Thị B",
          "CRC SĐT 1": "0987654321",
          "CRC Email 1": "crc1@company.com",
          "CRC Tên 2": "",
          "CRC SĐT 2": "",
          "CRC Email 2": "",
        },
      ]);

      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Clinical Trials");
      ws["!cols"] = [
        { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 },
        { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
        { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
        { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
        { wch: 20 }, { wch: 15 },
      ];

      writeFile(wb, "Template_Import_Trials.xlsx");
      toast.success("Đã download file mẫu");
    } catch (error) {
      toast.error("Lỗi khi download file mẫu");
      console.error(error);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const { utils, read } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = utils.sheet_to_json<Record<string, unknown>>(sheet) as unknown[];

      const rows: ParsedTrial[] = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as Record<string, unknown>;
        if (!row || Object.values(row).every(v => !v)) continue;

        const code = String(row["Mã (Code)"] ?? "").trim();
        if (!code) {
          rows.push({
            rowNum: i + 2,
            error: "Thiếu mã (Code)",
          });
          continue;
        }

        rows.push({
          rowNum: i + 2,
          code,
          title: String(row["Tên (Title)"] ?? "").trim(),
          abbreviation: String(row["Viết tắt (Abbreviation)"] ?? "").trim(),
          nctCode: String(row["NCT Code"] ?? "").trim(),
          principalInvestigatorName: String(row["PI"] ?? "").trim(),
          department: String(row["Khoa (Department)"] ?? "").trim(),
          sponsor: String(row["Nhà tài trợ (Sponsor)"] ?? "").trim(),
          cro: String(row["CRO"] ?? "").trim(),
          smo: String(row["SMO"] ?? "").trim(),
          startPeriod: String(row["Thời gian bắt đầu (Start Period)"] ?? "").trim(),
          endPeriod: String(row["Thời gian kết thúc (End Period)"] ?? "").trim(),
          status: String(row["Trạng thái (Status)"] ?? "").trim(),
          craData: extractContacts(row, "CRA"),
          crcData: extractContacts(row, "CRC"),
        });
      }

      if (rows.length === 0) {
        toast.error("Không tìm thấy dữ liệu nào trong file");
        setParsed([]);
      } else {
        setParsed(rows);
        toast.success(`Đọc được ${rows.length} thử nghiệm từ file`);
      }
    } catch (error) {
      toast.error(`Lỗi khi đọc file: ${error instanceof Error ? error.message : "Unknown error"}`);
      setParsed([]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleImport() {
    if (parsed.length === 0) {
      toast.error("Chưa có dữ liệu để import");
      return;
    }

    setImporting(true);
    try {
      // Get existing trials for upsert
      const existingTrials = await getClinicalTrials();
      const codeToId = new Map(existingTrials.map(t => [t.code, t.id]));

      const importedTrials: ClinicalTrial[] = [];

      for (const p of parsed) {
        if (p.error || !p.code || !p.title) continue;

        const trialId = codeToId.get(p.code);
        const baseData: Partial<ClinicalTrial> = {
          code: p.code,
          title: p.title,
          abbreviation: p.abbreviation,
          nctCode: p.nctCode,
          principalInvestigatorName: p.principalInvestigatorName,
          department: p.department,
          sponsor: p.sponsor,
          cro: p.cro,
          smo: p.smo,
          startPeriod: p.startPeriod,
          endPeriod: p.endPeriod,
          status: mapStatus(p.status),
          ...(p.craData && { cra: p.craData }),
          ...(p.crcData && { crc: p.crcData }),
        };

        if (trialId) {
          // Update existing
          await updateClinicalTrial(trialId, baseData);
          const updated = existingTrials.find(t => t.id === trialId);
          if (updated) {
            importedTrials.push({ ...updated, ...baseData });
          }
        } else {
          // Create new
          const newTrial: Partial<ClinicalTrial> = {
            ...baseData,
            createdBy: creatorId,
            createdByName: creatorName,
            createdAt: new Date().toISOString(),
          };
          const result = await saveClinicalTrial(newTrial as ClinicalTrial);
          if (result) importedTrials.push({ ...newTrial, id: result.id } as ClinicalTrial);
        }
      }

      toast.success(`Đã import/cập nhật ${importedTrials.length} thử nghiệm`);
      onImported(importedTrials);
      setParsed([]);
      onClose();
    } catch (error) {
      toast.error("Lỗi khi import");
      console.error(error);
    } finally {
      setImporting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            Import/Cập nhật Thử Nghiệm Lâm Sàng
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Download Template */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-900 dark:text-blue-300 mb-3">
              <strong>Bước 1:</strong> Download file mẫu, điền dữ liệu, rồi upload lại
            </p>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
            >
              <Download className="w-4 h-4" />
              Download File Mẫu
            </button>
          </div>

          {/* Upload Section */}
          {parsed.length === 0 ? (
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-800 dark:text-white mb-1">
                Click để chọn file hoặc kéo thả
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                File Excel (.xlsx, .xls) - Tối đa 1000 thử nghiệm
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                disabled={loading}
                className="hidden"
              />
            </div>
          ) : null}

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Preview ({parsed.length} thử nghiệm)
                </h3>
                <button
                  onClick={() => {
                    setParsed([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                >
                  Chọn file khác
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Mã</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Tên</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">PI</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Khoa</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, idx) => (
                      <tr
                        key={idx}
                        className={`${
                          p.error
                            ? "bg-red-50 dark:bg-red-900/20"
                            : idx % 2 === 0
                            ? "bg-white dark:bg-slate-900"
                            : "bg-slate-50 dark:bg-slate-800/50"
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">
                          {p.error ? "❌" : "✓"} {p.code || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate">
                          {p.title || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate">
                          {p.principalInvestigatorName || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          {p.department || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          {p.error ? (
                            <span className="text-red-600 dark:text-red-400">{p.error}</span>
                          ) : (
                            p.status || "feasibility"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Huỷ
          </button>
          {parsed.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing || loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang import...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Import {parsed.filter(p => !p.error).length} thử nghiệm
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
