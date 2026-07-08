import type { UserRole, User, ResearchTopic, ResearchContributorRole, CouncilMemberRole } from "@/types";

// ─── Permission definitions ───────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  guest: [
    "task:read",
    "workflow:read",
    "calendar:read",
    "intranet:read",
    "document:read",
    "request:create",
    "research:read",   // Chỉ xem đề tài của chính mình (lọc server-side)
    "research:create", // Đăng ký đề tài mới
  ],
  staff: [
    "task:read",
    "task:create",
    "task:updateProgress",
    "task:logTime",
    "task:comment",
    "task:uploadProof",
    "task:requestCompletion",
    "notification:read",
    "calendar:read",
    "calendar:createPersonal",
    "profile:edit",
    "evaluation:self",
    "kpi:read",
    "plan:read",
    "request:create",
    "request:read",
    "template:create",
    "document:read",
    "document:create",
    "intranet:read",
    "intranet:create",
    "intranet:comment",
    "workflow:read",
    "workflow:create",
    "research:read",
    "research:create",
    "finance:read",   // Thấy tab + thêm giao dịch/tạm ứng, KHÔNG duyệt
    "trial:read",     // Chỉ xem TNLS mà mình là PI/điều phối (lọc server-side)
  ],
  teamLead: [
    "task:read",
    "task:create",
    "task:assign",
    "task:approve",
    "task:updateProgress",
    "task:logTime",
    "task:comment",
    "task:uploadProof",
    "task:evaluate",
    "task:changeDeadline",
    "task:delete",
    "kpi:read",
    "kpi:evaluate",
    "user:read",
    "calendar:read",
    "calendar:createPersonal",
    "calendar:approveChange",
    "notification:read",
    "notification:manage",
    "profile:edit",
    "evaluation:self",
    "evaluation:team",
    "report:read",
    "request:create",
    "request:read",
    "plan:read",
    "plan:manage",
    "request:approve",
    "template:create",
    "template:approve",
    "document:read",
    "document:create",
    "document:manage",
    "document:approve",
    "intranet:read",
    "intranet:create",
    "intranet:post",
    "intranet:approve",
    "intranet:comment",
    "workflow:read",
    "workflow:create",
    "workflow:approve",
    "research:read",
    "research:create",
    "research:monitor",
    "research:assignReviewer",   // Trưởng đơn vị có thể chỉ định phản biện
    "research:assignCouncil",    // Trưởng đơn vị có thể thành lập hội đồng
    "research:addContributor",   // Trưởng đơn vị có thể thêm thành viên đề tài
    "calendar:approve",
    "finance:read",
    "finance:approve",
    "finance:manage",
    "trial:read",
    "trial:create",
    "trial:manage",
  ],
  director: [
    "task:read",
    "task:create",
    "task:assign",
    "task:approve",
    "task:updateProgress",
    "task:logTime",
    "task:comment",
    "task:uploadProof",
    "task:evaluate",
    "task:changeDeadline",
    "task:delete",
    "kpi:read",
    "kpi:evaluate",
    "kpi:manage",
    "user:read",
    "calendar:read",
    "calendar:createPersonal",
    "calendar:approveChange",
    "calendar:approveLevel2",
    "notification:read",
    "notification:manage",
    "profile:edit",
    "evaluation:self",
    "evaluation:team",
    "evaluation:company",
    "analytics:read",
    "report:read",
    "report:export",
    "report:schedule",
    "approval:level2",
    "request:create",
    "request:read",
    "plan:read",
    "plan:manage",
    "request:approve",
    "template:create",
    "template:approve",
    "document:read",
    "document:create",
    "document:manage",
    "document:approve",
    "intranet:read",
    "intranet:create",
    "intranet:post",
    "intranet:approve",
    "intranet:manage",
    "intranet:comment",
    "workflow:read",
    "workflow:create",
    "workflow:approve",
    "research:read",
    "research:create",
    "research:monitor",
    "research:assignReviewer",
    "research:assignCouncil",
    "research:addContributor",
    "research:manage",
    "calendar:approve",
    "finance:read",
    "finance:approve",
    "finance:manage",
    "trial:read",
    "trial:create",
    "trial:manage",
  ],
  hrAdmin: ["*"],

  // ── Vai trò chuyên trách tài chính ──
  // Theo dõi: chỉ xem toàn bộ tài chính + phân tích, không sửa/duyệt
  financeViewer: [
    "task:read",
    "calendar:read",
    "notification:read",
    "profile:edit",
    "finance:read",
    "analytics:read",
    "report:read",
  ],
  // Kiểm tra: xem + đối soát/đánh dấu kiểm tra + xuất báo cáo, không duyệt chi
  financeAuditor: [
    "task:read",
    "calendar:read",
    "notification:read",
    "profile:edit",
    "finance:read",
    "finance:audit",
    "analytics:read",
    "report:read",
    "report:export",
  ],
  // Giám sát: xem + kiểm tra + duyệt giao dịch + quản lý tài chính
  financeSupervisor: [
    "task:read",
    "calendar:read",
    "notification:read",
    "notification:manage",
    "profile:edit",
    "finance:read",
    "finance:audit",
    "finance:approve",
    "finance:manage",
    "analytics:read",
    "report:read",
    "report:export",
    "approval:level2",
  ],
};

// ─── Runtime overrides (loaded from Firestore at startup) ─────
// Replaces the default for a given role when set.
let _permOverrides: Partial<Record<UserRole, string[]>> | null = null;

export function applyPermissionOverrides(overrides: Partial<Record<UserRole, string[]>>) {
  _permOverrides = overrides;
}

export function hasPermission(role: UserRole, action: string): boolean {
  const perms = (_permOverrides?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role]);
  if (!perms) return false;
  if (perms.includes("*")) return true;

  const [domain] = action.split(":");
  return perms.includes(action) || perms.includes(`${domain}:*`);
}

export function getRolePermissions(role: UserRole): string[] {
  return (_permOverrides?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role]) ?? [];
}

// ─── Cấp bậc vai trò (để giới hạn giao việc) ──────────────────
// Quy tắc: chỉ giao cho người CÙNG CẤP hoặc THẤP HƠN, không giao cho cấp trên.

export const ROLE_RANK: Record<UserRole, number> = {
  guest: 0,
  staff: 1,
  financeViewer: 1,
  financeAuditor: 1,
  teamLead: 2,
  financeSupervisor: 2,
  director: 3,
  hrAdmin: 4,
};

/** Người giao (actor) chỉ được giao cho người có cấp ≤ cấp của mình. */
export function canAssignTo(actorRole: UserRole, targetRole: UserRole): boolean {
  return (ROLE_RANK[targetRole] ?? 0) <= (ROLE_RANK[actorRole] ?? 0);
}

// ─── Permission groups for management UI ─────────────────────

export interface PermissionDef {
  id: string;
  label: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "task", label: "Nhiệm vụ",
    permissions: [
      { id: "task:read",              label: "Xem nhiệm vụ" },
      { id: "task:create",            label: "Tạo nhiệm vụ" },
      { id: "task:assign",            label: "Phân công" },
      { id: "task:approve",           label: "Phê duyệt nhiệm vụ" },
      { id: "task:updateProgress",    label: "Cập nhật tiến độ" },
      { id: "task:logTime",           label: "Ghi giờ công" },
      { id: "task:comment",           label: "Bình luận" },
      { id: "task:uploadProof",       label: "Đính kèm minh chứng" },
      { id: "task:requestCompletion", label: "Đề xuất kết thúc" },
      { id: "task:evaluate",          label: "Đánh giá nhiệm vụ" },
      { id: "task:changeDeadline",    label: "Thay đổi deadline" },
      { id: "task:delete",            label: "Xoá nhiệm vụ" },
    ],
  },
  {
    id: "evaluation", label: "Đánh giá",
    permissions: [
      { id: "evaluation:self",    label: "Tự đánh giá" },
      { id: "evaluation:team",    label: "Đánh giá nhóm" },
      { id: "evaluation:company", label: "Đánh giá toàn công ty" },
    ],
  },
  {
    id: "kpi", label: "KPI / Hiệu suất",
    permissions: [
      { id: "kpi:read",     label: "Xem KPI" },
      { id: "kpi:evaluate", label: "Đánh giá KPI" },
      { id: "kpi:manage",   label: "Quản lý KPI" },
    ],
  },
  {
    id: "user", label: "Nhân viên",
    permissions: [
      { id: "user:read",               label: "Xem nhân viên" },
      { id: "user:manage",             label: "Quản lý nhân viên (vai trò, phòng ban, chức vụ)" },
      { id: "user:create",             label: "Tạo/Import nhân viên mới" },
      { id: "user:manageContract",     label: "Quản lý hồ sơ hợp đồng" },
      { id: "user:manageCredentials",  label: "Quản lý chứng chỉ/bằng cấp" },
      { id: "user:merge",              label: "Gộp nhân viên trùng lặp" },
    ],
  },
  {
    id: "finance", label: "Tài chính",
    permissions: [
      { id: "finance:read",    label: "Xem tài chính" },
      { id: "finance:audit",   label: "Kiểm tra / đối soát" },
      { id: "finance:approve", label: "Duyệt giao dịch" },
      { id: "finance:manage",  label: "Quản lý tài chính" },
    ],
  },
  {
    id: "request", label: "Đơn từ",
    permissions: [
      { id: "request:create",    label: "Tạo đơn từ" },
      { id: "request:read",      label: "Xem đơn từ" },
      { id: "request:approve",   label: "Duyệt đơn từ (thường: nghỉ phép, tăng ca...)" },
      { id: "request:approveHR", label: "Duyệt đơn nhân sự (nghỉ việc, thay đổi thông tin)" },
    ],
  },
  {
    id: "document", label: "Tài liệu",
    permissions: [
      { id: "document:read",    label: "Xem tài liệu" },
      { id: "document:create",  label: "Tạo tài liệu" },
      { id: "document:manage",  label: "Quản lý tài liệu" },
      { id: "document:approve", label: "Duyệt tài liệu" },
    ],
  },
  {
    id: "intranet", label: "Mạng nội bộ",
    permissions: [
      { id: "intranet:read",    label: "Xem mạng nội bộ" },
      { id: "intranet:create",  label: "Tạo nội dung" },
      { id: "intranet:post",    label: "Đăng bài" },
      { id: "intranet:comment", label: "Bình luận" },
      { id: "intranet:approve", label: "Duyệt nội dung" },
      { id: "intranet:manage",  label: "Quản lý mạng nội bộ" },
    ],
  },
  {
    id: "calendar", label: "Lịch biểu",
    permissions: [
      { id: "calendar:read",           label: "Xem lịch" },
      { id: "calendar:createPersonal", label: "Tạo lịch cá nhân" },
      { id: "calendar:approveChange",  label: "Duyệt thay đổi lịch" },
      { id: "calendar:approveLevel2",  label: "Duyệt cấp 2" },
    ],
  },
  {
    id: "workflow", label: "Quy trình",
    permissions: [
      { id: "workflow:read",    label: "Xem quy trình" },
      { id: "workflow:create",  label: "Tạo quy trình" },
      { id: "workflow:approve", label: "Duyệt quy trình" },
    ],
  },
  {
    id: "research", label: "Nghiên cứu khoa học",
    permissions: [
      { id: "research:read",             label: "Xem đề tài (chỉ của mình)" },
      { id: "research:create",           label: "Đăng ký đề tài mới" },
      { id: "research:monitor",          label: "Giám sát & tiếp nhận đề cương" },
      { id: "research:assignReviewer",   label: "Chỉ định phản biện kín" },
      { id: "research:assignCouncil",    label: "Thành lập Hội đồng KHCN" },
      { id: "research:addContributor",   label: "Thêm tác giả / thành viên đề tài" },
      { id: "research:manage",           label: "Quản trị toàn bộ NCKH (chứng nhận, từ chối)" },
    ],
  },
  {
    id: "trial", label: "Thử nghiệm lâm sàng",
    permissions: [
      { id: "trial:read",   label: "Xem TNLS (chỉ của mình)" },
      { id: "trial:create", label: "Đăng ký TNLS mới" },
      { id: "trial:manage", label: "Quản trị toàn bộ TNLS" },
    ],
  },
  {
    id: "analytics", label: "Phân tích & Báo cáo",
    permissions: [
      { id: "analytics:read",    label: "Xem phân tích" },
      { id: "report:read",       label: "Xem báo cáo" },
      { id: "report:export",     label: "Xuất báo cáo" },
      { id: "report:schedule",   label: "Lên lịch báo cáo" },
    ],
  },
  {
    id: "notification", label: "Thông báo",
    permissions: [
      { id: "notification:read",   label: "Nhận thông báo" },
      { id: "notification:manage", label: "Quản lý thông báo" },
    ],
  },
  {
    id: "template", label: "Biểu mẫu",
    permissions: [
      { id: "template:create",  label: "Tạo biểu mẫu" },
      { id: "template:approve", label: "Duyệt biểu mẫu" },
    ],
  },
  {
    id: "plan", label: "Kế hoạch đơn vị",
    permissions: [
      { id: "plan:read",   label: "Xem kế hoạch" },
      { id: "plan:manage", label: "Quản lý kế hoạch" },
    ],
  },
  {
    id: "system", label: "Hệ thống",
    permissions: [
      { id: "system:auditRead", label: "Xem nhật ký hệ thống" },
    ],
  },
];

// ─── Feature modules for module-access tab ────────────────────

export interface FeatureModule {
  id: string;
  label: string;
  href: string;
  requiredPermission: string;
}

export const FEATURE_MODULES: FeatureModule[] = [
  { id: "tasks",        label: "Nhiệm vụ",      href: "/tasks",       requiredPermission: "task:read" },
  { id: "calendar",     label: "Lịch biểu",     href: "/calendar",    requiredPermission: "calendar:read" },
  { id: "requests",     label: "Đơn từ",         href: "/requests",    requiredPermission: "request:read" },
  { id: "documents",    label: "Tài liệu",       href: "/documents",   requiredPermission: "document:read" },
  { id: "intranet",     label: "Mạng nội bộ",   href: "/intranet",    requiredPermission: "intranet:read" },
  { id: "performance",  label: "Hiệu suất",      href: "/performance", requiredPermission: "kpi:read" },
  { id: "employees",    label: "Nhân viên",      href: "/employees",   requiredPermission: "user:read" },
  { id: "workflow",     label: "Quy trình",      href: "/workflow",    requiredPermission: "task:read" },
  { id: "finance",      label: "Tài chính",      href: "/finance",     requiredPermission: "finance:read" },
  { id: "clinicalTrials", label: "Thử nghiệm LS", href: "/clinical-trials", requiredPermission: "trial:read" },
  { id: "analytics",    label: "Phân tích",      href: "/analytics",   requiredPermission: "analytics:read" },
  { id: "notifications",label: "Thông báo",      href: "/notifications",requiredPermission: "notification:read" },
];

// ─── Dashboard default widget layouts per role ────────────────

export type DefaultWidgetLayout = {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const DEFAULT_DASHBOARD_LAYOUTS: Record<UserRole, DefaultWidgetLayout[]> = {
  guest: [
    { type: "my_tasks", x: 0, y: 0, w: 3, h: 2 },
  ],
  staff: [
    { type: "my_tasks",          x: 0, y: 0, w: 3, h: 2 },
    { type: "deadline_alert",    x: 3, y: 0, w: 1, h: 2 },
    { type: "support_tasks",     x: 0, y: 2, w: 3, h: 2 },
    { type: "kpi_week",          x: 3, y: 2, w: 1, h: 2 },
    { type: "internal_messages", x: 0, y: 4, w: 2, h: 1 },
    { type: "calendar_mini",     x: 2, y: 4, w: 2, h: 1 },
  ],
  teamLead: [
    { type: "my_tasks",           x: 0, y: 0, w: 2, h: 2 },
    { type: "support_tasks",      x: 2, y: 0, w: 2, h: 2 },
    { type: "workload_heatmap",   x: 0, y: 2, w: 2, h: 2 },
    { type: "financial_overview", x: 2, y: 2, w: 1, h: 2 },
    { type: "deadline_alert",     x: 3, y: 2, w: 1, h: 2 },
    { type: "team_leaderboard",   x: 0, y: 4, w: 2, h: 2 },
    { type: "calendar_mini",      x: 2, y: 4, w: 1, h: 2 },
    { type: "research_summary",   x: 3, y: 4, w: 1, h: 2 },
  ],
  director: [
    { type: "analytics_summary",  x: 0, y: 0, w: 3, h: 2 },
    { type: "financial_overview", x: 3, y: 0, w: 1, h: 2 },
    { type: "workload_heatmap",   x: 0, y: 2, w: 2, h: 2 },
    { type: "team_leaderboard",   x: 2, y: 2, w: 1, h: 2 },
    { type: "research_summary",   x: 3, y: 2, w: 1, h: 2 },
    { type: "deadline_alert",     x: 0, y: 4, w: 2, h: 1 },
    { type: "calendar_mini",      x: 2, y: 4, w: 2, h: 1 },
  ],
  hrAdmin: [
    { type: "analytics_summary",  x: 0, y: 0, w: 3, h: 2 },
    { type: "financial_overview", x: 3, y: 0, w: 1, h: 2 },
    { type: "my_tasks",           x: 0, y: 2, w: 2, h: 2 },
    { type: "workload_heatmap",   x: 2, y: 2, w: 1, h: 2 },
    { type: "research_summary",   x: 3, y: 2, w: 1, h: 2 },
    { type: "kpi_week",           x: 0, y: 4, w: 2, h: 1 },
    { type: "team_leaderboard",   x: 2, y: 4, w: 2, h: 2 },
  ],
  financeViewer: [
    { type: "financial_overview", x: 0, y: 0, w: 2, h: 2 },
    { type: "analytics_summary",  x: 2, y: 0, w: 2, h: 2 },
    { type: "calendar_mini",      x: 0, y: 2, w: 2, h: 1 },
  ],
  financeAuditor: [
    { type: "financial_overview", x: 0, y: 0, w: 2, h: 2 },
    { type: "analytics_summary",  x: 2, y: 0, w: 2, h: 2 },
    { type: "deadline_alert",     x: 0, y: 2, w: 1, h: 2 },
    { type: "calendar_mini",      x: 1, y: 2, w: 3, h: 1 },
  ],
  financeSupervisor: [
    { type: "analytics_summary",  x: 0, y: 0, w: 3, h: 2 },
    { type: "financial_overview", x: 3, y: 0, w: 1, h: 2 },
    { type: "deadline_alert",     x: 0, y: 2, w: 1, h: 2 },
    { type: "calendar_mini",      x: 1, y: 2, w: 3, h: 2 },
  ],
};

// ─── Sidebar navigation items per role ────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  requiredPermission?: string;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Nhiệm vụ", href: "/tasks", icon: "CheckSquare", requiredPermission: "task:read" },
  { label: "Kế hoạch", href: "/unit-plans", icon: "ClipboardList", requiredPermission: "plan:read" },
  { label: "Lịch biểu", href: "/calendar", icon: "Calendar", requiredPermission: "calendar:read" },
  { label: "Đơn từ", href: "/requests", icon: "FileText", requiredPermission: "request:read" },
  { label: "Tài liệu", href: "/documents", icon: "FolderOpen", requiredPermission: "document:read" },
  { label: "Mạng nội bộ", href: "/intranet", icon: "Globe", requiredPermission: "intranet:read" },
  { label: "Hiệu suất", href: "/performance", icon: "TrendingUp", requiredPermission: "kpi:read" },
  { label: "Nhân viên", href: "/employees", icon: "Users", requiredPermission: "user:read" },
  { label: "Quy trình", href: "/workflow", icon: "GitBranch", requiredPermission: "task:read" },
  { label: "Nghiên cứu KH", href: "/research", icon: "Microscope", requiredPermission: "research:read" },
  { label: "Thử nghiệm LS", href: "/clinical-trials", icon: "FlaskConical", requiredPermission: "trial:read" },
  { label: "Tài chính", href: "/finance", icon: "DollarSign", requiredPermission: "finance:read" },
  { label: "Phân tích", href: "/analytics", icon: "BarChart3", requiredPermission: "analytics:read" },
  { label: "Thông báo", href: "/notifications", icon: "Bell", requiredPermission: "notification:read" },
  { label: "Cài đặt", href: "/settings/profile", icon: "Settings" },
];

export function getVisibleNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.requiredPermission || hasPermission(role, item.requiredPermission)
  );
}

// ─── Kiêm nhiệm — effective role & scope helpers ──────────────

/**
 * Trả về role cao nhất của user (xét cả positions[]).
 * Dùng khi cần check quyền hệ thống toàn cơ quan.
 */
export function getEffectiveRole(user: Pick<User, "role" | "positions">): UserRole {
  if (!user.positions?.length) return user.role;
  const allRoles = [user.role, ...user.positions.map(p => p.role)];
  return allRoles.reduce<UserRole>((best, r) =>
    (ROLE_RANK[r] ?? 0) > (ROLE_RANK[best] ?? 0) ? r : best
  , user.role);
}

/**
 * Kiểm tra user có quyền quản lý đơn vị cụ thể không (theo ID).
 * director/hrAdmin luôn trả về true (toàn cơ quan).
 */
export function canManageUnit(user: Pick<User, "role" | "positions">, unitId: string): boolean {
  const effective = getEffectiveRole(user);
  if (ROLE_RANK[effective] >= ROLE_RANK.director) return true;
  if (!user.positions?.length) return false;
  return user.positions.some(p => p.scopeUnitId === unitId);
}

/**
 * Kiểm tra user có quyền quản lý đơn vị theo tên (department string).
 * Dùng cho ResearchTopic.department vì chưa có unitId chuẩn hoá.
 * director/hrAdmin luôn trả về true.
 * teamLead không có positions[] cũng trả về true (chưa cấu hình scope → không giới hạn).
 */
export function canManageDepartment(
  user: Pick<User, "role" | "positions">,
  department: string | undefined
): boolean {
  const effective = getEffectiveRole(user);
  if (ROLE_RANK[effective] >= ROLE_RANK.director) return true;
  if (!department) return true; // topic chưa gán đơn vị → ai quản lý cũng được xem
  if (!user.positions?.length) return true; // chưa cấu hình scope → không giới hạn
  return user.positions.some(
    p => p.unitName?.trim().toLowerCase() === department.trim().toLowerCase()
  );
}

/**
 * Kiểm tra user có quyền thực hiện action trên đề tài thuộc department cụ thể.
 * Kết hợp: có quyền hệ thống + thuộc đơn vị quản lý.
 */
export function canDoResearchAction(
  user: Pick<User, "role" | "positions">,
  action: string,
  department: string | undefined
): boolean {
  if (!hasPermission(getEffectiveRole(user), action)) return false;
  return canManageDepartment(user, department);
}

/**
 * Kiểm tra user có permission, xét cả positions[] (lấy role cao nhất).
 */
export function hasPermissionForUser(user: Pick<User, "role" | "positions">, action: string): boolean {
  return hasPermission(getEffectiveRole(user), action);
}

/**
 * Chỉ định phản biện kín: chỉ Trưởng VP (Văn phòng) hoặc Director/hrAdmin.
 * teamLead thuộc đơn vị khác KHÔNG được phép, dù có permission research:assignReviewer.
 */
export function canUserAssignReviewer(
  user: Pick<User, "role" | "positions">,
  department?: string
): boolean {
  const role = getEffectiveRole(user);
  if (ROLE_RANK[role] >= ROLE_RANK.director) return true;
  if (role !== "teamLead") return false;
  if (!hasPermission(role, "research:assignReviewer")) return false;
  // Phải có ít nhất một vị trí thuộc đơn vị Văn phòng (VP)
  const isVPHead = user.positions?.some(p => {
    const unit = p.unitName?.trim().toLowerCase() ?? "";
    return unit === "vp" || unit.includes("văn phòng");
  }) ?? false;
  if (!isVPHead) return false;
  return canManageDepartment(user, department);
}

// ─── Research context roles ───────────────────────────────────

/**
 * Kiểm tra user có vai trò đóng góp trong đề tài không
 * (tác giả / đồng tác giả / tham gia).
 */
export function getResearchContributorRole(
  user: Pick<User, "id">,
  topic: Pick<ResearchTopic, "principalInvestigatorId" | "contributors" | "memberIds">
): ResearchContributorRole | null {
  if (topic.principalInvestigatorId === user.id) return "author";
  const fromContributors = topic.contributors?.find(c => c.userId === user.id);
  if (fromContributors) return fromContributors.role;
  if (topic.memberIds?.includes(user.id)) return "participant"; // legacy fallback
  return null;
}

/**
 * Kiểm tra user có phải phản biện của đề tài không (bất kỳ giai đoạn).
 */
export function isReviewerOf(
  userId: string,
  topic: Pick<ResearchTopic, "reviews">
): boolean {
  return topic.reviews.some(r => r.reviewerId === userId);
}

/**
 * Kiểm tra user có thuộc hội đồng KHCN của đề tài không.
 * Trả về vai trò hội đồng nếu có.
 */
export function getCouncilRole(
  userId: string,
  topic: Pick<ResearchTopic, "councilSessions">
): CouncilMemberRole | null {
  for (const session of topic.councilSessions) {
    if (session.members) {
      const m = session.members.find(m => m.userId === userId);
      if (m) return m.role;
    } else if (session.memberIds?.includes(userId)) {
      return "member"; // legacy fallback
    }
  }
  return null;
}
