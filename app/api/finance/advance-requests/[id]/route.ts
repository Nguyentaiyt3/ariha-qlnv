/**
 * PATCH /api/finance/advance-requests/[id]
 * Hành động: approve | reject
 * Body: { action: "approve"|"reject", approvedBy, approvedByName, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { approveAdvanceRequest, rejectAdvanceRequest } from "@/lib/firebase/finance";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json() as {
      action: "approve" | "reject";
      approvedBy?: string;
      approvedByName?: string;
      reason?: string;
    };

    if (!body.action) {
      return NextResponse.json({ error: "action là bắt buộc (approve|reject)" }, { status: 400 });
    }

    if (body.action === "approve") {
      if (!body.approvedBy || !body.approvedByName) {
        return NextResponse.json({ error: "approvedBy và approvedByName là bắt buộc" }, { status: 400 });
      }
      await approveAdvanceRequest(id, body.approvedBy, body.approvedByName);
      return NextResponse.json({ message: "Đã phê duyệt đơn tạm ứng. Tiền đã được giải ngân." });
    }

    if (body.action === "reject") {
      if (!body.reason) {
        return NextResponse.json({ error: "Lý do từ chối là bắt buộc" }, { status: 400 });
      }
      await rejectAdvanceRequest(id, body.reason);
      return NextResponse.json({ message: "Đã từ chối đơn tạm ứng." });
    }

    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[PATCH /api/finance/advance-requests/:id]", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
