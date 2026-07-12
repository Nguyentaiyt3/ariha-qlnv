import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getAllAdvanceRequests, createAdvanceRequest, getTasks } from "@/lib/mongodb/firestore";
import { sameUnit } from "@/lib/rbac/scope";
import { parseBody } from "@/lib/validation";

const bankAccountSchema = z.object({
  bankId: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
});

const createAdvanceRequestSchema = z.object({
  taskId: z.string().min(1),
  stepId: z.string().optional(),
  stepName: z.string().optional(),
  mode: z.enum(["ADVANCE", "SELF_PAID"]).optional(),
  amount: z.number().positive(),
  purpose: z.string().min(1),
  bankAccount: bankAccountSchema.optional(),
});

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const all = await getAllAdvanceRequests();
  const userId = req.nextUrl.searchParams.get("userId");
  const taskId = req.nextUrl.searchParams.get("taskId");
  const statuses = req.nextUrl.searchParams.get("statuses")?.split(",");

  let requests = all;

  // Trưởng nhóm: chỉ thấy tạm ứng của chính mình + tạm ứng gắn với nhiệm vụ cùng đơn vị.
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
  if (statuses?.length) requests = requests.filter((r) => statuses.includes(r.status));
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, createAdvanceRequestSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // requestedBy luôn lấy từ phiên đăng nhập — không tin theo body, tránh ai đó tạo đơn tạm ứng
  // đứng tên người khác.
  const me = await getUser(user.userId);
  const now = new Date().toISOString();
  const request = await createAdvanceRequest({
    ...body,
    requestedBy: user.userId,
    requestedByName: me?.name ?? "",
    status: "PENDING",
    usedAmount: 0,
    remainingAmount: body.amount,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ request }, { status: 201 });
}
