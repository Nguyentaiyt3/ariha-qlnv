// So khớp tên đơn vị (department) giữa hồ sơ nhân viên và các bản ghi (Task/Plan/Trial/...).
// Dùng chung cho việc giới hạn phạm vi xem/quản lý của vai trò trưởng nhóm theo đơn vị.

export function sameUnit(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Vai trò luôn thấy/quản lý toàn bộ dữ liệu, không giới hạn theo đơn vị. */
export function isFullAccessRole(role: string): boolean {
  return role === "director" || role === "hrAdmin";
}

/**
 * Designation "clinicalTrialManager" (Quản lý NCLS) chỉ cấp quyền XEM toàn bộ danh sách thử
 * nghiệm lâm sàng (không giới hạn theo đơn vị) — KHÔNG tự động cấp trial:manage (sửa/xoá/duyệt
 * thanh toán...). Dùng designation thay vì đổi role hệ thống của nhân viên.
 */
export function isClinicalTrialViewManager(
  user: { researchDesignations?: string[] } | null | undefined
): boolean {
  return !!user && (user.researchDesignations ?? []).includes("clinicalTrialManager");
}
