import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";
import type { SettlementConfirmation } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { submittedBy, submittedByUserId, handoverDocumentUrl } = body;

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

    const confirmation: SettlementConfirmation = {
      confirmationType: "document",
      status: "confirmed",
      confirmedBy: submittedBy,
      confirmedByUserId: submittedByUserId,
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
