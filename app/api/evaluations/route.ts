import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getEvaluations, getAllEvaluations, saveEvaluation, getEvaluationConfig, saveEvaluationConfig, getUsers } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId");
  const configOnly = req.nextUrl.searchParams.get("config") === "true";
  if (configOnly) {
    const config = await getEvaluationConfig();
    return NextResponse.json({ config });
  }

  await ensurePermissionOverridesLoaded();
  const me = await getUser(user.userId);
  const canSeeOthers = !!me && (hasPermission(me.role, "evaluation:team") || hasPermission(me.role, "evaluation:company"));

  if (userId) {
    const isSelf = userId === user.userId;
    if (!isSelf && !canSeeOthers) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Trưởng nhóm: chỉ xem đánh giá của nhân viên cùng đơn vị (director/hrAdmin không giới hạn).
    if (!isSelf && me!.role === "teamLead") {
      const target = await getUser(userId);
      if (!target || !sameUnit(target.department, me!.department)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const evaluations = await getEvaluations(userId);
    return NextResponse.json({ evaluations });
  }

  if (!canSeeOthers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let evaluations = await getAllEvaluations();
  if (me!.role === "teamLead") {
    const users = await getUsers();
    const deptByUserId = new Map(users.map((u) => [u.id, u.department]));
    evaluations = evaluations.filter((e) => sameUnit(deptByUserId.get(e.evaluatedUserId), me!.department));
  }
  return NextResponse.json({ evaluations });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  await ensurePermissionOverridesLoaded();
  const me = await getUser(user.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (body.action === "saveConfig") {
    if (!hasPermission(me.role, "evaluation:company")) {
      return NextResponse.json({ error: "Không có quyền cấu hình đánh giá" }, { status: 403 });
    }
    await saveEvaluationConfig(body.config);
    return NextResponse.json({ success: true });
  }

  // evaluatorId luôn lấy từ phiên đăng nhập, không tin theo body — tránh giả mạo danh tính
  // người đánh giá. evaluatedUserId (người được đánh giá) do client gửi nhưng phải được xét quyền:
  // tự đánh giá (evaluation:self) hoặc đánh giá người khác (evaluation:team/company, trưởng nhóm
  // giới hạn cùng đơn vị).
  const evaluatedUserId: string | undefined = body.evaluatedUserId;
  if (!evaluatedUserId) {
    return NextResponse.json({ error: "Thiếu evaluatedUserId" }, { status: 400 });
  }
  if (evaluatedUserId === user.userId) {
    if (!hasPermission(me.role, "evaluation:self")) {
      return NextResponse.json({ error: "Không có quyền tự đánh giá" }, { status: 403 });
    }
  } else {
    const canEvaluateOthers = hasPermission(me.role, "evaluation:team") || hasPermission(me.role, "evaluation:company");
    if (!canEvaluateOthers) {
      return NextResponse.json({ error: "Không có quyền đánh giá người khác" }, { status: 403 });
    }
    if (me.role === "teamLead") {
      const target = await getUser(evaluatedUserId);
      if (!target || !sameUnit(target.department, me.department)) {
        return NextResponse.json({ error: "Bạn chỉ được đánh giá nhân viên cùng đơn vị" }, { status: 403 });
      }
    }
  }

  const id = body.id || generateId("eval");
  await saveEvaluation({ ...body, evaluatorId: user.userId, evaluatedUserId, id });
  return NextResponse.json({ success: true, id });
}
