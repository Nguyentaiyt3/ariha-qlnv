import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import {
  getClinicalTrial,
  updateClinicalTrial,
  createEnrollmentMilestoneTask,
  getEnrollmentShareToken,
  markTokenAsUsed,
} from "@/lib/mongodb/firestore";
import { EnrollmentMilestoneType } from "@/lib/jobs/clinicalTrialAlerts";
import type { ClinicalTrialEnrollment } from "@/types";

/**
 * Detect newly reached milestones by comparing old vs new enrollment
 */
function detectNewMilestones(
  oldEnrollment: ClinicalTrialEnrollment | undefined,
  newEnrollment: ClinicalTrialEnrollment,
  targetSite: number | undefined
): EnrollmentMilestoneType[] {
  const milestones: EnrollmentMilestoneType[] = [];

  if (!targetSite || targetSite === 0) {
    return milestones;
  }

  const oldEnrolled = oldEnrollment?.enrolledAtSite || 0;
  const newEnrolled = newEnrollment.enrolledAtSite || 0;

  const oldPercent = Math.round((oldEnrolled / targetSite) * 100);
  const newPercent = Math.round((newEnrolled / targetSite) * 100);

  // Detect 100% milestone
  if (newEnrolled >= targetSite && oldEnrolled < targetSite) {
    milestones.push(EnrollmentMilestoneType.ONE_HUNDRED_PERCENT);
  }

  // Detect 75% milestone
  if (newPercent >= 75 && oldPercent < 75 && newEnrolled < targetSite) {
    milestones.push(EnrollmentMilestoneType.SEVENTY_FIVE_PERCENT);
  }

  // Detect 50% milestone
  if (newPercent >= 50 && oldPercent < 50 && newPercent < 75) {
    milestones.push(EnrollmentMilestoneType.FIFTY_PERCENT);
  }

  return milestones;
}

/**
 * POST /api/clinical-trials/{id}/enrollment/shared
 * Update enrollment via shared token (no auth required)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await req.json();
    const { enrollmentData, token } = body;

    if (!id || !token || !enrollmentData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectDB();

    // Validate token
    const tokenDoc = await getEnrollmentShareToken(token);
    if (!tokenDoc || tokenDoc.trialId !== id) {
      return NextResponse.json(
        { error: "Liên kết không hợp lệ hoặc đã hết hạn" },
        { status: 401 }
      );
    }

    // Get current trial
    const trial = await getClinicalTrial(id);
    if (!trial) {
      return NextResponse.json(
        { error: "Không tìm thấy thử nghiệm" },
        { status: 404 }
      );
    }

    // Merge enrollment data
    const updatedEnrollment: ClinicalTrialEnrollment = {
      ...trial.enrollment,
      ...enrollmentData,
    };

    // Validate: enrolledAtSite ≤ targetSite
    if (
      updatedEnrollment.enrolledAtSite &&
      updatedEnrollment.targetSite &&
      updatedEnrollment.enrolledAtSite > updatedEnrollment.targetSite
    ) {
      return NextResponse.json(
        { error: `Số tuyển không được vượt quá chỉ tiêu (${updatedEnrollment.targetSite})` },
        { status: 400 }
      );
    }

    // Check for newly reached milestones before update
    const newMilestoneTypes = detectNewMilestones(
      trial.enrollment,
      updatedEnrollment,
      updatedEnrollment.targetSite
    );

    // Update trial enrollment
    await updateClinicalTrial(id, { enrollment: updatedEnrollment });

    // Mark token as used
    await markTokenAsUsed(tokenDoc._id, "shared-link-update");

    const newMilestones: Array<{ type: string; message: string }> = [];

    // Create tasks for newly reached milestones
    for (const milestoneType of newMilestoneTypes) {
      const task = await createEnrollmentMilestoneTask(trial, milestoneType);
      if (task) {
        newMilestones.push({
          type: milestoneType,
          message: `Created milestone task for ${milestoneType}`,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        updatedEnrollment,
        newMilestones,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[enrollment/shared] Error:", error);
    return NextResponse.json(
      {
        error: "Lỗi cập nhật tiến độ",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
