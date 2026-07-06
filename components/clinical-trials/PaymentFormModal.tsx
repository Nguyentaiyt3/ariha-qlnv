"use client";

import { useState, useRef } from "react";
import { X, Upload, FileText, Image as ImageIcon, Trash2, Camera, Printer } from "lucide-react";
import { toast } from "sonner";
import { updateClinicalTrial } from "@/lib/firebase/firestore";
import { generateId } from "@/lib/utils";
import { generatePaymentProposalPDF } from "@/lib/utils/generatePaymentProposal";
import { useAuthStore } from "@/stores/useAuthStore";
import { CostItemManager } from "@/components/finance/CostItemManager";
import { CostSplitPreview } from "@/components/finance/CostSplitPreview";
import type { ClinicalTrial, ClinicalTrialPayment, CostItem } from "@/types";

interface PaymentFormModalProps {
  trial: ClinicalTrial;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedTrial: ClinicalTrial) => void;
  editingPayment?: ClinicalTrialPayment;
}

interface FileItem {
  id: string;
  name: string;
  type: "pdf" | "image";
  file: File;
  preview?: string;
}

type SplitMode = "percentage" | "amount";

export function PaymentFormModal({ trial, isOpen, onClose, onSuccess, editingPayment }: PaymentFormModalProps) {
  const { currentUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [printingPDF, setPrintingPDF] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>(
    (editingPayment?.splitMode as SplitMode) || "percentage"
  );
  const [files, setFiles] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!editingPayment;
  const canEdit = !editingPayment || editingPayment.submitterId === currentUser?.id || ["director", "financeSupervisor"].includes(currentUser?.role || "");

  const [formData, setFormData] = useState<ClinicalTrialPayment>(
    editingPayment || {
      id: generateId("payment"),
      batchNo: (trial.payments?.length ?? 0) + 1,
      date: new Date().toISOString().slice(0, 10),
      paymentName: "",
      totalAmount: 0,
      received: false,
      splitMode: "percentage",
      note: "",
      submitterId: currentUser?.id,
      submitterName: currentUser?.name,
      submitterUnitName: currentUser?.department,
      submitterRole: currentUser?.role,
    }
  );

  const defaultCostItems: CostItem[] = [
    { id: generateId("cost"), name: "Chi phí phục vụ chuyên môn", percentage: 68 },
    { id: generateId("cost"), name: "Chi phí hỗ trợ bệnh nhân", percentage: 10 },
    { id: generateId("cost"), name: "Chi phí quản lý", percentage: 20 },
    { id: generateId("cost"), name: "Thuế thu nhập doanh nghiệp", percentage: 2 },
  ];

  const [costItems, setCostItems] = useState<CostItem[]>(
    editingPayment?.costItems || defaultCostItems
  );

  function handleFileSelect(fileList: FileList | null) {
    if (!fileList) return;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");

      if (!isPdf && !isImage) {
        toast.error(`${file.name} - Chỉ hỗ trợ PDF và hình ảnh`);
        continue;
      }

      const fileItem: FileItem = {
        id: generateId("file"),
        name: file.name,
        type: isPdf ? "pdf" : "image",
        file,
      };

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          fileItem.preview = e.target?.result as string;
          setFiles((prev) => [...prev, fileItem]);
        };
        reader.readAsDataURL(file);
      } else {
        setFiles((prev) => [...prev, fileItem]);
      }
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handlePrintProposal() {
    if (!formData.paymentName || !formData.totalAmount) {
      toast.error("Vui lòng nhập tên và số tiền trước khi in");
      return;
    }

    setPrintingPDF(true);
    try {
      await generatePaymentProposalPDF(
        trial.code || "N/A",
        trial.title || "N/A",
        formData.paymentName,
        formData.date || new Date().toISOString().slice(0, 10),
        formData.totalAmount,
        costItems,
        splitMode,
        trial.department,
        trial.principalInvestigatorName
      );
      toast.success("Đã tải tờ trình thanh toán");
    } catch (error) {
      toast.error("Lỗi khi in tờ trình");
      console.error(error);
    } finally {
      setPrintingPDF(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.paymentName || !formData.totalAmount) {
      toast.error("Vui lòng nhập tên và số tiền");
      return;
    }

    setLoading(true);
    try {
      // Add costItems if using new method
      const paymentToSave = {
        ...formData,
        splitMode: splitMode,
        costItems: costItems.length > 0 ? costItems : undefined,
      };

      if (isEditMode && editingPayment?.status === "approved" && !canEdit) {
        // Send edit request instead of direct update
        const response = await fetch(
          `/api/clinical-trials/payments/${formData.id}/request-edit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestedBy: currentUser?.name,
              requestedByUserId: currentUser?.id,
              requestedByUnitName: currentUser?.department,
              editedData: paymentToSave,
              reason: "Requested edit after approval",
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to submit edit request");
        toast.success("Đã gửi yêu cầu sửa thanh toán, chờ phê duyệt");
        onSuccess({ ...trial, payments: trial.payments } as ClinicalTrial);
        onClose();
      } else {
        // Direct update (for pending payments or if user can edit approved)
        let updatedPayments: ClinicalTrialPayment[];
        if (isEditMode) {
          updatedPayments = (trial.payments ?? []).map(p => p.id === formData.id ? paymentToSave : p);
        } else {
          updatedPayments = [...(trial.payments ?? []), paymentToSave];
        }

        const updated = { payments: updatedPayments };
        await updateClinicalTrial(trial.id, updated);
        toast.success(isEditMode ? "Đã cập nhật thanh toán" : "Đã thêm thanh toán");
        onSuccess({ ...trial, payments: updatedPayments });
        onClose();
      }
    } catch (error) {
      toast.error(isEditMode ? "Lỗi khi cập nhật thanh toán" : "Lỗi khi thêm thanh toán");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {isEditMode ? "Sửa thanh toán" : "Thêm thanh toán"}
            </h2>
            {isEditMode && editingPayment?.status === "approved" && !canEdit && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ⚠️ Thanh toán đã được duyệt. Yêu cầu sửa sẽ được gửi tới trưởng đơn vị để phê duyệt.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrintProposal}
              disabled={printingPDF || !formData.paymentName || !formData.totalAmount}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="In tờ trình thanh toán"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Payment Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tên thanh toán *
              </label>
              <input
                type="text"
                value={formData.paymentName || ""}
                onChange={(e) => setFormData({ ...formData, paymentName: e.target.value })}
                placeholder="VD: Thanh toán đợt 1"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ngày
              </label>
              <input
                type="date"
                value={formData.date || ""}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Total Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Số tiền (VND) *
              </label>
              <input
                type="text"
                value={formData.totalAmount ? formData.totalAmount.toLocaleString("en-US") : ""}
                onChange={(e) => {
                  const value = e.target.value.replace(/,/g, "");
                  setFormData({ ...formData, totalAmount: parseFloat(value) || 0 });
                }}
                placeholder="0"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Trạng thái
              </label>
              <select
                value={formData.received ? "received" : (formData.status === "delivered" ? "delivered" : "pending")}
                onChange={(e) => {
                  if (e.target.value === "pending") {
                    setFormData({ ...formData, received: false, status: undefined });
                  } else if (e.target.value === "delivered") {
                    setFormData({ ...formData, received: false, status: "delivered" });
                  } else {
                    setFormData({ ...formData, received: true, status: undefined });
                  }
                }}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="pending">Chờ nhận</option>
                <option value="delivered">Đã giao cho đơn vị nhận</option>
                <option value="received">Đã nhận</option>
              </select>
            </div>
          </div>

          {/* Cost Splitting */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Phân chia chi phí
            </h3>

            <CostItemManager
              items={costItems}
              totalAmount={formData.totalAmount || 0}
              onChange={setCostItems}
              mode={splitMode}
            />

            {costItems.length > 0 && (
              <CostSplitPreview
                items={costItems}
                totalAmount={formData.totalAmount || 0}
                mode={splitMode}
              />
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tài liệu đính kèm</label>

            {/* Drag & Drop Area */}
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-blue-400");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-blue-400");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-blue-400");
                handleFileSelect(e.dataTransfer.files);
              }}
            >
              <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-600 dark:text-slate-400">Kéo thả hoặc click để chọn file</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Camera Button */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <Camera className="w-4 h-4" />
              Chụp từ camera
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{files.length} file(s) đã chọn</p>
                <div className="space-y-2">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {f.type === "pdf" ? (
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ghi chú</label>
            <textarea
              value={formData.note || ""}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Thông tin bổ sung..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition"
            >
              {loading ? "Đang lưu..." : isEditMode ? "Cập nhật thanh toán" : "Thêm thanh toán"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
