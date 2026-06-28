"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck, Save, Loader2, ChevronDown, ChevronRight,
  Check, X, Info, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission, DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, FEATURE_MODULES, applyPermissionOverrides } from "@/lib/rbac/permissions";
import { getPermissionConfig, savePermissionConfig } from "@/lib/firebase/firestore";
import type { UserRole } from "@/types";
import { toast } from "sonner";

const ROLES: { id: UserRole; label: string; sublabel: string; color: string }[] = [
  { id: "guest",    label: "Khách",          sublabel: "Chưa phân quyền",                          color: "text-slate-500" },
  { id: "staff",    label: "Nhân viên",      sublabel: "Chuyên viên, NCV...",                       color: "text-blue-600"  },
  { id: "teamLead", label: "Trưởng đơn vị",  sublabel: "Trưởng/Phó phòng, khoa, viện, TT",         color: "text-purple-600"},
  { id: "director", label: "Ban Giám đốc",   sublabel: "Phó Giám đốc, Giám đốc",                   color: "text-amber-600" },
  { id: "hrAdmin",  label: "HR/Admin",       sublabel: "Toàn quyền hệ thống",                       color: "text-red-600"   },
  { id: "financeViewer",     label: "Tài chính (Xem)",    sublabel: "Theo dõi tài chính",           color: "text-emerald-600" },
  { id: "financeAuditor",    label: "Tài chính (Kiểm)",   sublabel: "Kiểm tra / đối soát",          color: "text-teal-600"    },
  { id: "financeSupervisor", label: "Tài chính (Giám sát)", sublabel: "Duyệt chi, quản lý",        color: "text-cyan-600"    },
];

type PermConfig = Record<UserRole, string[]>;

function buildInitialConfig(overrides: Partial<PermConfig>): PermConfig {
  const result = {} as PermConfig;
  for (const r of ROLES) {
    result[r.id] = overrides[r.id] ?? [...(DEFAULT_ROLE_PERMISSIONS[r.id] ?? [])];
  }
  return result;
}

export default function PermissionsPage() {
  const { currentUser } = useAuthStore();
  const [config, setConfig] = useState<PermConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"matrix" | "modules" | "context">("matrix");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["task"]));

  const isAdmin = !!(currentUser && (hasPermission(currentUser.role, "*") || currentUser.role === "hrAdmin"));

  useEffect(() => {
    getPermissionConfig()
      .then((overrides) => setConfig(buildInitialConfig(overrides)))
      .catch(() => setConfig(buildInitialConfig({})))
      .finally(() => setLoading(false));
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)] text-sm">
        Chỉ HR Admin mới có quyền quản lý phân quyền.
      </div>
    );
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  function togglePermission(role: UserRole, permId: string) {
    if (role === "hrAdmin") return; // hrAdmin always has *
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev[role];
      const has = current.includes(permId);
      return {
        ...prev,
        [role]: has ? current.filter((p) => p !== permId) : [...current, permId],
      };
    });
  }

  function toggleGroup(role: UserRole, groupId: string, grant: boolean) {
    if (role === "hrAdmin") return;
    const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const groupPerms = group.permissions.map((p) => p.id);
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev[role];
      const next = grant
        ? Array.from(new Set([...current, ...groupPerms]))
        : current.filter((p) => !groupPerms.includes(p));
      return { ...prev, [role]: next };
    });
  }

  function toggleModuleAccess(role: UserRole, requiredPerm: string, grant: boolean) {
    if (role === "hrAdmin") return;
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev[role];
      const next = grant
        ? Array.from(new Set([...current, requiredPerm]))
        : current.filter((p) => p !== requiredPerm);
      return { ...prev, [role]: next };
    });
  }

  function resetToDefault(role: UserRole) {
    if (role === "hrAdmin") return;
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, [role]: [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])] };
    });
    toast.info(`Đã đặt lại quyền "${ROLES.find(r => r.id === role)?.label}" về mặc định.`);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      // Save only non-hrAdmin roles (hrAdmin always = *)
      const toSave: Partial<PermConfig> = {};
      for (const r of ROLES) {
        if (r.id !== "hrAdmin") toSave[r.id] = config[r.id];
      }
      toSave.hrAdmin = ["*"];
      await savePermissionConfig(toSave as PermConfig);
      applyPermissionOverrides(toSave as PermConfig);
      toast.success("Đã lưu cấu hình phân quyền. Hiệu lực ngay lập tức.");
    } catch {
      toast.error("Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  function toggleExpandGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // Check if all permissions in a group are granted for a role
  function groupGranted(role: UserRole, groupId: string): "all" | "some" | "none" {
    if (role === "hrAdmin") return "all";
    const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group || !config) return "none";
    const perms = group.permissions.map((p) => p.id);
    const granted = perms.filter((p) => config[role].includes(p));
    if (granted.length === perms.length) return "all";
    if (granted.length > 0) return "some";
    return "none";
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            Phân quyền
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Cấu hình quyền hạn cho từng vai trò trong hệ thống.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu thay đổi
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Thay đổi có hiệu lực ngay khi lưu (không cần khởi động lại).
          HR/Admin luôn có toàn quyền và không thể thay đổi.
          Người dùng đang đăng nhập cần <strong>tải lại trang</strong> để thấy quyền mới.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {(["matrix", "modules", "context"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition",
              activeTab === tab
                ? "bg-white dark:bg-slate-700 text-[var(--foreground)] shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-[var(--foreground)]"
            )}
          >
            {tab === "matrix" ? "Quyền hệ thống" : tab === "modules" ? "Quyền chức năng" : "Vai trò NCKH"}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Permission matrix ── */}
      {activeTab === "matrix" && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
          {/* Sticky header row */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 font-semibold text-[var(--foreground)] w-52">
                    Quyền / Chức năng
                  </th>
                  {ROLES.map((r) => (
                    <th key={r.id} className="px-3 py-3 text-center min-w-[110px]">
                      <div className={cn("font-bold text-sm", r.color)}>{r.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{r.sublabel}</div>
                      {r.id !== "hrAdmin" && (
                        <button
                          onClick={() => resetToDefault(r.id)}
                          className="mt-1 flex items-center gap-1 mx-auto text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                          title="Đặt lại về mặc định"
                        >
                          <RefreshCw className="w-2.5 h-2.5" /> Mặc định
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  return (
                    <>
                      {/* Group header row */}
                      <tr
                        key={`group-${group.id}`}
                        className="bg-slate-50/70 dark:bg-slate-800/50 border-b border-[var(--border)] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        onClick={() => toggleExpandGroup(group.id)}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            {group.label}
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({group.permissions.length})
                            </span>
                          </div>
                        </td>
                        {ROLES.map((r) => {
                          const state = groupGranted(r.id, group.id);
                          return (
                            <td key={r.id} className="px-3 py-2.5 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleGroup(r.id, group.id, state !== "all");
                                }}
                                disabled={r.id === "hrAdmin"}
                                className={cn(
                                  "w-6 h-6 rounded-md border-2 flex items-center justify-center mx-auto transition",
                                  r.id === "hrAdmin"
                                    ? "bg-blue-500 border-blue-500 cursor-not-allowed opacity-80"
                                    : state === "all"
                                    ? "bg-blue-500 border-blue-500 hover:bg-blue-600"
                                    : state === "some"
                                    ? "bg-blue-200 border-blue-400 dark:bg-blue-900/40 hover:bg-blue-300"
                                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-blue-400"
                                )}
                                title={state === "all" ? "Thu hồi tất cả" : "Cấp tất cả"}
                              >
                                {(state === "all" || r.id === "hrAdmin") && <Check className="w-3.5 h-3.5 text-white" />}
                                {state === "some" && r.id !== "hrAdmin" && <div className="w-2 h-0.5 bg-blue-600 dark:bg-blue-400 rounded" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Permission rows (expanded) */}
                      {isExpanded && group.permissions.map((perm) => (
                        <tr
                          key={perm.id}
                          className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                        >
                          <td className="pl-10 pr-4 py-2">
                            <div className="text-xs text-[var(--foreground)]">{perm.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{perm.id}</div>
                          </td>
                          {ROLES.map((r) => {
                            const granted = r.id === "hrAdmin" || config[r.id].includes(perm.id);
                            return (
                              <td key={r.id} className="px-3 py-2 text-center">
                                <button
                                  onClick={() => togglePermission(r.id, perm.id)}
                                  disabled={r.id === "hrAdmin"}
                                  className={cn(
                                    "w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition",
                                    r.id === "hrAdmin"
                                      ? "bg-blue-500 border-blue-500 cursor-not-allowed opacity-70"
                                      : granted
                                      ? "bg-blue-500 border-blue-500 hover:bg-blue-600"
                                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-blue-400"
                                  )}
                                >
                                  {granted && <Check className="w-3 h-3 text-white" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 2: Module / feature access ── */}
      {activeTab === "modules" && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 font-semibold text-[var(--foreground)] w-44">
                    Chức năng / Module
                  </th>
                  {ROLES.map((r) => (
                    <th key={r.id} className="px-3 py-3 text-center min-w-[100px]">
                      <div className={cn("font-bold text-sm", r.color)}>{r.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MODULES.map((mod) => (
                  <tr
                    key={mod.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--foreground)]">{mod.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{mod.requiredPermission}</div>
                    </td>
                    {ROLES.map((r) => {
                      const granted = r.id === "hrAdmin" || config[r.id].includes(mod.requiredPermission);
                      return (
                        <td key={r.id} className="px-3 py-3 text-center">
                          <button
                            onClick={() => toggleModuleAccess(r.id, mod.requiredPermission, !granted)}
                            disabled={r.id === "hrAdmin"}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition",
                              r.id === "hrAdmin"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 cursor-not-allowed opacity-80"
                                : granted
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                            )}
                          >
                            {granted
                              ? <><Check className="w-3 h-3" /> Có</>
                              : <><X className="w-3 h-3" /> Không</>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-[var(--border)]">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Bật/tắt ở đây sẽ thêm/xoá quyền cơ sở tương ứng (vd: bật Nhiệm vụ = thêm <code className="font-mono">task:read</code>).
              Để cấu hình chi tiết từng quyền con, dùng tab <strong>Phân quyền hệ thống</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ── Tab 3: Research context roles ── */}
      {activeTab === "context" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
            <Info className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700 dark:text-violet-300">
              Vai trò NCKH gắn với <strong>từng đề tài cụ thể</strong>, không phải toàn hệ thống.
              Một người có thể là Tác giả đề tài A, Phản biện đề tài B, Hội đồng đề tài C — cùng lúc.
              Quyền chỉ định được cấu hình qua tab <strong>Quyền hệ thống</strong> nhóm "Nghiên cứu khoa học".
            </p>
          </div>

          {[
            {
              role: "Tác giả (author)",
              color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
              who: "Chủ nhiệm đề tài — người đăng ký và chịu trách nhiệm chính",
              canDo: ["Xem toàn bộ tiến trình đề tài của mình", "Nộp báo cáo, đề cương", "Xem phiếu phản biện (sau khi kết thúc phản biện kín)"],
              assignedBy: "Tự đăng ký khi tạo đề tài",
              systemPerm: null,
            },
            {
              role: "Đồng tác giả (coAuthor)",
              color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
              who: "Tác giả phụ — cùng thực hiện nghiên cứu, được ghi nhận tín chỉ",
              canDo: ["Xem tiến trình đề tài", "Nộp tài liệu theo yêu cầu"],
              assignedBy: "Tác giả chính hoặc người có quyền research:addContributor",
              systemPerm: "research:addContributor",
            },
            {
              role: "Tham gia (participant)",
              color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
              who: "Thành viên hỗ trợ — được ghi nhận tham gia nhưng không phải tác giả",
              canDo: ["Xem tiến trình đề tài"],
              assignedBy: "Người có quyền research:addContributor",
              systemPerm: "research:addContributor",
            },
            {
              role: "Phản biện (reviewer)",
              color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
              who: "Thẩm định viên — đánh giá đề cương / kết quả theo phiếu 7 tiêu chí (phản biện kín)",
              canDo: ["Xem file đề cương được giao (không biết tác giả)", "Nộp phiếu nhận xét với điểm và kết luận"],
              assignedBy: "Người có quyền research:assignReviewer",
              systemPerm: "research:assignReviewer",
            },
            {
              role: "Hội đồng — Chủ tịch (chair)",
              color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
              who: "Chủ trì phiên họp Hội đồng KHCN, ký biên bản kết luận",
              canDo: ["Bỏ phiếu (họp online)", "Xem kết quả phiếu biểu quyết", "Ký biên bản họp"],
              assignedBy: "Người có quyền research:assignCouncil",
              systemPerm: "research:assignCouncil",
            },
            {
              role: "Hội đồng — Thành viên (member)",
              color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
              who: "Thành viên biểu quyết trong phiên họp Hội đồng KHCN",
              canDo: ["Bỏ phiếu Tán thành / Phản đối / Trắng (họp online)"],
              assignedBy: "Người có quyền research:assignCouncil",
              systemPerm: "research:assignCouncil",
            },
            {
              role: "Hội đồng — Thư ký (secretary)",
              color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
              who: "Ghi biên bản, tổng hợp kết quả phiên họp",
              canDo: ["Xem danh sách thành viên và biểu quyết", "Đính kèm biên bản họp"],
              assignedBy: "Người có quyền research:assignCouncil",
              systemPerm: "research:assignCouncil",
            },
          ].map(item => (
            <div key={item.role} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", item.color)}>
                    {item.role}
                  </span>
                </div>
                {item.systemPerm && (
                  <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded">
                    Cần quyền: {item.systemPerm}
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--foreground)]">{item.who}</p>
              <div className="space-y-0.5">
                {item.canDo.map((d, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                    {d}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-[var(--border)]">
                Được chỉ định bởi: {item.assignedBy}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 bg-blue-500 border-blue-500" />
          Có quyền
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 bg-blue-200 border-blue-400 dark:bg-blue-900/40 flex items-center justify-center">
            <div className="w-2 h-0.5 bg-blue-600 rounded" />
          </div>
          Có một số quyền trong nhóm
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600" />
          Không có quyền
        </div>
      </div>
    </div>
  );
}
