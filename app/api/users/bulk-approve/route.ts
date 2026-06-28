import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { bulkApproveUsers } from "@/lib/mongodb/firestore";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role: authRole } = auth as { role?: string };
  if (authRole !== "hrAdmin" && authRole !== "director") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { userIds, role } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }
    const validRoles = ["staff", "teamLead", "director", "hrAdmin", "financeViewer", "financeAuditor", "financeSupervisor"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const count = await bulkApproveUsers(userIds, role);
    return NextResponse.json({ success: true, count });
  } catch (e) {
    console.error("[API /users/bulk-approve POST]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
