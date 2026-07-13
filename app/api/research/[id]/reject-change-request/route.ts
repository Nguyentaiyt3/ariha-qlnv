import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopic, updateResearchTopic, createNotification } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const topic = await getResearchTopic(params.id);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const req_ = topic.pendingChangeRequest;
  if (!req_ || req_.status !== "pending") {
    return NextResponse.json({ error: "Không có yêu cầu nào đang chờ duyệt" }, { status: 404 });
  }

  const canReview =
    hasPermission(me.role, "research:manage") ||
    (me.role === "teamLead" && sameUnit(topic.department, me.department));
  if (!canReview) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}) as { rejectionReason?: string });
  const rejectionReason = (body?.rejectionReason || "").trim();
  if (!rejectionReason) {
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await updateResearchTopic(params.id, {
    pendingChangeRequest: {
      ...req_,
      status: "rejected",
      rejectionReason,
      reviewedAt: now,
      reviewedBy: me.name,
      reviewedByUserId: me.id,
    },
  });

  await createNotification({
    userId: req_.requestedByUserId,
    type: "request_rejected",
    title: req_.type === "edit" ? "Yêu cầu sửa đề tài NCKH bị từ chối" : "Yêu cầu xoá đề tài NCKH bị từ chối",
    body: `${me.name} đã từ chối: ${rejectionReason}`,
    link: `/research/${topic.id}`,
    read: false,
    priority: "normal",
    createdAt: now,
  });

  return NextResponse.json({ success: true });
}
