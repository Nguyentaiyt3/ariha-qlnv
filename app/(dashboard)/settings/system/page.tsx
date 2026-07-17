"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Clock, AlertTriangle, BarChart3, ClipboardList, Plus, Trash2 } from "lucide-react";
import { getMilestoneConfigs, saveMilestoneConfig, getEvaluationConfig, saveEvaluationConfig, getNckhReviewCriteria, saveNckhReviewCriteria, getRiskFlagConfig, saveRiskFlagConfig } from "@/lib/firebase/firestore";
import type { MilestoneConfig, EvaluationConfig, NckhReviewCriteriaConfig, RiskFlagConfig } from "@/types";
import { DEFAULT_MILESTONE_CONFIG } from "@/lib/deadline-calc";
import { DEFAULT_EVAL_CONFIG, GRADE_LABEL } from "@/lib/eval3T";
import { DEFAULT_NCKH_REVIEW_CRITERIA } from "@/lib/research";
import { DEFAULT_RISK_FLAG_CONFIG } from "@/lib/risk-flag";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";

export default function SystemSettingsPage() {
  const { currentUser } = useAuthStore();
  const [config, setConfig] = useState<MilestoneConfig>({
    ...DEFAULT_MILESTONE_CONFIG,
    id: "default",
    name: "Mặc định",
    isDefault: true,
    createdBy: "",
    createdAt: new Date().toISOString(),
  });
  const [saving, setSaving] = useState(false);
  const [evalConfig, setEvalConfig] = useState<EvaluationConfig>(DEFAULT_EVAL_CONFIG);
  const [savingEval, setSavingEval] = useState(false);
  const [reviewCriteria, setReviewCriteria] = useState<NckhReviewCriteriaConfig>(DEFAULT_NCKH_REVIEW_CRITERIA);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [riskConfig, setRiskConfig] = useState<RiskFlagConfig>(DEFAULT_RISK_FLAG_CONFIG);
  const [savingRisk, setSavingRisk] = useState(false);

  const [activeTab, setActiveTab] = useState<"milestone" | "eval3t" | "nckh" | "risk">("milestone");

  const canEdit = currentUser ? hasPermission(currentUser.role, "*") || currentUser.role === "hrAdmin" : false;

  useEffect(() => {
    getMilestoneConfigs().then((configs) => {
      const def = configs.find((c) => c.id === "default") ?? configs[0];
      if (def) setConfig(def);
    });
    getEvaluationConfig().then(setEvalConfig).catch(console.error);
    getNckhReviewCriteria().then((c) => { if (c) setReviewCriteria(c); }).catch(console.error);
    getRiskFlagConfig().then((c) => { if (c) setRiskConfig(c); }).catch(console.error);
  }, []);

  const addCriterion = (stage: "proposal" | "recognition") =>
    setReviewCriteria((c) => ({ ...c, [stage]: [...c[stage], { key: generateId("crit"), label: "", desc: "" }] }));

  const removeCriterion = (stage: "proposal" | "recognition", key: string) =>
    setReviewCriteria((c) => ({ ...c, [stage]: c[stage].filter((x) => x.key !== key) }));

  const updateCriterion = (stage: "proposal" | "recognition", key: string, field: "label" | "desc", value: string) =>
    setReviewCriteria((c) => ({ ...c, [stage]: c[stage].map((x) => (x.key === key ? { ...x, [field]: value } : x)) }));

  const handleSaveCriteria = async () => {
    if (!reviewCriteria.proposal.length || !reviewCriteria.recognition.length) {
      toast.error("Mỗi giai đoạn cần ít nhất 1 tiêu chí");
      return;
    }
    if (reviewCriteria.proposal.some((c) => !c.label.trim()) || reviewCriteria.recognition.some((c) => !c.label.trim())) {
      toast.error("Tên tiêu chí không được để trống");
      return;
    }
    setSavingCriteria(true);
    try {
      await saveNckhReviewCriteria({
        proposal: reviewCriteria.proposal,
        recognition: reviewCriteria.recognition,
        updatedBy: currentUser?.id,
      });
      toast.success("Đã lưu bộ tiêu chí chấm điểm NCKH");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSavingCriteria(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        Chỉ HR Admin mới có quyền chỉnh sửa cấu hình hệ thống.
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMilestoneConfig(config);
      toast.success("Đã lưu cấu hình");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEval = async () => {
    const { t1, t2, t3 } = evalConfig.weights;
    if (Math.abs(t1 + t2 + t3 - 1) > 0.01) {
      toast.error("Tổng trọng số T1+T2+T3 phải bằng 100%");
      return;
    }
    const { xuatSac, hoanThanhTot, hoanThanh } = evalConfig.thresholds;
    if (xuatSac <= hoanThanhTot || hoanThanhTot <= hoanThanh || hoanThanh <= 0) {
      toast.error("Ngưỡng phải theo thứ tự: Xuất sắc > Hoàn thành tốt > Hoàn thành > 0");
      return;
    }
    setSavingEval(true);
    try {
      await saveEvaluationConfig({
        ...evalConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.id,
      });
      toast.success("Đã lưu cấu hình đánh giá 3T");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSavingEval(false);
    }
  };

  const handleSaveRisk = async () => {
    if (riskConfig.thresholdDays <= 0) {
      toast.error("Số ngày ngưỡng phải lớn hơn 0");
      return;
    }
    if (riskConfig.progressThreshold <= 0 || riskConfig.progressThreshold > 100) {
      toast.error("Ngưỡng tiến độ phải trong khoảng 1-100%");
      return;
    }
    setSavingRisk(true);
    try {
      await saveRiskFlagConfig({
        ...riskConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.id,
      });
      toast.success("Đã lưu ngưỡng cờ rủi ro");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSavingRisk(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-blue-500" />
        Cấu hình hệ thống
      </h1>

      {/* Tab strip */}
      <div className="flex items-center gap-1 mb-5 border-b border-[var(--border)] overflow-x-auto">
        {([
          { key: "milestone", label: "Quy trình", icon: Clock },
          { key: "eval3t",    label: "Đánh giá 3T", icon: BarChart3 },
          { key: "nckh",      label: "Tiêu chí NCKH", icon: ClipboardList },
          { key: "risk",      label: "Rủi ro", icon: AlertTriangle },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Milestone config */}
      <div className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5 ${activeTab !== "milestone" ? "hidden" : ""}`}>
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-blue-500" />
          Mốc quy trình 3 giai đoạn
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          Xác định khoảng thời gian tự động tính 3 giai đoạn (Chuẩn bị, Thực hiện, Hoàn thiện) từ deadline gốc.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Ngày chuẩn bị trước deadline (Giai đoạn 1)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={config.daysBeforeForPrepare}
                onChange={(e) => setConfig((c) => ({ ...c, daysBeforeForPrepare: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-[var(--muted-foreground)]">ngày trước deadline gốc</span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Ví dụ: deadline 15/07, chuẩn bị từ {config.daysBeforeForPrepare} ngày trước → bắt đầu 12/07
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Ngày hoàn thiện hồ sơ sau deadline (Giai đoạn 3)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={config.daysAfterForFinalize}
                onChange={(e) => setConfig((c) => ({ ...c, daysAfterForFinalize: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-[var(--muted-foreground)]">ngày sau deadline gốc</span>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Thay đổi này chỉ áp dụng cho nhiệm vụ tạo mới. Nhiệm vụ hiện tại giữ nguyên deadline 3 giai đoạn.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu cấu hình
        </button>
      </div>

      {/* Evaluation 3T config */}
      <div className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5 ${activeTab !== "eval3t" ? "hidden" : ""}`}>
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-purple-500" />
          Cấu hình đánh giá 3T
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          Trọng số và ngưỡng xếp loại được áp dụng khi tính điểm tự động lúc gửi đề xuất kết thúc nhiệm vụ.
        </p>

        {/* Trọng số */}
        <p className="text-xs font-semibold text-[var(--foreground)] mb-3 uppercase tracking-wider">Trọng số (tổng = 100%)</p>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(["t1", "t2", "t3"] as const).map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                {key === "t1" ? "T1 · Tiến độ" : key === "t2" ? "T2 · Chất lượng" : "T3 · Tài nguyên"}
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={0} max={100} step={5}
                  value={Math.round(evalConfig.weights[key] * 100)}
                  onChange={(e) => setEvalConfig((c) => ({ ...c, weights: { ...c.weights, [key]: Number(e.target.value) / 100 } }))}
                  className="w-full px-2 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-sm text-[var(--muted-foreground)]">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className={`text-xs mb-5 ${Math.abs(evalConfig.weights.t1 + evalConfig.weights.t2 + evalConfig.weights.t3 - 1) > 0.01 ? "text-red-500 font-semibold" : "text-[var(--muted-foreground)]"}`}>
          Tổng hiện tại: {Math.round((evalConfig.weights.t1 + evalConfig.weights.t2 + evalConfig.weights.t3) * 100)}%
          {Math.abs(evalConfig.weights.t1 + evalConfig.weights.t2 + evalConfig.weights.t3 - 1) > 0.01 ? " ⚠ Phải bằng 100%" : " ✓"}
        </p>

        {/* Ngưỡng xếp loại */}
        <p className="text-xs font-semibold text-[var(--foreground)] mb-3 uppercase tracking-wider">Ngưỡng xếp loại</p>
        <div className="space-y-3 mb-4">
          {([
            { key: "xuatSac",      label: GRADE_LABEL.xuatSac,        hint: "≥ ngưỡng",  color: "text-amber-600" },
            { key: "hoanThanhTot", label: GRADE_LABEL.hoanThanhTot,   hint: "> ngưỡng",  color: "text-green-600" },
            { key: "hoanThanh",    label: GRADE_LABEL.hoanThanh,      hint: "≥ ngưỡng",  color: "text-blue-600"  },
          ] as const).map(({ key, label, hint, color }) => (
            <div key={key} className="flex items-center gap-3">
              <span className={`w-36 text-sm font-medium ${color}`}>{label}</span>
              <span className="text-xs text-[var(--muted-foreground)] w-16">{hint}</span>
              <input
                type="number" min={0} max={10} step={0.5}
                value={evalConfig.thresholds[key]}
                onChange={(e) => setEvalConfig((c) => ({ ...c, thresholds: { ...c.thresholds, [key]: Number(e.target.value) } }))}
                className="w-20 px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-xs text-[var(--muted-foreground)]">/ 10</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="w-36 text-sm font-medium text-red-600">{GRADE_LABEL.khongHoanThanh}</span>
            <span className="text-xs text-[var(--muted-foreground)] w-16">&lt; ngưỡng HT</span>
            <span className="w-20 px-2 py-1.5 text-sm text-center text-[var(--muted-foreground)]">{evalConfig.thresholds.hoanThanh}</span>
            <span className="text-xs text-[var(--muted-foreground)]">(tự động)</span>
          </div>
        </div>

        <button
          onClick={handleSaveEval}
          disabled={savingEval}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {savingEval ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu cấu hình đánh giá
        </button>
      </div>

      {/* NCKH review criteria config */}
      <div className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5 ${activeTab !== "nckh" ? "hidden" : ""}`}>
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2 mb-1">
          <ClipboardList className="w-4 h-4 text-violet-500" />
          Tiêu chí chấm điểm phản biện NCKH
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          Bộ tiêu chí (1–5 điểm mỗi tiêu chí) dùng cho phiếu phản biện GĐ1 (đề cương) và GĐ2 (nghiệm thu).
          Áp dụng cho cả phản biện nội bộ và phản biện ngoài.
        </p>

        {([
          { key: "proposal" as const, label: "Giai đoạn 1 — Thẩm định đề cương" },
          { key: "recognition" as const, label: "Giai đoạn 2 — Nghiệm thu kết quả" },
        ]).map(({ key: stage, label: stageLabel }) => (
          <div key={stage} className="mb-5 last:mb-0">
            <p className="text-xs font-semibold text-[var(--foreground)] mb-3 uppercase tracking-wider">{stageLabel}</p>
            <div className="space-y-2 mb-2">
              {reviewCriteria[stage].map((c, idx) => (
                <div key={c.key} className="flex gap-2 items-start">
                  <span className="text-xs text-[var(--muted-foreground)] w-5 mt-2">{idx + 1}.</span>
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={c.label}
                      onChange={(e) => updateCriterion(stage, c.key, "label", e.target.value)}
                      placeholder="Tên tiêu chí..."
                      className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <input
                      value={c.desc ?? ""}
                      onChange={(e) => updateCriterion(stage, c.key, "desc", e.target.value)}
                      placeholder="Mô tả / gợi ý chấm điểm (tuỳ chọn)..."
                      className="w-full px-2.5 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <button
                    onClick={() => removeCriterion(stage, c.key)}
                    className="text-[var(--muted-foreground)] hover:text-red-500 p-1 mt-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => addCriterion(stage)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-dashed border-[var(--border)] rounded-lg text-[var(--muted-foreground)] hover:border-violet-400 hover:text-violet-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Thêm tiêu chí
            </button>
          </div>
        ))}

        <button
          onClick={handleSaveCriteria}
          disabled={savingCriteria}
          className="flex items-center gap-2 px-4 py-2 mt-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {savingCriteria ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu bộ tiêu chí
        </button>
      </div>

      {/* Risk flag config */}
      <div className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mb-5 ${activeTab !== "risk" ? "hidden" : ""}`}>
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Ngưỡng cờ rủi ro
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          Nhiệm vụ còn ít ngày tới deadline (hoặc đã quá hạn) VÀ tiến độ dưới ngưỡng sẽ tự động bị đánh cờ rủi ro,
          áp dụng khi hệ thống kiểm tra deadline theo lịch.
        </p>
        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Còn bao nhiêu ngày tới deadline thì tính là gần hạn
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={riskConfig.thresholdDays}
                onChange={(e) => setRiskConfig((c) => ({ ...c, thresholdDays: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <span className="text-sm text-[var(--muted-foreground)]">ngày (hoặc đã quá hạn)</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Tiến độ dưới ngưỡng này mới bị đánh cờ
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={riskConfig.progressThreshold}
                onChange={(e) => setRiskConfig((c) => ({ ...c, progressThreshold: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-center focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <span className="text-sm text-[var(--muted-foreground)]">%</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mb-4">
          Hiện tại: nhiệm vụ còn ≤ <strong>{riskConfig.thresholdDays} ngày</strong> deadline VÀ tiến độ &lt; <strong>{riskConfig.progressThreshold}%</strong> sẽ tự động bị đánh cờ rủi ro.
        </p>

        <button
          onClick={handleSaveRisk}
          disabled={savingRisk}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {savingRisk ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu ngưỡng rủi ro
        </button>
      </div>
    </div>
  );
}
