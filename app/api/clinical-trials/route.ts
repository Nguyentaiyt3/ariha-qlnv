import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrials, getClinicalTrial, createClinicalTrial } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";
import { ensurePhaseTask } from "@/lib/mongodb/clinicalTrialTask";

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

  // Chỉ sinh Task pha "Khảo sát tính khả thi" cho trial MỚI bắt đầu (không spam khi import Excel
  // dữ liệu lịch sử đã ở giai đoạn sau — các trial đó bỏ qua điều kiện này).
  if (!body.status || body.status === "feasibility") {
    const trial = await getClinicalTrial(id);
    if (trial) await ensurePhaseTask(trial, "feasibility", session.userId);
  }

  return NextResponse.json({ success: true, id });
}
