import { NextRequest, NextResponse } from "next/server";
import { updateClinicalTrial } from "@/lib/mongodb/firestore";
import { authorizePaymentAction, getTrialByPaymentId } from "@/lib/mongodb/clinicalTrialPayments";
import type { EditDeleteRequest } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { editedData, reason } = body;

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

    const editRequest: EditDeleteRequest = {
      type: "edit",
      requestedAt: new Date().toISOString(),
      requestedBy: me.name,
      requestedByUserId: me.id,
      requestedByUnitName: me.department,
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
