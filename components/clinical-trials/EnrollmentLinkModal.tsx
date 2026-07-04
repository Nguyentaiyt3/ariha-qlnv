"use client";

import { useState } from "react";
import { X, Copy, Link as LinkIcon, Loader2, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ClinicalTrial } from "@/types";

interface Props {
  trial: ClinicalTrial;
  isOpen: boolean;
  onClose: () => void;
}

export function EnrollmentLinkModal({ trial, isOpen, onClose }: Props) {
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateLink = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/clinical-trials/${trial.id}/share-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "", recipientName: "" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Tạo liên kết thất bại");
      }

      const result = await response.json();
      setShareLink(result.shareLink);
      setExpiresAt(result.expiresAt);
      toast.success("Liên kết được tạo thành công");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi tạo liên kết");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success("Liên kết đã sao chép vào clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Lỗi sao chép liên kết");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-purple-600" />
            Tạo Liên kết Cập nhật
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Trial Info */}
          <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-slate-600 dark:text-slate-400">Thử nghiệm lâm sàng</p>
            <p className="font-semibold text-slate-800 dark:text-white text-sm">
              {trial.abbreviation || trial.code}
            </p>
          </div>

          {/* Content */}
          {!shareLink ? (
            <div className="text-center py-8">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                  <LinkIcon className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Tạo một liên kết có thể chia sẻ để cho phép người khác cập nhật tiến độ tuyển bệnh mà không cần đăng nhập. Liên kết có hiệu lực trong 7 ngày.
              </p>
              <button
                onClick={handleGenerateLink}
                disabled={isLoading}
                className={cn(
                  "w-full px-4 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2",
                  "text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" />
                    Tạo Liên kết
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Link Display */}
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">Liên kết chia sẻ</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-2 text-slate-800 dark:text-slate-200 font-mono break-all">
                    {shareLink}
                  </code>
                  <button
                    onClick={handleCopyLink}
                    className={cn(
                      "p-2 rounded-lg transition shrink-0",
                      copied
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300"
                    )}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expiry Info */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-3">
                <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <p className="font-medium">Hết hạn lúc:</p>
                  <p>
                    {expiresAt
                      ? new Date(expiresAt).toLocaleString("vi-VN")
                      : "Không xác định"}
                  </p>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  💡 <strong>Cách sử dụng:</strong> Sao chép liên kết này và chia sẻ với người muốn cập nhật. Họ không cần tài khoản để truy cập biểu mẫu.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-sm transition text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Đóng
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-sm transition text-white bg-purple-600 hover:bg-purple-700 flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Sao chép Liên kết
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
