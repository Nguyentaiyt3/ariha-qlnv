import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { rejectionReason, rejectedBy, rejectedByUserId, rejectorRole } = body;

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
            status: "rejected" as const,
            rejectionReason,
            rejectedBy,
            rejectedByUserId,
            rejectorRole,
            rejectedAt: new Date().toISOString(),
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Payment rejected successfully",
    });
  } catch (error) {
    console.error("Error rejecting payment:", error);
    return NextResponse.json(
      { error: "Failed to reject payment" },
      { status: 500 }
    );
  }
}
