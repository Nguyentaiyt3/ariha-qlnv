import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import { hasPermission } from "@/lib/rbac/permissions";
import { isTopicAuthor } from "@/lib/researchUtils";
import type { ResearchReview, ResearchTopic, ReviewScores, ReviewVerdict, ReviewGrade, ResearchAnnotation } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

function genId() {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function genToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function s(v: unknown, max = 500): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

/** POST — chỉ định một phản biện cho đề tài. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const doc = await ResearchTopicModel.findById(params.id).lean() as ResearchTopic & { _id: string } | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;

  // Quyền: manager, người có quyền assignReviewer, hoặc nhân viên được giao
  const isManager = hasPermission(me.role, "research:manage");
  const canAssign = isManager || hasPermission(me.role, "research:assignReviewer");
  const isDelegated = topic.reviewAssignment?.delegatedTo === me.id;
  if (!canAssign && !isDelegated) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const stage = (body.stage === "recognition" ? "recognition" : "proposal") as ResearchReview["stage"];
  const round = topic.revisionCount ?? 0;

  // Tối đa 2 phản biện độc lập mỗi giai đoạn — chỉ tính phiếu của VÒNG THẨM ĐỊNH HIỆN TẠI. Phiếu
  // vòng trước (trước khi "Yêu cầu sửa đổi") không tính vào đây nữa, để có thể chỉ định lại đủ 2
  // phản biện (kể cả người cũ) cho vòng thẩm định lại sau khi đề tài được nộp lại.
  const currentReviews = (topic.reviews ?? []).filter(r => r.stage === stage && r.status !== "removed" as string && (r.round ?? 0) === round);
  if (currentReviews.length >= 2) {
    return NextResponse.json({ error: "Đề tài đã có đủ 2 phản biện cho giai đoạn này" }, { status: 409 });
  }

  // Kiểm tra trùng reviewer
  const reviewerId = s(body.reviewerId, 100);
  if (reviewerId) {
    // Xung đột lợi ích: người thực hiện chỉ định KHÔNG được tự chọn CHÍNH MÌNH làm phản biện của
    // đề tài mình đang phân công — dù họ vẫn được thấy & chỉ định người khác bình thường. Áp dụng
    // cho cả 2 giai đoạn (không phân biệt stage).
    if (reviewerId === me.id) {
      return NextResponse.json(
        { error: "Bạn không thể tự chỉ định bản thân làm phản biện của đề tài mình đang phân công" },
        { status: 403 },
      );
    }
    // Không được chọn 1 người làm cả 2 phản biện độc lập của cùng giai đoạn.
    if (currentReviews.some(r => r.reviewerId === reviewerId)) {
      return NextResponse.json({ error: "Phản biện này đã được chỉ định cho đề tài" }, { status: 409 });
    }
    // Xung đột lợi ích: phản biện không được là tác giả/đồng tác giả đề tài — chặn hẳn, không
    // chỉ cảnh báo (trước đây chỉ trả về isCOI để client tự cảnh báo, không chặn server).
    if (isTopicAuthor({ id: reviewerId }, topic)) {
      return NextResponse.json(
        { error: "Không thể chỉ định tác giả/đồng tác giả đề tài làm phản biện của chính đề tài đó" },
        { status: 409 },
      );
    }
  }

  const token = genToken();
  const now = new Date().toISOString();

  const review: ResearchReview = {
    id: genId(),
    stage,
    round,
    mode: body.mode === "confirm" ? "confirm" : "full",
    reviewerType: body.reviewerType === "external" ? "external" : "internal",
    reviewerId: reviewerId ?? undefined,
    reviewerName: s(body.reviewerName) ?? undefined,
    reviewerEmail: s(body.reviewerEmail, 200) ?? undefined,
    reviewerOrg: s(body.reviewerOrg) ?? undefined,
    assignedAt: now,
    assignedBy: me.id,
    assignedByName: me.name,
    token,
    dueAt: s(body.dueAt) ?? undefined,
    status: "assigned",
  };

  await ResearchTopicModel.updateOne(
    { _id: params.id },
    { $push: { reviews: review }, $set: { updatedAt: now } },
  );

  return NextResponse.json({ review, token });
}

function s2(v: unknown, max = 4000): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

/**
 * PATCH — nộp phiếu phản biện của chính mình (phản biện nội bộ, đăng nhập trong app).
 * Cập nhật đúng 1 phần tử trong mảng reviews qua arrayFilters — KHÔNG bao giờ nhận nguyên mảng
 * `reviews` từ client, vì bản client đang giữ có thể đã bị ẩn danh tính phản biện khác (phản
 * biện kín ở GET) — nếu ghi đè cả mảng sẽ xoá vĩnh viễn danh tính thật của người khác trong DB.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const reviewId = s2(body.reviewId, 100);
  if (!reviewId) return NextResponse.json({ error: "Thiếu reviewId" }, { status: 400 });

  await connectDB();
  const doc = await ResearchTopicModel.findById(params.id).lean() as ResearchTopic & { _id: string } | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;
  const review = (topic.reviews ?? []).find(r => r.id === reviewId);
  if (!review) return NextResponse.json({ error: "Không tìm thấy phiếu phản biện" }, { status: 404 });

  // Chỉ chính phản biện được nộp phiếu của mình — không cho phép sửa hộ phiếu người khác.
  if (review.reviewerId !== me.id) {
    return NextResponse.json({ error: "Bạn không có quyền nộp phiếu này" }, { status: 403 });
  }
  if (review.status === "submitted") {
    return NextResponse.json({ error: "Phiếu phản biện đã được nộp" }, { status: 409 });
  }

  const scores = body.scores as ReviewScores | undefined;
  const verdict = s2(body.verdict) as ReviewVerdict | undefined;
  const grade = s2(body.grade) as ReviewGrade | undefined;
  const now = new Date().toISOString();

  const reviewerAnnotations = Array.isArray(body.reviewerAnnotations)
    ? (body.reviewerAnnotations as ResearchAnnotation[]).slice(0, 200)
    : undefined;

  const set: Record<string, unknown> = {
    "reviews.$[r].status": "submitted",
    "reviews.$[r].submittedAt": now,
    "reviews.$[r].scores": scores ?? null,
    "reviews.$[r].urgency": s2(body.urgency),
    "reviews.$[r].methodFit": s2(body.methodFit),
    "reviews.$[r].novelty": s2(body.novelty),
    "reviews.$[r].significance": s2(body.significance),
    "reviews.$[r].revisionPoints": s2(body.revisionPoints),
    "reviews.$[r].additionalComments": s2(body.additionalComments),
    "reviews.$[r].verdict": verdict ?? null,
    "reviews.$[r].grade": grade ?? null,
    "reviews.$[r].needResubmit": typeof body.needResubmit === "boolean" ? body.needResubmit : null,
    ...(reviewerAnnotations ? { "reviews.$[r].reviewerAnnotations": reviewerAnnotations } : {}),
    updatedAt: now,
  };

  await ResearchTopicModel.updateOne(
    { _id: params.id },
    { $set: set },
    { arrayFilters: [{ "r.id": reviewId }] },
  );

  return NextResponse.json({ success: true });
}

/** DELETE — hủy một chỉ định phản biện theo ?reviewId= */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isManager = hasPermission(me.role, "research:manage");
  if (!isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const reviewId = req.nextUrl.searchParams.get("reviewId");
  if (!reviewId) return NextResponse.json({ error: "Thiếu reviewId" }, { status: 400 });

  await connectDB();
  const res = await ResearchTopicModel.updateOne(
    { _id: params.id },
    {
      $pull: { reviews: { id: reviewId } },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
