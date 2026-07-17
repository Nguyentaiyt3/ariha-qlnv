import { NextRequest, NextResponse } from "next/server";
import { getTasks } from "@/lib/firebase/firestore";
import { checkAndUpdateRiskFlags } from "@/lib/risk-flag";
import { getRiskFlagConfig } from "@/lib/mongodb/firestore";

// Called by node-cron or external cron every hour
// Requires CRON_SECRET header to prevent unauthorized calls
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tasks, riskConfig] = await Promise.all([getTasks(), getRiskFlagConfig()]);
    await checkAndUpdateRiskFlags(tasks, riskConfig);
    return NextResponse.json({ ok: true, checked: tasks.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
