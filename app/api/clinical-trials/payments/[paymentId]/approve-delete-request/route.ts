import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { requestIndex, approvedBy, approvedByUserId } = body;

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

    const updatedPayments = trial.payments?.filter((p) => {
      if (p.id === paymentId) {
        if (p.editDeleteRequests && p.editDeleteRequests[requestIndex]) {
          const requests = p.editDeleteRequests.map((req, idx) => {
            if (idx === requestIndex && req.type === "delete" && req.status === "pending") {
              return {
                ...req,
                status: "approved" as const,
                approvedAt: new Date().toISOString(),
                approvedBy,
                approvedByUserId,
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
