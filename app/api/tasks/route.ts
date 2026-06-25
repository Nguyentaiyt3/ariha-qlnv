import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getTasks, getTasksByPlan, createTask, updateTask } from "@/lib/mongodb/firestore";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const planId = req.nextUrl.searchParams.get("planId");
    const tasks = planId ? await getTasksByPlan(planId) : await getTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[API /tasks GET]", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    await createTask(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /tasks POST]", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
