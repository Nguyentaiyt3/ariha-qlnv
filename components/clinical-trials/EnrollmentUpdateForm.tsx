"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicalTrialEnrollment } from "@/types";

interface Props {
  trial: {
    id: string;
    code: string;
    abbreviation?: string;
    enrollment?: ClinicalTrialEnrollment;
  };
  onSubmit: (data: Partial<ClinicalTrialEnrollment>) => Promise<void>;
  isLoading?: boolean;
}

export function EnrollmentUpdateForm({ trial, onSubmit, isLoading }: Props) {
  const [formData, setFormData] = useState<Partial<ClinicalTrialEnrollment>>({
    enrolledAtSite: trial.enrollment?.enrolledAtSite ?? 0,
    icfSigned: trial.enrollment?.icfSigned ?? 0,
    randomized: trial.enrollment?.randomized ?? 0,
    screenFailed: trial.enrollment?.screenFailed ?? 0,
    discontinuedDeath: trial.enrollment?.discontinuedDeath ?? 0,
    discontinuedDrugOnly: trial.enrollment?.discontinuedDrugOnly ?? 0,
    onTreatment: trial.enrollment?.onTreatment ?? 0,
    lostToFollowUp: trial.enrollment?.lostToFollowUp ?? 0,
    completedTreatment: trial.enrollment?.completedTreatment ?? 0,
    aeCount: trial.enrollment?.aeCount ?? 0,
    saeCount: trial.enrollment?.saeCount ?? 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof ClinicalTrialEnrollment, value: string) => {
    const numValue = parseInt(value, 10) || 0;

    // Validation
    if (numValue < 0) {
      setErrors((prev) => ({ ...prev, [field]: "Không thể âm" }));
      return;
    }

    // Check enrolledAtSite ≤ targetSite
    if (field === "enrolledAtSite" && trial.enrollment?.targetSite && numValue > trial.enrollment.targetSite) {
      setErrors((prev) => ({
        ...prev,
        [field]: `Không được vượt quá chỉ tiêu (${trial.enrollment?.targetSite})`,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: numValue }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fields = [
    { key: "enrolledAtSite", label: "Số đã tuyển tại site", hint: `/ ${trial.enrollment?.targetSite || "?"}` },
    { key: "icfSigned", label: "Đã ký phiếu đồng ý", hint: "" },
    { key: "randomized", label: "Được phân ngẫu nhiên", hint: "" },
    { key: "screenFailed", label: "Sàng lọc thất bại", hint: "" },
    { key: "discontinuedDeath", label: "Ngưng NC (tử vong)", hint: "" },
    { key: "discontinuedDrugOnly", label: "Ngừng thuốc NC", hint: "" },
    { key: "onTreatment", label: "Đang điều trị", hint: "" },
    { key: "lostToFollowUp", label: "Mất theo dõi", hint: "" },
    { key: "completedTreatment", label: "Hoàn tất điều trị", hint: "" },
    { key: "aeCount", label: "Số AE (Adverse Events)", hint: "" },
    { key: "saeCount", label: "Số SAE (Serious AE)", hint: "" },
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-white">
          {trial.abbreviation || trial.code}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Cập nhật tiến độ tuyển bệnh tại site
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
        {fields.map(({ key, label, hint }) => (
          <div key={key}>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
              {label}
              {hint && <span className="text-slate-400"> {hint}</span>}
            </label>
            <input
              type="number"
              min="0"
              value={formData[key] ?? 0}
              onChange={(e) => handleChange(key as keyof ClinicalTrialEnrollment, e.target.value)}
              disabled={isSubmitting || isLoading}
              className={cn(
                "w-full px-2.5 py-2 text-sm rounded-lg border transition",
                "bg-white dark:bg-slate-700 text-slate-900 dark:text-white",
                errors[key]
                  ? "border-red-300 dark:border-red-600"
                  : "border-slate-200 dark:border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              )}
            />
            {errors[key] && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors[key]}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          type="submit"
          disabled={isSubmitting || isLoading || Object.keys(errors).length > 0}
          className={cn(
            "flex-1 px-4 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2",
            "text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isSubmitting || isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Đang lưu...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Lưu tiến độ
            </>
          )}
        </button>
      </div>
    </form>
  );
}
