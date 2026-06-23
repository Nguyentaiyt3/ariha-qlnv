/**
 * POST /api/work-nodes/[nodeId]/evaluate
 *
 * Người phê duyệt đánh giá chất lượng (T2) và quyết định:
 *   verdict = "pass"  → node chuyển sang "completed", T1+T3 auto-tính, trigger unlock dependents
 *   verdict = "fail"  → node chuyển sang "rejected",  người làm cần sửa lại
 */
import { NextRequest, NextResponse } from "next/server";
import { evaluateNode } from "@/lib/firebase/workNodes";

type Params = { params: { nodeId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json() as {
      verdict: "pass" | "fail";
      rating: 1 | 2 | 3 | 4 | 5;
      evaluatorId: string;
      evaluatorName: string;
      note?: string;
    };

    if (!body.verdict || !body.rating || !body.evaluatorId || !body.evaluatorName) {
      return NextResponse.json(
        { error: "Thiếu verdict, rating, evaluatorId hoặc evaluatorName." },
        { status: 400 }
      );
    }
    if (!["pass", "fail"].includes(body.verdict)) {
      return NextResponse.json({ error: "verdict phải là 'pass' hoặc 'fail'." }, { status: 400 });
    }
    if (![1, 2, 3, 4, 5].includes(body.rating)) {
      return NextResponse.json({ error: "rating phải từ 1 đến 5." }, { status: 400 });
    }

    const node = await evaluateNode(params.nodeId, body);

    const message = body.verdict === "pass"
      ? `Node đã được duyệt (T2: ${body.rating}★ — Đạt). T1/T3 đã tự động tính.`
      : `Node bị từ chối (T2: ${body.rating}★ — Không đạt). Người thực hiện cần làm lại.`;

    return NextResponse.json({ node, message });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
