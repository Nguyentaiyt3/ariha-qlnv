import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getMessages, addMessage, updateMessage } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { taskId: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messages = await getMessages(params.taskId);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "update") {
    await updateMessage(params.taskId, body.msgId, body.data);
    return NextResponse.json({ success: true });
  }
  const message = await addMessage(params.taskId, body);
  return NextResponse.json({ message });
}
