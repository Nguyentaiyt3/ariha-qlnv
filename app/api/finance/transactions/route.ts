import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getAllFinancialTransactions, createFinancialTransaction } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const taskId = req.nextUrl.searchParams.get("taskId") ?? undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "0") || undefined;
  let transactions = await getAllFinancialTransactions(taskId);
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
  return NextResponse.json({ transaction }, { status: 201 });
}
