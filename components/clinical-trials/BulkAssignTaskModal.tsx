"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useTaskStore } from "@/stores/useTaskStore";
import { getWorkflows, bulkGenerateClinicalTrialTasks } from "@/lib/firebase/firestore";
import type { BulkGenerateTaskResult } from "@/lib/firebase/firestore";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import type { ClinicalTrial, Workflow, UnitPlan } from "@/types";

interface BulkAssignTaskModalProps {
  trials: ClinicalTrial[];
  onClose: () => void;
  onSuccess: (results: BulkGenerateTaskResult[]) => void;
}

export function BulkAssignTaskModal({ trials, onClose, onSuccess }: BulkAssignTaskModalProps) {
  const { users } = useTaskStore();
  // Chỉ những người có chỉ định "Quản lý NCLS" mới đủ điều kiện làm người theo dõi/quản lý
  // nhiệm vụ TNLS được tạo hàng loạt ở đây.
  const eligibleAssignees = users.filter((u) => (u.researchDesignations ?? []).includes("clinicalTrialManager"));
  const [assigneeId, setAssigneeId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [planId, setPlanId] = useState("");
  const [plans, setPlans] = useState<UnitPlan[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getWorkflows().then((all) => setWorkflows(all.filter((w) => w.status === "published"))).catch(() => {});
    fetch("/api/unit-plans").then((r) => r.json()).then((data) => setPlans(data?.plans ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (supervisorId && supervisorId === assigneeId) setSupervisorId("");
  }, [assigneeId, supervisorId]);

  async function handleSubmit() {
    if (!assigneeId) { toast.error("Vui lòng chọn người theo dõi/quản lý"); return; }
    setSubmitting(true);
    try {
      const res = await bulkGenerateClinicalTrialTasks(
        trials.map((t) => t.id),
        assigneeId,
        workflowId || undefined,
        supervisorId || undefined,
        planId || undefined,
      );
      const parts: string[] = [];
      if (res.createdCount) parts.push(`${res.createdCount} nhiệm vụ mới`);
      if (res.existingCount) parts.push(`${res.existingCount} đã có sẵn`);
      if (res.errorCount) parts.push(`${res.errorCount} lỗi`);
      toast.success(`Đã xử lý ${trials.length} nghiên cứu — ${parts.join(", ") || "không có thay đổi"}`);
      onSuccess(res.results);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo nhiệm vụ hàng loạt thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-500" /> Tạo nhiệm vụ & phân công
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Áp dụng cho {trials.length} thử nghiệm đã chọn
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
          {trials.map((t) => (
            <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {t.abbreviation || t.code}
            </span>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Người theo dõi/quản lý <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            value={assigneeId}
            onChange={setAssigneeId}
            options={eligibleAssignees.map((u) => ({ id: u.id, label: u.name, sub: u.department }))}
            placeholder="Chọn nhân viên..."
            emptyText="Không có nhân viên nào có chỉ định Quản lý NCLS"
          />
          <p className="text-xs text-slate-400 mt-1">
            Chỉ hiển thị người có chỉ định "Quản lý NCLS" — người này sẽ là người thực hiện chính của các nhiệm vụ theo dõi được tạo.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Người giám sát
          </label>
          <SearchableSelect
            value={supervisorId}
            onChange={setSupervisorId}
            options={users
              .filter((u) => u.id !== assigneeId)
              .map((u) => ({ id: u.id, label: u.name, sub: u.department }))}
            placeholder="Chọn nhân viên (không bắt buộc)..."
            emptyText="Không tìm thấy nhân viên"
          />
          <p className="text-xs text-slate-400 mt-1">
            Tuỳ chọn — được thêm vào nhiệm vụ với vai trò giám sát.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Kế hoạch
          </label>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
          >
            <option value="">-- Không thuộc kế hoạch nào --</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.year})</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Tuỳ chọn — các nhiệm vụ được tạo sẽ cộng dồn vào kế hoạch này.
          </p>
        </div>

        {workflows.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Quy trình mẫu
            </label>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Quy trình mặc định (Thử nghiệm lâm sàng)</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Nghiên cứu đã có nhiệm vụ theo dõi sẽ được giữ nguyên (không tạo trùng).
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Huỷ
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !assigneeId}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Tạo & phân công
          </button>
        </div>
      </div>
    </div>
  );
}
