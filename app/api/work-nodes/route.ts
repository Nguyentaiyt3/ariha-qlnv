import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getWorkNodesByTask, saveWorkNode } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const taskId = req.nextUrl.searchParams.get("taskId") || req.nextUrl.searchParams.get("rootTaskId");
  if (!taskId) return NextResponse.json({ error: "taskId là bắt buộc" }, { status: 400 });
  const nodes = await getWorkNodesByTask(taskId);
  return NextResponse.json({ nodes });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("node");
  const now = new Date().toISOString();
  await saveWorkNode({
    ...body,
    id,
    status: body.status || "pending",
    progress: body.progress ?? 0,
    ancestors: body.ancestors ?? [],
    depth: body.depth ?? 1,
    checklist: body.checklist ?? [],
    outputAttachments: body.outputAttachments ?? [],
    inputResources: body.inputResources ?? [],
    prerequisites: body.prerequisites ?? [],
    prerequisiteMode: body.prerequisiteMode ?? "ALL",
    approverIds: body.approverIds ?? [],
    createdAt: now,
    updatedAt: now,
    createdBy: body.createdBy || user.userId,
  });
  return NextResponse.json({ success: true, id }, { status: 201 });
}
