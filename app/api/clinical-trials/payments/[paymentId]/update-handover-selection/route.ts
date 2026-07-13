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
    const { selectedCostItemIds, netAmount, status } = body;

    if (!paymentId || netAmount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find the trial containing this payment
    const trial = await getTrialByPaymentId(paymentId);
    if (!trial) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const auth = await authorizePaymentAction(request, trial, {});
    if (!auth.ok) return auth.response;

    // Update the payment with handover selection
    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            handoverSelection: {
              selectedCostItemIds,
              netAmount,
              status: status || "selection_confirmed",
              savedAt: new Date().toISOString(),
            },
          }
        : p
    );

    // Save back to database
    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    return NextResponse.json({
      success: true,
      message: "Số tiền thực lĩnh đã được lưu",
      data: {
        paymentId,
        trialId: trial.id,
        netAmount,
        selectedCostItemIds,
        status: status || "selection_confirmed",
        savedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating handover selection:", error);
    return NextResponse.json(
      {
        error: "Lỗi khi lưu",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
