"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { ClinicalTrialContact } from "@/types";

interface ImportCRARcModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (contacts: ClinicalTrialContact[]) => void;
  type: "CRA" | "CRC";
}

interface ParsedContact {
  rowNum: number;
  name?: string;
  phone?: string;
  email?: string;
  org?: string;
  error?: string;
}

export function ImportCRARcModal({ isOpen, onClose, onImport, type }: ImportCRARcModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedContact[]>([]);
  const [importing, setImporting] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const { utils, read } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

      const rows: ParsedContact[] = [];
      // Skip header (row 0), start from row 1
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row || row.every(c => c === null || c === undefined || c === "")) continue;

        const name = String(row[0] ?? "").trim();
        const phone = String(row[1] ?? "").trim();
        const email = String(row[2] ?? "").trim();
        const org = String(row[3] ?? "").trim();

        if (!name && !phone && !email) continue;

        rows.push({
          rowNum: i + 1,
          name: name || undefined,
          phone: phone || undefined,
          email: email || undefined,
          org: org || undefined,
        });
      }

      if (rows.length === 0) {
        toast.error("Không tìm thấy dữ liệu nào trong file");
        setParsed([]);
      } else {
        setParsed(rows);
        toast.success(`Đọc được ${rows.length} ${type} từ file`);
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
      const contacts: ClinicalTrialContact[] = parsed
        .filter(p => !p.error && (p.name || p.phone || p.email))
        .map(p => ({
          name: p.name,
          phone: p.phone,
          email: p.email,
          org: p.org,
        }));

      onImport(contacts);
      toast.success(`Đã import ${contacts.length} ${type}`);
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            Import {type} từ Excel
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Upload Section */}
          {parsed.length === 0 ? (
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-800 dark:text-white mb-1">
                Click để chọn file hoặc kéo thả
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                File Excel (.xlsx, .xls)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : null}

          {/* Instructions */}
          {parsed.length === 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-900 dark:text-blue-300">
                <strong>Format file:</strong> Cột 1: Tên | Cột 2: SĐT | Cột 3: Email | Cột 4: Công ty (tuỳ chọn)
              </p>
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Preview ({parsed.length} {type})
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

              <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Tên</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">SĐT</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Công ty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800/50"}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.name || "—"}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.phone || "—"}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.email || "—"}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.org || "—"}</td>
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
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang import...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Import {parsed.length} {type}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
