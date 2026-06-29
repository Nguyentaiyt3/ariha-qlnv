import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import { hasPermission } from "@/lib/rbac/permissions";
import { isTopicAuthor } from "@/lib/researchUtils";
import type { ResearchReview, ResearchTopic } from "@/types";

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

  // Tối đa 2 phản biện độc lập mỗi giai đoạn
  const currentReviews = (topic.reviews ?? []).filter(r => r.stage === stage && r.status !== "removed" as string);
  if (currentReviews.length >= 2) {
    return NextResponse.json({ error: "Đề tài đã có đủ 2 phản biện cho giai đoạn này" }, { status: 409 });
  }

  // Kiểm tra trùng reviewer
  const reviewerId = s(body.reviewerId, 100);
  if (reviewerId) {
    if (currentReviews.some(r => r.reviewerId === reviewerId)) {
      return NextResponse.json({ error: "Phản biện này đã được chỉ định cho đề tài" }, { status: 409 });
    }
    // COI check: cảnh báo nhưng không chặn (warning returned in response)
  }

  const token = genToken();
  const now = new Date().toISOString();

  const review: ResearchReview = {
    id: genId(),
    stage,
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

  // COI warning — phản biện là tác giả/đồng tác giả
  const isCOI = reviewerId
    ? isTopicAuthor({ id: reviewerId }, topic)
    : false;

  return NextResponse.json({ review, token, isCOI });
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
