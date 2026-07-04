"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { EnrollmentUpdateForm } from "./EnrollmentUpdateForm";
import type { ClinicalTrial, ClinicalTrialEnrollment } from "@/types";

interface Props {
  trial: ClinicalTrial;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedEnrollment: ClinicalTrialEnrollment) => void;
}

export function UpdateEnrollmentModal({ trial, isOpen, onClose, onSuccess }: Props) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: Partial<ClinicalTrialEnrollment>) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/clinical-trials/${trial.id}/enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Cập nhật thất bại");
      }

      const result = await response.json();
      toast.success(`Tiến độ được cập nhật${result.newMilestones?.length > 0 ? ` — ${result.newMilestones.length} milestone task tạo` : ""}`);
      onSuccess?.(result.updatedEnrollment);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi cập nhật");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            Cập nhật tiến độ tuyển bệnh
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6">
          <EnrollmentUpdateForm
            trial={trial}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
