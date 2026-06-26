import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { checkResearchTaskParticipant } from "@/lib/mongodb/firestore";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ canMonitor: false });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ canMonitor: false });

  const me = await getUser(session.userId);
  if (!me) return NextResponse.json({ canMonitor: false });

  if (
    hasPermission(me.role, "research:manage") ||
    hasPermission(me.role, "research:monitor")
  ) {
    return NextResponse.json({ canMonitor: true });
  }

  const isParticipant = await checkResearchTaskParticipant(session.userId);
  return NextResponse.json({ canMonitor: isParticipant });
}
