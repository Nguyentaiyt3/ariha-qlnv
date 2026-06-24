import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getTask, updateTask, deleteTask } from "@/lib/mongodb/firestore";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const task = await getTask(params.id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const updates = await req.json();
    await updateTask(params.id, updates);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteTask(params.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
