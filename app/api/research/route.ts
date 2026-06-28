import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopics, createResearchTopic, checkResearchTaskParticipant, claimPublicTopicsByEmail } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";
import { connectDB } from "@/lib/mongodb/config";
import { TaskModel } from "@/lib/mongodb/models";

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

  // research:manage / research:monitor / task participants → see all; others → own only
  const me = await getUser(session.userId);
  const roleCanSeeAll = !!me && (
    hasPermission(me.role, "research:manage") ||
    hasPermission(me.role, "research:monitor")
  );
  const canSeeAll = roleCanSeeAll || (!taskId && await checkResearchTaskParticipant(session.userId));
  const userId = canSeeAll ? undefined : session.userId;
  const userEmail = (!canSeeAll && me?.email) ? me.email : undefined;

  // Permanently claim any public-form submissions whose email matches this user.
  // Runs silently; errors are non-critical.
  if (userId && userEmail) {
    claimPublicTopicsByEmail(userId, userEmail).catch(() => {});
  }

  const topics = await getResearchTopics(taskId, userId, forIntake, userEmail);
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
