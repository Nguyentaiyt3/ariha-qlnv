/**
 * POST /api/finance/reconcile/[taskId]
 * ─────────────────────────────────────────────────────────────────────────────
 * Quyết toán hoàn ứng cuối nhiệm vụ.
 *
 * Công thức đối chiếu:
 *   difference = Σ(Tạm ứng đã duyệt) − Σ(Thực chi hợp lệ từ tạm ứng)
 *   > 0 → Nhân viên còn dư → phải nộp lại
 *   < 0 → Nhân viên chi vượt → công ty bù thêm
 *   = 0 → Cân bằng
 *
 * Điều kiện tiên quyết:
 *   1. Không còn giao dịch PENDING_PROOF (thiếu chứng từ)
 *   2. Có ít nhất 1 đơn tạm ứng APPROVED
 */
import { NextRequest, NextResponse } from "next/server";
import { reconcileAdvance } from "@/lib/firebase/finance";

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params;
    const body = await req.json() as { settledBy: string; settledByName?: string };

    if (!taskId) {
      return NextResponse.json({ error: "taskId là bắt buộc" }, { status: 400 });
    }
    if (!body.settledBy) {
      return NextResponse.json({ error: "settledBy (userId) là bắt buộc" }, { status: 400 });
    }

    const result = await reconcileAdvance(taskId, body.settledBy);

    // ── Tạo thông báo kết quả quyết toán ─────────────────────────────────────
    const { difference, settlementType, totalAdvanced, totalActualSpent } = result;
    const absDiff = Math.abs(difference);
    const vnd = (n: number) => n.toLocaleString("vi-VN") + " đ";

    let message = "";
    let action = "";

    switch (settlementType) {
      case "RETURN_TO_COMPANY":
        message = `Quyết toán hoàn tất. Nhân viên còn dư ${vnd(absDiff)} từ tạm ứng.`;
        action = `Nhân viên cần nộp lại ${vnd(absDiff)} cho công ty.`;
        break;
      case "PAY_EMPLOYEE_ADDITIONAL":
        message = `Quyết toán hoàn tất. Nhân viên chi vượt ${vnd(absDiff)} so với tạm ứng.`;
        action = `Công ty cần thanh toán thêm ${vnd(absDiff)} cho nhân viên.`;
        break;
      case "BALANCED":
        message = "Quyết toán hoàn tất. Số tiền tạm ứng và thực chi khớp hoàn toàn.";
        action = "Không cần thu hồi hay thanh toán thêm.";
        break;
    }

    return NextResponse.json({
      success: true,
      message,
      action,
      details: {
        totalAdvanced: vnd(totalAdvanced),
        totalActualSpent: vnd(totalActualSpent),
        difference: vnd(absDiff),
        settlementType,
        settledRequests: result.settledRequests,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi hệ thống";
    console.error("[POST /api/finance/reconcile]", msg);
    const isBusinessError =
      msg.includes("chứng từ") || msg.includes("quyết toán") || msg.includes("tạm ứng");
    return NextResponse.json({ error: msg }, { status: isBusinessError ? 400 : 500 });
  }
}
