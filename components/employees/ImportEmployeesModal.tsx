"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, Download, CheckCircle2, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { getUsers, saveUser } from "@/lib/firebase/firestore";
import { roleLabel } from "@/lib/utils";
import { CONTRACT_TYPE_LABEL } from "@/types";
import type { UserRole, ContractType } from "@/types";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const ASSIGNABLE_ROLES: UserRole[] = ["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"];

function genTempPassword() {
  return "Ariha@" + Math.random().toString(36).slice(-6);
}

const ROLE_LABEL_TO_KEY: Record<string, UserRole> = Object.fromEntries(
  ASSIGNABLE_ROLES.map((r) => [roleLabel(r).toLowerCase(), r]),
);

function mapRole(raw?: string): UserRole {
  if (!raw) return "staff";
  const s = raw.trim().toLowerCase();
  if (ROLE_LABEL_TO_KEY[s]) return ROLE_LABEL_TO_KEY[s];
  if ((ASSIGNABLE_ROLES as string[]).includes(raw.trim())) return raw.trim() as UserRole;
  return "staff";
}

const CONTRACT_LABEL_TO_KEY: Record<string, ContractType> = Object.fromEntries(
  (Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => [CONTRACT_TYPE_LABEL[t].toLowerCase(), t]),
);

function mapContractType(raw?: string): ContractType | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  if (CONTRACT_LABEL_TO_KEY[s]) return CONTRACT_LABEL_TO_KEY[s];
  if ((Object.keys(CONTRACT_TYPE_LABEL) as string[]).includes(raw.trim())) return raw.trim() as ContractType;
  return undefined;
}

/** Chấp nhận Date (ô Excel định dạng ngày), "dd/mm/yyyy", hoặc "yyyy-mm-dd". Không nhận dạng được → bỏ qua. */
function parseDateCell(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Dùng getter theo giờ địa phương, KHÔNG dùng toISOString() — toISOString quy đổi sang UTC
    // nên với múi giờ dương (VN = UTC+7), 1 ngày ở giờ địa phương sẽ bị lùi 1 ngày khi convert.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return undefined;
}

interface ParsedEmployee {
  rowNum: number;
  name?: string;
  email?: string;
  department?: string;
  position?: string;
  role?: UserRole;
  employeeCode?: string;
  idNumber?: string;
  contractType?: ContractType;
  contractStart?: string;
  contractEnd?: string;
  phone?: string;
  birthday?: string;
  joinDate?: string;
  error?: string;
}

interface ImportResult {
  email: string;
  name: string;
  action: "created" | "updated" | "failed";
  tempPassword?: string;
  error?: string;
}

export function ImportEmployeesModal({ onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedEmployee[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  async function downloadTemplate() {
    try {
      const { utils, writeFile } = await import("xlsx");
      const ws = utils.json_to_sheet([
        {
          "Họ tên *": "Nguyễn Văn A",
          "Email *": "nguyenvana@example.com",
          "Phòng ban": "Khoa Nội tim mạch",
          "Chức danh": "Bác sĩ điều trị",
          "Vai trò": "Nhân viên",
          "Mã nhân viên": "NV001",
          "Số CCCD": "079123456789",
          "Loại hợp đồng": "Không xác định thời hạn",
          "Ngày bắt đầu HĐ": "01/01/2026",
          "Ngày kết thúc HĐ": "",
          "Điện thoại": "0912345678",
          "Ngày sinh": "15/05/1990",
          "Ngày vào làm": "01/01/2026",
        },
      ]);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Nhân viên");
      ws["!cols"] = [
        { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 22 },
        { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
        { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 14 }, { wch: 15 },
      ];
      writeFile(wb, "Template_Import_NhanVien.xlsx");
      toast.success("Đã tải file mẫu");
    } catch (error) {
      toast.error("Lỗi khi tải file mẫu");
      console.error(error);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResults(null);
    try {
      const { utils, read } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = utils.sheet_to_json<Record<string, unknown>>(sheet);

      const rows: ParsedEmployee[] = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || Object.values(row).every((v) => !v)) continue;

        const name = String(row["Họ tên *"] ?? "").trim();
        const email = String(row["Email *"] ?? "").trim().toLowerCase();
        if (!name || !email) {
          rows.push({ rowNum: i + 2, name: name || undefined, email: email || undefined, error: "Thiếu họ tên hoặc email" });
          continue;
        }
        if (!email.includes("@")) {
          rows.push({ rowNum: i + 2, name, email, error: "Email không hợp lệ" });
          continue;
        }

        rows.push({
          rowNum: i + 2,
          name,
          email,
          department: String(row["Phòng ban"] ?? "").trim() || undefined,
          position: String(row["Chức danh"] ?? "").trim() || undefined,
          role: mapRole(String(row["Vai trò"] ?? "")),
          employeeCode: String(row["Mã nhân viên"] ?? "").trim() || undefined,
          idNumber: String(row["Số CCCD"] ?? "").trim() || undefined,
          contractType: mapContractType(String(row["Loại hợp đồng"] ?? "")),
          contractStart: parseDateCell(row["Ngày bắt đầu HĐ"]),
          contractEnd: parseDateCell(row["Ngày kết thúc HĐ"]),
          phone: String(row["Điện thoại"] ?? "").trim() || undefined,
          birthday: parseDateCell(row["Ngày sinh"]),
          joinDate: parseDateCell(row["Ngày vào làm"]),
        });
      }

      // Trùng email trong cùng file — chỉ giữ dòng đầu, đánh dấu lỗi các dòng sau
      const seen = new Set<string>();
      for (const r of rows) {
        if (r.error || !r.email) continue;
        if (seen.has(r.email)) {
          r.error = "Email trùng với 1 dòng khác trong file";
        } else {
          seen.add(r.email);
        }
      }

      if (rows.length === 0) {
        toast.error("Không tìm thấy dữ liệu nào trong file");
        setParsed([]);
      } else {
        setParsed(rows);
        toast.success(`Đọc được ${rows.length} nhân viên từ file`);
      }
    } catch (error) {
      toast.error(`Lỗi khi đọc file: ${error instanceof Error ? error.message : "Unknown error"}`);
      setParsed([]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImport() {
    const validRows = parsed.filter((p) => !p.error);
    if (validRows.length === 0) {
      toast.error("Chưa có dữ liệu hợp lệ để import");
      return;
    }

    setImporting(true);
    try {
      const existingUsers = await getUsers();
      const emailToId = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));

      const out: ImportResult[] = [];
      for (const p of validRows) {
        const existingId = emailToId.get(p.email!);
        try {
          if (existingId) {
            await saveUser({
              id: existingId,
              name: p.name,
              department: p.department,
              position: p.position,
              role: p.role,
              employeeCode: p.employeeCode,
              idNumber: p.idNumber,
              contractType: p.contractType,
              contractStart: p.contractStart,
              contractEnd: p.contractEnd,
              phone: p.phone,
              birthday: p.birthday,
              joinDate: p.joinDate,
            });
            out.push({ email: p.email!, name: p.name!, action: "updated" });
          } else {
            const tempPassword = genTempPassword();
            const res = await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: p.name, email: p.email, tempPassword,
                role: p.role || "staff", department: p.department, position: p.position,
                employeeCode: p.employeeCode,
              }),
            });
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || "Tạo tài khoản thất bại");
            }
            const { id } = await res.json();
            // Các field hợp đồng/liên hệ không có trong POST /api/users — set thêm 1 lần nữa
            await saveUser({
              id, idNumber: p.idNumber, contractType: p.contractType, contractStart: p.contractStart,
              contractEnd: p.contractEnd, phone: p.phone, birthday: p.birthday, joinDate: p.joinDate,
            });
            out.push({ email: p.email!, name: p.name!, action: "created", tempPassword });
          }
        } catch (err) {
          out.push({ email: p.email!, name: p.name!, action: "failed", error: err instanceof Error ? err.message : "Lỗi" });
        }
      }

      setResults(out);
      setParsed([]);
      onImported();

      const created = out.filter((r) => r.action === "created").length;
      const updated = out.filter((r) => r.action === "updated").length;
      const failed = out.filter((r) => r.action === "failed").length;
      toast.success(`Đã tạo ${created}, cập nhật ${updated}${failed ? `, lỗi ${failed}` : ""} nhân viên`);
    } catch (error) {
      toast.error("Lỗi khi import");
      console.error(error);
    } finally {
      setImporting(false);
    }
  }

  function copyResultsToClipboard() {
    if (!results) return;
    const lines = results
      .filter((r) => r.action === "created" && r.tempPassword)
      .map((r) => `${r.name}\t${r.email}\t${r.tempPassword}`);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(["Họ tên\tEmail\tMật khẩu tạm", ...lines].join("\n"));
    toast.success("Đã copy danh sách mật khẩu tạm");
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Import danh sách nhân viên</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!results && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-300 mb-1">
                <strong>Bước 1:</strong> Tải file mẫu, điền dữ liệu, rồi upload lại
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                Email đã tồn tại → cập nhật thông tin. Email mới → tự tạo tài khoản (mật khẩu tạm hiển thị sau khi import).
              </p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
              >
                <Download className="w-4 h-4" /> Tải file mẫu
              </button>
            </div>
          )}

          {!results && parsed.length === 0 && (
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-800 dark:text-white mb-1">Click để chọn file hoặc kéo thả</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">File Excel (.xlsx, .xls)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                disabled={loading}
                className="hidden"
              />
            </div>
          )}

          {!results && parsed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Preview ({parsed.length} nhân viên, {parsed.filter((p) => p.error).length} lỗi)
                </h3>
                <button
                  onClick={() => { setParsed([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                >
                  Chọn file khác
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Họ tên</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Phòng ban</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Vai trò</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, idx) => (
                      <tr key={idx} className={p.error ? "bg-red-50 dark:bg-red-900/20" : idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800/50"}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{p.error ? "❌" : "✓"} {p.name || "—"}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate">{p.email || "—"}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate">{p.department || "—"}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.role ? roleLabel(p.role) : "—"}</td>
                        <td className="px-3 py-2">
                          {p.error ? <span className="text-red-600 dark:text-red-400">{p.error}</span> : <span className="text-green-600 dark:text-green-400">Hợp lệ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Kết quả import</h3>
                {results.some((r) => r.action === "created") && (
                  <button
                    onClick={copyResultsToClipboard}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <Copy className="w-3 h-3" /> Copy mật khẩu tạm
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Họ tên</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Kết quả</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Mật khẩu tạm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800/50"}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate">{r.email}</td>
                        <td className="px-3 py-2">
                          {r.action === "created" && <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Đã tạo mới</span>}
                          {r.action === "updated" && <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Đã cập nhật</span>}
                          {r.action === "failed" && <span className="text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {r.error}</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono">{r.tempPassword ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400">Nhân viên mới sẽ bị buộc đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            {results ? "Đóng" : "Huỷ"}
          </button>
          {!results && parsed.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing || loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center gap-2"
            >
              {importing ? (<><Loader2 className="w-4 h-4 animate-spin" /> Đang import...</>) : (<><CheckCircle2 className="w-4 h-4" /> Import {parsed.filter((p) => !p.error).length} nhân viên</>)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
