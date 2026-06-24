import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { saveWorkflow, deleteWorkflow, approveWorkflow } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "approve" || body.action === "reject") {
    await approveWorkflow(params.id, body.action === "approve", body.reason);
  } else {
    await saveWorkflow({ ...body, id: params.id });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteWorkflow(params.id);
  return NextResponse.json({ success: true });
}
