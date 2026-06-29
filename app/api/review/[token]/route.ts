import { NextRequest, NextResponse } from "next/server";
import { verifyToken as verifyAuthToken, getUser } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import type { ResearchTopic, ResearchReview, ReviewScores, ReviewVerdict, ReviewGrade, ResearchAnnotation } from "@/types";

function s(v: unknown, max = 4000): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

/** GET — lấy dữ liệu phản biện theo token (phản biện kín: không tiết lộ tác giả / phản biện khác). */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!token || token.length < 40) {
    return NextResponse.json({ error: "Token không hợp lệ" }, { status: 400 });
  }

  await connectDB();
  // Tìm đề tài có review với token khớp
  const doc = await ResearchTopicModel.findOne({ "reviews.token": token }).lean() as (ResearchTopic & { _id: string }) | null;
  if (!doc) return NextResponse.json({ error: "Không tìm thấy phiếu phản biện" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;
  const review = (topic.reviews ?? []).find(r => r.token === token);
  if (!review) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 404 });

  // Xác thực danh tính theo loại phản biện viên
  const authCookie = req.cookies.get("auth-token")?.value;
  let isInternalReviewer = false;

  if (review.reviewerType === "internal") {
    // Phản biện nội bộ: bắt buộc đăng nhập đúng tài khoản được phân công
    const payload = authCookie ? verifyAuthToken(authCookie) : null;
    if (!payload) {
      return NextResponse.json(
        { error: "Phiếu phản biện này yêu cầu đăng nhập bằng tài khoản được phân công.", requireLogin: true },
        { status: 401 },
      );
    }
    if (payload.userId !== review.reviewerId) {
      return NextResponse.json(
        { error: "Bạn không có quyền xem phiếu phản biện này — chỉ người được phân công mới truy cập được." },
        { status: 403 },
      );
    }
    isInternalReviewer = true;
  }
  // Phản biện ngoài: token = credential (nhận qua mail), không cần đăng nhập

  // Phản biện kín: ẩn tên tác giả, email, thành viên, các phản biện khác
  const blindedTopic = {
    id: topic.id,
    title: topic.title,
    field: topic.field,
    year: topic.year,
    abstract: topic.abstract,
    proposalFileUrl: topic.proposalFileUrl,
    completionTimeline: topic.completionTimeline,
  };

  return NextResponse.json({
    topic: blindedTopic,
    review: {
      id: review.id,
      stage: review.stage,
      status: review.status,
      dueAt: review.dueAt,
      assignedAt: review.assignedAt,
      // Trả về kết quả nếu đã nộp (để hiển thị lại)
      ...(review.status === "submitted" ? {
        scores: review.scores,
        urgency: review.urgency,
        methodFit: review.methodFit,
        novelty: review.novelty,
        significance: review.significance,
        revisionPoints: review.revisionPoints,
        additionalComments: review.additionalComments,
        verdict: review.verdict,
        grade: review.grade,
        needResubmit: review.needResubmit,
        submittedAt: review.submittedAt,
      } : {}),
    },
    isInternalReviewer,
  });
}

/** PATCH — nộp phiếu phản biện. */
export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!token || token.length < 40) {
    return NextResponse.json({ error: "Token không hợp lệ" }, { status: 400 });
  }

  await connectDB();
  const doc = await ResearchTopicModel.findOne({ "reviews.token": token }).lean() as (ResearchTopic & { _id: string }) | null;
  if (!doc) return NextResponse.json({ error: "Không tìm thấy phiếu phản biện" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;
  const review = (topic.reviews ?? []).find(r => r.token === token);
  if (!review) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 404 });

  // Xác thực danh tính trước khi cho phép nộp
  const authCookie = req.cookies.get("auth-token")?.value;
  if (review.reviewerType === "internal") {
    const payload = authCookie ? verifyAuthToken(authCookie) : null;
    if (!payload) {
      return NextResponse.json(
        { error: "Cần đăng nhập để nộp phiếu phản biện.", requireLogin: true },
        { status: 401 },
      );
    }
    if (payload.userId !== review.reviewerId) {
      return NextResponse.json(
        { error: "Bạn không có quyền nộp phiếu này — chỉ người được phân công mới có thể nộp." },
        { status: 403 },
      );
    }
  }

  // Kiểm tra hết hạn (áp dụng cho cả internal và external)
  if (review.dueAt && new Date(review.dueAt) < new Date()) {
    return NextResponse.json({ error: "Phiếu phản biện đã hết hạn nộp." }, { status: 403 });
  }

  if (review.status === "submitted") {
    return NextResponse.json({ error: "Phiếu phản biện đã được nộp" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const scores = body.scores as ReviewScores | undefined;
  const verdict = s(body.verdict) as ReviewVerdict | undefined;
  const grade = s(body.grade) as ReviewGrade | undefined;
  const now = new Date().toISOString();

  // Ghi chú + highlight riêng của phản biện viên
  const reviewerNotes = s(body.reviewerNotes, 8000);
  const reviewerAnnotations = Array.isArray(body.reviewerAnnotations)
    ? (body.reviewerAnnotations as ResearchAnnotation[]).slice(0, 200)
    : undefined;

  const set: Record<string, unknown> = {
    "reviews.$[r].status": "submitted",
    "reviews.$[r].submittedAt": now,
    "reviews.$[r].scores": scores ?? null,
    "reviews.$[r].urgency": s(body.urgency),
    "reviews.$[r].methodFit": s(body.methodFit),
    "reviews.$[r].novelty": s(body.novelty),
    "reviews.$[r].significance": s(body.significance),
    "reviews.$[r].revisionPoints": s(body.revisionPoints),
    "reviews.$[r].additionalComments": s(body.additionalComments),
    "reviews.$[r].verdict": verdict ?? null,
    "reviews.$[r].grade": grade ?? null,
    "reviews.$[r].needResubmit": typeof body.needResubmit === "boolean" ? body.needResubmit : null,
    "reviews.$[r].reviewerNotes": reviewerNotes ?? null,
    ...(reviewerAnnotations ? { "reviews.$[r].reviewerAnnotations": reviewerAnnotations } : {}),
    updatedAt: now,
  };

  await ResearchTopicModel.updateOne(
    { _id: String(doc._id) },
    { $set: set },
    { arrayFilters: [{ "r.token": token }] },
  );

  return NextResponse.json({ success: true });
}
