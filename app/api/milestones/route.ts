import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getMilestoneConfigs, getDefaultMilestoneConfig, saveMilestoneConfig } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const defaultOnly = req.nextUrl.searchParams.get("default") === "true";
  if (defaultOnly) {
    const config = await getDefaultMilestoneConfig();
    return NextResponse.json({ config });
  }
  const configs = await getMilestoneConfigs();
  return NextResponse.json({ configs });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("ms");
  await saveMilestoneConfig({ ...body, id });
  return NextResponse.json({ success: true, id });
}
