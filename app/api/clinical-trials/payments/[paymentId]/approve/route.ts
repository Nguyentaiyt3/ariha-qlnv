import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { approvedBy, approvedByUserId, approverRole, approverPosition } = body;

    // Find trial with this payment
    const trials = await getClinicalTrials();
    const trial = trials.find((t) =>
      t.payments?.some((p) => p.id === paymentId)
    );

    if (!trial) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Update the payment
    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            status: "approved" as const,
            approvedBy,
            approvedByUserId,
            approverRole,
            approverPosition,
            approvedAt: new Date().toISOString(),
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Payment approved successfully",
    });
  } catch (error) {
    console.error("Error approving payment:", error);
    return NextResponse.json(
      { error: "Failed to approve payment" },
      { status: 500 }
    );
  }
}
