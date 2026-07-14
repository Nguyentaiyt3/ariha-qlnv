import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopic, updateResearchTopic, deleteResearchTopic, getDepartmentTeamLeads, createNotification } from "@/lib/mongodb/firestore";
import { hasPermission, canDoResearchAction, canUserAssignReviewer } from "@/lib/rbac/permissions";
import { sameUnit } from "@/lib/rbac/scope";
import { redactTopicReviewsForViewer, redactAuthorForReviewer, isProposalFileLocked, isFinalReportFileLocked } from "@/lib/research";
import { isTopicAuthor, isTopicReviewer, isNckhManager } from "@/lib/researchUtils";
import { logAudit } from "@/lib/mongodb/auditLog";
import type { ResearchTopic, User, RecordChangeRequest } from "@/types";

/**
 * Các key thuộc hành động quy trình đã có kiểm soát quyền riêng (intakeStatus, reviewAssignment)
 * hoặc bị chặn hoàn toàn với designation-holder (stage) — không đi qua cổng duyệt sửa/xoá mới.
 */
const WORKFLOW_UPDATE_KEYS = ["stage", "intakeStatus", "reviewAssignment"];

async function notifyChangeRequestReviewers(topic: ResearchTopic, req: RecordChangeRequest) {
  const leads = await getDepartmentTeamLeads(topic.department);
  const title = req.type === "edit" ? "Yêu cầu sửa đề tài NCKH chờ duyệt" : "Yêu cầu xoá đề tài NCKH chờ duyệt";
  const body = `${req.requestedBy} đề nghị ${req.type === "edit" ? "sửa" : "xoá"} đề tài "${topic.code || topic.title}"`;
  for (const lead of leads) {
    await createNotification({
      userId: lead.id, type: "approval_request", title, body,
      link: `/research/${topic.id}`, read: false, priority: "normal",
      actionRequired: true, createdAt: new Date().toISOString(),
    });
  }
}

/** Thành viên đề tài (PI/thực hiện chính/đồng tác giả/tạo/phản biện/hội đồng) hoặc trưởng nhóm cùng đơn vị. */
function isTopicMember(topic: ResearchTopic, userId: string): boolean {
  return (
    topic.principalInvestigatorId === userId ||
    topic.mainPerformerId === userId ||
    (topic.memberIds ?? []).includes(userId) ||
    topic.createdBy === userId ||
    (topic.reviews ?? []).some((r) => r.reviewerId === userId) ||
    (topic.councilSessions ?? []).some((s) => (s.memberIds ?? []).includes(userId))
  );
}

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
  const isNckhMgr = !!me && isNckhManager(me);
  const isManager = !!me && (hasPermission(me.role, "research:manage") || isNckhMgr);
  const isTeamLeadOwnUnit =
    !!me && me.role === "teamLead" &&
    hasPermission(me.role, "research:monitor") &&
    sameUnit(topic.department, me.department);

  // Non-managers may only view topics they are part of (hoặc, với trưởng nhóm, cùng đơn vị)
  if (!isManager) {
    const isMember =
      topic.principalInvestigatorId === u.userId ||
      (topic.memberIds ?? []).includes(u.userId) ||
      topic.createdBy === u.userId ||
      (topic.reviews ?? []).some((r) => r.reviewerId === u.userId) ||
      (topic.councilSessions ?? []).some((s) => (s.memberIds ?? []).includes(u.userId));

    if (!isMember && !isTeamLeadOwnUnit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Phản biện kín 2 chiều: tác giả không được biết phản biện, 2 phản biện cùng giai đoạn không
  // được biết nhau — áp dụng cho MỌI người xem, kể cả khi họ đồng thời có quyền quản lý (vd.
  // hrAdmin/Quản lý NCKH tự đăng ký đề tài, hoặc 1 phản biện cũng đang giữ vai trò quản lý khác).
  // Chỉ Quản lý NCKH thật (isNckhMgr) mới được xem đầy đủ khi không phải tác giả/phản biện —
  // quyền research:manage nói chung (vd. toàn bộ "staff" trong 1 số tổ chức) không đủ.
  const viewerIsAuthor = isTopicAuthor({ id: u.userId, email: me?.email }, topic);
  topic.reviews = redactTopicReviewsForViewer(topic.reviews, u.userId, viewerIsAuthor, isNckhMgr);

  // Chiều còn lại: phản biện không được biết danh tính tác giả/nhóm thực hiện — áp dụng ngay cả
  // khi họ đồng thời có quyền quản lý (cùng logic với redactTopicReviewsForViewer ở trên: 1 khi
  // đã là phản biện của đề tài này thì không còn là "quản lý thuần" nữa, dù vai trò/permission có
  // cấp research:manage). Chỉ "quản lý thuần" — KHÔNG đồng thời là phản biện của đề tài này — mới
  // thấy đầy đủ danh tính để điều phối.
  let responseTopic = topic;
  if (isTopicReviewer(topic, u.userId)) {
    responseTopic = redactAuthorForReviewer(topic);
  }
  return NextResponse.json({ topic: responseTopic });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const topic = await getResearchTopic(params.id);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates = await req.json();

  // Không bao giờ nhận nguyên mảng `reviews` qua route chung này — client chỉ giữ bản đã bị ẩn
  // danh tính phản biện khác (phản biện kín ở GET), ghi đè cả mảng sẽ xoá vĩnh viễn danh tính
  // thật của người khác trong DB. Mọi thay đổi cho reviews phải qua POST/PATCH/DELETE
  // /api/research/[id]/reviews (thao tác đúng 1 phần tử, không đụng phần tử khác).
  if (Object.prototype.hasOwnProperty.call(updates, "reviews")) {
    return NextResponse.json(
      { error: "Không thể sửa mảng reviews qua route này — dùng /api/research/[id]/reviews" },
      { status: 400 },
    );
  }

  // Chặn hoàn toàn người ngoài cuộc — trước đây route này không kiểm tra quyền gì cả, ai đăng
  // nhập cũng PATCH được bất kỳ đề tài nào (kể cả đổi `stage` GĐ1→GĐ5, gán mình làm chủ nhiệm...).
  const canManage = canDoResearchAction(me as User, "research:manage", topic.department);
  const isMember = isTopicMember(topic, me.id);
  const isTeamLeadOwnUnit =
    me.role === "teamLead" && hasPermission(me.role, "research:monitor") && sameUnit(topic.department, me.department);
  const isDesignatedManager = isNckhManager(me);

  if (!canManage && !isMember && !isTeamLeadOwnUnit && !isDesignatedManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // File đề cương/đề tài bị khoá vĩnh viễn sau khi đã nộp thẩm định — không được sửa/xoá/thay
  // thế, kể cả với người có quyền quản lý, vì phản biện có thể đã/đang đánh giá đúng file đó.
  // Kiểm tra TRƯỚC cổng duyệt sửa/xoá bên dưới để chặn hẳn, không tạo yêu cầu chờ duyệt vô ích.
  if (Object.prototype.hasOwnProperty.call(updates, "proposalFileUrl") && isProposalFileLocked(topic)) {
    return NextResponse.json({ error: "Đề cương đã nộp thẩm định — không thể sửa/xoá/thay thế file" }, { status: 403 });
  }
  if (Object.prototype.hasOwnProperty.call(updates, "finalReportFileUrl") && isFinalReportFileLocked(topic)) {
    return NextResponse.json({ error: "File đề tài đã nộp thẩm định — không thể sửa/xoá/thay thế file" }, { status: 403 });
  }

  // Người chỉ có chỉ định "Quản lý NCKH" (không có quyền research:manage theo role, không phải
  // thành viên/trưởng nhóm cùng đơn vị của CHÍNH đề tài này) — sửa nội dung đề tài phải qua duyệt
  // của trưởng nhóm cùng đơn vị, để nhất quán với Thử nghiệm lâm sàng. Các hành động quy trình đã
  // có kiểm soát quyền riêng (stage/intakeStatus/reviewAssignment) không bị ảnh hưởng.
  const needsApprovalGate =
    isDesignatedManager && !canManage && !isMember && !isTeamLeadOwnUnit &&
    !WORKFLOW_UPDATE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(updates, k));

  if (needsApprovalGate) {
    if (topic.pendingChangeRequest?.status === "pending") {
      return NextResponse.json({ error: "Đề tài đang có 1 yêu cầu sửa/xoá chờ duyệt" }, { status: 409 });
    }
    const pendingChangeRequest: RecordChangeRequest = {
      type: "edit",
      requestedAt: new Date().toISOString(),
      requestedBy: me.name,
      requestedByUserId: me.id,
      proposedChanges: updates,
      status: "pending",
    };
    await updateResearchTopic(params.id, { pendingChangeRequest });
    await notifyChangeRequestReviewers(topic, pendingChangeRequest);
    return NextResponse.json({ success: true, pending: true });
  }

  // Đổi giai đoạn (GĐ1→GĐ5) là hành động quản lý toàn quy trình — chỉ canManage mới được phép,
  // TRỪ 1 ngoại lệ: tác giả/thực hiện chính được tự nộp báo cáo kết quả để đề nghị thẩm định GĐ2
  // (đây là hành động NỘP của họ, không phải hành động quản lý tuỳ ý chuyển giai đoạn — khớp với
  // canAct = canManage || isPI || isPerformer đã cho phép ở nút "Nộp báo cáo kết quả"/"Nộp thẩm
  // định" phía client). Bao gồm cả trường hợp NỘP LẠI sau khi phản biện "Yêu cầu sửa đổi" —
  // lúc đó topic.stage đã là "recognition" từ trước (không đổi khi yêu cầu sửa), currentStep bị
  // reset về "r_intake" chờ nộp lại, nên không thể chỉ dựa vào topic.stage khác "recognition" để
  // nhận diện lượt nộp đầu tiên như cũ — phải cho phép cả khi đang đứng đúng ở r_intake.
  const isPIOrPerformer = topic.principalInvestigatorId === me.id || topic.mainPerformerId === me.id;
  const isSubmitFinalReportTransition =
    updates.stage === "recognition" && updates.currentStep === "r_intake" &&
    (
      !["recognition", "completed", "rejected"].includes(topic.stage) ||
      (topic.stage === "recognition" && topic.currentStep === "r_intake")
    );
  if ("stage" in updates && !canManage && !(isSubmitFinalReportTransition && isPIOrPerformer)) {
    return NextResponse.json({ error: "Bạn không có quyền chuyển giai đoạn đề tài" }, { status: 403 });
  }

  // Tiếp nhận đề cương chỉ dành cho hrAdmin hoặc người có chỉ định "Quản lý NCKH" — vai trò
  // director/teamLead khác KHÔNG đủ nếu chưa được gán chỉ định này.
  if (Object.prototype.hasOwnProperty.call(updates, "intakeStatus")) {
    if (!isNckhManager(me)) {
      return NextResponse.json({ error: "Bạn không có quyền tiếp nhận đề cương" }, { status: 403 });
    }
    // Tác giả / đồng tác giả không được tự tiếp nhận đề cương của chính mình
    if (isTopicAuthor({ id: me.id, email: me.email }, topic)) {
      return NextResponse.json(
        { error: "Bạn là tác giả/đồng tác giả — không thể tự kiểm tra, tiếp nhận đề cương của mình" },
        { status: 403 },
      );
    }
  }

  // Phân công phản biện chỉ dành cho người có quyền chỉ định phản biện.
  if (Object.prototype.hasOwnProperty.call(updates, "reviewAssignment")) {
    if (!canManage && !canUserAssignReviewer(me as User, topic.department)) {
      return NextResponse.json({ error: "Bạn không có quyền phân công phản biện" }, { status: 403 });
    }
    const delegatedTo = (updates as { reviewAssignment?: { delegatedTo?: string } }).reviewAssignment?.delegatedTo;
    if (delegatedTo && isTopicAuthor({ id: delegatedTo }, topic)) {
      return NextResponse.json(
        { error: "Chủ nhiệm / thành viên đề tài không được phân công phản biện đề tài của chính mình" },
        { status: 403 },
      );
    }
  }

  await updateResearchTopic(params.id, updates);

  if (updates.stage && updates.stage !== topic.stage) {
    await logAudit({
      actorId: u.userId, actorName: me.name, actorRole: me.role,
      action: "research.stage_changed", entityType: "ResearchTopic", entityId: params.id,
      entityLabel: topic.code || topic.title,
      before: { stage: topic.stage }, after: { stage: updates.stage },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (hasPermission(me.role, "research:manage")) {
    await deleteResearchTopic(params.id);
    return NextResponse.json({ success: true });
  }

  // Người chỉ có chỉ định "Quản lý NCKH" (không có quyền xoá theo role) có thể đề nghị xoá,
  // nhưng phải nêu lý do và chờ trưởng nhóm cùng đơn vị duyệt — không xoá ngay.
  if (isNckhManager(me)) {
    const topic = await getResearchTopic(params.id);
    if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (topic.pendingChangeRequest?.status === "pending") {
      return NextResponse.json({ error: "Đề tài đang có 1 yêu cầu sửa/xoá chờ duyệt" }, { status: 409 });
    }
    const body = await req.json().catch(() => ({}) as { reason?: string });
    const reason = (body?.reason || "").trim();
    if (!reason) {
      return NextResponse.json({ error: "Cần nhập lý do xoá" }, { status: 400 });
    }
    const pendingChangeRequest: RecordChangeRequest = {
      type: "delete",
      requestedAt: new Date().toISOString(),
      requestedBy: me.name,
      requestedByUserId: me.id,
      reason,
      status: "pending",
    };
    await updateResearchTopic(params.id, { pendingChangeRequest });
    await notifyChangeRequestReviewers(topic, pendingChangeRequest);
    return NextResponse.json({ success: true, pending: true });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
