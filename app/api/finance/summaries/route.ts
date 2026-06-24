import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { TaskFinancialSummaryModel } from "@/lib/mongodb/models";
import { connectDB } from "@/lib/mongodb/config";
import { recomputeFinancialSummary, getTaskFinancialSummary } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (taskId) {
    const summary = await getTaskFinancialSummary(taskId);
    return NextResponse.json({ summary });
  }
  await connectDB();
  const summaries = await TaskFinancialSummaryModel.find().lean();
  return NextResponse.json({
    summaries: summaries.map((s: any) => ({ taskId: String(s._id), ...s })),
  });
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
