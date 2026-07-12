import { NextRequest, NextResponse } from "next/server";
import {
  updateClinicalTrial,
  createFinancialTransaction,
} from "@/lib/mongodb/firestore";
import { isArihaUnit } from "@/lib/research-departments";
import { ensureTrialExecutionTask, completePhaseTask } from "@/lib/mongodb/clinicalTrialTask";
import { authorizePaymentAction, getTrialByPaymentId } from "@/lib/mongodb/clinicalTrialPayments";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;

    const trial = await getTrialByPaymentId(paymentId);
    if (!trial) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const auth = await authorizePaymentAction(request, trial, { requireApprove: true });
    if (!auth.ok) return auth.response;
    const { me } = auth;
    const approvedBy = me.name;
    const approvedByUserId = me.id;

    const payment = trial.payments?.find((p) => p.id === paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.distributionStatus !== "submitted_for_approval") {
      return NextResponse.json(
        { error: "Thanh toán chưa được gửi báo cáo bàn giao" },
        { status: 400 }
      );
    }

    // Find the ARiHA distribution to record as revenue
    const arihaDistribution = (payment.handoverDistributions || []).find((d) =>
      isArihaUnit(d.unit)
    );

    let arihaRevenueTransactionId: string | undefined;

    if (arihaDistribution && arihaDistribution.amount > 0) {
      // Gắn vào Task theo dõi thật (tự sinh nếu chưa có) — tránh dùng trial.id giả làm taskId,
      // vốn sẽ tạo link chết "/tasks/{trial.id}" trong trang Tài chính.
      const executionTaskId = await ensureTrialExecutionTask(trial, approvedByUserId);
      const txn = await createFinancialTransaction({
        taskId: executionTaskId,
        taskName: `${trial.code} — ${trial.title || ""}`,
        createdBy: approvedByUserId,
        createdByName: approvedBy,
        amount: arihaDistribution.amount,
        direction: "CREDIT",
        fundSource: "REVENUE",
        category: "Thu nghiên cứu lâm sàng",
        description: `Bàn giao thanh toán "${payment.paymentName}" — ${trial.code} (Viện ARiHA)`,
        proofs: [],
        status: "VALID",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      arihaRevenueTransactionId = txn.id;
    }

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            distributionStatus: "approved" as const,
            distributionApprovedBy: approvedBy,
            distributionApprovedByUserId: approvedByUserId,
            distributionApprovedAt: new Date().toISOString(),
            ...(arihaRevenueTransactionId ? { arihaRevenueTransactionId } : {}),
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    // Tất cả thanh toán của trial đã bàn giao xong → đóng pha "Kết thúc & Quyết toán" (nếu đang mở)
    const allSettled = (updatedPayments || []).every((p) => p.distributionStatus === "approved");
    if (allSettled && trial.phaseTaskIds?.closeout) {
      await completePhaseTask({ ...trial, payments: updatedPayments }, "closeout", approvedByUserId);
    }

    return NextResponse.json({ success: true, arihaRevenueTransactionId });
  } catch (error) {
    console.error("Error approving distribution:", error);
    return NextResponse.json(
      { error: "Lỗi khi duyệt bàn giao" },
      { status: 500 }
    );
  }
}
