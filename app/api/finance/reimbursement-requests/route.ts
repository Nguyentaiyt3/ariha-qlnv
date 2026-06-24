import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getAllReimbursementRequests, createReimbursementRequest } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const all = await getAllReimbursementRequests();
  const userId = req.nextUrl.searchParams.get("userId");
  const taskId = req.nextUrl.searchParams.get("taskId");
  const status = req.nextUrl.searchParams.get("status");

  let requests = all;
  if (userId) requests = requests.filter((r) => r.requestedBy === userId);
  if (taskId) requests = requests.filter((r) => r.taskId === taskId);
  if (status) requests = requests.filter((r) => r.status === status);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const request = await createReimbursementRequest({ ...body, status: "DRAFT" });
  return NextResponse.json({ request }, { status: 201 });
}
