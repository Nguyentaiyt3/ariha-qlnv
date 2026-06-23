/**
 * POST /api/work-nodes  — Tạo WorkNode mới
 * GET  /api/work-nodes?rootTaskId=xxx  — Lấy danh sách node theo task
 */
import { NextRequest, NextResponse } from "next/server";
import { createWorkNode, getNodesByTask } from "@/lib/firebase/workNodes";
import type { CreateNodePayload } from "@/lib/firebase/workNodes";

export async function GET(req: NextRequest) {
  try {
    const rootTaskId = req.nextUrl.searchParams.get("rootTaskId");
    if (!rootTaskId) {
      return NextResponse.json({ error: "rootTaskId là bắt buộc" }, { status: 400 });
    }
    const nodes = await getNodesByTask(rootTaskId);
    return NextResponse.json({ nodes });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CreateNodePayload;

    // Validate bắt buộc
    const required: (keyof CreateNodePayload)[] = [
      "rootTaskId", "name", "assigneeId", "assigneeName",
      "dueDate", "createdBy", "createdByName",
    ];
    const missing = required.filter((k) => !body[k]);
    if (missing.length) {
      return NextResponse.json(
        { error: `Thiếu trường bắt buộc: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate dueDate hợp lệ
    if (isNaN(Date.parse(body.dueDate))) {
      return NextResponse.json({ error: "dueDate không hợp lệ" }, { status: 400 });
    }
    if (body.startDate && isNaN(Date.parse(body.startDate))) {
      return NextResponse.json({ error: "startDate không hợp lệ" }, { status: 400 });
    }

    const node = await createWorkNode(body);
    return NextResponse.json({ node, message: "Tạo node thành công." }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
