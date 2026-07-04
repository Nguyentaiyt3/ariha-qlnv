"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EnrollmentUpdateForm } from "@/components/clinical-trials/EnrollmentUpdateForm";
import type { ClinicalTrialEnrollment } from "@/types";

interface TrialData {
  id: string;
  code: string;
  abbreviation?: string;
  title?: string;
  enrollment?: ClinicalTrialEnrollment;
}

export default function PublicEnrollmentUpdatePage() {
  const { token } = useParams<{ token: string }>();
  const [trial, setTrial] = useState<TrialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate token and fetch trial data
  useEffect(() => {
    async function validateAndLoadTrial() {
      try {
        const response = await fetch(`/api/clinical-trials/validate-enrollment-token/${token}`);

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Link không hợp lệ hoặc đã hết hạn");
          setLoading(false);
          return;
        }

        const data = await response.json();
        setTrial(data.trial);
        setLoading(false);
      } catch (err) {
        setError("Lỗi khi tải dữ liệu thử nghiệm");
        setLoading(false);
      }
    }

    validateAndLoadTrial();
  }, [token]);

  const handleSubmit = async (enrollmentData: Partial<ClinicalTrialEnrollment>) => {
    if (!trial) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/clinical-trials/${trial.id}/enrollment/shared`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentData,
          token,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Cập nhật thất bại");
      }

      const result = await response.json();
      toast.success(
        `Tiến độ được cập nhật${result.newMilestones?.length > 0 ? ` — ${result.newMilestones.length} milestone tasks tạo` : ""}`
      );

      // Show success screen
      setTrial(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-300">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg w-full max-w-sm p-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white text-center mb-2">
            Liên kết không hợp lệ
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
            {error}
          </p>
          <a
            href="/"
            className="block text-center text-sm text-blue-600 hover:underline"
          >
            ← Quay lại trang chủ
          </a>
        </div>
      </div>
    );
  }

  if (!trial) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg w-full max-w-sm p-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white text-center mb-2">
            Cập nhật thành công!
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
            Tiến độ tuyển bệnh đã được cập nhật và lưu vào hệ thống.
          </p>
          <a
            href="/"
            className="block text-center text-sm text-blue-600 hover:underline"
          >
            ← Quay lại trang chủ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-600">Link An Toàn</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Cập nhật Tiến độ Tuyển Bệnh
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Thử nghiệm: <span className="font-semibold">{trial.abbreviation || trial.code}</span>
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
          <EnrollmentUpdateForm
            trial={trial}
            onSubmit={handleSubmit}
            isLoading={isSubmitting}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          <p>ARiHA WorkHub — Hệ thống Quản lý Hiệu suất</p>
          <p>Link này được bảo vệ bằng token riêng và không yêu cầu đăng nhập</p>
        </div>
      </div>
    </div>
  );
}
