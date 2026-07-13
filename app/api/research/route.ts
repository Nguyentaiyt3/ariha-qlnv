import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopics, createResearchTopic, claimPublicTopicsByEmail } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { sameUnit } from "@/lib/rbac/scope";
import { isNckhManager, isTopicAuthor } from "@/lib/researchUtils";
import { redactTopicReviewsForViewer } from "@/lib/research";
import { generateId } from "@/lib/utils";
import { connectDB } from "@/lib/mongodb/config";
import { TaskModel } from "@/lib/mongodb/models";
import type { ResearchTopic } from "@/types";

// ─── Quarter helpers ──────────────────────────────────────────

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

/** Extract quarter number from a task name like "NCKH CS Q2" or "NCKH Quý III". */
function quarterFromName(name: string): number | null {
  const m1 = name.match(/\bQ(\d)\b/i);
  if (m1) return parseInt(m1[1]);
  const m2 = name.match(/Quý\s+(IV|III|II|I)\b/i);
  return m2 ? (ROMAN[m2[1].toUpperCase()] ?? null) : null;
}

/** Extract quarter from completionTimeline string like "Quý II, năm 2026". */
function quarterFromTimeline(tl: string): number | null {
  const m = tl.match(/Quý\s+(IV|III|II|I)\b/i);
  return m ? (ROMAN[m[1].toUpperCase()] ?? null) : null;
}

// ─── Auth ─────────────────────────────────────────────────────

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

// ─── GET /api/research ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId     = req.nextUrl.searchParams.get("taskId") ?? undefined;
  const forIntake  = req.nextUrl.searchParams.get("forIntake") === "1";

  // research:manage (director/hrAdmin) hoặc chỉ định "Quản lý NCKH" → thấy tất cả; research:monitor
  // (teamLead) → thấy đề tài đơn vị mình + đề tài mình tham gia; còn lại → chỉ đề tài của mình.
  // LƯU Ý: KHÔNG còn cấp "thấy tất cả" chỉ vì là người tham gia 1 nhiệm vụ liên kết (trước đây có
  // lỗ hổng này, để lộ toàn bộ đề tài NCKH cho bất kỳ ai được giao task, không liên quan gì đến
  // vai trò/chỉ định quản lý NCKH).
  const me = await getUser(session.userId);
  const isFullManager = !!me && hasPermission(me.role, "research:manage");
  const isTeamLeadMonitor = !!me && me.role === "teamLead" && hasPermission(me.role, "research:monitor");
  const canSeeAll = isFullManager || isNckhManager(me);

  let topics: ResearchTopic[];
  if (canSeeAll) {
    topics = await getResearchTopics(taskId, undefined, forIntake, undefined);
  } else if (isTeamLeadMonitor) {
    const all = await getResearchTopics(taskId, undefined, forIntake, undefined);
    topics = all.filter((t) =>
      t.principalInvestigatorId === session.userId ||
      (t.memberIds ?? []).includes(session.userId) ||
      t.createdBy === session.userId ||
      (me!.email && t.principalInvestigatorId === "public" && t.submitterEmail === me!.email) ||
      sameUnit(t.department, me!.department)
    );
  } else {
    const userEmail = me?.email;
    // Permanently claim any public-form submissions whose email matches this user.
    // Runs silently; errors are non-critical.
    if (userEmail) {
      claimPublicTopicsByEmail(session.userId, userEmail).catch(() => {});
    }
    topics = await getResearchTopics(taskId, session.userId, forIntake, userEmail);
  }

  // Phản biện kín 2 chiều — áp dụng cho từng đề tài theo góc nhìn người xem hiện tại (xem chi
  // tiết nguyên tắc tại redactTopicReviewsForViewer). Danh sách này trước đây trả về reviews
  // KHÔNG hề ẩn danh cho bất kỳ ai thấy được đề tài (canSeeAll/isTeamLeadMonitor) — lỗ hổng lộ
  // danh tính phản biện cho tác giả/phản biện còn lại nếu họ đồng thời có quyền quản lý.
  topics = topics.map((t) => ({
    ...t,
    reviews: redactTopicReviewsForViewer(t.reviews, session.userId, isTopicAuthor({ id: session.userId, email: me?.email }, t)),
  }));

  return NextResponse.json({ topics });
}

// ─── POST /api/research ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const id = body.id || generateId("rsch");
  const userId = session.userId;

  let taskId = (body.taskId as string | undefined) || undefined;
  let autoLinked = false;

  // ── Auto-match: if no taskId, find a matching NCKH task the user participates in ──
  if (!taskId && body.year) {
    try {
      await connectDB();
      const topicYear = Number(body.year);
      const topicQuarter = body.completionTimeline
        ? quarterFromTimeline(String(body.completionTimeline))
        : null;

      // Tasks where this user is creator, main performer, or stakeholder AND it's NCKH-related
      const candidates = await (TaskModel as any).find({
        $and: [
          {
            $or: [
              { mainPerformerId: userId },
              { creatorId: userId },
              { "stakeholders.userId": userId },
            ],
          },
          {
            $or: [
              { workflowName: /NCKH/i },
              { name: /NCKH/i },
            ],
          },
        ],
      }).lean();

      const matched = (candidates as any[]).filter((t) => {
        if (!t.deadlineBase) return false;
        const taskYear = new Date(t.deadlineBase).getFullYear();
        if (taskYear !== topicYear) return false;
        // Quarter match: only reject if both sides have a quarter and they differ
        if (topicQuarter !== null) {
          const taskQ = quarterFromName(t.name ?? "");
          if (taskQ !== null && taskQ !== topicQuarter) return false;
        }
        return true;
      });

      if (matched.length === 1) {
        taskId = String(matched[0]._id);
        autoLinked = true;
      }
    } catch {
      // auto-match is non-critical — proceed without taskId
    }
  }

  await createResearchTopic({ ...body, id, ...(taskId ? { taskId } : {}) });
  return NextResponse.json({ success: true, id, autoLinked, taskId: taskId ?? null });
}
