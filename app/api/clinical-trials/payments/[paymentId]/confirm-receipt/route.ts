import { NextRequest, NextResponse } from "next/server";
import { updateClinicalTrial } from "@/lib/mongodb/firestore";
import { authorizePaymentAction, getTrialByPaymentId } from "@/lib/mongodb/clinicalTrialPayments";
import type { SettlementConfirmation } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;

    const trial = await getTrialByPaymentId(paymentId);
    if (!trial) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const auth = await authorizePaymentAction(request, trial, {});
    if (!auth.ok) return auth.response;
    const { me } = auth;

    const confirmation: SettlementConfirmation = {
      confirmationType: "app",
      status: "confirmed",
      confirmedBy: me.name,
      confirmedByUserId: me.id,
      confirmedAt: new Date().toISOString(),
    };

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            settlement: confirmation,
            status: "delivered" as const,
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Payment confirmed successfully",
      confirmation,
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    return NextResponse.json(
      { error: "Failed to confirm payment" },
      { status: 500 }
    );
  }
}
