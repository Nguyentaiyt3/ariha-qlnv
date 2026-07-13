import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import {
  getTask, updateTask, deleteTask,
  getClinicalTrials, updateClinicalTrial,
  getResearchTopics, updateResearchTopic,
} from "@/lib/mongodb/firestore";
import { CalendarEventModel, NotificationModel } from "@/lib/mongodb/models";
import { syncTrialStatusFromCompletedSteps } from "@/lib/mongodb/clinicalTrialTask";
import { logAudit } from "@/lib/mongodb/auditLog";
import { isTaskVisible } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";

const DEADLINE_FIELDS = ["deadlineBase", "deadlinePrepare", "deadlineExecute", "deadlineFinalize"];

/**
 * Dọn các back-reference trỏ tới task vừa xoá (ClinicalTrial.executionTaskId/phaseTaskIds,
 * ResearchTopic.executionTaskId/taskId, CalendarEvent.taskId, Notification.taskId/link) — nếu
 * không, UI vẫn hiện nút "Xem nhiệm vụ"/"Xem đề tài" hoặc link thông báo trỏ tới 1 task không
 * còn tồn tại. Dùng "" thay vì undefined vì $set bỏ qua field undefined.
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
    const updates: { executionTaskId?: string; taskId?: string } = {};
    if (topic.executionTaskId === taskId) updates.executionTaskId = "";
    if (topic.taskId === taskId) updates.taskId = "";
    if (Object.keys(updates).length > 0) await updateResearchTopic(topic.id, updates);
  }

  await CalendarEventModel.updateMany({ taskId }, { $unset: { taskId: "" } });
  await NotificationModel.updateMany({ taskId }, { $unset: { taskId: "", link: "" } });
}

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const task = await getTask(params.id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const me = await getUser(auth.userId);
    if (me && !isTaskVisible(task, me.id, me.role, me.department)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const task = await getTask(params.id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !isTaskVisible(task, me.id, me.role, me.department)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates = await req.json();

    // Mirror đúng quy tắc phân quyền client đã dùng để ẩn/hiện nút (xem canApprove/canEdit ở
    // app/(dashboard)/tasks/[id]/page.tsx) — trước đây route này không kiểm tra gì cả, ai đăng
    // nhập cũng PATCH được bất kỳ task nào.
    const isMainPerformer = me.id === task.mainPerformerId;
    const isStakeholder = (task.stakeholders ?? []).some((s) => s.userId === me.id);
    const canApprove = hasPermission(me.role, "task:approve");
    const canEdit = canApprove || isMainPerformer || isStakeholder;

    if (("approved" in updates || "approvedBy" in updates || "approvedAt" in updates) && !canApprove) {
      return NextResponse.json({ error: "Bạn không có quyền phê duyệt nhiệm vụ" }, { status: 403 });
    }
    if ("status" in updates && !canEdit) {
      return NextResponse.json({ error: "Bạn không có quyền đổi trạng thái nhiệm vụ này" }, { status: 403 });
    }
    if ("mainPerformerId" in updates && updates.mainPerformerId !== task.mainPerformerId && !canEdit) {
      return NextResponse.json({ error: "Bạn không có quyền đổi người thực hiện chính" }, { status: 403 });
    }
    if (DEADLINE_FIELDS.some((f) => f in updates) && !canEdit) {
      return NextResponse.json({ error: "Bạn không có quyền đổi hạn nhiệm vụ này" }, { status: 403 });
    }

    const prevTask = updates.steps ? task : null;
    await updateTask(params.id, updates);

    // Ghi nhật ký ngay trong request này cho các hành động nhạy cảm — trước đây phụ thuộc hoàn
    // toàn vào client tự gọi thêm POST /api/tasks/[id]/audit sau khi PATCH thành công, nên nếu
    // client quên gọi (lỗi mạng, hoặc gọi API trực tiếp) thì hành động vẫn xảy ra nhưng không có
    // dấu vết. Các hành động khác (edited/change_requested/issue_raised...) vẫn qua route đó.
    if ("approved" in updates && updates.approved === true && !task.approved) {
      await logAudit({
        actorId: me.id, actorName: me.name, actorRole: me.role,
        action: "approved", entityType: "Task", entityId: params.id, entityLabel: task.name,
        before: { approved: false }, after: { approved: true },
      });
    }
    if ("status" in updates && updates.status !== task.status) {
      await logAudit({
        actorId: me.id, actorName: me.name, actorRole: me.role,
        action: "status_changed", entityType: "Task", entityId: params.id, entityLabel: task.name,
        before: { status: task.status }, after: { status: updates.status },
      });
    }
    if ("mainPerformerId" in updates && updates.mainPerformerId !== task.mainPerformerId) {
      await logAudit({
        actorId: me.id, actorName: me.name, actorRole: me.role,
        action: "reassigned", entityType: "Task", entityId: params.id, entityLabel: task.name,
        before: { mainPerformerId: task.mainPerformerId }, after: { mainPerformerId: updates.mainPerformerId },
      });
    }
    if (DEADLINE_FIELDS.some((f) => f in updates && updates[f] !== (task as unknown as Record<string, unknown>)[f])) {
      await logAudit({
        actorId: me.id, actorName: me.name, actorRole: me.role,
        action: "deadline_changed", entityType: "Task", entityId: params.id, entityLabel: task.name,
        before: Object.fromEntries(DEADLINE_FIELDS.map((f) => [f, (task as unknown as Record<string, unknown>)[f]])),
        after: Object.fromEntries(DEADLINE_FIELDS.map((f) => [f, f in updates ? updates[f] : (task as unknown as Record<string, unknown>)[f]])),
      });
    }

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
    await ensurePermissionOverridesLoaded();
    const requester = await getUser(auth.userId);
    if (!requester || !hasPermission(requester.role, "task:delete")) {
      return NextResponse.json({ error: "Bạn không có quyền xoá nhiệm vụ" }, { status: 403 });
    }

    // Lấy snapshot TRƯỚC khi xoá — sau khi xoá, trang chi tiết Task không còn để xem lại nữa,
    // nên đây là nơi DUY NHẤT còn thấy nhiệm vụ này đã từng tồn tại (qua Nhật ký hệ thống).
    const task = await getTask(params.id);
    await deleteTask(params.id);
    await cleanupTaskBackReferences(params.id);

    await logAudit({
      actorId: auth.userId, actorName: requester.name, actorRole: requester.role,
      action: "deleted", entityType: "Task", entityId: params.id,
      entityLabel: task?.name,
      before: task ? { name: task.name, status: task.status, mainPerformerId: task.mainPerformerId } : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
