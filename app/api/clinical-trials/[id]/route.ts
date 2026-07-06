import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, updateClinicalTrial, deleteClinicalTrial, updateTask } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { mapTrialStatusToTaskStatus, ensurePhaseTask, completePhaseTask } from "@/lib/mongodb/clinicalTrialTask";
import { CLINICAL_TRIAL_TERMINAL_BRANCHES } from "@/types";

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

  // Lấy trạng thái TRƯỚC khi cập nhật để phát hiện đúng thời điểm chuyển pha
  const prevTrial = updates.status ? await getClinicalTrial(params.id) : null;
  const prevStatus = prevTrial?.status;

  await updateClinicalTrial(params.id, updates);

  if (updates.status) {
    let trial = await getClinicalTrial(params.id);
    if (trial) {
      // Đồng bộ trạng thái sang Task tổng theo dõi (nếu đã sinh)
      if (trial.executionTaskId) {
        await updateTask(trial.executionTaskId, {
          status: mapTrialStatusToTaskStatus(updates.status),
          ...(updates.status === "completed" ? { completedAt: new Date().toISOString() } : {}),
        });
      }

      const isTerminalOrCompleted =
        updates.status === "completed" || (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(updates.status);
      const wasTerminalOrCompleted =
        prevStatus === "completed" || (CLINICAL_TRIAL_TERMINAL_BRANCHES as string[]).includes(prevStatus || "");

      // Rời "Khảo sát tính khả thi" → đóng pha ①, mở pha ②
      if (prevStatus === "feasibility" && updates.status !== "feasibility") {
        await completePhaseTask(trial, "feasibility", u.userId);
        await ensurePhaseTask(trial, "execution", u.userId);
        // Refetch để có phaseTaskIds mới nhất trước khi xét bước tiếp theo (tránh dùng dữ liệu cũ
        // nếu trial nhảy thẳng từ "feasibility" sang "completed"/dừng sớm trong cùng 1 lần cập nhật)
        trial = await getClinicalTrial(params.id);
      }

      // Vừa đạt "Đã kết thúc" hoặc 1 trong 2 nhánh dừng sớm → đóng pha ②, mở pha ③
      if (trial && isTerminalOrCompleted && !wasTerminalOrCompleted) {
        await completePhaseTask(trial, "execution", u.userId);
        await ensurePhaseTask(trial, "closeout", u.userId);
      }
    }
  }

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
