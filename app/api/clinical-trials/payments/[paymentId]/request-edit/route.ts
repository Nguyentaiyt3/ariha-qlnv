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
    const { requestedBy, requestedByUserId, requestedByUnitName, editedData, reason } = body;

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

    const editRequest: EditDeleteRequest = {
      type: "edit",
      requestedAt: new Date().toISOString(),
      requestedBy,
      requestedByUserId,
      requestedByUnitName,
      reason,
      status: "pending",
      editedData,
    };

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            editDeleteRequests: [...(p.editDeleteRequests || []), editRequest],
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Edit request submitted successfully",
      request: editRequest,
    });
  } catch (error) {
    console.error("Error submitting edit request:", error);
    return NextResponse.json(
      { error: "Failed to submit edit request" },
      { status: 500 }
    );
  }
}
