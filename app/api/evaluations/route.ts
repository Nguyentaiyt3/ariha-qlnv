import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getEvaluations, getAllEvaluations, saveEvaluation, getEvaluationConfig, saveEvaluationConfig } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId");
  const configOnly = req.nextUrl.searchParams.get("config") === "true";
  if (configOnly) {
    const config = await getEvaluationConfig();
    return NextResponse.json({ config });
  }
  const evaluations = userId ? await getEvaluations(userId) : await getAllEvaluations();
  return NextResponse.json({ evaluations });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "saveConfig") {
    await saveEvaluationConfig(body.config);
    return NextResponse.json({ success: true });
  }
  const id = body.id || generateId("eval");
  await saveEvaluation({ ...body, id });
  return NextResponse.json({ success: true, id });
}
