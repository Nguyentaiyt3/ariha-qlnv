/**
 * app/api/clinical-trials/alerts/check/route.ts
 *
 * Manual endpoint to trigger enrollment alert checking.
 * Used for testing or manual triggering (UI refresh, admin action).
 *
 * POST /api/clinical-trials/alerts/check
 * Returns: List of trials with active alerts
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAllTrialAlerts, getTrialNotificationRecipients, formatAlertMessage, formatMilestoneMessage } from "@/lib/jobs/clinicalTrialAlerts";
import { getClinicalTrial, sendEnrollmentAlertNotification, createEnrollmentMilestoneTask } from "@/lib/mongodb/firestore";
import { connectDB } from "@/lib/mongodb/config";

export async function POST(req: NextRequest) {
  try {
    // In a production system, verify user has permission to trigger alerts
    // For now, allow any authenticated user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Run alert check on all active trials
    const results = await checkAllTrialAlerts();

    // Filter to only trials with alerts or milestones
    const trialsWithAlerts = results.filter((r) => r.alerts.length > 0 || r.milestones.length > 0);

    let notificationsCreated = 0;

    // Send notifications for each alert and milestone
    let tasksCreated = 0;

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
        console.log(`[alerts/check] Creating task for ${trial.code} - ${milestone.type}`);
        console.log(`  Coordinator: ${trial.coordinatorId}, PI: ${trial.principalInvestigatorId}`);
        const task = await createEnrollmentMilestoneTask(trial, milestoneTaskType);
        if (task) {
          tasksCreated++;
          console.log(`  ✓ Task created: ${task.id}`);
        } else {
          console.log(`  ✗ Task not created (null returned)`);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
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
      { status: 200 }
    );
  } catch (error) {
    console.error("[API /clinical-trials/alerts/check] Error:", error);
    return NextResponse.json(
      { error: "Failed to check alerts", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
