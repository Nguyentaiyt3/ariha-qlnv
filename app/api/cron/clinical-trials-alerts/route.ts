import { NextRequest, NextResponse } from "next/server";
import {
  checkAllTrialAlerts,
  getTrialNotificationRecipients,
  formatAlertMessage,
  formatMilestoneMessage,
  checkAllPaymentReconciliations,
  PaymentReconciliationStatus,
} from "@/lib/jobs/clinicalTrialAlerts";
import {
  getClinicalTrial,
  sendEnrollmentAlertNotification,
  createEnrollmentMilestoneTask,
  createPaymentReconciliationTask,
} from "@/lib/mongodb/firestore";
import { connectDB } from "@/lib/mongodb/config";

/**
 * Cron endpoint: Check clinical trial enrollment alerts daily
 * Called by scripts/cron.js at 8 AM every day
 *
 * GET /api/cron/clinical-trials-alerts
 * Header: x-cron-secret (matches CRON_SECRET env var)
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET || "";

    if (!expectedSecret || cronSecret !== expectedSecret) {
      console.warn("[cron/clinical-trials-alerts] Invalid or missing CRON_SECRET");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[cron/clinical-trials-alerts] Starting daily check...");
    await connectDB();

    // Run alert check on all active trials
    const results = await checkAllTrialAlerts();

    // Filter to only trials with alerts or milestones
    const trialsWithAlerts = results.filter((r) => r.alerts.length > 0 || r.milestones.length > 0);

    let notificationsCreated = 0;
    let tasksCreated = 0;
    let reconciliationTasksCreated = 0;

    // Check payment reconciliations
    const reconciliationResults = await checkAllPaymentReconciliations();
    const reconciliationsToAddress = reconciliationResults.filter((r) => r.status !== PaymentReconciliationStatus.MATCHED);

    console.log(`[cron/clinical-trials-alerts] Found ${reconciliationsToAddress.length} payment reconciliation issues`);

    for (const reconciliation of reconciliationsToAddress) {
      const trial = await getClinicalTrial(reconciliation.trialId);
      if (!trial) continue;

      // Create reconciliation task for mismatch or pending
      const taskStatus = reconciliation.status as "matched" | "mismatch" | "pending";
      const task = await createPaymentReconciliationTask(
        trial,
        taskStatus,
        reconciliation.targetAmount,
        reconciliation.receivedAmount,
        reconciliation.difference
      );
      if (task) {
        reconciliationTasksCreated++;
        console.log(`[cron/clinical-trials-alerts] Created reconciliation task for ${trial.code}`);
      }
    }

    // Send notifications for each alert and milestone
    for (const trialResult of trialsWithAlerts) {
      const trial = await getClinicalTrial(trialResult.trialId);
      if (!trial) continue;

      // Get recipients for this trial
      const recipients = await getTrialNotificationRecipients(trial);

      // Send notifications for alerts
      for (const userId of recipients) {
        for (const alert of trialResult.alerts) {
          const { title, body } = formatAlertMessage(alert, trial);
          await sendEnrollmentAlertNotification(userId, trial, alert.type, body, alert.severity);
          notificationsCreated++;
        }
      }

      // Handle milestones: send notification and create task
      for (const milestone of trialResult.milestones) {
        // Send milestone notification to recipients
        for (const userId of recipients) {
          const { title, body } = formatMilestoneMessage(milestone, trial);
          await sendEnrollmentAlertNotification(userId, trial, milestone.type, body, "low");
          notificationsCreated++;
        }

        // Create task for milestone
        const milestoneTaskType = milestone.type as "50_percent" | "75_percent" | "100_percent";
        const task = await createEnrollmentMilestoneTask(trial, milestoneTaskType);
        if (task) {
          tasksCreated++;
        }
      }
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      enrollment: {
        checkedCount: results.length,
        alertCount: trialsWithAlerts.length,
        notificationsCreated,
        tasksCreated,
        trials: trialsWithAlerts.map((t) => ({
          trialId: t.trialId,
          code: t.code,
          alertCount: t.alerts.length,
          milestoneCount: t.milestones.length,
        })),
      },
      payment: {
        reconciliationsChecked: reconciliationResults.length,
        reconciliationsToAddress: reconciliationsToAddress.length,
        tasksCreated: reconciliationTasksCreated,
      },
    };

    console.log(
      `[cron/clinical-trials-alerts] Complete: ${notificationsCreated} notifications, ${tasksCreated} enrollment tasks, ${reconciliationTasksCreated} reconciliation tasks`
    );
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("[cron/clinical-trials-alerts] Error:", error);
    return NextResponse.json(
      { error: "Failed to check alerts", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
