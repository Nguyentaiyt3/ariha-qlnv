import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrials } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import type { ClinicalTrial } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    const auth = token ? verifyToken(token) : null;
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await ensurePermissionOverridesLoaded();
    const me = await getUser(auth.userId);
    if (!me || !(hasPermission(me.role, "finance:approve") || hasPermission(me.role, "trial:manage"))) {
      return NextResponse.json({ error: "Không có quyền xem danh sách chờ duyệt" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "pending";
    const distributionStatus = searchParams.get("distributionStatus");

    // Fetch all trials with payments
    const trials = await getClinicalTrials();

    // Flatten payments with trial info and filter by status
    const payments: any[] = [];
    for (const trial of trials) {
      if (trial.payments && Array.isArray(trial.payments)) {
        for (const payment of trial.payments) {
          const matches = distributionStatus
            ? payment.distributionStatus === distributionStatus
            : status === "all" || (payment.status || "pending") === status;

          if (matches) {
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
