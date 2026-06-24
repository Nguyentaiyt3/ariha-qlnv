import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { updateAdvanceRequest, submitAdvanceSettlement } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const now = new Date().toISOString();

  if (body.action === "submitSettlement") {
    try {
      await submitAdvanceSettlement(params.id, {
        amountUsed: body.amountUsed,
        proofs: body.proofs,
        notes: body.notes,
      });
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  const actions: Record<string, Record<string, unknown>> = {
    approve: {
      status: "APPROVED",
      approvedBy: body.approvedBy ?? user.userId,
      approvedByName: body.approvedByName,
      approvedAt: now,
    },
    reject: { status: "REJECTED", rejectedReason: body.reason },
    approveSettlement: {
      status: "SETTLED",
      settlementApprovedBy: body.approvedBy ?? user.userId,
      settlementApprovedByName: body.approvedByName,
      settledAt: now,
    },
    rejectSettlement: { status: "APPROVED", settlementRejectedReason: body.reason },
  };

  const update = actions[body.action];
  if (!update) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  await updateAdvanceRequest(params.id, update as any);
  return NextResponse.json({ success: true });
}
