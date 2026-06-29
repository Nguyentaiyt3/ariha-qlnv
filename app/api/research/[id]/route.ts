import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopic, updateResearchTopic, deleteResearchTopic } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { redactReviewer } from "@/lib/research";
import { isTopicAuthor } from "@/lib/researchUtils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const topic = await getResearchTopic(params.id);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await getUser(u.userId);
  const isManager = !!me && hasPermission(me.role, "research:manage");

  // Non-managers may only view topics they are part of
  if (!isManager) {
    const isMember =
      topic.principalInvestigatorId === u.userId ||
      (topic.memberIds ?? []).includes(u.userId) ||
      topic.createdBy === u.userId ||
      (topic.reviews ?? []).some((r) => r.reviewerId === u.userId) ||
      (topic.councilSessions ?? []).some((s) => (s.memberIds ?? []).includes(u.userId));

    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Phản biện kín: ẩn danh tính phản biện với người không có quyền quản trị
  // (mỗi phản biện viên vẫn thấy phiếu của chính mình).
  if (!isManager) {
    topic.reviews = (topic.reviews ?? []).map((r) =>
      r.reviewerId === u.userId ? r : redactReviewer(r)
    );
  }
  return NextResponse.json({ topic });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updates = await req.json();

  // COI checks — fetch topic once if any protected field is being updated
  const needsCOICheck =
    Object.prototype.hasOwnProperty.call(updates, "intakeStatus") ||
    Object.prototype.hasOwnProperty.call(updates, "reviewAssignment");

  if (needsCOICheck) {
    const [me, topic] = await Promise.all([getUser(u.userId), getResearchTopic(params.id)]);

    // Tác giả / đồng tác giả không được tự tiếp nhận đề cương
    if (Object.prototype.hasOwnProperty.call(updates, "intakeStatus") && topic) {
      if (isTopicAuthor({ id: me?.id, email: me?.email }, topic)) {
        return NextResponse.json(
          { error: "Bạn là tác giả/đồng tác giả — không thể tự kiểm tra, tiếp nhận đề cương của mình" },
          { status: 403 },
        );
      }
    }

    // Chủ nhiệm / thành viên không được được giao phân công phản biện đề tài của chính mình
    if (Object.prototype.hasOwnProperty.call(updates, "reviewAssignment") && topic) {
      const delegatedTo = (updates as { reviewAssignment?: { delegatedTo?: string } }).reviewAssignment?.delegatedTo;
      if (delegatedTo && isTopicAuthor({ id: delegatedTo }, topic)) {
        return NextResponse.json(
          { error: "Chủ nhiệm / thành viên đề tài không được phân công phản biện đề tài của chính mình" },
          { status: 403 },
        );
      }
    }
  }

  await updateResearchTopic(params.id, updates);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me || !hasPermission(me.role, "research:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteResearchTopic(params.id);
  return NextResponse.json({ success: true });
}
