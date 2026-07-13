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
    const { requestIndex } = body;

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

    const updatedPayments = trial.payments?.filter((p) => {
      if (p.id === paymentId) {
        if (p.editDeleteRequests && p.editDeleteRequests[requestIndex]) {
          const requests = p.editDeleteRequests.map((req, idx) => {
            if (idx === requestIndex && req.type === "delete" && req.status === "pending") {
              return {
                ...req,
                status: "approved" as const,
                approvedAt: new Date().toISOString(),
                approvedBy: me.name,
                approvedByUserId: me.id,
              };
            }
            return req;
          });
          p.editDeleteRequests = requests;
        }
        return false; // Remove this payment
      }
      return true;
    });

    await updateClinicalTrial(trial.id, { payments: updatedPayments || [] });

    return NextResponse.json({
      message: "Delete request approved successfully",
    });
  } catch (error) {
    console.error("Error approving delete request:", error);
    return NextResponse.json(
      { error: "Failed to approve delete request" },
      { status: 500 }
    );
  }
}
