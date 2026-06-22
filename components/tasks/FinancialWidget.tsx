"use client";

/**
 * components/tasks/FinancialWidget.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Hộp tiện ích tài chính nằm trong giao diện chi tiết nhiệm vụ.
 *
 * Hiển thị:
 *  • Tổng hợp: Ngân sách | Tạm ứng | Tự ứng | Thu về
 *  • Thanh tiến độ ngân sách
 *  • Danh sách giao dịch có filter (tất cả / tạm ứng / tự ứng / thu)
 *  • Danh sách đơn tạm ứng và trạng thái
 *  • Modal: Thêm giao dịch | Yêu cầu tạm ứng | Upload chứng từ | Quyết toán
 */

import { useEffect, useRef, useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Upload,
  FileText, CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, Loader2, Receipt,
  ArrowUpCircle, ArrowDownCircle, X, Check, CreditCard, Camera, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { uploadFile } from "@/lib/firebase/storage";
import {
  subscribeTransactions, subscribeFinancialSummary,
  subscribeAdvanceRequests, subscribeReimbursementRequests,
  createTransaction, createAdvanceRequest,
  addProofToTransaction, recomputeFinancialSummary,
  submitAdvanceSettlement,
  EXPENSE_CATEGORIES,
} from "@/lib/firebase/finance";
import type {
  FinancialTransaction, AdvanceRequest, ReimbursementRequest,
  TaskFinancialSummary, FinancialProof, Task,
} from "@/types";

// ── Hằng & Helpers ────────────────────────────────────────────────────────────

/** Định dạng tiền VNĐ */
const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

/** Nhãn trạng thái giao dịch */
const TX_STATUS_CONFIG: Record<FinancialTransaction["status"], { label: string; cls: string }> = {
  VALID:         { label: "Hợp lệ",        cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  PENDING_PROOF: { label: "Chờ chứng từ",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  REJECTED:      { label: "Từ chối",        cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

/** Nhãn nguồn tiền */
const FUND_SOURCE_CONFIG: Record<FinancialTransaction["fundSource"], { label: string; icon: React.ReactNode; cls: string }> = {
  ADVANCE:       { label: "Tạm ứng",  icon: <CreditCard className="w-3 h-3" />, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  OUT_OF_POCKET: { label: "Tự ứng",   icon: <Wallet className="w-3 h-3" />,     cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  REVENUE:       { label: "Thu về",   icon: <TrendingUp className="w-3 h-3" />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

/** Nhãn trạng thái đơn tạm ứng */
const ADV_STATUS_CONFIG: Record<AdvanceRequest["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:             { label: "Chờ duyệt",       cls: "text-amber-600",  icon: <Clock className="w-3.5 h-3.5" /> },
  APPROVED:            { label: "Đã duyệt",         cls: "text-green-600",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  REJECTED:            { label: "Từ chối",           cls: "text-red-600",    icon: <XCircle className="w-3.5 h-3.5" /> },
  PENDING_SETTLEMENT:  { label: "Chờ thanh toán",   cls: "text-blue-600",   icon: <Receipt className="w-3.5 h-3.5" /> },
  SETTLED:             { label: "Đã quyết toán",    cls: "text-slate-500",  icon: <Check className="w-3.5 h-3.5" /> },
};

// ── Summary Cards ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className={cn(
      "flex-1 min-w-[120px] rounded-xl p-3.5 border flex flex-col gap-1.5",
      "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", color)}>
          {icon}
        </div>
      </div>
      <p className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Modal: Thêm giao dịch ─────────────────────────────────────────────────────
function AddTransactionModal({
  taskId, currentUser, advances, stepId,
  onSuccess, onClose,
}: {
  taskId: string;
  currentUser: { id: string; name: string };
  advances: AdvanceRequest[];
  stepId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [fundSource, setFundSource] = useState<FinancialTransaction["fundSource"]>("ADVANCE");
  const [direction, setDirection] = useState<FinancialTransaction["direction"]>("DEBIT");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [advanceRequestId, setAdvanceRequestId] = useState("");
  const [proofFiles, setProofFiles] = useState<FinancialProof[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Khi chọn REVENUE → chiều tiền luôn là CREDIT
  useEffect(() => {
    if (fundSource === "REVENUE") setDirection("CREDIT");
    else setDirection("DEBIT");
  }, [fundSource]);

  const approvedAdvances = advances.filter((a) => ["APPROVED", "PENDING_SETTLEMENT"].includes(a.status));

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadFile(file, "proofs");
        setProofFiles((prev) => [
          ...prev,
          {
            id: generateId("proof"),
            name: file.name,
            url,
            type: file.type,
            size: file.size,
            uploadedBy: currentUser.id,
            uploadedAt: new Date().toISOString(),
          },
        ]);
      }
      toast.success(`Đã tải ${files.length} chứng từ.`);
    } catch {
      toast.error("Tải chứng từ thất bại. Kiểm tra kết nối mạng.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function addProofLink() {
    const url = proofUrl.trim();
    if (!url) return;
    setProofFiles((prev) => [
      ...prev,
      { id: generateId("proof"), name: url, url, type: "link",
        uploadedBy: currentUser.id, uploadedAt: new Date().toISOString() },
    ]);
    setProofUrl("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(/[^\d]/g, ""));
    if (!amountNum || amountNum <= 0) { toast.error("Nhập số tiền hợp lệ."); return; }
    if (fundSource === "ADVANCE" && !advanceRequestId) {
      toast.error("Chọn đơn tạm ứng để chi."); return;
    }
    // OUT_OF_POCKET khuyến nghị có chứng từ (warning, không block)
    if (fundSource === "OUT_OF_POCKET" && proofFiles.length === 0) {
      toast.warning("Nên bổ sung chứng từ để đơn hoàn ứng được duyệt nhanh hơn.");
    }

    setSubmitting(true);
    try {
      await createTransaction({
        taskId,
        stepId,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        amount: amountNum,
        direction,
        fundSource,
        category,
        description,
        advanceRequestId: fundSource === "ADVANCE" ? advanceRequestId : undefined,
        proofs: proofFiles,
      });
      toast.success(
        fundSource === "ADVANCE" ? "Đã ghi nhận chi từ tạm ứng!" :
        fundSource === "OUT_OF_POCKET" ? "Đã ghi nhận tự ứng, tạo đơn hoàn ứng tự động." :
        "Đã ghi nhận khoản thu."
      );
      onSuccess();
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? "Ghi nhận thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            Thêm giao dịch thu/chi
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Loại nguồn tiền */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Loại giao dịch
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["ADVANCE", "OUT_OF_POCKET", "REVENUE"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setFundSource(src)}
                  className={cn(
                    "py-2 px-3 rounded-xl border text-xs font-medium transition flex flex-col items-center gap-1",
                    fundSource === src
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {FUND_SOURCE_CONFIG[src].icon}
                  {FUND_SOURCE_CONFIG[src].label}
                </button>
              ))}
            </div>
            {/* Mô tả nghiệp vụ */}
            <p className="text-[10px] text-slate-400 mt-1.5">
              {fundSource === "ADVANCE" && "Chi từ khoản tạm ứng đã được công ty cấp."}
              {fundSource === "OUT_OF_POCKET" && "Tự bỏ tiền túi → hệ thống tạo đơn hoàn ứng tự động."}
              {fundSource === "REVENUE" && "Ghi nhận khoản thu về cho nhiệm vụ/dự án."}
            </p>
          </div>

          {/* Chọn đơn tạm ứng (chỉ khi ADVANCE) */}
          {fundSource === "ADVANCE" && (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                Chọn đơn tạm ứng *
              </label>
              {approvedAdvances.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                  Chưa có đơn tạm ứng nào được duyệt. Hãy gửi đơn tạm ứng trước.
                </p>
              ) : (
                <select
                  value={advanceRequestId}
                  onChange={(e) => setAdvanceRequestId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Chọn đơn tạm ứng --</option>
                  {approvedAdvances.map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.purpose} — Còn lại: {vnd(adv.remainingAmount)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Số tiền */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Số tiền (VNĐ) *
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="VD: 500000"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {amount && parseFloat(amount) > 0 && (
              <p className="text-[10px] text-blue-500 mt-1">= {vnd(parseFloat(amount))}</p>
            )}
          </div>

          {/* Phân loại */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Phân loại chi tiêu
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as string)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Mô tả */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Mô tả chi tiết *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả nội dung thu/chi..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          {/* Upload chứng từ */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Chứng từ / Hóa đơn
              {fundSource === "OUT_OF_POCKET" && (
                <span className="ml-1 text-amber-500">(Bắt buộc để hoàn ứng)</span>
              )}
            </label>

            {/* Link input */}
            <div className="flex gap-1.5 mb-2">
              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addProofLink())}
                placeholder="Dán link Drive / URL chứng từ..."
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button type="button" onClick={addProofLink} className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Thêm
              </button>
            </div>

            {/* File + Camera buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-500 hover:border-blue-400 hover:text-blue-500 transition flex items-center justify-center gap-1.5"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Ảnh / PDF
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-500 hover:border-green-400 hover:text-green-600 transition flex items-center justify-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" /> Chụp ảnh
              </button>
            </div>

            {/* Hidden inputs */}
            <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />

            {proofFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {proofFiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    {p.type === "link" ? <Link2 className="w-3 h-3 text-blue-500 shrink-0" /> : <FileText className="w-3 h-3 text-green-600 shrink-0" />}
                    <span className="text-xs text-green-700 dark:text-green-400 truncate flex-1">{p.name}</span>
                    <button type="button" onClick={() => setProofFiles((prev) => prev.filter((x) => x.id !== p.id))} className="text-slate-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={submitting || (fundSource === "ADVANCE" && !advanceRequestId)}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Ghi nhận
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: Yêu cầu tạm ứng ──────────────────────────────────────────────────
function AdvanceRequestModal({
  taskId, currentUser, onSuccess, onClose,
}: {
  taskId: string;
  currentUser: { id: string; name: string };
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error("Nhập số tiền hợp lệ."); return; }
    setSubmitting(true);
    try {
      await createAdvanceRequest({
        taskId,
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        amount: num,
        purpose,
      });
      toast.success("Đã gửi đơn tạm ứng. Chờ cấp trên phê duyệt.");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? "Gửi đơn thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-blue-600" /> Đề nghị tạm ứng
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Số tiền tạm ứng (VNĐ) *
            </label>
            <input
              type="number" min={1} step={1000}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="VD: 2000000"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {amount && parseFloat(amount) > 0 && (
              <p className="text-[10px] text-blue-500 mt-1">= {vnd(parseFloat(amount))}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Mục đích sử dụng *
            </label>
            <textarea
              value={purpose} onChange={(e) => setPurpose(e.target.value)}
              placeholder="Mô tả mục đích tạm ứng (mua vật tư, thuê dịch vụ...)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              Huỷ
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
              Gửi đơn
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: Nộp thanh toán tạm ứng ─────────────────────────────────────────────
function AdvanceSettlementModal({
  advance, currentUser, onSuccess, onClose,
}: {
  advance: AdvanceRequest;
  currentUser: { id: string; name: string };
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [amountUsed, setAmountUsed] = useState(advance.settlementAmountUsed?.toString() ?? "");
  const [notes, setNotes] = useState(advance.settlementNotes ?? "");
  const [proofUrl, setProofUrl] = useState("");
  const [proofs, setProofs] = useState<FinancialProof[]>(advance.settlementProofs ?? []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const amountUsedNum = parseFloat(amountUsed.replace(/[^\d]/g, "")) || 0;
  const diff = advance.amount - amountUsedNum;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadFile(file, "proofs");
        setProofs((prev) => [
          ...prev,
          { id: generateId("proof"), name: file.name, url, type: file.type, size: file.size,
            uploadedBy: currentUser.id, uploadedAt: new Date().toISOString() },
        ]);
      }
      toast.success(`Đã tải ${files.length} chứng từ.`);
    } catch { toast.error("Tải chứng từ thất bại. Kiểm tra kết nối mạng."); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function addProofLink() {
    const url = proofUrl.trim();
    if (!url) return;
    setProofs((prev) => [
      ...prev,
      { id: generateId("proof"), name: url, url, type: "link",
        uploadedBy: currentUser.id, uploadedAt: new Date().toISOString() },
    ]);
    setProofUrl("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountUsedNum <= 0) { toast.error("Nhập số tiền đã sử dụng."); return; }
    if (proofs.length === 0) { toast.error("Cần ít nhất 1 chứng từ để nộp thanh toán."); return; }
    setSubmitting(true);
    try {
      await submitAdvanceSettlement(advance.id, { amountUsed: amountUsedNum, proofs, notes: notes || undefined });
      toast.success("Đã nộp thanh toán, chờ quản lý duyệt.");
      onSuccess();
      onClose();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Nộp thanh toán tạm ứng</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Tạm ứng: <strong>{vnd(advance.amount)}</strong></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Số tiền đã chi */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Số tiền đã chi tiêu *</label>
            <input
              type="text"
              value={amountUsed}
              onChange={(e) => setAmountUsed(e.target.value)}
              placeholder="VD: 1500000"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {/* Tính chênh lệch */}
          {amountUsedNum > 0 && (
            <div className={cn(
              "rounded-xl px-3 py-2.5 text-sm font-medium",
              diff > 0 ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" :
              diff < 0 ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" :
              "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
            )}>
              {diff > 0 && `Bạn cần trả lại công ty: ${vnd(diff)}`}
              {diff < 0 && `Công ty cần thanh toán thêm cho bạn: ${vnd(Math.abs(diff))}`}
              {diff === 0 && "Cân bằng hoàn toàn."}
            </div>
          )}
          {/* Chứng từ */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Chứng từ * <span className="text-slate-400 font-normal">(hình ảnh, PDF hoặc link)</span>
            </label>
            {/* Link input */}
            <div className="flex gap-1.5 mb-2">
              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addProofLink())}
                placeholder="Dán link Drive / URL chứng từ..."
                className="flex-1 px-2.5 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button type="button" onClick={addProofLink}
                className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Thêm
              </button>
            </div>
            {/* Upload buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition flex items-center justify-center gap-1.5">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Ảnh / PDF
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}
                className="py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-500 hover:border-green-400 hover:text-green-600 transition flex items-center justify-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> Chụp ảnh
              </button>
            </div>
            {/* Hidden inputs */}
            <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
            {/* Proof list */}
            {proofs.length > 0 && (
              <div className="mt-2 space-y-1">
                {proofs.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-[11px] bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5 rounded-lg">
                    {p.type === "link" ? <Link2 className="w-3 h-3 text-blue-500 shrink-0" /> : <FileText className="w-3 h-3 text-green-600 shrink-0" />}
                    <a href={p.url} target="_blank" rel="noreferrer" className="truncate flex-1 text-slate-600 dark:text-slate-300 hover:text-blue-500 hover:underline">
                      {p.name.length > 35 ? p.name.slice(0, 35) + "…" : p.name}
                    </a>
                    <button type="button" onClick={() => setProofs((prev) => prev.filter((x) => x.id !== p.id))} className="text-slate-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Ghi chú</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Giải thích khoản chi nếu cần..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition flex items-center justify-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Nộp thanh toán
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: Quyết toán ────────────────────────────────────────────────────────
function ReconcileModal({
  taskId, currentUser,
  onSuccess, onClose,
}: {
  taskId: string;
  currentUser: { id: string; name: string };
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleReconcile() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/reconcile/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settledBy: currentUser.id, settledByName: currentUser.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast.success("Quyết toán hoàn tất!");
    } catch (err) {
      toast.error((err as Error).message ?? "Quyết toán thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const d = result.details as Record<string, string>;
    const type = d?.settlementType;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-4">
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">Quyết toán hoàn tất</h3>
            <p className="text-sm text-slate-500 mt-1">{result.message as string}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Tổng tạm ứng:</span><span className="font-semibold">{d?.totalAdvanced}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Thực chi:</span><span className="font-semibold">{d?.totalActualSpent}</span></div>
            <div className={cn("flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700",
              type === "RETURN_TO_COMPANY" ? "text-orange-600" :
              type === "PAY_EMPLOYEE_ADDITIONAL" ? "text-blue-600" : "text-green-600"
            )}>
              <span className="font-semibold">Chênh lệch:</span>
              <span className="font-bold">{d?.difference}</span>
            </div>
          </div>
          {typeof result.action === "string" && (
            <div className={cn("px-3 py-2 rounded-lg text-xs font-medium",
              type === "RETURN_TO_COMPANY" ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20" :
              type === "PAY_EMPLOYEE_ADDITIONAL" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20" :
              "bg-green-50 text-green-700 dark:bg-green-900/20"
            )}>
              {result.action}
            </div>
          )}
          <button
            onClick={() => { onSuccess(); onClose(); }}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-blue-600 mx-auto mb-3" />
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">Quyết toán hoàn ứng</h3>
          <p className="text-sm text-slate-500 mt-1">
            Hệ thống sẽ đối chiếu toàn bộ tạm ứng đã cấp với thực chi có chứng từ
            và tính ra số tiền cần trả lại hoặc thanh toán thêm.
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Đảm bảo tất cả giao dịch đã có chứng từ hợp lệ trước khi quyết toán.
            Thao tác này không thể hoàn tác.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Huỷ
          </button>
          <button onClick={handleReconcile} disabled={submitting}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Quyết toán
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main FinancialWidget ──────────────────────────────────────────────────────
export function FinancialWidget({
  task,
  currentUser,
  stepId,
}: {
  task: Task;
  currentUser: { id: string; name: string; role: string };
  stepId?: string; // Nếu mở từ bước cụ thể
}) {
  const [summary, setSummary] = useState<TaskFinancialSummary | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [advances, setAdvances] = useState<AdvanceRequest[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);

  // Tabs trong widget: "overview" | "transactions" | "advances" | "reimbursements"
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "advances">("overview");
  const [txFilter, setTxFilter] = useState<FinancialTransaction["fundSource"] | "ALL">("ALL");
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  // Modals
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAdvReq, setShowAdvReq] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [settlementAdvId, setSettlementAdvId] = useState<string | null>(null);
  const [uploadingTxId, setUploadingTxId] = useState<string | null>(null);

  const fileUploadRef = useRef<HTMLInputElement>(null);
  const canManageFinance = ["director", "hrAdmin", "teamLead"].includes(currentUser.role);

  // ── Subscriptions realtime (tất cả) ───────────────────────────────────────
  useEffect(() => {
    const u1 = subscribeFinancialSummary(task.id, setSummary);
    const u2 = subscribeTransactions(task.id, setTransactions);
    const u3 = subscribeAdvanceRequests(task.id, setAdvances);
    const u4 = subscribeReimbursementRequests(task.id, setReimbursements);
    return () => { u1(); u2(); u3(); u4(); };
  }, [task.id]);

  function refreshAll() {
    recomputeFinancialSummary(task.id).then(setSummary).catch(console.error);
  }

  // ── Upload chứng từ bổ sung vào giao dịch có sẵn ──────────────────────────
  async function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!uploadingTxId) return;
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    try {
      for (const file of files) {
        const url = await uploadFile(file, "proofs");
        const proof: FinancialProof = {
          id: generateId("proof"),
          name: file.name,
          url,
          type: file.type,
          size: file.size,
          uploadedBy: currentUser.id,
          uploadedAt: new Date().toISOString(),
        };
        await addProofToTransaction(task.id, uploadingTxId, proof);
      }
      toast.success("Đã bổ sung chứng từ.");
    } catch {
      toast.error("Tải chứng từ thất bại.");
    } finally {
      setUploadingTxId(null);
      if (fileUploadRef.current) fileUploadRef.current.value = "";
    }
  }

  const filteredTx = txFilter === "ALL"
    ? transactions
    : transactions.filter((t) => t.fundSource === txFilter);

  const budget = task.totalAmount ?? summary?.budget ?? 0;

  // ── KPI tính trực tiếp từ dữ liệu realtime ──────────────────────────────
  const advApproved  = advances.filter((a) => a.status === "APPROVED");
  const advPending   = advances.filter((a) => a.status === "PENDING");
  const totalAdvApproved = advApproved.reduce((s, a) => s + a.amount, 0);
  const totalAdvPending  = advPending.reduce((s, a) => s + a.amount, 0);
  // Số đã thực chi từ advance (dùng summary nếu có, không thì tính từ transactions)
  const totalAdvUsed = summary?.totalAdvanceUsed
    ?? transactions.filter((t) => t.fundSource === "ADVANCE" && t.status === "VALID").reduce((s, t) => s + t.amount, 0);
  const totalAdvRemaining = Math.max(0, totalAdvApproved - totalAdvUsed);

  const totalOutOfPocket = summary?.totalOutOfPocket
    ?? transactions.filter((t) => t.fundSource === "OUT_OF_POCKET" && t.status === "VALID").reduce((s, t) => s + t.amount, 0);
  const totalRevenue = summary?.totalRevenue
    ?? transactions.filter((t) => t.fundSource === "REVENUE" && t.status === "VALID").reduce((s, t) => s + t.amount, 0);
  const totalExpense = summary?.totalExpense
    ?? transactions.filter((t) => t.direction === "DEBIT" && t.status === "VALID").reduce((s, t) => s + t.amount, 0);

  const utilizationPct = budget > 0
    ? Math.min(Math.round((totalExpense / budget) * 100), 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" />
          Tài chính nhiệm vụ
        </h3>
        <div className="flex items-center gap-2">
          {canManageFinance && summary?.financialStatus === "ACTIVE" && (
            <button
              onClick={() => setShowReconcile(true)}
              className="text-xs px-3 py-1.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Quyết toán
            </button>
          )}
          <button
            onClick={() => setShowAdvReq(true)}
            className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5"
          >
            <ArrowUpCircle className="w-3 h-3" /> Tạm ứng
          </button>
          <button
            onClick={() => setShowAddTx(true)}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> Thêm thu/chi
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="flex flex-wrap gap-2">
        <SummaryCard
          label="Ngân sách"
          value={vnd(budget)}
          sub={utilizationPct > 0 ? `Đã dùng ${utilizationPct}%` : "Chưa phân bổ"}
          color="bg-slate-100 dark:bg-slate-800"
          icon={<Wallet className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />}
        />
        <SummaryCard
          label="Tạm ứng"
          value={vnd(totalAdvApproved)}
          sub={
            advPending.length > 0
              ? `${advPending.length} đơn chờ duyệt (${vnd(totalAdvPending)})`
              : totalAdvApproved > 0
                ? `Đã chi: ${vnd(totalAdvUsed)} · Còn: ${vnd(totalAdvRemaining)}`
                : advances.length === 0 ? "Chưa có đơn" : undefined
          }
          color="bg-blue-50 dark:bg-blue-900/30"
          icon={<CreditCard className="w-3.5 h-3.5 text-blue-600" />}
        />
        <SummaryCard
          label="Tự ứng"
          value={vnd(totalOutOfPocket)}
          sub={
            reimbursements.filter((r) => ["SUBMITTED","APPROVED"].includes(r.status)).length > 0
              ? `Chờ hoàn: ${vnd(reimbursements.filter((r) => ["SUBMITTED","APPROVED"].includes(r.status)).reduce((s,r) => s+r.amount,0))}`
              : totalOutOfPocket > 0 ? "Đã thanh toán đủ" : undefined
          }
          color="bg-purple-50 dark:bg-purple-900/30"
          icon={<Wallet className="w-3.5 h-3.5 text-purple-600" />}
        />
        <SummaryCard
          label="Thu về"
          value={vnd(totalRevenue)}
          sub={totalExpense > 0 ? `Chi tiêu: ${vnd(totalExpense)}` : undefined}
          color="bg-emerald-50 dark:bg-emerald-900/30"
          icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-600" />}
        />
      </div>

      {/* ── Thanh tiến độ ngân sách ── */}
      {budget > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <span>Tiến độ sử dụng ngân sách</span>
            <span className={cn(utilizationPct >= 90 ? "text-red-500 font-semibold" : "")}>
              {utilizationPct}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                utilizationPct >= 100 ? "bg-red-500" :
                utilizationPct >= 80 ? "bg-amber-500" : "bg-blue-500"
              )}
              style={{ width: `${utilizationPct}%` }}
            />
          </div>
          {utilizationPct >= 90 && (
            <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Ngân sách sắp cạn kiệt!
            </p>
          )}
        </div>
      )}

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: "overview", label: "Tổng quan" },
          { key: "transactions", label: `Giao dịch (${transactions.length})` },
          { key: "advances", label: `Tạm ứng (${advances.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              "px-3 py-2 text-xs font-medium transition border-b-2",
              activeTab === tab.key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tổng quan ── */}
      {activeTab === "overview" && (
        <div className="space-y-3">
          {reimbursements.filter((r) => r.status === "DRAFT").length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {reimbursements.filter((r) => r.status === "DRAFT").length} đơn hoàn ứng chờ chứng từ
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                  Bổ sung chứng từ để nộp đơn hoàn ứng chính thức.
                </p>
              </div>
            </div>
          )}

          {transactions.filter((t) => t.status === "PENDING_PROOF").length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <Receipt className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  {transactions.filter((t) => t.status === "PENDING_PROOF").length} giao dịch chưa có chứng từ
                </p>
                <p className="text-[10px] text-red-600 dark:text-red-500 mt-0.5">
                  Chứng từ thiếu sẽ ảnh hưởng đến quyết toán hoàn ứng.
                </p>
              </div>
            </div>
          )}

          {/* Chi tiêu theo loại */}
          {totalExpense > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Phân bổ chi tiêu</p>
              {[
                { label: "Từ tạm ứng", value: totalAdvUsed, color: "bg-blue-500" },
                { label: "Tự ứng tiền túi", value: totalOutOfPocket, color: "bg-purple-500" },
              ].map(({ label, value, color }) => {
                const pct = totalExpense > 0 ? Math.round((value / totalExpense) * 100) : 0;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 w-28 shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 w-20 text-right">{vnd(value)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Danh sách giao dịch ── */}
      {activeTab === "transactions" && (
        <div className="space-y-3">
          {/* Filter */}
          <div className="flex gap-1.5 flex-wrap">
            {(["ALL", "ADVANCE", "OUT_OF_POCKET", "REVENUE"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTxFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition",
                  txFilter === f
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {f === "ALL" ? `Tất cả (${transactions.length})` : FUND_SOURCE_CONFIG[f].label}
              </button>
            ))}
          </div>

          {filteredTx.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Chưa có giao dịch nào.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredTx.map((tx) => {
                const isExpanded = expandedTx === tx.id;
                const src = FUND_SOURCE_CONFIG[tx.fundSource];
                const sts = TX_STATUS_CONFIG[tx.status];
                return (
                  <div
                    key={tx.id}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                  >
                    {/* Row chính */}
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
                      onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                    >
                      {/* Icon chiều tiền */}
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        tx.direction === "DEBIT" ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"
                      )}>
                        {tx.direction === "DEBIT"
                          ? <ArrowDownCircle className="w-4 h-4 text-red-500" />
                          : <ArrowUpCircle className="w-4 h-4 text-green-500" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md", src.cls)}>
                            {src.icon}{src.label}
                          </span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md", sts.cls)}>
                            {sts.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">{tx.description}</p>
                        <p className="text-[10px] text-slate-400">{tx.category} · {tx.createdByName}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-bold", tx.direction === "DEBIT" ? "text-red-600" : "text-green-600")}>
                          {tx.direction === "DEBIT" ? "-" : "+"}{vnd(tx.amount)}
                        </p>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400 ml-auto mt-1" /> : <ChevronDown className="w-3 h-3 text-slate-400 ml-auto mt-1" />}
                      </div>
                    </button>

                    {/* Mở rộng: chứng từ + upload */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="text-[11px] text-slate-500 mt-2">
                          Ngày: {new Date(tx.createdAt).toLocaleDateString("vi-VN")}
                          {tx.stepId && <span className="ml-2">· Bước: {tx.stepId}</span>}
                        </div>

                        {/* Chứng từ */}
                        <div>
                          <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Chứng từ ({tx.proofs.length})
                          </p>
                          {tx.proofs.length > 0 ? (
                            <div className="space-y-1">
                              {tx.proofs.map((p) => (
                                <a
                                  key={p.id}
                                  href={p.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline"
                                >
                                  <FileText className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{p.name}</span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400">Chưa có chứng từ.</p>
                          )}
                        </div>

                        {/* Upload chứng từ bổ sung */}
                        {tx.status === "PENDING_PROOF" && (
                          <button
                            onClick={() => {
                              setUploadingTxId(tx.id);
                              fileUploadRef.current?.click();
                            }}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                          >
                            <Upload className="w-3 h-3" /> Bổ sung chứng từ
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Danh sách đơn tạm ứng ── */}
      {activeTab === "advances" && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {advances.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Chưa có đơn tạm ứng nào.</p>
          ) : (
            advances.map((adv) => {
              const s = ADV_STATUS_CONFIG[adv.status];
              return (
                <div
                  key={adv.id}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{adv.purpose}</p>
                      <p className="text-[11px] text-slate-400">{adv.requestedByName} · {new Date(adv.createdAt).toLocaleDateString("vi-VN")}</p>
                    </div>
                    <div className={cn("flex items-center gap-1 text-[11px] font-medium shrink-0", s.cls)}>
                      {s.icon}{s.label}
                    </div>
                  </div>
                  <div className="flex gap-4 text-[11px]">
                    <span><span className="text-slate-400">Xin: </span><span className="font-semibold">{vnd(adv.amount)}</span></span>
                    {adv.status === "APPROVED" && (
                      <>
                        <span><span className="text-slate-400">Đã chi: </span><span className="font-semibold text-red-600">{vnd(adv.usedAmount)}</span></span>
                        <span><span className="text-slate-400">Còn: </span><span className="font-semibold text-green-600">{vnd(adv.remainingAmount)}</span></span>
                      </>
                    )}
                    {adv.status === "SETTLED" && adv.settlementDifference !== undefined && (
                      <span className={cn(
                        "font-semibold",
                        adv.settlementDifference > 0 ? "text-orange-600" : adv.settlementDifference < 0 ? "text-blue-600" : "text-green-600"
                      )}>
                        {adv.settlementDifference > 0
                          ? `Trả lại: ${vnd(adv.settlementDifference)}`
                          : adv.settlementDifference < 0
                          ? `Nhận thêm: ${vnd(Math.abs(adv.settlementDifference))}`
                          : "Cân bằng"}
                      </span>
                    )}
                  </div>
                  {/* Thanh tiến độ sử dụng tạm ứng */}
                  {adv.status === "APPROVED" && adv.amount > 0 && (
                    <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(Math.round((adv.usedAmount / adv.amount) * 100), 100)}%` }}
                      />
                    </div>
                  )}
                  {/* Nút thanh toán — nhân viên yêu cầu quyết toán */}
                  {adv.status === "APPROVED" && adv.requestedBy === currentUser.id && (
                    <div className="pt-1">
                      <button
                        onClick={() => setSettlementAdvId(adv.id)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                      >
                        <Receipt className="w-3.5 h-3.5" /> Thanh toán / Quyết toán
                      </button>
                    </div>
                  )}
                  {/* Hiển thị lý do từ chối thanh toán nếu có */}
                  {adv.status === "APPROVED" && adv.settlementRejectedReason && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1">
                      Từ chối: {adv.settlementRejectedReason}. Vui lòng nộp lại.
                    </p>
                  )}
                  {/* Trạng thái chờ duyệt thanh toán */}
                  {adv.status === "PENDING_SETTLEMENT" && (
                    <div className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2 py-1 flex items-center gap-1">
                      <Receipt className="w-3 h-3" />
                      Đã nộp thanh toán {vnd(adv.settlementAmountUsed ?? 0)} — chờ quản lý duyệt
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Hidden file input (upload chứng từ bổ sung) ── */}
      <input
        ref={fileUploadRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleProofUpload}
      />

      {/* ── Modals ── */}
      {showAddTx && (
        <AddTransactionModal
          taskId={task.id}
          currentUser={currentUser}
          advances={advances}
          stepId={stepId}
          onSuccess={refreshAll}
          onClose={() => setShowAddTx(false)}
        />
      )}
      {showAdvReq && (
        <AdvanceRequestModal
          taskId={task.id}
          currentUser={currentUser}
          onSuccess={refreshAll}
          onClose={() => setShowAdvReq(false)}
        />
      )}
      {showReconcile && (
        <ReconcileModal
          taskId={task.id}
          currentUser={currentUser}
          onSuccess={refreshAll}
          onClose={() => setShowReconcile(false)}
        />
      )}
      {settlementAdvId && (() => {
        const adv = advances.find((a) => a.id === settlementAdvId);
        return adv ? (
          <AdvanceSettlementModal
            advance={adv}
            currentUser={currentUser}
            onSuccess={refreshAll}
            onClose={() => setSettlementAdvId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}
