import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getAllReimbursementRequests, createReimbursementRequest, getTasks } from "@/lib/mongodb/firestore";
import { sameUnit } from "@/lib/rbac/scope";
import { parseBody } from "@/lib/validation";

const createReimbursementSchema = z.object({
  taskId: z.string().min(1),
  transactionId: z.string().optional(),
  stepId: z.string().optional(),
  stepName: z.string().optional(),
  amount: z.number().positive(),
  description: z.string().min(1),
  proofs: z.array(z.unknown()).default([]),
});

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

  // Trưởng nhóm: chỉ thấy hoàn ứng của chính mình + hoàn ứng gắn với nhiệm vụ cùng đơn vị.
  const me = await getUser(user.userId);
  if (me && me.role === "teamLead") {
    const tasks = await getTasks();
    const deptByTaskId = new Map(tasks.map((t) => [t.id, t.department]));
    requests = requests.filter((r) =>
      r.requestedBy === me.id || sameUnit(deptByTaskId.get(r.taskId), me.department)
    );
  }

  if (userId) requests = requests.filter((r) => r.requestedBy === userId);
  if (taskId) requests = requests.filter((r) => r.taskId === taskId);
  if (status) requests = requests.filter((r) => r.status === status);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, createReimbursementSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // requestedBy luôn lấy từ phiên đăng nhập — không tin theo body.
  const me = await getUser(user.userId);
  const now = new Date().toISOString();
  const request = await createReimbursementRequest({
    ...body,
    requestedBy: user.userId,
    requestedByName: me?.name ?? "",
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
  } as any);
  return NextResponse.json({ request }, { status: 201 });
}
