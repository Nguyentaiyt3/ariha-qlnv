import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { verifiedBy, verifiedByUserId, verificationNote } = body;

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

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId && p.settlement
        ? {
            ...p,
            settlement: {
              ...p.settlement,
              status: "verified" as const,
              verifiedBy,
              verifiedByUserId,
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
