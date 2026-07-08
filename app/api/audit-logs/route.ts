import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { getAuditLogs } from "@/lib/mongodb/auditLog";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * GET /api/audit-logs — Nhật ký hệ thống, dùng cho trang xem toàn hệ thống (Cài đặt > Nhật ký
 * hệ thống, cần system:auditRead) VÀ tab "Lịch sử" trên trang chi tiết từng đối tượng (chỉ cần
 * quyền xem đối tượng đó — không cần system:auditRead, xem kiểm tra bên dưới).
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const entityType = searchParams.get("entityType") || undefined;
  const entityId = searchParams.get("entityId") || undefined;
  const actorId = searchParams.get("actorId") || undefined;
  const action = searchParams.get("action") || undefined;
  const limit = Number(searchParams.get("limit")) || undefined;

  // Xem nhật ký của 1 đối tượng cụ thể (tab "Lịch sử") không cần quyền system:auditRead — nếu đã
  // xem được trang chi tiết đối tượng đó thì xem được lịch sử của nó. Chỉ khi xem TOÀN BỘ nhật ký
  // hệ thống (không lọc theo entityId cụ thể) mới cần quyền system:auditRead.
  if (!entityId) {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !hasPermission(me.role, "system:auditRead")) {
      return NextResponse.json({ error: "Không có quyền xem nhật ký hệ thống" }, { status: 403 });
    }
  } else if (entityType === "User") {
    // Lịch sử nhân viên có thể chứa đổi vai trò/vô hiệu hoá — nhạy cảm hơn xem hồ sơ thông
    // thường, nên yêu cầu riêng user:manage thay vì chỉ cần xem được trang chi tiết.
    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !hasPermission(me.role, "user:manage")) {
      return NextResponse.json({ error: "Không có quyền xem lịch sử nhân viên" }, { status: 403 });
    }
  }

  const logs = await getAuditLogs({ entityType, entityId, actorId, action, limit });
  return NextResponse.json({ logs });
}
