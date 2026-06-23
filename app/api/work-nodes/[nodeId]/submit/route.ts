/**
 * POST /api/work-nodes/[nodeId]/submit
 *
 * Người thực hiện nộp nghiệm thu.
 * VALIDATION cứng: outputAttachments phải có ít nhất 1 mục.
 *                  Node phải đang ở trạng thái in_progress hoặc rejected.
 */
import { NextRequest, NextResponse } from "next/server";
import { submitNodeForReview } from "@/lib/firebase/workNodes";

type Params = { params: { nodeId: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await submitNodeForReview(params.nodeId);
    return NextResponse.json({
      message: "Đã nộp nghiệm thu. Đang chờ phê duyệt.",
      status: "review",
    });
  } catch (err) {
    const msg = (err as Error).message;
    // Lỗi validation output → 422 Unprocessable Entity
    const isValidationError = msg.includes("Bắt buộc phải có ít nhất");
    return NextResponse.json({ error: msg }, { status: isValidationError ? 422 : 409 });
  }
}
