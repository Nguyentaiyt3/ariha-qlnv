import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isAfter, isBefore, addDays, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, pattern = "dd/MM/yyyy") {
  return format(new Date(date), pattern, { locale: vi });
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), "HH:mm dd/MM/yyyy", { locale: vi });
}

export function formatRelativeTime(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: vi });
}

export function isOverdue(deadline: string) {
  return isBefore(new Date(deadline), new Date());
}

export function isNearDeadline(deadline: string, daysThreshold = 2) {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const threshold = addDays(now, daysThreshold);
  return isAfter(deadlineDate, now) && isBefore(deadlineDate, threshold);
}

export function daysUntilDeadline(deadline: string) {
  return differenceInDays(new Date(deadline), new Date());
}

export function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

export function truncate(str: string, length = 80) {
  return str.length > length ? str.slice(0, length) + "..." : str;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function avatarColor(name: string) {
  const colors = [
    "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
    "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500",
    "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500",
    "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return colors[hash % colors.length];
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    todo: "Chờ thực hiện",
    in_progress: "Đang thực hiện",
    review: "Đang xét duyệt",
    done: "Hoàn thành",
    cancelled: "Đã hủy",
  };
  return labels[status] ?? status;
}

export function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    low: "Thấp",
    medium: "Trung bình",
    high: "Cao",
    urgent: "Khẩn cấp",
  };
  return labels[priority] ?? priority;
}

export function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    prepare: "Chuẩn bị",
    execute: "Tổ chức thực hiện",
    finalize: "Hoàn thiện hồ sơ",
  };
  return labels[phase] ?? phase;
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    guest: "Khách",
    staff: "Nhân viên",
    teamLead: "Trưởng nhóm",
    director: "Giám đốc",
    hrAdmin: "HR/Admin",
  };
  return labels[role] ?? role;
}

export function stakeholderRoleLabel(role: string) {
  const labels: Record<string, string> = {
    assignee: "Người thực hiện",
    collaborator: "Hỗ trợ",
    watcher: "Theo dõi",
    approver: "Phê duyệt",
  };
  return labels[role] ?? role;
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms = 300) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const group = String(item[key]);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Task visibility — managers see all; others only see tasks they participate in
export function isTaskVisible(
  task: { creatorId: string; mainPerformerId: string; stakeholders?: { userId: string }[]; steps?: { assigneeId: string; subTasks?: { userId: string }[] }[] },
  userId: string,
  role: string,
): boolean {
  if (["teamLead", "director", "hrAdmin"].includes(role)) return true;
  if (task.creatorId === userId) return true;
  if (task.mainPerformerId === userId) return true;
  if ((task.stakeholders ?? []).some((s) => s.userId === userId)) return true;
  if ((task.steps ?? []).some((s) =>
    s.assigneeId === userId ||
    (s.subTasks ?? []).some((st) => st.userId === userId)
  )) return true;
  return false;
}
