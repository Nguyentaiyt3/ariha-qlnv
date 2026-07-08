import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import {
  getTask, updateTask, deleteTask,
  getClinicalTrials, updateClinicalTrial,
  getResearchTopics, updateResearchTopic,
} from "@/lib/mongodb/firestore";
import { syncTrialStatusFromCompletedSteps } from "@/lib/mongodb/clinicalTrialTask";
import { logAudit } from "@/lib/mongodb/auditLog";

/**
 * Dọn các back-reference trỏ tới task vừa xoá (ClinicalTrial.executionTaskId/phaseTaskIds,
 * ResearchTopic.executionTaskId) — nếu không, UI vẫn hiện nút "Xem nhiệm vụ"/"Xem đề tài" trỏ
 * tới 1 task không còn tồn tại. Dùng "" thay vì undefined vì $set bỏ qua field undefined.
 */
async function cleanupTaskBackReferences(taskId: string): Promise<void> {
  const [trials, topics] = await Promise.all([getClinicalTrials(), getResearchTopics()]);

  for (const trial of trials) {
    const p = trial.phaseTaskIds;
    const touchesPhase = !!p && (p.feasibility === taskId || p.execution === taskId || p.closeout === taskId);
    if (trial.executionTaskId !== taskId && !touchesPhase) continue;

    await updateClinicalTrial(trial.id, {
      ...(trial.executionTaskId === taskId ? { executionTaskId: "" } : {}),
      ...(touchesPhase
        ? {
            phaseTaskIds: {
              feasibility: p!.feasibility === taskId ? "" : p!.feasibility,
              execution: p!.execution === taskId ? "" : p!.execution,
              closeout: p!.closeout === taskId ? "" : p!.closeout,
            },
          }
        : {}),
    });
  }

  for (const topic of topics) {
    if (topic.executionTaskId === taskId) {
      await updateResearchTopic(topic.id, { executionTaskId: "" });
    }
  }
}

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const task = await getTask(params.id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const updates = await req.json();
    const prevTask = updates.steps ? await getTask(params.id) : null;
    await updateTask(params.id, updates);
    // Đồng bộ ngược: bước Task vừa hoàn thành → đẩy trạng thái ClinicalTrial (nếu Task này là
    // Task tổng theo dõi 1 trial, xem lib/mongodb/clinicalTrialTask.ts). Bọc try/catch riêng:
    // lỗi đồng bộ không được làm hỏng việc cập nhật Task (đã lưu thành công ở trên).
    if (updates.steps && prevTask) {
      try {
        await syncTrialStatusFromCompletedSteps(params.id, prevTask.steps, updates.steps, auth.userId);
      } catch (e) {
        console.error("[tasks/[id]:PATCH] Lỗi khi đồng bộ trạng thái sang ClinicalTrial:", e);
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[tasks/[id]:PATCH] Lỗi:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Lấy snapshot TRƯỚC khi xoá — sau khi xoá, trang chi tiết Task không còn để xem lại nữa,
    // nên đây là nơi DUY NHẤT còn thấy nhiệm vụ này đã từng tồn tại (qua Nhật ký hệ thống).
    const task = await getTask(params.id);
    await deleteTask(params.id);
    await cleanupTaskBackReferences(params.id);

    const actor = await getUser(auth.userId);
    await logAudit({
      actorId: auth.userId, actorName: actor?.name, actorRole: actor?.role,
      action: "deleted", entityType: "Task", entityId: params.id,
      entityLabel: task?.name,
      before: task ? { name: task.name, status: task.status, mainPerformerId: task.mainPerformerId } : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
