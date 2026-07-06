import { NextRequest, NextResponse } from "next/server";
import {
  getClinicalTrials,
  updateClinicalTrial,
  createFinancialTransaction,
} from "@/lib/mongodb/firestore";
import { isArihaUnit } from "@/lib/research-departments";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { approvedBy, approvedByUserId } = body;

    if (!approvedBy || !approvedByUserId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const trials = await getClinicalTrials();
    const trial = trials.find((t) =>
      t.payments?.some((p) => p.id === paymentId)
    );

    if (!trial) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

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
      const txn = await createFinancialTransaction({
        taskId: trial.id,
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

    return NextResponse.json({ success: true, arihaRevenueTransactionId });
  } catch (error) {
    console.error("Error approving distribution:", error);
    return NextResponse.json(
      { error: "Lỗi khi duyệt bàn giao" },
      { status: 500 }
    );
  }
}
