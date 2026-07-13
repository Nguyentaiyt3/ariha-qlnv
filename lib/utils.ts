import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isAfter, isBefore, addDays, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { sameUnit, isFullAccessRole } from "@/lib/rbac/scope";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, pattern = "dd/MM/yyyy") {
  return format(new Date(date), pattern, { locale: vi });
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), "HH:mm dd/MM/yyyy", { locale: vi });
}

/** Số ngày tới hạn (âm = đã qua hạn). null nếu không có ngày hoặc ngày không hợp lệ. */
export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return differenceInDays(d, new Date());
}

/** Cảnh báo hợp đồng nhân viên: đã hết hạn, hoặc còn ≤30 ngày. Dùng chung cho trang danh sách + hồ sơ. */
export function contractAlert(contractEnd?: string): { label: string; days: number; cls: string } | null {
  const days = daysUntil(contractEnd);
  if (days === null) return null;
  if (days < 0) {
    return { label: `Hết hạn HĐ ${Math.abs(days)} ngày trước`, days, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  }
  if (days <= 30) {
    return { label: `Sắp hết hạn HĐ — còn ${days} ngày`, days, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  }
  return null;
}

/** Cảnh báo hết hạn chứng chỉ/bằng cấp — cùng ngưỡng 30 ngày với hợp đồng, dùng chung màu sắc. */
export function credentialAlert(expiryDate?: string): { label: string; days: number; cls: string } | null {
  const days = daysUntil(expiryDate);
  if (days === null) return null;
  if (days < 0) {
    return { label: `Hết hạn ${Math.abs(days)} ngày trước`, days, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  }
  if (days <= 30) {
    return { label: `Còn ${days} ngày`, days, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  }
  return null;
}

/**
 * Format period string (month/year or year-month or day-month-year) to dd/mm/yy
 * Input: "3/2024" → "01/03/24", "2024-03-15" → "15/03/24"
 * Defaults day to 1 if missing
 */
export function formatPeriodDDMMYY(periodStr?: string): string {
  if (!periodStr) return "";

  const parts = periodStr.trim().split(/[/-]/).map(p => p.trim()).filter(p => p);

  let day = 1;
  let month = 1;
  let year = new Date().getFullYear();

  if (parts.length === 2) {
    const first = parseInt(parts[0]);
    const second = parseInt(parts[1]);
    if (first > 31) {
      // year-month format (2024-03)
      year = first;
      month = second;
    } else {
      // month/year format (3/2024)
      month = first;
      year = second;
    }
  } else if (parts.length === 3) {
    const first = parseInt(parts[0]);
    if (first > 31) {
      // year-month-day format
      year = first;
      month = parseInt(parts[1]);
      day = parseInt(parts[2]);
    } else {
      // day-month-year format
      day = first;
      month = parseInt(parts[1]);
      year = parseInt(parts[2]);
    }
  } else if (parts.length === 1) {
    year = parseInt(parts[0]);
  }

  // Validate
  if (isNaN(day) || isNaN(month) || isNaN(year)) return periodStr;
  if (month < 1 || month > 12) return periodStr;
  if (day < 1 || day > 31) return periodStr;

  // Format: dd/mm/yy
  const dayStr = String(day).padStart(2, "0");
  const monthStr = String(month).padStart(2, "0");
  const yearStr = String(year % 100).padStart(2, "0");

  return `${dayStr}/${monthStr}/${yearStr}`;
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
    financeViewer: "Theo dõi tài chính",
    financeAuditor: "Kiểm tra tài chính",
    financeSupervisor: "Giám sát tài chính",
  };
  return labels[role] ?? role;
}

export function stakeholderRoleLabel(role: string) {
  const labels: Record<string, string> = {
    assignee: "Người thực hiện",
    collaborator: "Hỗ trợ",
    watcher: "Theo dõi",
    approver: "Phê duyệt",
    supervisor: "Giám sát",
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

// Task visibility — director/hrAdmin see all; teamLead sees own-unit tasks + tasks they
// participate in; others only see tasks they participate in.
export function isTaskVisible(
  task: { creatorId: string; mainPerformerId: string; department?: string; stakeholders?: { userId: string }[]; steps?: { assigneeId: string; subTasks?: { userId: string }[] }[] },
  userId: string,
  role: string,
  department?: string,
): boolean {
  if (isFullAccessRole(role)) return true;
  if (task.creatorId === userId) return true;
  if (task.mainPerformerId === userId) return true;
  if ((task.stakeholders ?? []).some((s) => s.userId === userId)) return true;
  if ((task.steps ?? []).some((s) =>
    s.assigneeId === userId ||
    (s.subTasks ?? []).some((st) => st.userId === userId)
  )) return true;
  if (role === "teamLead") {
    return sameUnit(department, task.department);
  }
  return false;
}
