"use client";

import { cn, getInitials, avatarColor } from "@/lib/utils";

interface UserAvatarProps {
  user: { name: string; avatar?: string };
  size?: "xs" | "sm" | "md" | "lg";
  showName?: boolean;
  namePosition?: "right" | "below";
  className?: string;
}

const SIZE_MAP = {
  xs: "w-5 h-5 text-[9px]",
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

export function UserAvatar({ user, size = "sm", showName = false, namePosition = "right", className }: UserAvatarProps) {
  const avatar = (
    <div
      className={cn(
        "rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold text-white",
        SIZE_MAP[size],
        !user.avatar && avatarColor(user.name),
        className,
      )}
    >
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        getInitials(user.name)
      )}
    </div>
  );

  if (!showName) return avatar;

  return (
    <div className={cn("flex items-center gap-1.5", namePosition === "below" && "flex-col")}>
      {avatar}
      <span className="text-sm font-medium text-[var(--foreground)] truncate">{user.name}</span>
    </div>
  );
}
