import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchTopics, createResearchTopic, checkResearchTaskParticipant } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = req.nextUrl.searchParams.get("taskId") ?? undefined;

  // research:manage / research:monitor / task participants → see all topics; others → own only
  const me = await getUser(session.userId);
  const roleCanSeeAll = !!me && (
    hasPermission(me.role, "research:manage") ||
    hasPermission(me.role, "research:monitor")
  );
  const canSeeAll = roleCanSeeAll || (!taskId && await checkResearchTaskParticipant(session.userId));
  const userId = canSeeAll ? undefined : session.userId;

  const topics = await getResearchTopics(taskId, userId);
  return NextResponse.json({ topics });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("rsch");
  await createResearchTopic({ ...body, id });
  return NextResponse.json({ success: true, id });
}
