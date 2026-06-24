import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { updateReimbursementRequest } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const now = new Date().toISOString();

  const actions: Record<string, Record<string, unknown>> = {
    approve: { status: "APPROVED", approvedBy: user.userId, approvedAt: now },
    markPaid: { status: "PAID", paidAt: now },
    reject: { status: "REJECTED", rejectedReason: body.reason },
    submit: { status: "SUBMITTED", submittedAt: now },
  };

  const update = actions[body.action];
  if (!update) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  await updateReimbursementRequest(params.id, update as any);
  return NextResponse.json({ success: true });
}
