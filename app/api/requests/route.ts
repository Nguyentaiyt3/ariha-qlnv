import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getRequests, saveRequest } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let requests = await getRequests();

  // Trưởng nhóm: chỉ thấy đơn của chính mình + đơn của nhân viên cùng đơn vị (để duyệt).
  const me = await getUser(user.userId);
  if (me && me.role === "teamLead") {
    requests = requests.filter((r) =>
      r.submittedBy === me.id || sameUnit(r.department, me.department)
    );
  }

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("req");
  await saveRequest({ ...body, id });
  return NextResponse.json({ success: true, id });
}
