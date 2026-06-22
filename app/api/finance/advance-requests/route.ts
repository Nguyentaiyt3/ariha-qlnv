/**
 * POST /api/finance/advance-requests — Tạo đơn tạm ứng
 * GET  /api/finance/advance-requests?taskId= — Lấy danh sách theo task
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdvanceRequest, getAdvanceRequests } from "@/lib/firebase/finance";

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId là bắt buộc" }, { status: 400 });
    const requests = await getAdvanceRequests(taskId);
    return NextResponse.json({ requests });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      taskId: string;
      requestedBy: string;
      requestedByName: string;
      amount: number;
      purpose: string;
    };

    if (!body.taskId || !body.requestedBy || !body.amount || !body.purpose) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }
    if (body.amount <= 0) {
      return NextResponse.json({ error: "Số tiền tạm ứng phải lớn hơn 0" }, { status: 400 });
    }

    const request = await createAdvanceRequest(body);
    return NextResponse.json({ request, message: "Đã gửi đơn tạm ứng. Chờ phê duyệt." }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
