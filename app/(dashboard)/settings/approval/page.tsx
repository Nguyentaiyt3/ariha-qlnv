"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, X, Edit2, Trash2, ChevronDown, ArrowRight,
  Check, Layers, Star, RefreshCw, Settings2, GripVertical,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import type { PositionDef, ApprovalRule, ApprovalStep, UnitLevel, UnitDef } from "@/types";

// ─── Constants ────────────────────────────────────────────────

const UNIT_LEVEL_OPTIONS: Array<{
  value: UnitLevel;
  label: string;
  short: string;
  color: string;
}> = [
  { value: 1, label: "Cấp 1 — Cơ quan (Ban Giám đốc)",    short: "Cơ quan",    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: 2, label: "Cấp 2 — Khoa / Phòng / TT / Viện",  short: "Khoa/Phòng", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"         },
  { value: 3, label: "Cấp 3 — Đơn vị thuộc TT / Viện",    short: "Đơn vị con", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"         },
  { value: 4, label: "Cấp 4 — Nhân viên",                  short: "Nhân viên",  color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"         },
];

function levelColor(level: UnitLevel) {
  return UNIT_LEVEL_OPTIONS.find(o => o.value === level)?.color ?? "";
}
function levelShort(level: UnitLevel) {
  return UNIT_LEVEL_OPTIONS.find(o => o.value === level)?.short ?? "";
}

const STORAGE_KEY_POSITIONS = "ariha:positionDefs";
const STORAGE_KEY_RULES     = "ariha:approvalRules";

type Tab = "positions" | "workflow" | "units";
type FormStep = { label: string; positionIds: string[] };

// Migrate old localStorage format (approverPositionIds → steps)
function migrateRule(r: Record<string, unknown>): ApprovalRule {
  if (!("steps" in r) && "approverPositionIds" in r) {
    const ids = r.approverPositionIds as string[];
    return {
      ...(r as unknown as Omit<ApprovalRule, "steps" | "scope">),
      scope: (r.scope as string) === "institution" ? "unit" : (r.scope as "default" | "unit"),
      unitLevel: (r.scope as string) === "default" ? 2 : undefined,
      steps: ids.length > 0 ? [{ order: 1, label: "Duyệt", positionIds: ids }] : [],
    } as ApprovalRule;
  }
  // Old default without unitLevel
  if (r.scope === "default" && !("unitLevel" in r)) {
    return { ...(r as unknown as ApprovalRule), unitLevel: 2 as const };
  }
  return r as unknown as ApprovalRule;
}

// ─── UnitCombobox ─────────────────────────────────────────────

function UnitCombobox({
  units,
  value,
  onChange,
}: {
  units: UnitDef[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = units.filter(u =>
    !query ||
    u.name.toLowerCase().includes(query.toLowerCase()) ||
    (u.abbr ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const LEVEL_COLOR: Record<2 | 3, string> = {
    2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    3: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  };
  const LEVEL_LABEL: Record<2 | 3, string> = {
    2: "Cấp 2",
    3: "Cấp 3",
  };

  function select(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition bg-[var(--background)]",
          open
            ? "border-blue-400 ring-1 ring-blue-400/30"
            : "border-slate-200 dark:border-slate-700 hover:border-slate-400"
        )}
      >
        {value ? (
          <>
            <span className="flex-1 text-sm text-[var(--foreground)] truncate">{value}</span>
            <button
              onClick={e => { e.stopPropagation(); onChange(""); }}
              className="shrink-0 text-slate-400 hover:text-red-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span className="flex-1 text-sm text-slate-400">— Chọn đơn vị —</span>
        )}
        <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          {/* Search */}
          <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-800">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm kiếm đơn vị..."
              className="w-full text-sm px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-blue-400 text-[var(--foreground)]"
            />
          </div>
          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-5 text-xs text-center text-slate-400">Không tìm thấy đơn vị</div>
            ) : filtered.map(u => (
              <div
                key={u.id}
                onClick={() => select(u.name)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition",
                  u.name === value && "bg-blue-50 dark:bg-blue-950/30"
                )}
              >
                {u.unitLevel === 3 && <span className="text-slate-300 dark:text-slate-600 text-xs shrink-0 pl-3">└</span>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--foreground)] truncate">{u.name}</p>
                  {u.abbr && <p className="text-[10px] text-slate-400">{u.abbr}</p>}
                </div>
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", LEVEL_COLOR[u.unitLevel])}>
                  {LEVEL_LABEL[u.unitLevel]}
                </span>
                {u.name === value && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PositionMultiSelect ──────────────────────────────────────

function PositionMultiSelect({
  positions, selected, onChange, placeholder, label,
}: {
  positions: PositionDef[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  const selectedPos = positions.filter(p => selected.includes(p.id));
  const grouped = UNIT_LEVEL_OPTIONS.map(lvl => ({
    ...lvl,
    items: positions.filter(p => p.unitLevel === lvl.value),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <div ref={ref} className="relative">
        <div
          onClick={() => setOpen(o => !o)}
          className={cn(
            "min-h-[36px] flex flex-wrap gap-1.5 px-2 py-1.5 border rounded-lg cursor-pointer transition bg-[var(--background)]",
            open
              ? "border-blue-400 ring-1 ring-blue-400/30"
              : "border-slate-200 dark:border-slate-700 hover:border-slate-400"
          )}
        >
          {selectedPos.length === 0 ? (
            <span className="text-xs text-slate-400 self-center">{placeholder}</span>
          ) : (
            selectedPos.map(p => (
              <span
                key={p.id}
                onClick={e => { e.stopPropagation(); toggle(p.id); }}
                className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs rounded-md cursor-pointer hover:bg-blue-200"
              >
                {p.title}<X className="w-3 h-3" />
              </span>
            ))
          )}
          <ChevronDown className={cn("w-4 h-4 text-slate-400 ml-auto self-center transition-transform shrink-0", open && "rotate-180")} />
        </div>
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="px-4 py-5 text-xs text-center text-slate-400">Chưa có chức vụ.</div>
            ) : grouped.map(group => (
              <div key={group.value}>
                <div className="sticky top-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800">
                  {group.short}
                </div>
                {group.items.map(p => (
                  <div
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <div className={cn(
                      "w-4 h-4 border-2 rounded flex items-center justify-center shrink-0 transition-all",
                      selected.includes(p.id) ? "bg-blue-600 border-blue-600" : "border-slate-300 dark:border-slate-600"
                    )}>
                      {selected.includes(p.id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--foreground)] truncate">{p.title}</p>
                      {p.name !== p.title && <p className="text-[10px] text-slate-400 truncate">{p.name}</p>}
                    </div>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", levelColor(p.unitLevel))}>
                      Cấp {p.unitLevel}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StepBuilder ──────────────────────────────────────────────

function StepBuilder({
  steps, positions, onChange,
}: {
  steps: FormStep[];
  positions: PositionDef[];
  onChange: (steps: FormStep[]) => void;
}) {
  function addStep() {
    onChange([...steps, { label: "", positionIds: [] }]);
  }
  function removeStep(i: number) {
    onChange(steps.filter((_, j) => j !== i));
  }
  function updateStep(i: number, patch: Partial<FormStep>) {
    onChange(steps.map((s, j) => j === i ? { ...s, ...patch } : s));
  }

  const STEP_LABELS = [
    "Trưởng khoa / phòng",
    "Giám đốc Trung tâm / Viện trưởng",
    "Giám đốc",
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          Chuỗi phê duyệt
        </label>
        {steps.length === 0 && (
          <span className="text-[10px] text-slate-400 italic">Chưa có bước nào</span>
        )}
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 items-start">
            {/* Step number + connector */}
            <div className="flex flex-col items-center pt-2.5 shrink-0">
              <div className="w-6 h-6 rounded-full bg-green-600 text-white text-[10px] flex items-center justify-center font-bold">
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className="w-px h-4 bg-green-200 dark:bg-green-800 mt-1" />
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2.5 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <input
                  value={step.label}
                  onChange={e => updateStep(i, { label: e.target.value })}
                  placeholder={STEP_LABELS[i] ?? `Bước ${i + 1}: tên cấp duyệt...`}
                  className="flex-1 text-xs border-0 border-b border-slate-200 dark:border-slate-700 pb-0.5 bg-transparent text-[var(--foreground)] focus:outline-none focus:border-blue-400 placeholder:text-slate-400"
                />
              </div>
              <PositionMultiSelect
                positions={positions}
                selected={step.positionIds}
                onChange={ids => updateStep(i, { positionIds: ids })}
                placeholder="Chọn chức vụ có thể duyệt bước này..."
                label=""
              />
            </div>

            <button
              onClick={() => removeStep(i)}
              className="p-1.5 mt-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition shrink-0"
              title="Xóa bước"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addStep}
        className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 dark:text-green-400 px-3 py-2 border border-dashed border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/20 transition w-full justify-center"
      >
        <Plus className="w-3.5 h-3.5" />
        Thêm bước duyệt
      </button>
    </div>
  );
}

// ─── RuleCard ─────────────────────────────────────────────────

function RuleCard({
  rule, positions, onEdit, onDelete,
}: {
  rule: ApprovalRule;
  positions: PositionDef[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const submitters = positions.filter(p => rule.submitterPositionIds.includes(p.id));

  return (
    <div className="p-4 space-y-3">
      {/* Header for unit rules */}
      {rule.scope === "unit" && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--foreground)]">{rule.unitName}</span>
          <div className="flex gap-0.5">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {rule.scope === "default" && (
        <div className="flex justify-end gap-0.5">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Submitters */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">Người trình</p>
        <div className="flex flex-wrap gap-1">
          {submitters.length > 0 ? submitters.map(p => (
            <span key={p.id} className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded-full">
              {p.title}
            </span>
          )) : (
            <span className="text-xs text-slate-400 italic">Chưa cấu hình</span>
          )}
        </div>
      </div>

      {/* Approval chain */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">Chuỗi phê duyệt</p>
        {rule.steps.length === 0 ? (
          <span className="text-xs text-slate-400 italic">Chưa cấu hình bước duyệt</span>
        ) : (
          <div className="flex items-start flex-wrap gap-1.5">
            {rule.steps.map((step, i) => {
              const stepPos = positions.filter(p => step.positionIds.includes(p.id));
              return (
                <div key={step.order} className="flex items-center gap-1.5">
                  {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1.5 min-w-[90px]">
                    <p className="text-[9px] font-bold text-green-600 dark:text-green-400 mb-1 uppercase tracking-wide">
                      Bước {step.order}{step.label ? ` · ${step.label}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {stepPos.length > 0 ? stepPos.map(p => (
                        <span key={p.id} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-700 rounded-full text-green-700 dark:text-green-300">
                          {p.title}
                        </span>
                      )) : (
                        <span className="text-[10px] text-slate-400 italic">Chưa chọn chức vụ</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rule.description && (
        <p className="text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">{rule.description}</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

const EMPTY_RULE_FORM = {
  scope: "unit" as "default" | "unit",
  unitLevel: 2 as 2 | 3,
  unitName: "",
  submitterPositionIds: [] as string[],
  steps: [] as FormStep[],
  description: "",
};

const EMPTY_POS_FORM = { title: "", name: "", unitLevel: 2 as UnitLevel };

export default function ApprovalSettingsPage() {
  const [tab, setTab] = useState<Tab>("positions");
  const [positions, setPositions] = useState<PositionDef[]>([]);
  const [rules, setRules] = useState<ApprovalRule[]>([]);

  // Unit catalog state
  const [unitCatalog, setUnitCatalog] = useState<UnitDef[]>([]);
  const [discoveredRaw, setDiscoveredRaw] = useState<string[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitDef | null>(null);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: "", abbr: "", parentId: "", unitLevel: 2 as 2 | 3 });
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  // Position form state
  const [showPosForm, setShowPosForm] = useState(false);
  const [posForm, setPosForm] = useState(EMPTY_POS_FORM);
  const [editPosId, setEditPosId] = useState<string | null>(null);

  // Rule form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);

  // ── Load positions from API, migrate localStorage → MongoDB once ──
  useEffect(() => {
    async function loadPositions() {
      try {
        const res = await fetch("/api/positions");
        const data = await res.json();
        if (Array.isArray(data.positions) && data.positions.length > 0) {
          // MongoDB has data — use it and drop localStorage copy
          setPositions(data.positions);
          localStorage.removeItem(STORAGE_KEY_POSITIONS);
        } else {
          // MongoDB empty — migrate from localStorage if any
          const raw = localStorage.getItem(STORAGE_KEY_POSITIONS);
          if (raw) {
            const local = JSON.parse(raw) as PositionDef[];
            if (local.length > 0) {
              await fetch("/api/positions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bulk: local }),
              });
              setPositions(local);
              localStorage.removeItem(STORAGE_KEY_POSITIONS);
            }
          }
        }
      } catch {
        // Fallback: still show localStorage data if API unreachable
        try {
          const raw = localStorage.getItem(STORAGE_KEY_POSITIONS);
          if (raw) setPositions(JSON.parse(raw));
        } catch {}
      }
    }
    loadPositions();

    // Rules still use localStorage (not migrated yet)
    try {
      const r = localStorage.getItem(STORAGE_KEY_RULES);
      if (r) {
        const parsed = JSON.parse(r) as Record<string, unknown>[];
        setRules(parsed.map(migrateRule));
      }
    } catch {}
  }, []);

  // ── Load units khi tab units được mở ──────────────────────
  useEffect(() => {
    if ((tab === "units" || tab === "workflow") && unitCatalog.length === 0 && !unitsLoading) loadUnits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadUnits() {
    setUnitsLoading(true);
    try {
      const res = await fetch("/api/units");
      const data = await res.json();
      if (data.catalog)    setUnitCatalog(data.catalog);
      if (data.discovered) setDiscoveredRaw(data.discovered);
    } catch {}
    setUnitsLoading(false);
  }

  function openUnitForm(unit?: UnitDef) {
    if (unit) {
      setEditingUnit(unit);
      setUnitForm({ name: unit.name, abbr: unit.abbr ?? "", parentId: unit.parentId ?? "", unitLevel: unit.unitLevel });
    } else {
      setEditingUnit(null);
      setUnitForm({ name: "", abbr: "", parentId: "", unitLevel: 2 });
    }
    setShowUnitForm(true);
  }

  async function handleSaveUnit() {
    if (!unitForm.name.trim()) return;
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUnit?.id,
          name: unitForm.name.trim(),
          abbr: unitForm.abbr.trim() || undefined,
          parentId: unitForm.parentId || undefined,
          unitLevel: unitForm.unitLevel,
          source: "manual",
        }),
      });
      const data = await res.json();
      if (data.catalog) setUnitCatalog(data.catalog);
    } catch {}
    setShowUnitForm(false);
    setEditingUnit(null);
  }

  async function handleImportUnit(name: string) {
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unitLevel: 2, source: "auto" }),
      });
      const data = await res.json();
      if (data.catalog) setUnitCatalog(data.catalog);
      if (data.unit) {
        setDiscoveredRaw(prev => prev.filter(d => d !== name));
        setEditingUnit(data.unit);
        setUnitForm({ name: data.unit.name, abbr: "", parentId: "", unitLevel: 2 });
        setShowUnitForm(true);
      }
    } catch {}
  }

  async function handleDeleteUnit(id: string) {
    try {
      const res = await fetch("/api/units", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.catalog) setUnitCatalog(data.catalog);
    } catch {}
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/units/import", { method: "POST", body: fd });
      const data = await res.json();
      if (data.catalog) setUnitCatalog(data.catalog);
      setImportResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? [] });
      const reload = await fetch("/api/units");
      const reloadData = await reload.json();
      if (reloadData.discovered) setDiscoveredRaw(reloadData.discovered);
    } catch {
      setImportResult({ imported: 0, skipped: 0, errors: ["Không thể kết nối server."] });
    }
    setImporting(false);
  }

  function persistPositions(updated: PositionDef[]) {
    setPositions(updated);
    fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: updated }),
    }).catch(console.error);
  }
  function persistRules(updated: ApprovalRule[]) {
    setRules(updated);
    localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(updated));
  }

  // ── Position CRUD ───────────────────────────────────────────
  function handleSavePosition() {
    if (!posForm.title.trim()) return;
    const fullName = posForm.name.trim() || posForm.title.trim();
    if (editPosId) {
      persistPositions(positions.map(p =>
        p.id === editPosId ? { ...p, title: posForm.title.trim(), name: fullName, unitLevel: posForm.unitLevel } : p
      ));
      setEditPosId(null);
    } else {
      persistPositions([...positions, {
        id: generateId(), title: posForm.title.trim(), name: fullName,
        unitLevel: posForm.unitLevel, createdAt: new Date().toISOString(),
      }]);
    }
    setPosForm(EMPTY_POS_FORM);
    setShowPosForm(false);
  }

  function handleDeletePosition(id: string) {
    persistPositions(positions.filter(p => p.id !== id));
    // Remove from all rules (submitters + every step)
    persistRules(rules.map(r => ({
      ...r,
      submitterPositionIds: r.submitterPositionIds.filter(x => x !== id),
      steps: r.steps.map(s => ({ ...s, positionIds: s.positionIds.filter(x => x !== id) })),
    })));
  }

  function startEditPosition(p: PositionDef) {
    setEditPosId(p.id);
    setPosForm({ title: p.title, name: p.name, unitLevel: p.unitLevel });
    setShowPosForm(true);
  }

  function cancelPosForm() {
    setShowPosForm(false);
    setEditPosId(null);
    setPosForm(EMPTY_POS_FORM);
  }

  // ── Rule CRUD ───────────────────────────────────────────────
  function handleSaveRule() {
    if (ruleForm.scope === "unit" && !ruleForm.unitName.trim()) return;
    const base: Omit<ApprovalRule, "id"> = {
      scope: ruleForm.scope,
      unitLevel: ruleForm.scope === "default" ? ruleForm.unitLevel : undefined,
      unitName: ruleForm.scope === "unit" ? ruleForm.unitName.trim() : undefined,
      submitterPositionIds: ruleForm.submitterPositionIds,
      steps: ruleForm.steps.map((s, i) => ({ order: i + 1, label: s.label, positionIds: s.positionIds })),
      description: ruleForm.description.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    if (editRuleId) {
      persistRules(rules.map(r => r.id === editRuleId ? { ...r, ...base } : r));
      setEditRuleId(null);
    } else {
      persistRules([...rules, { id: generateId(), ...base }]);
    }
    setRuleForm(EMPTY_RULE_FORM);
    setShowRuleForm(false);
  }

  function startEditRule(r: ApprovalRule) {
    setEditRuleId(r.id);
    setRuleForm({
      scope: r.scope,
      unitLevel: r.unitLevel ?? 2,
      unitName: r.unitName ?? "",
      submitterPositionIds: r.submitterPositionIds,
      steps: r.steps.map(s => ({ label: s.label, positionIds: s.positionIds })),
      description: r.description ?? "",
    });
    setShowRuleForm(true);
  }

  function cancelRuleForm() {
    setShowRuleForm(false);
    setEditRuleId(null);
    setRuleForm(EMPTY_RULE_FORM);
  }

  function openNewRule(scope: "default" | "unit", opts: { unitLevel?: 2 | 3; unitName?: string } = {}) {
    cancelRuleForm();
    setRuleForm({ ...EMPTY_RULE_FORM, scope, unitLevel: opts.unitLevel ?? 2, unitName: opts.unitName ?? "" });
    setShowRuleForm(true);
  }

  // ── Derived ─────────────────────────────────────────────────
  const defaultRuleLv2 = rules.find(r => r.scope === "default" && r.unitLevel === 2);
  const defaultRuleLv3 = rules.find(r => r.scope === "default" && r.unitLevel === 3);
  const unitRules      = rules.filter(r => r.scope === "unit");

  const groupedPositions = ([1, 2, 3, 4] as UnitLevel[])
    .map(lvl => ({ level: lvl, items: positions.filter(p => p.unitLevel === lvl) }))
    .filter(g => g.items.length > 0);

  // ── Helper: Default rule card ────────────────────────────────
  function DefaultRuleSection({
    title, desc, unitLevel, color, rule,
  }: {
    title: string;
    desc: string;
    unitLevel: 2 | 3;
    color: "blue" | "teal";
    rule: ApprovalRule | undefined;
  }) {
    const headerCls = color === "blue"
      ? "bg-blue-600 text-white"
      : "bg-teal-600 text-white";
    const borderCls = color === "blue"
      ? "border-blue-300 dark:border-blue-700"
      : "border-teal-300 dark:border-teal-700";
    const editingThis = editRuleId && rule && editRuleId === rule.id;

    return (
      <div className={cn("rounded-xl overflow-hidden shadow-sm border-2", borderCls)}>
        <div className={cn("flex items-center gap-2 px-3 py-2 text-xs font-semibold", headerCls)}>
          <Layers className="w-3.5 h-3.5" />
          {title}
          <span className="font-normal opacity-80 ml-1">{desc}</span>
        </div>
        {rule && !editingThis ? (
          <RuleCard
            rule={rule}
            positions={positions}
            onEdit={() => startEditRule(rule)}
            onDelete={() => persistRules(rules.filter(r => r.id !== rule.id))}
          />
        ) : !editingThis ? (
          <div className="px-5 py-6 flex flex-col items-center gap-2 text-center">
            <Layers className="w-8 h-8 text-slate-200 dark:text-slate-700" />
            <p className="text-sm text-slate-400">Chưa cấu hình quy trình cho cấp này.</p>
            <button
              onClick={() => openNewRule("default", { unitLevel })}
              className="mt-1 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/50 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Thiết lập
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--foreground)]">Quy trình phê duyệt</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Quản lý chức vụ và cấu hình chuỗi phê duyệt nhiều bước theo từng cấp đơn vị.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        {[
          { id: "positions" as Tab, label: "Danh mục chức vụ" },
          { id: "workflow"  as Tab, label: "Quy trình phê duyệt" },
          { id: "units"     as Tab, label: "Bảng đơn vị" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg transition",
              tab === t.id
                ? "bg-white dark:bg-slate-700 text-[var(--foreground)] shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-[var(--foreground)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════
          Tab 1: Danh mục chức vụ
          ═══════════════════════════════════════════════ */}
      {tab === "positions" && (
        <div className="space-y-4">
          {showPosForm ? (
            <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                {editPosId ? "Sửa chức vụ" : "Thêm chức vụ mới"}
              </h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Chức vụ <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={posForm.title}
                  onChange={e => setPosForm({ ...posForm, title: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && handleSavePosition()}
                  placeholder="VD: Trưởng phòng, Giám đốc, Phó Viện trưởng..."
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Tên đầy đủ <span className="text-slate-400 font-normal">(để trống = dùng chức vụ)</span>
                </label>
                <input
                  value={posForm.name}
                  onChange={e => setPosForm({ ...posForm, name: e.target.value })}
                  placeholder="VD: Trưởng phòng Kế hoạch tổng hợp, Giám đốc Trung tâm Tim mạch..."
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Cấp đơn vị <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {UNIT_LEVEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPosForm({ ...posForm, unitLevel: opt.value })}
                      className={cn(
                        "flex items-start gap-2.5 p-3 border-2 rounded-xl text-left transition text-xs",
                        posForm.unitLevel === opt.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0",
                        posForm.unitLevel === opt.value ? "border-blue-600 bg-blue-600" : "border-slate-300 dark:border-slate-600"
                      )} />
                      <span className={cn(
                        "font-medium leading-snug",
                        posForm.unitLevel === opt.value ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-400"
                      )}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button onClick={cancelPosForm} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg transition">Hủy</button>
                <button
                  onClick={handleSavePosition}
                  disabled={!posForm.title.trim()}
                  className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  {editPosId ? "Lưu thay đổi" : "Thêm chức vụ"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPosForm(true)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium px-4 py-2.5 border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 transition w-full justify-center"
            >
              <Plus className="w-4 h-4" />Thêm chức vụ
            </button>
          )}

          {groupedPositions.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              Chưa có chức vụ nào. Nhấn "Thêm chức vụ" để bắt đầu.
            </div>
          )}
          {groupedPositions.map(({ level, items }) => (
            <div key={level} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", levelColor(level))}>Cấp {level}</span>
                <span className="text-sm font-semibold text-[var(--foreground)]">{levelShort(level)}</span>
                <span className="ml-auto text-xs text-slate-400">{items.length} chức vụ</span>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {items.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)]">{p.title}</p>
                      {p.name !== p.title && <p className="text-xs text-slate-400 truncate">{p.name}</p>}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditPosition(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeletePosition(p.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          Tab 2: Quy trình phê duyệt
          ═══════════════════════════════════════════════ */}
      {tab === "workflow" && (
        <div className="space-y-6">
          {positions.length === 0 && (
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>Cần tạo chức vụ trước. Chuyển sang tab <strong>"Danh mục chức vụ"</strong> để thêm.</span>
            </div>
          )}

          {/* ── 1. Quy trình mặc định ─────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-[var(--foreground)]">Quy trình mặc định</h3>
              <span className="text-xs text-slate-400 font-normal">
                — Tự động áp dụng cho đơn vị chưa cấu hình riêng
              </span>
            </div>

            {/* Explanation banner */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-500 space-y-1">
              <p><strong className="text-blue-600">Cấp 2</strong> (Khoa/Phòng/TT/Viện): NV trình → Trưởng khoa/phòng → Giám đốc</p>
              <p><strong className="text-teal-600">Cấp 3</strong> (Đơn vị con thuộc TT/Viện): NV trình → Trưởng phòng con → GĐ Trung tâm/Viện trưởng → Giám đốc</p>
              <p className="text-amber-600 italic">Trường hợp GĐ kiêm GĐ TT/Viện → dùng "Đơn vị đặc biệt" bên dưới để rút gọn xuống 2 bước.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DefaultRuleSection
                title="Cấp 2 — Khoa / Phòng / TT / Viện"
                desc="(quy trình 2 bước)"
                unitLevel={2}
                color="blue"
                rule={defaultRuleLv2}
              />
              <DefaultRuleSection
                title="Cấp 3 — Đơn vị con thuộc TT / Viện"
                desc="(quy trình 3 bước)"
                unitLevel={3}
                color="teal"
                rule={defaultRuleLv3}
              />
            </div>
          </div>

          {/* ── 2. Đơn vị đặc biệt ──────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-[var(--foreground)]">Đơn vị đặc biệt</h3>
                <span className="text-xs text-slate-400 font-normal">— Ghi đè quy trình mặc định</span>
              </div>
              <button
                onClick={() => openNewRule("unit")}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm đơn vị
              </button>
            </div>

            {/* Hint for special case */}
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">💡</span>
              <span>Dùng để cấu hình riêng cho các TT/Viện mà Giám đốc Trung tâm / Viện trưởng đồng thời là Giám đốc bệnh viện — quy trình rút gọn chỉ cần 2 bước.</span>
            </div>

            {unitRules.length === 0 && !(showRuleForm && ruleForm.scope === "unit") && (
              <div className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                Chưa có đơn vị đặc biệt nào.
              </div>
            )}

            {unitRules.map(rule => (
              editRuleId === rule.id && showRuleForm ? null : (
                <div key={rule.id} className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900 text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    <Star className="w-3 h-3" />Quy trình riêng — ghi đè mặc định
                  </div>
                  <RuleCard
                    rule={rule}
                    positions={positions}
                    onEdit={() => startEditRule(rule)}
                    onDelete={() => persistRules(rules.filter(r => r.id !== rule.id))}
                  />
                </div>
              )
            ))}
          </div>

          {/* ── Inline form ─────────────────────────────── */}
          {showRuleForm && (
            <div className="bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  {editRuleId ? "Sửa quy trình" : (
                    ruleForm.scope === "default"
                      ? `Thiết lập quy trình mặc định cấp ${ruleForm.unitLevel}`
                      : "Thêm quy trình riêng cho đơn vị"
                  )}
                </h3>
                <button onClick={cancelRuleForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scope selector — chỉ khi tạo mới */}
              {!editRuleId && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "default" as const, unitLevel: 2 as const, label: "Mặc định Cấp 2", color: "blue" },
                    { value: "default" as const, unitLevel: 3 as const, label: "Mặc định Cấp 3", color: "teal" },
                    { value: "unit"    as const, unitLevel: 2 as const, label: "Đơn vị đặc biệt", color: "amber" },
                  ].map(opt => {
                    const active = ruleForm.scope === opt.value && (opt.value === "unit" || ruleForm.unitLevel === opt.unitLevel);
                    const disabled =
                      (opt.value === "default" && opt.unitLevel === 2 && !!defaultRuleLv2) ||
                      (opt.value === "default" && opt.unitLevel === 3 && !!defaultRuleLv3);
                    return (
                      <button
                        key={`${opt.value}-${opt.unitLevel}`}
                        disabled={disabled}
                        onClick={() => setRuleForm({ ...ruleForm, scope: opt.value, unitLevel: opt.unitLevel, unitName: "" })}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition",
                          disabled && "opacity-40 cursor-not-allowed",
                          active
                            ? opt.color === "blue"   ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                            : opt.color === "teal"   ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300"
                            :                          "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                            : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                        )}
                      >
                        {opt.label}
                        {disabled && " ✓"}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Unit name */}
              {ruleForm.scope === "unit" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Tên đơn vị <span className="text-red-500">*</span>
                  </label>
                  {unitCatalog.length > 0 ? (
                    <UnitCombobox
                      units={unitCatalog}
                      value={ruleForm.unitName}
                      onChange={name => setRuleForm({ ...ruleForm, unitName: name })}
                    />
                  ) : (
                    <input
                      autoFocus
                      value={ruleForm.unitName}
                      onChange={e => setRuleForm({ ...ruleForm, unitName: e.target.value })}
                      placeholder="VD: Trung tâm Tim mạch, Viện Y học lâm sàng..."
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
                    />
                  )}
                </div>
              )}

              <PositionMultiSelect
                positions={positions}
                selected={ruleForm.submitterPositionIds}
                onChange={ids => setRuleForm({ ...ruleForm, submitterPositionIds: ids })}
                placeholder="Chọn chức vụ được trình..."
                label="Người trình ▸"
              />

              <StepBuilder
                steps={ruleForm.steps}
                positions={positions}
                onChange={steps => setRuleForm({ ...ruleForm, steps })}
              />

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ghi chú</label>
                <input
                  value={ruleForm.description}
                  onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })}
                  placeholder="VD: Áp dụng cho đề án NCKH cấp cơ sở..."
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button onClick={cancelRuleForm} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg transition">Hủy</button>
                <button
                  onClick={handleSaveRule}
                  disabled={ruleForm.scope === "unit" && !ruleForm.unitName.trim()}
                  className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  {editRuleId ? "Lưu thay đổi" : "Tạo quy trình"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          Tab 3: Bảng đơn vị
          ═══════════════════════════════════════════════ */}
      {tab === "units" && (
        <div className="space-y-4">
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-500">Danh mục khoa, phòng, TT, Viện — kể cả đơn vị con.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={loadUnits} disabled={unitsLoading} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                <RefreshCw className={cn("w-3.5 h-3.5", unitsLoading && "animate-spin")} />Làm mới
              </button>
              <a href="/api/units/template" download="mau_danh_sach_don_vi.xlsx" className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Tải mẫu Excel
              </a>
              <button onClick={() => importFileRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/20 transition disabled:opacity-40">
                {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                {importing ? "Đang import..." : "Import Excel"}
              </button>
              <button onClick={() => openUnitForm()} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 dark:border-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 transition">
                <Plus className="w-3.5 h-3.5" />Thêm thủ công
              </button>
            </div>
          </div>

          {/* Import result */}
          {importResult && (
            <div className={cn("rounded-xl px-4 py-3 space-y-1.5 border text-sm",
              importResult.imported > 0
                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {importResult.imported > 0 && (
                    <span className="flex items-center gap-1 font-semibold text-green-700 dark:text-green-300">
                      <Check className="w-4 h-4" />{importResult.imported} đơn vị đã nhập
                    </span>
                  )}
                  {importResult.skipped > 0 && <span className="text-slate-500">{importResult.skipped} bỏ qua</span>}
                  {importResult.imported === 0 && importResult.skipped === 0 && (
                    <span className="text-slate-500">Không có đơn vị nào được nhập.</span>
                  )}
                </div>
                <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
              {importResult.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700 select-none">
                    {importResult.errors.length} cảnh báo / lỗi
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 pl-3 border-l border-slate-200 dark:border-slate-700">
                    {importResult.errors.map((e, i) => <li key={i} className="text-amber-600 dark:text-amber-400">{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Discovered from DB */}
          {discoveredRaw.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Phát hiện từ dữ liệu ({discoveredRaw.length}) — chưa có trong danh mục
              </p>
              <div className="flex flex-wrap gap-1.5">
                {discoveredRaw.map(name => (
                  <button key={name} onClick={() => handleImportUnit(name)} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition" title="Nhập vào danh mục">
                    <Plus className="w-3 h-3" />{name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Unit form */}
          {showUnitForm && (
            <div className="bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{editingUnit ? "Sửa đơn vị" : "Thêm đơn vị"}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Tên đầy đủ <span className="text-red-500">*</span></label>
                  <input autoFocus value={unitForm.name} onChange={e => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="VD: Khoa Nội tim mạch, Phòng Kế hoạch tổng hợp..." className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Tên viết tắt</label>
                  <input value={unitForm.abbr} onChange={e => setUnitForm({ ...unitForm, abbr: e.target.value })} placeholder="VD: K.NTM, P.KHTH" className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Cấp đơn vị</label>
                  <select value={unitForm.unitLevel} onChange={e => setUnitForm({ ...unitForm, unitLevel: Number(e.target.value) as 2 | 3, parentId: "" })} className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400">
                    <option value={2}>Cấp 2 — Khoa / Phòng / TT / Viện</option>
                    <option value={3}>Cấp 3 — Đơn vị con thuộc TT / Viện</option>
                  </select>
                </div>
                {unitForm.unitLevel === 3 && (
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Đơn vị cha <span className="text-red-500">*</span></label>
                    <select value={unitForm.parentId} onChange={e => setUnitForm({ ...unitForm, parentId: e.target.value })} className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-blue-400">
                      <option value="">— Chọn đơn vị cha —</option>
                      {unitCatalog.filter(u => u.unitLevel === 2 && u.id !== editingUnit?.id).map(u => (
                        <option key={u.id} value={u.id}>{u.name}{u.abbr ? ` (${u.abbr})` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => { setShowUnitForm(false); setEditingUnit(null); }} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-1.5">Hủy</button>
                <button onClick={handleSaveUnit} disabled={!unitForm.name.trim() || (unitForm.unitLevel === 3 && !unitForm.parentId)} className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium">
                  {editingUnit ? "Lưu" : "Thêm"}
                </button>
              </div>
            </div>
          )}

          {/* Unit table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1fr_80px_100px_110px_96px] px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 gap-2">
              <span>Tên đơn vị</span><span>Viết tắt</span><span>Đơn vị cha</span><span className="text-center">Quy trình</span><span className="text-right">Thao tác</span>
            </div>
            {unitsLoading && (
              <div className="py-10 text-center text-sm text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />Đang tải...
              </div>
            )}
            {!unitsLoading && unitCatalog.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-400">Chưa có đơn vị nào trong danh mục.</div>
            )}
            {!unitsLoading && (() => {
              const roots = unitCatalog.filter(u => u.unitLevel === 2).sort((a, b) => a.name.localeCompare(b.name, "vi"));
              const rows: Array<UnitDef & { indent: boolean }> = [];
              for (const root of roots) {
                rows.push({ ...root, indent: false });
                for (const child of unitCatalog.filter(u => u.unitLevel === 3 && u.parentId === root.id).sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
                  rows.push({ ...child, indent: true });
                }
              }
              for (const o of unitCatalog.filter(u => u.unitLevel === 3 && !unitCatalog.find(p => p.id === u.parentId))) {
                rows.push({ ...o, indent: false });
              }
              return rows.map(unit => {
                const parent = unit.parentId ? unitCatalog.find(u => u.id === unit.parentId) : null;
                const customRule = unitRules.find(r => r.unitName?.trim().toLowerCase() === unit.name.trim().toLowerCase());
                const hasDefault = unit.unitLevel === 2 ? !!defaultRuleLv2 : !!defaultRuleLv3;
                return (
                  <div key={unit.id} className={cn("grid grid-cols-[1fr_80px_100px_110px_96px] gap-2 items-center px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition", unit.indent && "bg-slate-50/50 dark:bg-slate-800/20")}>
                    <div className={cn("flex items-center gap-1.5 min-w-0", unit.indent && "pl-4")}>
                      {unit.indent && <span className="text-slate-300 dark:text-slate-600 text-xs shrink-0">└</span>}
                      <span className={cn("truncate text-[var(--foreground)]", unit.indent ? "text-xs" : "text-sm font-medium")}>{unit.name}</span>
                      {unit.source === "auto" && <span className="text-[9px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded shrink-0">auto</span>}
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{unit.abbr || <span className="text-slate-300">—</span>}</span>
                    <span className="text-xs text-slate-400 truncate">{parent ? (parent.abbr || parent.name) : <span className="text-slate-300">—</span>}</span>
                    <div className="text-center">
                      {customRule ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                          <Star className="w-2.5 h-2.5" />Riêng
                        </span>
                      ) : hasDefault ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                          <Layers className="w-2.5 h-2.5" />Mặc định
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Chưa đặt</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => {
                          if (customRule) { startEditRule(customRule); }
                          else { openNewRule("unit", { unitName: unit.name }); }
                          setTab("workflow");
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition"
                        title="Cấu hình quy trình riêng"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openUnitForm(unit)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Sửa">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteUnit(unit.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition" title="Xóa">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {!unitsLoading && unitCatalog.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/30 rounded-xl text-xs text-slate-500 border border-slate-100 dark:border-slate-800">
              <span className="font-semibold text-[var(--foreground)]">{unitCatalog.length} đơn vị</span>
              <span>{unitCatalog.filter(u => u.unitLevel === 2).length} cấp Khoa/Phòng</span>
              <span>{unitCatalog.filter(u => u.unitLevel === 3).length} đơn vị con</span>
              <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />{unitRules.length} quy trình riêng</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
