import { NextRequest, NextResponse } from "next/server";
import { triggerEmail } from "@/lib/email/emailService";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getTask, getUsers } from "@/lib/firebase/firestore";
import type { EmailEventType } from "@/types";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const authUser = token ? verifyToken(token) : null;
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { event, taskId, extraData } = body as {
      event: EmailEventType;
      taskId: string;
      extraData?: Record<string, unknown>;
    };

    if (!event || !taskId) {
      return NextResponse.json({ error: "event and taskId are required" }, { status: 400 });
    }

    const [task, users] = await Promise.all([getTask(taskId), getUsers()]);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Danh tính người gửi luôn lấy từ phiên đăng nhập đã xác thực, không tin theo body.
    const sender = (await getUser(authUser.userId)) ?? undefined;

    await triggerEmail({ event, task, users, sender, extraData });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
