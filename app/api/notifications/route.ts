import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getNotifications, markAllNotificationsRead, addNotification, deleteAllReadNotifications } from "@/lib/mongodb/firestore";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const notifs = await getNotifications(auth.userId);
    return NextResponse.json({ notifications: notifs });
  } catch (error) {
    console.error("[API /notifications GET]", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (body.action === "markAllRead") {
      await markAllNotificationsRead(auth.userId);
      return NextResponse.json({ success: true });
    }
    await addNotification(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /notifications POST]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const userId = req.nextUrl.searchParams.get("userId") || auth.userId;
    await deleteAllReadNotifications(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /notifications DELETE]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
