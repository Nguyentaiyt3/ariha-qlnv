import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getTask } from "@/lib/mongodb/firestore";
import { logAudit, getAuditLogs } from "@/lib/mongodb/auditLog";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

/**
 * GET /api/tasks/[id]/audit — dòng thời gian hành động của 1 Task. Đọc từ SystemAuditLog dùng
 * chung (entityType="Task") nhưng trả về đúng shape AuditEvent cũ mà UI (tasks/[id]/page.tsx)
 * đang dùng, để không phải sửa hàng chục điểm gọi describeEvent()/render đã có sẵn.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const logs = await getAuditLogs({ entityType: "Task", entityId: params.id, limit: 500 });
  const events = logs.map((l) => ({
    id: l.id,
    taskId: l.entityId,
    action: l.action,
    userId: l.actorId,
    userName: l.actorName || "",
    before: l.before,
    after: l.after,
    note: l.note,
    timestamp: l.createdAt,
  }));
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Luôn dùng danh tính người gọi API thật (từ token) làm actor — trước đây tin thẳng
    // userId/userName do client gửi lên, cho phép giả mạo người thực hiện trong nhật ký.
    const { action, before, after, note } = await req.json();
    const actor = await getUser(u.userId);
    const task = await getTask(params.id);
    await logAudit({
      actorId: u.userId,
      actorName: actor?.name,
      actorRole: actor?.role,
      action,
      entityType: "Task",
      entityId: params.id,
      entityLabel: task?.name,
      before,
      after,
      note,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[tasks/[id]/audit:POST]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
