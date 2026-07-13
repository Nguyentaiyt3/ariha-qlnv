import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, createNotification } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { ensureTrialExecutionTask } from "@/lib/mongodb/clinicalTrialTask";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

interface BulkResult {
  trialId: string;
  taskId?: string;
  created?: boolean;
  error?: string;
}

/**
 * POST /api/clinical-trials/bulk-generate-task
 * Tạo (hoặc lấy nếu đã có) Task theo dõi cho nhiều thử nghiệm lâm sàng cùng lúc, và phân công
 * 1 người theo dõi/quản lý chung (mainPerformerId) cho các Task đó — dùng từ bảng danh sách TNLS
 * khi chọn nhiều nghiên cứu. Chỉ dành cho vai trò quản lý toàn bộ TNLS (trial:manage).
 */
export async function POST(req: NextRequest) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(u.userId);
  if (!me || !hasPermission(me.role, "trial:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const trialIds: string[] = Array.isArray(body?.trialIds) ? body.trialIds : [];
  const assigneeId: string | undefined = body?.assigneeId || undefined;
  const supervisorId: string | undefined = body?.supervisorId || undefined;
  const workflowId: string | undefined = body?.workflowId || undefined;
  const planId: string | undefined = body?.planId || undefined;

  if (trialIds.length === 0) {
    return NextResponse.json({ error: "Chưa chọn thử nghiệm lâm sàng nào" }, { status: 400 });
  }
  if (!assigneeId) {
    return NextResponse.json({ error: "Chưa chọn người theo dõi/quản lý" }, { status: 400 });
  }

  const assignee = await getUser(assigneeId);
  const supervisor = supervisorId ? await getUser(supervisorId) : null;

  const results: BulkResult[] = [];
  for (const trialId of trialIds) {
    try {
      const trial = await getClinicalTrial(trialId);
      if (!trial) {
        results.push({ trialId, error: "Không tìm thấy" });
        continue;
      }
      const alreadyExisted = !!trial.executionTaskId;
      const taskId = await ensureTrialExecutionTask(trial, u.userId, workflowId, assigneeId, supervisorId, planId);
      results.push({ trialId, taskId, created: !alreadyExisted });

      if (!alreadyExisted && assignee && assigneeId !== u.userId) {
        await createNotification({
          userId: assigneeId,
          type: "task_assigned",
          title: "Được phân công theo dõi thử nghiệm lâm sàng",
          body: `${me.name} đã giao bạn theo dõi/quản lý nhiệm vụ "${trial.abbreviation || trial.code}"`,
          link: `/tasks/${taskId}`,
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
      if (!alreadyExisted && supervisor && supervisorId !== u.userId && supervisorId !== assigneeId) {
        await createNotification({
          userId: supervisorId!,
          type: "task_assigned",
          title: "Được phân công giám sát thử nghiệm lâm sàng",
          body: `${me.name} đã giao bạn giám sát nhiệm vụ "${trial.abbreviation || trial.code}"`,
          link: `/tasks/${taskId}`,
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("[bulk-generate-task] Lỗi khi tạo nhiệm vụ cho trial", trialId, e);
      results.push({ trialId, error: "Lỗi khi tạo nhiệm vụ" });
    }
  }

  const createdCount = results.filter((r) => r.created).length;
  const existingCount = results.filter((r) => r.taskId && !r.created).length;
  const errorCount = results.filter((r) => r.error).length;

  return NextResponse.json({ results, createdCount, existingCount, errorCount });
}
