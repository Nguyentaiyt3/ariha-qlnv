/**
 * POST /api/finance/transactions  — Tạo giao dịch thu/chi
 * GET  /api/finance/transactions?taskId=  — Lấy danh sách
 *
 * Business rules được thực thi ở lib/firebase/finance.ts (createTransaction):
 *  • ADVANCE    : Kiểm tra số dư tạm ứng, dùng Firestore atomic transaction
 *  • OUT_OF_POCKET: Tự tạo ReimbursementRequest nháp
 *  • REVENUE    : Ghi nhận khoản thu, không cần chứng từ
 */
import { NextRequest, NextResponse } from "next/server";
import { createTransaction, getTransactions } from "@/lib/firebase/finance";
import type { FinancialProof } from "@/types";

// ── GET — Lấy danh sách giao dịch ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId là bắt buộc" }, { status: 400 });

    const transactions = await getTransactions(taskId);
    return NextResponse.json({ transactions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi hệ thống";
    console.error("[GET /api/finance/transactions]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — Tạo giao dịch mới ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      taskId: string;
      stepId?: string;
      createdBy: string;
      createdByName: string;
      amount: number;
      direction: "DEBIT" | "CREDIT";
      fundSource: "ADVANCE" | "OUT_OF_POCKET" | "REVENUE";
      category: string;
      description: string;
      advanceRequestId?: string;
      proofs?: FinancialProof[];
    };

    // ── Validate input ─────────────────────────────────────────
    const required = ["taskId", "createdBy", "createdByName", "amount", "direction", "fundSource", "category", "description"];
    for (const field of required) {
      if (!body[field as keyof typeof body]) {
        return NextResponse.json({ error: `Trường "${field}" là bắt buộc` }, { status: 400 });
      }
    }

    if (body.amount <= 0) {
      return NextResponse.json({ error: "Số tiền phải lớn hơn 0" }, { status: 400 });
    }

    if (body.fundSource === "ADVANCE" && !body.advanceRequestId) {
      return NextResponse.json(
        { error: "Giao dịch từ tạm ứng phải chỉ định đơn tạm ứng (advanceRequestId)" },
        { status: 400 }
      );
    }

    // ── Tạo giao dịch (business logic trong finance.ts) ────────
    const result = await createTransaction(body);

    return NextResponse.json({
      transaction: result.transaction,
      reimbursementRequest: result.reimbursementRequest ?? null,
      message: buildSuccessMessage(body.fundSource, !!result.reimbursementRequest),
    }, { status: 201 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi hệ thống";
    console.error("[POST /api/finance/transactions]", msg);
    // 400 cho lỗi nghiệp vụ (số dư không đủ...), 500 cho lỗi hệ thống
    const isBusinessError = msg.includes("Số dư") || msg.includes("chưa được duyệt") || msg.includes("không tồn tại");
    return NextResponse.json({ error: msg }, { status: isBusinessError ? 400 : 500 });
  }
}

function buildSuccessMessage(fundSource: string, hasReimbursement: boolean): string {
  if (fundSource === "ADVANCE") return "Đã ghi nhận chi từ tạm ứng và cập nhật số dư.";
  if (fundSource === "OUT_OF_POCKET") {
    return hasReimbursement
      ? "Đã ghi nhận tự ứng và tạo đơn đề nghị hoàn ứng tự động."
      : "Đã ghi nhận tự ứng. Vui lòng bổ sung chứng từ để nộp đơn hoàn ứng.";
  }
  return "Đã ghi nhận khoản thu.";
}
