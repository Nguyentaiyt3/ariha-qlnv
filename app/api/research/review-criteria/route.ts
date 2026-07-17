import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getNckhReviewCriteria, saveNckhReviewCriteria } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import type { NckhReviewCriteriaConfig } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

/** GET — bất kỳ ai đã đăng nhập đều đọc được (phản biện cần bộ tiêu chí để hiện phiếu chấm điểm). */
export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getNckhReviewCriteria();
  return NextResponse.json({ config });
}

/**
 * PATCH — chỉ hrAdmin/quyền hệ thống ("*") mới được sửa bộ tiêu chí chấm điểm (ảnh hưởng toàn bộ
 * hệ thống, giống các cấu hình khác ở trang Cài đặt hệ thống — 3T, mốc quy trình).
 */
export async function PATCH(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(session.userId);
  if (!me || !(hasPermission(me.role, "*") || me.role === "hrAdmin")) {
    return NextResponse.json({ error: "Bạn không có quyền cấu hình tiêu chí chấm điểm" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({})) as Partial<NckhReviewCriteriaConfig>;
  if (!Array.isArray(body.proposal) || !Array.isArray(body.recognition)) {
    return NextResponse.json({ error: "Thiếu danh sách tiêu chí" }, { status: 400 });
  }
  await saveNckhReviewCriteria({ proposal: body.proposal, recognition: body.recognition, updatedBy: me.id });
  return NextResponse.json({ success: true });
}
