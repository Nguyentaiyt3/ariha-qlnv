import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { updateChannel, deleteChannel, getChannelMessages, sendChannelMessage, updateChannelMessage, markChannelRead } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messages = await getChannelMessages(params.id);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "sendMessage") {
    await sendChannelMessage(params.id, body.message);
    return NextResponse.json({ success: true });
  }
  if (body.action === "markRead") {
    await markChannelRead(params.id, user.userId);
    return NextResponse.json({ success: true });
  }
  if (body.action === "updateMessage") {
    await updateChannelMessage(params.id, body.msgId, body.data);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await updateChannel(params.id, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteChannel(params.id);
  return NextResponse.json({ success: true });
}
