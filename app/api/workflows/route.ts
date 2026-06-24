import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getWorkflows, saveWorkflow } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canApprove = req.nextUrl.searchParams.get("all") === "true";
  const workflows = await getWorkflows(canApprove, user.userId);
  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("wf");
  await saveWorkflow({ ...body, id });
  return NextResponse.json({ success: true, id });
}
