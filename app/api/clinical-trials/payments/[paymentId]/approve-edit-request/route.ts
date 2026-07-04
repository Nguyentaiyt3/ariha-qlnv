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

    const updatedPayments = trial.payments?.map((p) => {
      if (p.id === paymentId && p.editDeleteRequests) {
        const requests = p.editDeleteRequests.map((req, idx) => {
          if (idx === requestIndex && req.type === "edit" && req.status === "pending") {
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

        const editReq = requests[requestIndex];
        if (editReq && editReq.type === "edit" && editReq.status === "approved" && editReq.editedData) {
          return {
            ...p,
            ...editReq.editedData,
            editDeleteRequests: requests,
          };
        }

        return { ...p, editDeleteRequests: requests };
      }
      return p;
    });

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      message: "Edit request approved successfully",
    });
  } catch (error) {
    console.error("Error approving edit request:", error);
    return NextResponse.json(
      { error: "Failed to approve edit request" },
      { status: 500 }
    );
  }
}
