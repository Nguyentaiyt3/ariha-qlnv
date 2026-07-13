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
    const { reason } = body;

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

    const deleteRequest: EditDeleteRequest = {
      type: "delete",
      requestedAt: new Date().toISOString(),
      requestedBy: me.name,
      requestedByUserId: me.id,
      requestedByUnitName: me.department,
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
