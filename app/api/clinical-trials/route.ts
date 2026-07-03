import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrials, createClinicalTrial } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

// ─── GET /api/clinical-trials ───────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(session.userId);
  const canSeeAll = !!me && hasPermission(me.role, "trial:manage");
  const userId = canSeeAll ? undefined : session.userId;

  const trials = await getClinicalTrials(userId);
  return NextResponse.json({ trials });
}

// ─── POST /api/clinical-trials ──────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(session.userId);
  if (!me || !hasPermission(me.role, "trial:create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const id = body.id || generateId("trial");
  await createClinicalTrial({
    ...body,
    id,
    createdBy: body.createdBy || session.userId,
    createdByName: body.createdByName || me.name,
  });
  return NextResponse.json({ success: true, id });
}
