import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { getClinicalTrial } from "@/lib/mongodb/firestore";
import { EnrollmentShareTokenModel } from "@/lib/mongodb/models";

/**
 * GET /api/clinical-trials/validate-enrollment-token/[token]
 * Validate token and return trial data for public enrollment form
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;

    if (!token) {
      return NextResponse.json(
        { error: "Token không được cung cấp" },
        { status: 400 }
      );
    }

    await connectDB();

    // Find and validate token
    const tokenDoc = await EnrollmentShareTokenModel.findOne({ token }).lean();

    if (!tokenDoc) {
      return NextResponse.json(
        { error: "Liên kết không tồn tại" },
        { status: 404 }
      );
    }

    // Check if token is expired
    const now = new Date().toISOString();
    if ((tokenDoc as any).expiresAt < now) {
      return NextResponse.json(
        { error: "Liên kết đã hết hạn" },
        { status: 410 }
      );
    }

    // Check if token was already used
    if ((tokenDoc as any).isUsed) {
      return NextResponse.json(
        { error: "Liên kết đã được sử dụng" },
        { status: 410 }
      );
    }

    // Get trial data
    const trial = await getClinicalTrial((tokenDoc as any).trialId);
    if (!trial) {
      return NextResponse.json(
        { error: "Không tìm thấy thử nghiệm" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        trial: {
          id: trial.id,
          code: trial.code,
          abbreviation: trial.abbreviation,
          title: trial.title,
          enrollment: trial.enrollment,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[validate-enrollment-token] Error:", error);
    return NextResponse.json(
      {
        error: "Lỗi xác thực liên kết",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
