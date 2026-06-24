import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getCalendarEvents, saveCalendarEvent, getPendingCalendarEvents, approveCalendarEvent } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pending = req.nextUrl.searchParams.get("pending") === "true";
  if (pending) {
    const events = await getPendingCalendarEvents();
    return NextResponse.json({ events });
  }
  const userId = req.nextUrl.searchParams.get("userId") || user.userId;
  const events = await getCalendarEvents(userId);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "approve" || body.action === "reject") {
    await approveCalendarEvent(body.id, body.action === "approve", body.reason);
    return NextResponse.json({ success: true });
  }
  const id = body.id || generateId("evt");
  await saveCalendarEvent({ ...body, id });
  return NextResponse.json({ success: true, id });
}
