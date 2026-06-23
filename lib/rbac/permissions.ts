import type { UserRole } from "@/types";

// ─── Permission definitions ───────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  guest: [
    "task:read",
    "workflow:read",
    "calendar:read",
    "intranet:read",
    "document:read",
    "request:create",
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
    "finance:read",   // Thấy tab + thêm giao dịch/tạm ứng, KHÔNG duyệt
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
    "calendar:approve",
    "finance:read",
    "finance:approve",
    "finance:manage",
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
    "calendar:approve",
    "finance:read",
    "finance:approve",
    "finance:manage",
  ],
  hrAdmin: ["*"],
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
      { id: "user:read",   label: "Xem nhân viên" },
      { id: "user:manage", label: "Quản lý nhân viên" },
    ],
  },
  {
    id: "finance", label: "Tài chính",
    permissions: [
      { id: "finance:read",    label: "Xem tài chính" },
      { id: "finance:approve", label: "Duyệt giao dịch" },
      { id: "finance:manage",  label: "Quản lý tài chính" },
    ],
  },
  {
    id: "request", label: "Đơn từ",
    permissions: [
      { id: "request:create",  label: "Tạo đơn từ" },
      { id: "request:read",    label: "Xem đơn từ" },
      { id: "request:approve", label: "Duyệt đơn từ" },
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
    { type: "calendar_mini",      x: 2, y: 4, w: 2, h: 2 },
  ],
  director: [
    { type: "analytics_summary",  x: 0, y: 0, w: 3, h: 2 },
    { type: "financial_overview", x: 3, y: 0, w: 1, h: 2 },
    { type: "workload_heatmap",   x: 0, y: 2, w: 2, h: 2 },
    { type: "team_leaderboard",   x: 2, y: 2, w: 2, h: 2 },
    { type: "deadline_alert",     x: 0, y: 4, w: 2, h: 1 },
    { type: "calendar_mini",      x: 2, y: 4, w: 2, h: 1 },
  ],
  hrAdmin: [
    { type: "analytics_summary",  x: 0, y: 0, w: 3, h: 2 },
    { type: "financial_overview", x: 3, y: 0, w: 1, h: 2 },
    { type: "my_tasks",           x: 0, y: 2, w: 2, h: 2 },
    { type: "workload_heatmap",   x: 2, y: 2, w: 2, h: 2 },
    { type: "kpi_week",           x: 0, y: 4, w: 2, h: 1 },
    { type: "team_leaderboard",   x: 2, y: 4, w: 2, h: 2 },
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
  { label: "Lịch biểu", href: "/calendar", icon: "Calendar", requiredPermission: "calendar:read" },
  { label: "Đơn từ", href: "/requests", icon: "FileText", requiredPermission: "request:read" },
  { label: "Tài liệu", href: "/documents", icon: "FolderOpen", requiredPermission: "document:read" },
  { label: "Mạng nội bộ", href: "/intranet", icon: "Globe", requiredPermission: "intranet:read" },
  { label: "Hiệu suất", href: "/performance", icon: "TrendingUp", requiredPermission: "kpi:read" },
  { label: "Nhân viên", href: "/employees", icon: "Users", requiredPermission: "user:read" },
  { label: "Quy trình", href: "/workflow", icon: "GitBranch", requiredPermission: "task:read" },
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
