import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getAnnouncements, saveAnnouncement, reactToAnnouncement, markAnnouncementViewed, approveAnnouncement } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const announcements = await getAnnouncements();
  return NextResponse.json({ announcements });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "react") {
    await reactToAnnouncement(body.announcementId, body.emoji, user.userId, body.add);
    return NextResponse.json({ success: true });
  }
  if (body.action === "view") {
    await markAnnouncementViewed(body.announcementId, user.userId);
    return NextResponse.json({ success: true });
  }
  if (body.action === "approve" || body.action === "reject") {
    await approveAnnouncement(body.id, body.action === "approve");
    return NextResponse.json({ success: true });
  }
  const id = body.id || generateId("ann");
  await saveAnnouncement({ ...body, id });
  return NextResponse.json({ success: true, id });
}
