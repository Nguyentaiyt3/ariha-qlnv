import { NextRequest, NextResponse } from "next/server";
import { getClinicalTrials } from "@/lib/mongodb/firestore";
import type { ClinicalTrial } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "pending";

    // Fetch all trials with payments
    const trials = await getClinicalTrials();

    // Flatten payments with trial info and filter by status
    const payments: any[] = [];
    for (const trial of trials) {
      if (trial.payments && Array.isArray(trial.payments)) {
        for (const payment of trial.payments) {
          const paymentStatus = payment.status || "pending";

          // Filter by status
          if (status === "all" || paymentStatus === status) {
            payments.push({
              ...payment,
              trialId: trial.id,
              trialCode: trial.code,
              trialName: trial.title,
              department: trial.department,
            });
          }
        }
      }
    }

    // Sort by date descending
    payments.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Error fetching payment approvals:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment approvals" },
      { status: 500 }
    );
  }
}
