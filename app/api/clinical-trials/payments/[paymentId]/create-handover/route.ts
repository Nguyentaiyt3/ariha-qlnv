import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials, updateClinicalTrial } from "@/lib/mongodb/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { actualReceivedAmount, splits, costItems } = await request.json();

    if (!actualReceivedAmount || actualReceivedAmount <= 0) {
      return NextResponse.json(
        { error: "Số tiền thực lĩnh không hợp lệ" },
        { status: 400 }
      );
    }

    const trials = await getClinicalTrials();
    let updated = false;

    for (const trial of trials) {
      if (!trial.payments) continue;

      const paymentIndex = trial.payments.findIndex((p: any) => p.id === params.paymentId);
      if (paymentIndex === -1) continue;

      const payment = trial.payments[paymentIndex];

      // Update settlement with actual received amount
      payment.settlement = {
        ...payment.settlement,
        actualReceivedAmount,
        status: "confirmed", // Mark as having actual amount recorded
      };

      // Store splits/costItems for reference (used in handover record)
      if (costItems && costItems.length > 0) {
        payment.handoverCostItems = costItems;
      } else if (splits) {
        payment.handoverSplits = splits;
      }

      await updateClinicalTrial(trial.id, {
        payments: trial.payments,
      });

      updated = true;
      break;
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Không tìm thấy thanh toán" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Đã lập biên bản bàn giao",
        actualReceivedAmount,
        splits: splits || undefined,
        costItems: costItems || undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating handover:", error);
    return NextResponse.json(
      { error: "Lỗi server khi lập biên bản" },
      { status: 500 }
    );
  }
}
