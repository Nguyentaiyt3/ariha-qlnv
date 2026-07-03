"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, CheckSquare, Calendar, TrendingUp, Users,
  GitBranch, BarChart3, Bell, Settings, LogOut, Building2,
  ChevronLeft, ChevronRight, X, FileText, FolderOpen, Globe, DollarSign,
  ClipboardList, Microscope, FlaskConical,
} from "lucide-react";
import { cn, getInitials, avatarColor, roleLabel } from "@/lib/utils";
import { getVisibleNavItems } from "@/lib/rbac/permissions";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { logout } from "@/lib/firebase/auth";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, CheckSquare, Calendar, TrendingUp, Users,
  GitBranch, BarChart3, Bell, Settings, FileText, FolderOpen, Globe, DollarSign,
  ClipboardList, Microscope, FlaskConical,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, isMobileOpen, onMobileClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout: storeLogout } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  async function handleLogout() {
    try {
      await logout();
      storeLogout();
      router.push("/login");
    } catch {
      toast.error("Đăng xuất thất bại.");
    }
  }

  if (!currentUser) return null;

  const navItems = getVisibleNavItems(currentUser.role);

  const sidebarContent = (
    <div className={cn(
      "h-full flex flex-col bg-slate-900 text-white transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">ARiHA WorkHub</p>
              <p className="text-[10px] text-slate-400 truncate">v2.0</p>
            </div>
          )}
        </div>
        {/* Mobile close */}
        <button onClick={onMobileClose} className="lg:hidden text-slate-400 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
        {/* Desktop collapse */}
        <button
          onClick={onToggle}
          className="hidden lg:flex text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-700"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = pathname.startsWith(item.href);
          const showBadge = item.href === "/notifications" && unreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
              title={collapsed ? item.label : undefined}
            >
              {Icon && (
                <div className="relative shrink-0">
                  <Icon className="w-5 h-5" />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
              )}
              {!collapsed && <span className="truncate">{item.label}</span>}

              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="border-t border-slate-700/50 p-3 space-y-2">
        <div className={cn("flex items-center gap-3 px-2 py-2 rounded-xl", collapsed && "justify-center")}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
            avatarColor(currentUser.name)
          )}>
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              getInitials(currentUser.name)
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{roleLabel(currentUser.role)}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition",
            collapsed && "justify-center"
          )}
          title={collapsed ? "Đăng xuất" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={onMobileClose} />
          <aside className="relative z-10 h-full">
            {/* Force full width on mobile */}
            <div className="h-full flex flex-col bg-slate-900 text-white w-64">
              {sidebarContent}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
