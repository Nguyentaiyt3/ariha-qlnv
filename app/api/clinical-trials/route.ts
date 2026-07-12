import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrials, getClinicalTrial, createClinicalTrial } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { isFullAccessRole, isClinicalTrialViewManager, sameUnit } from "@/lib/rbac/scope";
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
  const isManager = !!me && hasPermission(me.role, "trial:manage");
  // Designation "clinicalTrialManager" chỉ cấp quyền XEM toàn bộ danh sách — không cấp trial:manage
  // (sửa/xoá/duyệt thanh toán vẫn chỉ dựa vào role như cũ, không đổi ở đây).
  const canSeeAll = (isManager && isFullAccessRole(me!.role)) || isClinicalTrialViewManager(me);

  let trials;
  if (canSeeAll) {
    trials = await getClinicalTrials();
  } else if (isManager) {
    // teamLead: thấy trial mình là PI/điều phối/người tạo, HOẶC cùng đơn vị.
    const all = await getClinicalTrials();
    trials = all.filter((t) =>
      t.principalInvestigatorId === session.userId ||
      t.coordinatorId === session.userId ||
      t.createdBy === session.userId ||
      sameUnit(t.department, me!.department)
    );
  } else {
    trials = await getClinicalTrials(session.userId);
  }

  // Lọc theo taskId (nếu có) — dùng để hiện card "Thử nghiệm lâm sàng liên kết" ở trang chi tiết
  // nhiệm vụ. Lọc SAU khi đã áp quyền ở trên để không lộ trial ngoài phạm vi được xem.
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (taskId) {
    trials = trials.filter((t) =>
      t.executionTaskId === taskId ||
      t.phaseTaskIds?.feasibility === taskId ||
      t.phaseTaskIds?.execution === taskId ||
      t.phaseTaskIds?.closeout === taskId
    );
  }

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
  // createdBy luôn lấy từ phiên đăng nhập — không tin theo body, tránh gán nhầm/giả mạo người tạo.
  await createClinicalTrial({
    ...body,
    id,
    createdBy: session.userId,
    createdByName: me.name,
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
