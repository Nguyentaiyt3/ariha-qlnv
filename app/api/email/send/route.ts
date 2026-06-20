import { NextRequest, NextResponse } from "next/server";
import { triggerEmail } from "@/lib/email/emailService";
import { getTask, getUsers } from "@/lib/firebase/firestore";
import type { EmailEventType } from "@/types";

export async function POST(req: NextRequest) {
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

    await triggerEmail({ event, task, users, extraData });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
