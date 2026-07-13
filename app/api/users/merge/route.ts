import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { mergeUsers } from "@/lib/mongodb/mergeUsers";
import { logAudit } from "@/lib/mongodb/auditLog";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * POST /api/users/merge — gộp 2 tài khoản nhân viên trùng lặp thành 1. Chuyển toàn bộ dữ liệu
 * liên quan (nhiệm vụ, TNLS, đề tài, đơn từ, đánh giá...) sang tài khoản giữ lại, sau đó vô hiệu
 * hoá (không xoá cứng) tài khoản trùng.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  if (!me || !hasPermission(me.role, "user:merge")) {
    return NextResponse.json({ error: "Không có quyền gộp nhân viên trùng lặp" }, { status: 403 });
  }

  try {
    const { keepId, mergeId } = await req.json();
    if (typeof keepId !== "string" || typeof mergeId !== "string" || !keepId || !mergeId) {
      return NextResponse.json({ error: "Thiếu keepId hoặc mergeId" }, { status: 400 });
    }
    const [keepUser, mergeUser] = await Promise.all([getUser(keepId), getUser(mergeId)]);
    const results = await mergeUsers(keepId, mergeId);

    await logAudit({
      actorId: me.id,
      actorName: me.name,
      actorRole: me.role,
      action: "user.merged",
      entityType: "User",
      entityId: mergeId,
      entityLabel: mergeUser?.name,
      before: { mergeId, mergeEmail: mergeUser?.email },
      after: { keepId, keepEmail: keepUser?.email },
      note: `Gộp "${mergeUser?.name}" vào "${keepUser?.name}"`,
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gộp nhân viên thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
