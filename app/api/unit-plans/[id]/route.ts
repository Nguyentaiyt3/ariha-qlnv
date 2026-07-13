import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getUnitPlan, updateUnitPlan, deleteUnitPlan } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { sameUnit } from "@/lib/rbac/scope";
import type { User, UnitPlan } from "@/types";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** director/hrAdmin: không giới hạn. teamLead: chỉ đơn/kế hoạch của đơn vị mình hoặc do mình tạo/phụ trách. */
function canAccessPlan(me: User, plan: UnitPlan): boolean {
  if (me.role !== "teamLead") return true;
  return plan.createdBy === me.id || plan.ownerId === me.id || sameUnit(plan.department, me.department);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !hasPermission(me.role, "plan:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const plan = await getUnitPlan(params.id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessPlan(me, plan)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: "Failed to fetch plan" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !hasPermission(me.role, "plan:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const plan = await getUnitPlan(params.id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessPlan(me, plan)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    await updateUnitPlan(params.id, body);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !hasPermission(me.role, "plan:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const plan = await getUnitPlan(params.id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessPlan(me, plan)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await deleteUnitPlan(params.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}
