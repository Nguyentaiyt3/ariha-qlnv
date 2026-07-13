import { NextRequest, NextResponse } from "next/server";
import { updateClinicalTrial } from "@/lib/mongodb/firestore";
import { authorizePaymentAction, getTrialByPaymentId } from "@/lib/mongodb/clinicalTrialPayments";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { rejectionReason } = body;

    const trial = await getTrialByPaymentId(paymentId);
    if (!trial) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const auth = await authorizePaymentAction(request, trial, { requireApprove: true });
    if (!auth.ok) return auth.response;
    const { me } = auth;

    // Update the payment
    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            status: "rejected" as const,
            rejectionReason,
            rejectedBy: me.name,
            rejectedByUserId: me.id,
            rejectorRole: me.role,
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
