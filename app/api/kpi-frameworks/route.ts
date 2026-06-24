import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getKPIFrameworks, saveKPIFramework } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const frameworks = await getKPIFrameworks();
  return NextResponse.json({ frameworks });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("kpi");
  await saveKPIFramework({ ...body, id });
  return NextResponse.json({ success: true, id });
}
