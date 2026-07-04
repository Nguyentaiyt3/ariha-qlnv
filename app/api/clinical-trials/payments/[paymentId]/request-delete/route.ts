import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";
import type { EditDeleteRequest } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { requestedBy, requestedByUserId, requestedByUnitName, reason } = body;

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

    const deleteRequest: EditDeleteRequest = {
      type: "delete",
      requestedAt: new Date().toISOString(),
      requestedBy,
      requestedByUserId,
      requestedByUnitName,
      reason,
      status: "pending",
    };

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            editDeleteRequests: [...(p.editDeleteRequests || []), deleteRequest],
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Delete request submitted successfully",
      request: deleteRequest,
    });
  } catch (error) {
    console.error("Error submitting delete request:", error);
    return NextResponse.json(
      { error: "Failed to submit delete request" },
      { status: 500 }
    );
  }
}
