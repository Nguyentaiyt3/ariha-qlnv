import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { getClinicalTrial, createEnrollmentShareToken } from "@/lib/mongodb/firestore";

/**
 * POST /api/clinical-trials/{id}/share-enrollment
 * Generate a shareable token for enrollment update via email link
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const { email, recipientName } = await req.json();

    if (!id || !email) {
      return NextResponse.json(
        { error: "Trial ID and email required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Get trial to verify it exists
    const trial = await getClinicalTrial(id);
    if (!trial) {
      return NextResponse.json(
        { error: "Trial not found" },
        { status: 404 }
      );
    }

    // Get current user from auth header (in real app, use proper auth)
    const userIdHeader = req.headers.get("x-user-id") || "system";

    // Generate share token (valid 7 days)
    const { token, expiresAt } = await createEnrollmentShareToken(id, userIdHeader);

    // Build email link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareLink = `${appUrl}/clinical-trials/enrollment/${token}`;

    // Prepare email content
    const emailContent = `
Xin chào ${recipientName || "Coordinator"},

Bạn được mời cập nhật tiến độ tuyển bệnh cho thử nghiệm lâm sàng:

Mã thử nghiệm: ${trial.code}
Tên thử nghiệm: ${trial.abbreviation || trial.title}

Vui lòng truy cập link dưới đây để cập nhật thông tin tiến độ tuyển bệnh:

${shareLink}

Link này có hiệu lực trong 7 ngày. Sau khi cập nhật, bạn không cần xác minh thêm.

Link sinh ra lúc: ${new Date().toLocaleString("vi-VN")}
Hết hạn lúc: ${new Date(expiresAt).toLocaleString("vi-VN")}

Trân trọng,
ARiHA WorkHub System
    `.trim();

    // TODO: Send email via SMTP/Gmail API
    console.log(`[share-enrollment] Would send email to ${email}:`);
    console.log(emailContent);

    return NextResponse.json(
      {
        success: true,
        token,
        shareLink,
        expiresAt,
        message: "Enrollment share link generated. Email functionality not yet implemented.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[share-enrollment] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate share link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
