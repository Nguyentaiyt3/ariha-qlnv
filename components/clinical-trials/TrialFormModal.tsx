"use client";

import { useState, useEffect } from "react";
import { X, Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@/lib/utils";
import { saveClinicalTrial, updateClinicalTrial, getWorkflows } from "@/lib/firebase/firestore";
import { ContactListEditor } from "./ContactListEditor";
import type { ClinicalTrial, ClinicalTrialStatus, ClinicalTrialContact, UnitDef, User, Workflow } from "@/types";
import { CLINICAL_TRIAL_STATUS_LABEL } from "@/types";

interface Props {
  initialData?: ClinicalTrial;
  creatorId: string;
  creatorName: string;
  onClose: () => void;
  onSaved: (t: ClinicalTrial) => void;
}

const SPONSORS = [
  "AstraZeneca", "Boehringer Ingelheim", "Janssen Research & Development, LLC",
  "MSD", "Novartis", "Viện Geogre vì Sức khỏe toàn cầu (TGI) của Úc và Đại học Johns Hopkins (JHU)",
  "Viện George vì Sức khỏe Toàn cầu Trung Quốc Bệnh Viện Miền Tây Trung Quốc",
  "Merck Sharp & Dohme LLC", "Corxel Pharmaceuticals",
];

const STATUS_OPTIONS: ClinicalTrialStatus[] = [
  "feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met",
  "lec_approved", "awaiting_moh", "pre_deployment",
  "running_pre_enroll", "running_enrolled", "completed",
  "terminated_no_efficacy", "not_feasible",
];

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400";

export function TrialFormModal({ initialData, creatorId, creatorName, onClose, onSaved }: Props) {
  const isEdit = !!initialData;
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState(initialData?.code ?? "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [abbreviation, setAbbreviation] = useState(initialData?.abbreviation ?? "");
  const [nctCode, setNctCode] = useState(initialData?.nctCode ?? "");
  const [piName, setPiName] = useState(initialData?.principalInvestigatorName ?? "");
  const [piId, setPiId] = useState(initialData?.principalInvestigatorId ?? "");
  const [department, setDepartment] = useState(initialData?.department ?? "");
  const [sponsor, setSponsor] = useState(initialData?.sponsor ?? "");

  // Autocomplete: Khoa thực hiện (bảng đơn vị) + Nghiên cứu viên chính (bảng nhân viên)
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [editingDept, setEditingDept] = useState(false);
  const [editingPi, setEditingPi] = useState(false);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");

  useEffect(() => {
    fetch("/api/units").then((r) => r.json()).then((d) => setUnits(d.catalog || [])).catch(() => setUnits([]));
    fetch("/api/users").then((r) => r.json()).then((d) => setEmployees(d.users || [])).catch(() => setEmployees([]));
    if (!isEdit) getWorkflows().then(setWorkflows).catch(() => {});
  }, [isEdit]);
  const [cro, setCro] = useState(initialData?.cro ?? "");
  const [smo, setSmo] = useState(initialData?.smo ?? "");
  const [cra, setCra] = useState<ClinicalTrialContact[]>(initialData?.cra ?? []);
  const [crc, setCrc] = useState<ClinicalTrialContact[]>(initialData?.crc ?? []);
  const [startPeriod, setStartPeriod] = useState(initialData?.startPeriod ?? "");
  const [endPeriod, setEndPeriod] = useState(initialData?.endPeriod ?? "");
  const [status, setStatus] = useState<ClinicalTrialStatus>(initialData?.status ?? "feasibility");
  const [statusReason, setStatusReason] = useState(initialData?.statusReason ?? "");
  const [zaloGroupUrl, setZaloGroupUrl] = useState(initialData?.zaloGroupUrl ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !title.trim()) {
      toast.error("Vui lòng nhập mã và tên nghiên cứu");
      return;
    }
    setSaving(true);
    try {
      // Filter out empty contacts
      const craFiltered = cra.filter(c => c.name || c.phone || c.email).length > 0 ? cra.filter(c => c.name || c.phone || c.email) : undefined;
      const crcFiltered = crc.filter(c => c.name || c.phone || c.email).length > 0 ? crc.filter(c => c.name || c.phone || c.email) : undefined;

      if (isEdit && initialData) {
        const updates: Partial<ClinicalTrial> = {
          code, title, abbreviation, nctCode,
          principalInvestigatorName: piName,
          principalInvestigatorId: piId || undefined,
          department, sponsor, cro, smo, cra: craFiltered, crc: crcFiltered,
          startPeriod, endPeriod, status, statusReason, zaloGroupUrl,
        };
        await updateClinicalTrial(initialData.id, updates);
        toast.success("Đã cập nhật thử nghiệm lâm sàng");
        onSaved({ ...initialData, ...updates });
      } else {
        const trial: ClinicalTrial = {
          id: generateId("trial"),
          code, title, abbreviation, nctCode,
          principalInvestigatorName: piName,
          principalInvestigatorId: piId || undefined,
          department, sponsor, cro, smo, cra: craFiltered, crc: crcFiltered,
          startPeriod, endPeriod, status, statusReason, zaloGroupUrl,
          documents: [], payments: [],
          createdBy: creatorId,
          createdByName: creatorName,
          createdAt: new Date().toISOString(),
        };
        const result = await saveClinicalTrial(
          selectedWorkflowId ? ({ ...trial, workflowId: selectedWorkflowId } as ClinicalTrial & { workflowId: string }) : trial
        );
        toast.success("Đã tạo thử nghiệm lâm sàng");
        onSaved(result?.id ? { ...trial, id: result.id } : trial);
      }
      onClose();
    } catch {
      toast.error("Lưu thất bại, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl my-4">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-500" />
              {isEdit ? "Sửa thử nghiệm lâm sàng" : "Đăng ký thử nghiệm lâm sàng mới"}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mã nghiên cứu *">
              <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="D5160C00048" />
            </Field>
            <Field label="Tên viết tắt">
              <input className={inputCls} value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} placeholder="LAURA" />
            </Field>
            <Field label="Tên nghiên cứu *" full>
              <textarea className={inputCls} rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Mã ClinicalTrials.gov / mã khác">
              <input className={inputCls} value={nctCode} onChange={(e) => setNctCode(e.target.value)} />
            </Field>
            <Field label="Nghiên cứu viên chính (PI)">
              <div className="relative">
                <input
                  className={inputCls}
                  value={piName}
                  onChange={(e) => { setPiName(e.target.value); setPiId(""); setEditingPi(true); }}
                  onFocus={() => setEditingPi(true)}
                  onBlur={() => setTimeout(() => setEditingPi(false), 200)}
                  placeholder="PGS.TS.BS. ..."
                />
                {editingPi && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {employees
                      .filter((u) => u.name.toLowerCase().includes(piName.toLowerCase()))
                      .slice(0, 20)
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => { setPiName(u.name); setPiId(u.id); setEditingPi(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                        >
                          <div className="font-medium">{u.name}</div>
                          {u.position && <div className="text-xs text-slate-400">{u.position}</div>}
                        </button>
                      ))}
                    {employees.filter((u) => u.name.toLowerCase().includes(piName.toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Không tìm thấy nhân viên</div>
                    )}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Khoa thực hiện">
              <div className="relative">
                <input
                  className={inputCls}
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); setEditingDept(true); }}
                  onFocus={() => setEditingDept(true)}
                  onBlur={() => setTimeout(() => setEditingDept(false), 200)}
                  placeholder="Chọn đơn vị"
                />
                {editingDept && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {units
                      .filter((u) => u.name.toLowerCase().includes(department.toLowerCase()))
                      .slice(0, 20)
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => { setDepartment(u.name); setEditingDept(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                        >
                          {u.name}
                        </button>
                      ))}
                    {units.filter((u) => u.name.toLowerCase().includes(department.toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Không tìm thấy đơn vị</div>
                    )}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Nhà tài trợ">
              <input list="trial-sponsors" className={inputCls} value={sponsor} onChange={(e) => setSponsor(e.target.value)} />
              <datalist id="trial-sponsors">
                {SPONSORS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </Field>

            <Field label="CRO (Contract Research Organization)">
              <input className={inputCls} value={cro} onChange={(e) => setCro(e.target.value)} />
            </Field>
            <Field label="SMO (Site Management Organization)">
              <input className={inputCls} value={smo} onChange={(e) => setSmo(e.target.value)} />
            </Field>

            <Field label="Thời gian bắt đầu (Quý/năm)">
              <input className={inputCls} value={startPeriod} onChange={(e) => setStartPeriod(e.target.value)} placeholder="3/2024" />
            </Field>
            <Field label="Thời gian kết thúc (Quý/năm)">
              <input className={inputCls} value={endPeriod} onChange={(e) => setEndPeriod(e.target.value)} placeholder="4/2031" />
            </Field>

            <ContactListEditor label="CRA — Giám sát nghiên cứu" contacts={cra} onChange={setCra} className="col-span-2" />
            <ContactListEditor label="CRC — Điều phối tại site" contacts={crc} onChange={setCrc} className="col-span-2" />

            <Field label="Trạng thái vòng đời">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ClinicalTrialStatus)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{CLINICAL_TRIAL_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Link nhóm Zalo">
              <input className={inputCls} value={zaloGroupUrl} onChange={(e) => setZaloGroupUrl(e.target.value)} placeholder="https://zalo.me/g/..." />
            </Field>

            {!isEdit && workflows.length > 0 && (
              <Field label="Quy trình mẫu theo dõi (nhiệm vụ sẽ tự sinh)">
                <select className={inputCls} value={selectedWorkflowId} onChange={(e) => setSelectedWorkflowId(e.target.value)}>
                  <option value="">Mặc định — Thử nghiệm lâm sàng</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Lý do chưa triển khai / ghi chú trạng thái" full>
              <textarea className={inputCls} rows={2} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              Huỷ
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Tạo mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
