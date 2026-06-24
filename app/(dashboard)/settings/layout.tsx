"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Bell, Settings, ShieldCheck, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";

const TABS = [
  { href: "/settings/profile",       label: "Hồ sơ",      Icon: User        },
  { href: "/settings/security",      label: "Bảo mật",    Icon: KeyRound    },
  { href: "/settings/notifications", label: "Thông báo",  Icon: Bell        },
];

const ADMIN_TABS = [
  { href: "/settings/permissions",   label: "Phân quyền", Icon: ShieldCheck },
  { href: "/settings/system",        label: "Hệ thống",   Icon: Settings    },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser } = useAuthStore();
  const isAdmin = !!(currentUser && (hasPermission(currentUser.role, "*") || currentUser.role === "hrAdmin"));

  const tabs = isAdmin ? [...TABS, ...ADMIN_TABS] : TABS;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Sub-nav */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        {tabs.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center",
              pathname === href || pathname.startsWith(href)
                ? "bg-white dark:bg-slate-700 text-[var(--foreground)] shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-[var(--foreground)]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
