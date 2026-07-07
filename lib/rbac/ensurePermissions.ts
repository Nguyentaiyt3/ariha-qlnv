import { getPermissionConfig } from "@/lib/mongodb/firestore";
import { applyPermissionOverrides } from "@/lib/rbac/permissions";
import type { UserRole } from "@/types";

/**
 * `_permOverrides` trong lib/rbac/permissions.ts chỉ được nạp khi client gọi
 * GET/POST /api/config/permissions (xem app/(dashboard)/layout.tsx). Next.js dev biên dịch lại
 * module theo từng route khi có thay đổi code, và trên serverless (Vercel) mỗi instance có thể
 * cold-start riêng — cả 2 trường hợp đều có thể khiến 1 route khác chưa từng nạp override, dẫn
 * đến hasPermission() dùng nhầm DEFAULT_ROLE_PERMISSIONS dù đã tuỳ chỉnh qua Cài đặt > Phân quyền.
 * Gọi hàm này ở đầu route có kiểm tra hasPermission() để đảm bảo override đã được nạp cho
 * đúng instance đang xử lý request, tránh 403/kết quả sai lệch giữa client và server.
 */
let loaded = false;
let loading: Promise<void> | null = null;

export async function ensurePermissionOverridesLoaded(): Promise<void> {
  if (loaded) return;
  if (!loading) {
    loading = getPermissionConfig()
      .then((config) => {
        if (config && Object.keys(config).length > 0) {
          applyPermissionOverrides(config as Partial<Record<UserRole, string[]>>);
        }
        loaded = true;
      })
      .catch(() => {
        loading = null; // cho phép thử lại ở lần gọi kế tiếp nếu lần này lỗi
      });
  }
  return loading;
}
