import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getWorkNode, saveWorkNode } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

type Params = { params: { nodeId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.type || !body.name || !body.content || !body.uploadedBy) {
    return NextResponse.json({ error: "Thiếu type, name, content hoặc uploadedBy." }, { status: 400 });
  }
  const node = await getWorkNode(params.nodeId);
  if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });

  const attachment = { id: generateId("att"), ...body, uploadedAt: new Date().toISOString() };
  const outputAttachments = [...(node.outputAttachments ?? []), attachment];
  await saveWorkNode({ ...node, outputAttachments, updatedAt: new Date().toISOString() });
  return NextResponse.json({ attachment }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId) return NextResponse.json({ error: "attachmentId là bắt buộc." }, { status: 400 });

  const node = await getWorkNode(params.nodeId);
  if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });

  const outputAttachments = (node.outputAttachments ?? []).filter((a: any) => a.id !== attachmentId);
  await saveWorkNode({ ...node, outputAttachments, updatedAt: new Date().toISOString() });
  return NextResponse.json({ success: true });
}
