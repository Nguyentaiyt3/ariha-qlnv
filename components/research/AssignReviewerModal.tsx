"use client";

import { useState, useMemo } from "react";
import { Search, UserCheck, Building2, Briefcase, X, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { cn, getInitials, avatarColor } from "@/lib/utils";
import { toast } from "sonner";
import type { User, ResearchReview } from "@/types";
import { generateId } from "@/lib/utils";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  /** Danh sách user toàn hệ thống */
  users: User[];
  /** Phiếu phản biện đã có (để lọc trùng) */
  existingReviews: ResearchReview[];
  /** Số phản biện còn được thêm (max 2) */
  slotsLeft: number;
  /** Giai đoạn phản biện (proposal = thẩm định đề cương, recognition = nghiệm thu). */
  stage?: "proposal" | "recognition";
  onAssign: (review: ResearchReview) => Promise<void>;
  onClose: () => void;
}

type Tab = "internal" | "external";

const DESIGNATION_LABEL: Record<string, string> = {
  reviewer:         "Phản biện NCKH",
  councilMember:    "Thành viên HĐ",
  councilChair:     "Chủ tịch HĐ",
  councilSecretary: "Thư ký HĐ",
};

// ─── Avatar mini ─────────────────────────────────────────────────────────────

function MiniAvatar({ user }: { user: User }) {
  if (user.avatar) {
    return <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 flex-shrink-0" referrerPolicy="no-referrer" />;
  }
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ring-2 ring-white dark:ring-slate-800"
      style={{ background: avatarColor(user.name) }}>
      {getInitials(user.name)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssignReviewerModal({ users, existingReviews, slotsLeft, stage = "proposal", onAssign, onClose }: Props) {
  const abbr = useUnitAbbr();
  const [tab, setTab] = useState<Tab>("internal");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // External form
  const [extName, setExtName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [extOrg, setExtOrg] = useState("");
  const [extTitle, setExtTitle] = useState("");

  const assignedIds = new Set(existingReviews.map(r => r.reviewerId).filter(Boolean) as string[]);

  // Lọc: chỉ user có designation "reviewer", chưa được gán
  const eligible = useMemo(() =>
    users.filter(u =>
      u.isActive &&
      u.researchDesignations?.includes("reviewer") &&
      !assignedIds.has(u.id)
    ),
    [users, assignedIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.department ?? "").toLowerCase().includes(q) ||
      (u.position ?? "").toLowerCase().includes(q),
    );
  }, [eligible, search]);

  const selected = users.find(u => u.id === selectedId);

  async function handleAssignInternal() {
    if (!selectedId) { toast.error("Chọn phản biện viên"); return; }
    if (slotsLeft <= 0) { toast.error("Đã đủ 2 phản biện"); return; }
    setSaving(true);
    const review: ResearchReview = {
      id: generateId("rev"),
      stage,
      reviewerType: "internal",
      reviewerId: selectedId,
      reviewerName: selected?.name ?? "",
      assignedAt: new Date().toISOString(),
      dueAt: dueDate || undefined,
      status: "assigned",
    };
    await onAssign(review);
    setSaving(false);
  }

  async function handleAssignExternal() {
    if (!extName.trim()) { toast.error("Nhập họ tên phản biện viên"); return; }
    if (slotsLeft <= 0) { toast.error("Đã đủ 2 phản biện"); return; }
    setSaving(true);
    const review: ResearchReview = {
      id: generateId("rev"),
      stage,
      reviewerType: "external",
      reviewerName: extName.trim(),
      reviewerEmail: extEmail.trim() || undefined,
      reviewerOrg: extOrg.trim() || undefined,
      assignedAt: new Date().toISOString(),
      dueAt: dueDate || undefined,
      status: "assigned",
    };
    await onAssign(review);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4">
      <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">Chỉ định phản biện viên</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {slotsLeft > 0
                ? `Còn ${slotsLeft} vị trí phản biện · Phản biện kín ${stage === "recognition" ? "GĐ2 Nghiệm thu" : "GĐ1 Đề cương"}`
                : "Đã đủ 2 phản biện viên"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[var(--border)] shrink-0">
          {([["internal", "Nội bộ"], ["external", "Bên ngoài"]] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); setSelectedId(""); }}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium transition border-b-2",
                tab === t
                  ? "border-violet-500 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-slate-500 hover:text-[var(--foreground)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "internal" ? (
            <div className="p-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, phòng ban, chức vụ..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* No eligible hint */}
              {eligible.length === 0 && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    <p className="font-medium">Chưa có phản biện viên nội bộ</p>
                    <p className="text-xs mt-0.5">
                      Vào <strong>Nhân viên → chỉnh sửa hồ sơ → Vai trò NCKH</strong> để đánh dấu "Phản biện NCKH" cho nhân viên phù hợp.
                    </p>
                    <a href="/employees" target="_blank" className="inline-flex items-center gap-1 text-xs text-amber-700 underline mt-1">
                      Đến trang Nhân viên <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Reviewer cards */}
              {filtered.length === 0 && eligible.length > 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Không tìm thấy phản biện viên phù hợp</p>
              )}

              <div className="space-y-2">
                {filtered.map(u => {
                  const isSelected = selectedId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedId(isSelected ? "" : u.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition",
                        isSelected
                          ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20"
                          : "border-[var(--border)] hover:border-slate-300 dark:hover:border-slate-600 hover:bg-[var(--muted)]",
                      )}
                    >
                      <MiniAvatar user={u} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold truncate", isSelected ? "text-violet-700 dark:text-violet-300" : "text-[var(--foreground)]")}>
                          {u.name}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {u.department && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Building2 className="w-3 h-3" />{abbr(u.department)}
                            </span>
                          )}
                          {u.position && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Briefcase className="w-3 h-3" />{u.position}
                            </span>
                          )}
                        </div>
                        {/* Research designations */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {u.researchDesignations?.map(d => (
                            <span key={d} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                              {DESIGNATION_LABEL[d] ?? d}
                            </span>
                          ))}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-violet-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* External reviewer form */
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-400">Mời chuyên gia bên ngoài tổ chức — không cần có tài khoản hệ thống.</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Họ và tên *</label>
                  <div className="relative">
                    <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={extName}
                      onChange={e => setExtName(e.target.value)}
                      placeholder="PGS.TS Nguyễn Văn A"
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Học hàm/Chức danh</label>
                    <input
                      value={extTitle}
                      onChange={e => setExtTitle(e.target.value)}
                      placeholder="PGS.TS, ThS..."
                      className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={extEmail}
                      onChange={e => setExtEmail(e.target.value)}
                      placeholder="expert@university.edu.vn"
                      className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Cơ quan / Đơn vị</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={extOrg}
                      onChange={e => setExtOrg(e.target.value)}
                      placeholder="Trường Đại học Y Hà Nội..."
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — shared */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--card)] shrink-0 space-y-3">
          {/* Due date */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-500 shrink-0">Hạn nộp phiếu</label>
            <input
              type="date"
              value={dueDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDueDate(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Selected preview */}
          {tab === "internal" && selected && (
            <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-700">
              <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />
              <span className="text-sm text-violet-700 dark:text-violet-300 font-medium truncate">{selected.name}</span>
              <span className="text-xs text-violet-500 ml-auto shrink-0">{selected.department ?? ""}</span>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)] rounded-xl text-slate-600 dark:text-slate-300 hover:bg-[var(--muted)] transition">
              Huỷ
            </button>
            <button
              onClick={tab === "internal" ? handleAssignInternal : handleAssignExternal}
              disabled={saving || slotsLeft <= 0 || (tab === "internal" && !selectedId) || (tab === "external" && !extName.trim())}
              className="px-5 py-2 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              Chỉ định phản biện
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
