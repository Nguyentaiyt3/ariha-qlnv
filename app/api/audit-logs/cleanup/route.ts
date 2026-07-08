import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { connectDB } from "@/lib/mongodb/config";
import { SystemAuditLogModel } from "@/lib/mongodb/models";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * POST /api/audit-logs/cleanup — xoá vĩnh viễn nhật ký cũ hơn N ngày. Kích hoạt thủ công từ
 * Cài đặt > Nhật ký hệ thống (dự án chưa có cron job — nếu cần tự động, có thể gọi route này
 * định kỳ qua Vercel Cron sau).
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  if (!me || !hasPermission(me.role, "system:auditRead")) {
    return NextResponse.json({ error: "Không có quyền dọn nhật ký hệ thống" }, { status: 403 });
  }

  try {
    const { olderThanDays } = await req.json();
    const days = Number(olderThanDays);
    if (!days || days < 30) {
      return NextResponse.json({ error: "olderThanDays phải ≥ 30" }, { status: 400 });
    }

    await connectDB();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = await SystemAuditLogModel.deleteMany({ createdAt: { $lt: cutoff } });

    return NextResponse.json({ success: true, deleted: result.deletedCount ?? 0 });
  } catch (error) {
    console.error("[audit-logs/cleanup:POST]", error);
    return NextResponse.json({ error: "Dọn log thất bại" }, { status: 500 });
  }
}
