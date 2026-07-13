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
    const body = await request.json();
    const { handoverDocumentUrl } = body;

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
      confirmationType: "document",
      status: "confirmed",
      confirmedBy: me.name,
      confirmedByUserId: me.id,
      confirmedAt: new Date().toISOString(),
      handoverDocumentUrl,
    };

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            settlement: confirmation,
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Handover document submitted successfully",
      confirmation,
    });
  } catch (error) {
    console.error("Error submitting handover:", error);
    return NextResponse.json(
      { error: "Failed to submit handover document" },
      { status: 500 }
    );
  }
}
