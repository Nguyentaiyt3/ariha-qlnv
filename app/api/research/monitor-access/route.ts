import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getEffectiveRole } from "@/lib/rbac/permissions";
import { isNckhFullManager } from "@/lib/researchUtils";

/**
 * KHÔNG dùng checkResearchTaskParticipant (tham gia 1 Task có liên kết NCKH) làm fallback nữa —
 * đây chính là lỗ hổng đã từng bị phát hiện & vá ở GET /api/research (list), nhưng route này lại
 * bỏ sót: bất kỳ ai được giao/tham gia Task chung "NCKH CS QX" (rất nhiều người, kể cả phản biện
 * thường) đều bị cấp nhầm canMonitor=true, lộ tab "Hội đồng KH&CN" dù không có vai trò quản lý gì.
 *
 * KHÔNG dùng hasPermission(me.role, "research:monitor") nữa cũng vì lý do tương tự — đã xác nhận
 * trực tiếp trong DB (appconfigs/"permissions") rằng tổ chức đã cấp rộng quyền "research:monitor"
 * cho cả vai trò "staff" qua trang Phân quyền, khiến bất kỳ nhân viên thường nào cũng lọt qua check
 * này. Nguồn thẩm quyền thật CHỈ là isNckhFullManager (Quản lý NCKH thật) hoặc vai trò teamLead.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ canMonitor: false });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ canMonitor: false });

  const me = await getUser(session.userId);
  if (!me) return NextResponse.json({ canMonitor: false });

  const canMonitor = isNckhFullManager(me) || getEffectiveRole(me) === "teamLead";
  return NextResponse.json({ canMonitor });
}
