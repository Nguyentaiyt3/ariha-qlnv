import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { updateAnnouncement, deleteAnnouncement, getAnnouncementComments, addAnnouncementComment } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const comments = await getAnnouncementComments(params.id);
  return NextResponse.json({ comments });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "comment") {
    await addAnnouncementComment(params.id, body.comment);
    return NextResponse.json({ success: true });
  }
  await updateAnnouncement(params.id, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteAnnouncement(params.id);
  return NextResponse.json({ success: true });
}
