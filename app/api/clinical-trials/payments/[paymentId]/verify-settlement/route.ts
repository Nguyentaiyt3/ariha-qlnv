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
    const { verificationNote } = body;

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

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId && p.settlement
        ? {
            ...p,
            settlement: {
              ...p.settlement,
              status: "verified" as const,
              verifiedBy: me.name,
              verifiedByUserId: me.id,
              verifiedAt: new Date().toISOString(),
              verificationNote,
            },
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Settlement verified successfully",
    });
  } catch (error) {
    console.error("Error verifying settlement:", error);
    return NextResponse.json(
      { error: "Failed to verify settlement" },
      { status: 500 }
    );
  }
}
