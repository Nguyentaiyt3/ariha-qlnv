import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getRiskFlagConfig, saveRiskFlagConfig } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import type { RiskFlagConfig } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getRiskFlagConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(session.userId);
  if (!me || !(hasPermission(me.role, "*") || me.role === "hrAdmin")) {
    return NextResponse.json({ error: "Bạn không có quyền cấu hình ngưỡng rủi ro" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({})) as Partial<RiskFlagConfig>;
  if (typeof body.thresholdDays !== "number" || body.thresholdDays <= 0) {
    return NextResponse.json({ error: "Số ngày ngưỡng phải lớn hơn 0" }, { status: 400 });
  }
  if (typeof body.progressThreshold !== "number" || body.progressThreshold <= 0 || body.progressThreshold > 100) {
    return NextResponse.json({ error: "Ngưỡng tiến độ phải trong khoảng 1-100%" }, { status: 400 });
  }
  await saveRiskFlagConfig({
    thresholdDays: body.thresholdDays,
    progressThreshold: body.progressThreshold,
    updatedBy: me.id,
  });
  return NextResponse.json({ success: true });
}
