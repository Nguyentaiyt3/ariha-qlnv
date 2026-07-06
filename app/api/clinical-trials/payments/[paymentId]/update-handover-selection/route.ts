import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

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
