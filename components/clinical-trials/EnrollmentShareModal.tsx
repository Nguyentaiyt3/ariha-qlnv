"use client";

import { useState } from "react";
import { X, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ClinicalTrial } from "@/types";

interface Props {
  trial: ClinicalTrial;
  isOpen: boolean;
  onClose: () => void;
}

export function EnrollmentShareModal({ trial, isOpen, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Vui lòng nhập email");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email không hợp lệ");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/clinical-trials/${trial.id}/share-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, recipientName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Gửi liên kết thất bại");
      }

      const result = await response.json();

      // Copy link to clipboard
      const shareLink = result.shareLink;
      await navigator.clipboard.writeText(shareLink);

      toast.success(
        `Liên kết được tạo và sao chép vào clipboard. Link hết hạn lúc: ${new Date(result.expiresAt).toLocaleString("vi-VN")}`
      );

      // Reset form
      setEmail("");
      setRecipientName("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi gửi liên kết");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-600" />
            Gửi liên kết cập nhật
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Trial Info */}
          <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-slate-600 dark:text-slate-400">Thử nghiệm lâm sàng</p>
            <p className="font-semibold text-slate-800 dark:text-white text-sm">
              {trial.abbreviation || trial.code}
            </p>
          </div>

          {/* Email Input */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
              Email của người nhận *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              placeholder="coordinator@example.com"
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border transition",
                "bg-white dark:bg-slate-700 text-slate-900 dark:text-white",
                "border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              )}
            />
          </div>

          {/* Name Input (Optional) */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
              Tên người nhận (tuỳ chọn)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={isLoading}
              placeholder="Tên của người nhận"
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border transition",
                "bg-white dark:bg-slate-700 text-slate-900 dark:text-white",
                "border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              )}
            />
          </div>

          {/* Info Message */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              💡 Liên kết này sẽ hết hạn sau 7 ngày. Người nhận không cần đăng nhập để cập nhật tiến độ.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 rounded-lg font-medium text-sm transition text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "flex-1 px-4 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2",
                "text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Tạo & Sao chép
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
