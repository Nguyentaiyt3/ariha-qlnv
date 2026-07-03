/**
 * lib/jobs/clinicalTrialAlerts.ts
 *
 * Enrollment alert checker for clinical trials.
 * Checks trial conditions and sends notifications to coordinators when thresholds are met.
 * Can be called manually via API or scheduled as a daily job.
 */

import { connectDB } from "../mongodb/config";
import { ClinicalTrialModel } from "../mongodb/models";
import type { ClinicalTrial } from "@/types";

export enum EnrollmentAlertType {
  APPROACHING_DEADLINE = "approaching_deadline",
  FALLING_BEHIND = "falling_behind",
  HIGH_AE = "high_ae",
  HIGH_SAE = "high_sae",
  ENROLLMENT_COMPLETE = "enrollment_complete",
}

export enum EnrollmentMilestoneType {
  FIFTY_PERCENT = "50_percent",
  SEVENTY_FIVE_PERCENT = "75_percent",
  ONE_HUNDRED_PERCENT = "100_percent",
}

interface AlertCheckResult {
  trialId: string;
  code: string;
  alerts: {
    type: EnrollmentAlertType;
    severity: "low" | "medium" | "high";
    message: string;
  }[];
  milestones: {
    type: EnrollmentMilestoneType;
    percentage: number;
    message: string;
  }[];
}

/**
 * Check enrollment conditions for a single trial.
 * Returns alert conditions that should trigger notifications.
 */
export function checkTrialEnrollmentAlerts(trial: ClinicalTrial): AlertCheckResult["alerts"] {
  const alerts: AlertCheckResult["alerts"] = [];

  if (!trial.enrollment) {
    return alerts;
  }

  const enrollment = trial.enrollment;
  const now = new Date();
  const endDate = trial.endPeriod ? new Date(trial.endPeriod) : null;

  // 1. Check approaching deadline (30 days before endPeriod)
  if (endDate) {
    const daysUntilDeadline = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDeadline > 0 && daysUntilDeadline <= 30 && daysUntilDeadline > 0) {
      alerts.push({
        type: EnrollmentAlertType.APPROACHING_DEADLINE,
        severity: daysUntilDeadline <= 7 ? "high" : "medium",
        message: `Enrollment deadline approaching: ${daysUntilDeadline} days remaining`,
      });
    }
  }

  // 2. Check if enrollment falling behind target (< 50% with active trial)
  if (enrollment.targetSite && enrollment.targetSite > 0) {
    const enrollmentPercent = enrollment.enrolledAtSite
      ? Math.round((enrollment.enrolledAtSite / enrollment.targetSite) * 100)
      : 0;

    // Only alert if trial is active (running or pre-enrollment)
    const isActiveTrial = ["running_pre_enroll", "running_enrolled"].includes(trial.status);
    if (isActiveTrial && enrollmentPercent < 50 && enrollment.enrolledAtSite !== enrollment.targetSite) {
      alerts.push({
        type: EnrollmentAlertType.FALLING_BEHIND,
        severity: enrollmentPercent < 25 ? "high" : "medium",
        message: `Enrollment at ${enrollmentPercent}% of target (${enrollment.enrolledAtSite}/${enrollment.targetSite})`,
      });
    }
  }

  // 3. Check high AE count (> 10)
  if (enrollment.aeCount && enrollment.aeCount > 10) {
    alerts.push({
      type: EnrollmentAlertType.HIGH_AE,
      severity: enrollment.aeCount > 20 ? "high" : "medium",
      message: `High AE count: ${enrollment.aeCount} adverse events reported`,
    });
  }

  // 4. Check high SAE count (> 3)
  if (enrollment.saeCount && enrollment.saeCount > 3) {
    alerts.push({
      type: EnrollmentAlertType.HIGH_SAE,
      severity: enrollment.saeCount > 5 ? "high" : "high", // SAE is always high severity
      message: `Serious AE reported: ${enrollment.saeCount} serious adverse events`,
    });
  }

  // 5. Check enrollment complete (reached 100% of target)
  if (
    enrollment.targetSite &&
    enrollment.enrolledAtSite &&
    enrollment.enrolledAtSite >= enrollment.targetSite &&
    trial.status === "running_enrolled"
  ) {
    alerts.push({
      type: EnrollmentAlertType.ENROLLMENT_COMPLETE,
      severity: "low",
      message: `Enrollment target reached: ${enrollment.enrolledAtSite}/${enrollment.targetSite}`,
    });
  }

  return alerts;
}

/**
 * Check all active trials and return alerts.
 * Used by scheduled jobs or manual trigger API.
 */
export async function checkAllTrialAlerts(): Promise<AlertCheckResult[]> {
  await connectDB();

  // Fetch all active trials (not completed, terminated, or not_feasible)
  const activeStatuses = ["feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met", "lec_approved", "awaiting_moh", "pre_deployment", "running_pre_enroll", "running_enrolled"];

  const trials = await ClinicalTrialModel.find({
    status: { $in: activeStatuses },
  }).lean() as unknown as (ClinicalTrial & { _id: string })[];

  return trials.map((trial) => {
    const milestones = checkTrialEnrollmentMilestones(trial);
    if (milestones.length > 0) {
      console.log(`[checkAllTrialAlerts] ${trial.code}: ${milestones.length} milestones detected`);
      console.log(`  Coordinator: ${trial.coordinatorId}, PI: ${trial.principalInvestigatorId}`);
    }
    return {
      trialId: trial._id.toString(),
      code: trial.code,
      alerts: checkTrialEnrollmentAlerts(trial),
      milestones,
    };
  });
}

/**
 * Get coordinator/manager user IDs for a trial.
 * These are the users who should receive alerts.
 */
export async function getTrialNotificationRecipients(trial: ClinicalTrial): Promise<string[]> {
  const recipients = new Set<string>();

  // Add coordinator if assigned
  if (trial.coordinatorId) {
    recipients.add(trial.coordinatorId);
  }

  // Add PI if they have a user account (coordinatorId field)
  if (trial.principalInvestigatorId) {
    recipients.add(trial.principalInvestigatorId);
  }

  // Note: In a full implementation, would also query for users with trial:manage permission
  // For now, this is handled via the API that calls this function

  return Array.from(recipients);
}

/**
 * Check enrollment milestones for a trial.
 * Returns milestones that should trigger task creation.
 */
export function checkTrialEnrollmentMilestones(trial: ClinicalTrial): AlertCheckResult["milestones"] {
  const milestones: AlertCheckResult["milestones"] = [];

  if (!trial.enrollment || !trial.enrollment.targetSite || trial.enrollment.targetSite === 0) {
    return milestones;
  }

  const enrollment = trial.enrollment;
  const actualEnrolled = enrollment.enrolledAtSite || 0;
  const enrollmentPercent = Math.round((actualEnrolled / trial.enrollment.targetSite) * 100);

  // Check 100% enrollment milestone
  if (actualEnrolled >= trial.enrollment.targetSite && trial.status === "running_enrolled") {
    milestones.push({
      type: EnrollmentMilestoneType.ONE_HUNDRED_PERCENT,
      percentage: 100,
      message: `Tuyển bệnh đạt 100% chỉ tiêu: ${actualEnrolled}/${trial.enrollment.targetSite}`,
    });
  }

  // Check 75% enrollment milestone
  if (enrollmentPercent >= 75 && enrollmentPercent < 100 && trial.status === "running_enrolled") {
    milestones.push({
      type: EnrollmentMilestoneType.SEVENTY_FIVE_PERCENT,
      percentage: 75,
      message: `Tuyển bệnh đạt 75% chỉ tiêu: ${actualEnrolled}/${trial.enrollment.targetSite}`,
    });
  }

  // Check 50% enrollment milestone
  if (enrollmentPercent >= 50 && enrollmentPercent < 75 && trial.status === "running_enrolled") {
    milestones.push({
      type: EnrollmentMilestoneType.FIFTY_PERCENT,
      percentage: 50,
      message: `Tuyển bệnh đạt 50% chỉ tiêu: ${actualEnrolled}/${trial.enrollment.targetSite}`,
    });
  }

  return milestones;
}

/**
 * Format alert message for notification.
 */
export function formatAlertMessage(alert: AlertCheckResult["alerts"][0], trial: ClinicalTrial): { title: string; body: string } {
  const title = `[${trial.abbreviation || trial.code}] Enrollment Alert`;

  const severityLabel = {
    low: "📋",
    medium: "⚠️",
    high: "🚨",
  }[alert.severity];

  const typeLabel = {
    [EnrollmentAlertType.APPROACHING_DEADLINE]: "Approaching Deadline",
    [EnrollmentAlertType.FALLING_BEHIND]: "Enrollment Behind Target",
    [EnrollmentAlertType.HIGH_AE]: "High AE Count",
    [EnrollmentAlertType.HIGH_SAE]: "Serious AE Reported",
    [EnrollmentAlertType.ENROLLMENT_COMPLETE]: "Enrollment Complete",
  }[alert.type];

  const body = `${severityLabel} ${typeLabel}\n${alert.message}`;

  return { title, body };
}

/**
 * Format milestone message for notification.
 */
export function formatMilestoneMessage(milestone: AlertCheckResult["milestones"][0], trial: ClinicalTrial): { title: string; body: string } {
  const title = `[${trial.abbreviation || trial.code}] Cột Mốc Tuyển Bệnh`;

  const typeLabel = {
    [EnrollmentMilestoneType.FIFTY_PERCENT]: "50% Đạt",
    [EnrollmentMilestoneType.SEVENTY_FIVE_PERCENT]: "75% Đạt",
    [EnrollmentMilestoneType.ONE_HUNDRED_PERCENT]: "100% Đạt",
  }[milestone.type];

  const body = `🎯 ${typeLabel}\n${milestone.message}`;

  return { title, body };
}

// ─── PAYMENT RECONCILIATION ────────────────────────────────────

export enum PaymentReconciliationStatus {
  PENDING = "pending",
  MATCHED = "matched",
  MISMATCH = "mismatch",
  RECEIVED = "received",
}

interface PaymentReconciliationResult {
  trialId: string;
  code: string;
  status: PaymentReconciliationStatus;
  targetAmount: number;
  receivedAmount: number;
  difference: number;
  paymentCount: number;
  message: string;
}

/**
 * Check payment reconciliation for trials with 100% enrollment.
 * Match pending payments with expected amounts.
 */
export function checkPaymentReconciliation(trial: ClinicalTrial & { _id?: string }): PaymentReconciliationResult | null {
  // Only check trials with 100% enrollment
  if (!trial.enrollment || !trial.enrollment.targetSite || trial.enrollment.enrolledAtSite !== trial.enrollment.targetSite) {
    return null;
  }

  // No payments to reconcile
  if (!trial.payments || trial.payments.length === 0) {
    return null;
  }

  const receivedPayments = trial.payments.filter((p) => p.received);
  const totalReceived = receivedPayments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  // Calculate expected amount (rough estimate: enrollment target * base cost)
  // Note: This is simplified; actual calculation would use line items from budgets
  const targetAmount = trial.enrollment.enrolledAtSite * 5000000; // VND per subject (example)

  const difference = Math.abs(targetAmount - totalReceived);
  const tolerancePercent = 0.1; // 10% tolerance
  const tolerance = targetAmount * tolerancePercent;

  let status: PaymentReconciliationStatus;
  if (totalReceived === 0) {
    status = PaymentReconciliationStatus.PENDING;
  } else if (difference <= tolerance) {
    status = PaymentReconciliationStatus.MATCHED;
  } else {
    status = PaymentReconciliationStatus.MISMATCH;
  }

  const message =
    status === PaymentReconciliationStatus.MATCHED
      ? `✓ Payment matched: ${totalReceived.toLocaleString("vi-VN")} ≈ ${targetAmount.toLocaleString("vi-VN")} VND`
      : status === PaymentReconciliationStatus.MISMATCH
        ? `⚠️ Payment mismatch: Received ${totalReceived.toLocaleString("vi-VN")} but expected ~${targetAmount.toLocaleString("vi-VN")} VND (difference: ${difference.toLocaleString("vi-VN")} VND)`
        : `📋 Awaiting payment: Expected ${targetAmount.toLocaleString("vi-VN")} VND`;

  return {
    trialId: trial._id?.toString() || trial.id || "",
    code: trial.code,
    status,
    targetAmount,
    receivedAmount: totalReceived,
    difference,
    paymentCount: receivedPayments.length,
    message,
  };
}

/**
 * Check payment reconciliation for all trials with 100% enrollment.
 * Returns list of reconciliation results (pending, matched, mismatch).
 */
export async function checkAllPaymentReconciliations(): Promise<PaymentReconciliationResult[]> {
  await connectDB();

  // Fetch all trials with completed enrollment
  const activeStatuses = ["feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met", "lec_approved", "awaiting_moh", "pre_deployment", "running_pre_enroll", "running_enrolled"];

  const trials = await ClinicalTrialModel.find({
    status: { $in: activeStatuses },
    "enrollment.enrolledAtSite": { $gt: 0 },
  }).lean() as unknown as (ClinicalTrial & { _id: string })[];

  const results: PaymentReconciliationResult[] = [];

  for (const trial of trials) {
    const reconciliation = checkPaymentReconciliation(trial);
    if (reconciliation) {
      results.push(reconciliation);
    }
  }

  return results;
}
