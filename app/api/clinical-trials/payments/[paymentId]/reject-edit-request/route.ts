import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { requestIndex, rejectionReason, rejectedBy, rejectedByUserId } = body;

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

    const updatedPayments = trial.payments?.map((p) => {
      if (p.id === paymentId && p.editDeleteRequests) {
        const requests = p.editDeleteRequests.map((req, idx) => {
          if (idx === requestIndex && req.status === "pending") {
            return {
              ...req,
              status: "rejected" as const,
              rejectionReason,
              approvedAt: new Date().toISOString(),
              approvedBy: rejectedBy,
              approvedByUserId: rejectedByUserId,
            };
          }
          return req;
        });

        return { ...p, editDeleteRequests: requests };
      }
      return p;
    });

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Edit request rejected successfully",
    });
  } catch (error) {
    console.error("Error rejecting edit request:", error);
    return NextResponse.json(
      { error: "Failed to reject edit request" },
      { status: 500 }
    );
  }
}
