import { NextRequest, NextResponse } from "next/server";
import { updateClinicalTrial } from "@/lib/mongodb/firestore";
import { authorizePaymentAction, getTrialByPaymentId } from "@/lib/mongodb/clinicalTrialPayments";
import { deriveHandoverDistributions } from "@/lib/utils/costCalculator";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;
    const body = await request.json();
    const { costItemId, documentUrl, documentName } = body;

    if (!costItemId || !documentUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const trial = await getTrialByPaymentId(paymentId);
    if (!trial) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const auth = await authorizePaymentAction(request, trial, {});
    if (!auth.ok) return auth.response;
    const { me } = auth;

    const updatedPayments = trial.payments?.map((p) => {
      if (p.id !== paymentId) return p;

      const distributions =
        p.handoverDistributions && p.handoverDistributions.length > 0
          ? p.handoverDistributions
          : deriveHandoverDistributions(p);

      const updatedDistributions = distributions.map((d) =>
        d.costItemId === costItemId
          ? {
              ...d,
              documentUrl,
              documentName,
              status: "handed_over" as const,
              handedOverAt: new Date().toISOString(),
              handedOverBy: me.name,
            }
          : d
      );

      return {
        ...p,
        handoverDistributions: updatedDistributions,
        distributionStatus: p.distributionStatus || "in_progress",
      };
    });

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    const updatedPayment = updatedPayments?.find((p) => p.id === paymentId);

    return NextResponse.json({
      success: true,
      handoverDistributions: updatedPayment?.handoverDistributions,
    });
  } catch (error) {
    console.error("Error updating distribution:", error);
    return NextResponse.json(
      { error: "Lỗi khi cập nhật bàn giao" },
      { status: 500 }
    );
  }
}
