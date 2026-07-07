import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrials, getClinicalTrial, createClinicalTrial } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { generateId } from "@/lib/utils";
import { ensurePhaseTask, ensureTrialExecutionTask } from "@/lib/mongodb/clinicalTrialTask";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

// ─── GET /api/clinical-trials ───────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
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

  await ensurePermissionOverridesLoaded();
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

  // Chỉ tự sinh Task pha "Khảo sát tính khả thi" + Task tổng theo dõi cho trial MỚI bắt đầu
  // (không spam khi import Excel dữ liệu lịch sử đã ở giai đoạn sau — các trial đó bỏ qua,
  // dùng nút "Tạo nhiệm vụ theo dõi" thủ công ở trang chi tiết — flow (2)).
  // Bọc try/catch: lỗi sinh Task không được làm hỏng việc tạo trial (đã lưu thành công ở trên).
  if (!body.status || body.status === "feasibility") {
    try {
      const trial = await getClinicalTrial(id);
      if (trial) {
        await ensurePhaseTask(trial, "feasibility", session.userId);
        await ensureTrialExecutionTask(trial, session.userId, body.workflowId || undefined);
      }
    } catch (e) {
      console.error("[clinical-trials:POST] Lỗi khi tự sinh Task cho trial mới:", e);
    }
  }

  return NextResponse.json({ success: true, id });
}
