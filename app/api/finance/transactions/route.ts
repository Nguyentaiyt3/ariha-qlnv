import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getAllFinancialTransactions, createFinancialTransaction, recomputeFinancialSummary, getTasks } from "@/lib/mongodb/firestore";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const taskId = req.nextUrl.searchParams.get("taskId") ?? undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "0") || undefined;
  let transactions = await getAllFinancialTransactions(taskId);

  // Trưởng nhóm: chỉ thấy giao dịch của chính mình + giao dịch gắn với nhiệm vụ cùng đơn vị.
  const me = await getUser(user.userId);
  if (me && me.role === "teamLead") {
    const tasks = await getTasks();
    const deptByTaskId = new Map(tasks.map((t) => [t.id, t.department]));
    transactions = transactions.filter((t) =>
      t.createdBy === me.id || sameUnit(deptByTaskId.get(t.taskId), me.department)
    );
  }

  transactions = transactions.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (limit) transactions = transactions.slice(0, limit);
  return NextResponse.json({ transactions });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.taskId || !body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
  }
  const transaction = await createFinancialTransaction({ ...body, status: body.status || "VALID" });
  await recomputeFinancialSummary(body.taskId);
  return NextResponse.json({ transaction }, { status: 201 });
}
