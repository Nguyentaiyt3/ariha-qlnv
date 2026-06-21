import type { UserRole } from "@/types";

// ─── Permission definitions ───────────────────────────────────

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
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
    "intranet:comment",
    "workflow:read",
    "workflow:create",
    "workflow:approve",
    "calendar:approve",
  ],
  hrAdmin: ["*"],
};

export function hasPermission(role: UserRole, action: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes("*")) return true;

  // Support wildcard e.g. "task:*" grants all task:xxx actions
  const [domain] = action.split(":");
  return perms.includes(action) || perms.includes(`${domain}:*`);
}

export function getRolePermissions(role: UserRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

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
    { type: "my_tasks",          x: 0, y: 0, w: 2, h: 2 },
    { type: "support_tasks",     x: 2, y: 0, w: 2, h: 2 },
    { type: "workload_heatmap",  x: 0, y: 2, w: 2, h: 2 },
    { type: "kpi_week",          x: 2, y: 2, w: 1, h: 2 },
    { type: "deadline_alert",    x: 3, y: 2, w: 1, h: 2 },
    { type: "team_leaderboard",  x: 0, y: 4, w: 2, h: 2 },
    { type: "calendar_mini",     x: 2, y: 4, w: 2, h: 2 },
  ],
  director: [
    { type: "analytics_summary", x: 0, y: 0, w: 4, h: 2 },
    { type: "workload_heatmap",  x: 0, y: 2, w: 2, h: 2 },
    { type: "team_leaderboard",  x: 2, y: 2, w: 2, h: 2 },
    { type: "deadline_alert",    x: 0, y: 4, w: 2, h: 1 },
    { type: "calendar_mini",     x: 2, y: 4, w: 2, h: 1 },
  ],
  hrAdmin: [
    { type: "analytics_summary", x: 0, y: 0, w: 4, h: 2 },
    { type: "my_tasks",          x: 0, y: 2, w: 2, h: 2 },
    { type: "workload_heatmap",  x: 2, y: 2, w: 2, h: 2 },
    { type: "kpi_week",          x: 0, y: 4, w: 2, h: 1 },
    { type: "team_leaderboard",  x: 2, y: 4, w: 2, h: 2 },
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
  { label: "Phân tích", href: "/analytics", icon: "BarChart3", requiredPermission: "analytics:read" },
  { label: "Thông báo", href: "/notifications", icon: "Bell", requiredPermission: "notification:read" },
  { label: "Cài đặt", href: "/settings/profile", icon: "Settings" },
];

export function getVisibleNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.requiredPermission || hasPermission(role, item.requiredPermission)
  );
}
