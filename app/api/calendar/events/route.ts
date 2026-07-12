import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getCalendarEvents, saveCalendarEvent, getPendingCalendarEvents, approveCalendarEvent, getUsers } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { sameUnit } from "@/lib/rbac/scope";
import { CalendarEventModel } from "@/lib/mongodb/models";
import type { UserRole } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

function canApproveCalendar(role: UserRole): boolean {
  return hasPermission(role, "calendar:approveChange") || hasPermission(role, "calendar:approveLevel2");
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pending = req.nextUrl.searchParams.get("pending") === "true";
  if (pending) {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(user.userId);
    if (!me || !canApproveCalendar(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    let events = await getPendingCalendarEvents();
    if (me.role === "teamLead") {
      const users = await getUsers();
      const deptByUserId = new Map(users.map((u) => [u.id, u.department]));
      events = events.filter((e) => sameUnit(deptByUserId.get(e.userId), me.department));
    }
    return NextResponse.json({ events });
  }
  const requestedUserId = req.nextUrl.searchParams.get("userId");
  let userId = user.userId;
  if (requestedUserId && requestedUserId !== user.userId) {
    await ensurePermissionOverridesLoaded();
    const me = await getUser(user.userId);
    if (!me || !canApproveCalendar(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = requestedUserId;
  }
  const events = await getCalendarEvents(userId);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "approve" || body.action === "reject") {
    if (typeof body.id !== "string") {
      return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    }
    await ensurePermissionOverridesLoaded();
    const me = await getUser(user.userId);
    if (!me || !canApproveCalendar(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (me.role === "teamLead") {
      const event = await CalendarEventModel.findById(body.id).lean() as any;
      const owner = event ? await getUser(event.userId) : null;
      if (!owner || !sameUnit(owner.department, me.department)) {
        return NextResponse.json({ error: "Bạn chỉ được duyệt lịch của nhân viên đơn vị mình" }, { status: 403 });
      }
    }
    await approveCalendarEvent(body.id, body.action === "approve", body.reason);
    return NextResponse.json({ success: true });
  }
  const id = body.id || generateId("evt");
  await saveCalendarEvent({ ...body, id });
  return NextResponse.json({ success: true, id });
}
