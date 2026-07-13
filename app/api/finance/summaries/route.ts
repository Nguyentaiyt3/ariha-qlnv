import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { TaskFinancialSummaryModel } from "@/lib/mongodb/models";
import { connectDB } from "@/lib/mongodb/config";
import { recomputeFinancialSummary, getTaskFinancialSummary, getTasks } from "@/lib/mongodb/firestore";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (taskId) {
    const summary = await getTaskFinancialSummary(taskId);
    return NextResponse.json({ summary });
  }
  await connectDB();
  let summaries = (await TaskFinancialSummaryModel.find().lean()).map((s: any) => ({ taskId: String(s._id), ...s }));

  // Trưởng nhóm: chỉ thấy tổng hợp tài chính của nhiệm vụ thuộc đơn vị mình.
  const me = await getUser(user.userId);
  if (me && me.role === "teamLead") {
    const tasks = await getTasks();
    const deptByTaskId = new Map(tasks.map((t) => [t.id, t.department]));
    summaries = summaries.filter((s) => sameUnit(deptByTaskId.get(s.taskId), me.department));
  }

  return NextResponse.json({ summaries });
}

/** POST: recompute summary for a task */
export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.taskId) return NextResponse.json({ error: "taskId là bắt buộc" }, { status: 400 });
  try {
    const summary = await recomputeFinancialSummary(body.taskId);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
