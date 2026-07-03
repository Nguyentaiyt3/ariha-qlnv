import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, updateClinicalTrial, deleteClinicalTrial } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trial = await getClinicalTrial(params.id);
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await getUser(u.userId);
  const isManager = !!me && hasPermission(me.role, "trial:manage");

  if (!isManager) {
    const isMember =
      trial.principalInvestigatorId === u.userId ||
      trial.coordinatorId === u.userId ||
      trial.createdBy === u.userId;
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ trial });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(u.userId);
  if (!me || !hasPermission(me.role, "trial:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates = await req.json();
  await updateClinicalTrial(params.id, updates);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me || !hasPermission(me.role, "trial:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteClinicalTrial(params.id);
  return NextResponse.json({ success: true });
}
