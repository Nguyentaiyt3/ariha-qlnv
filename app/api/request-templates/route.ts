import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getRequestTemplates, getPendingTemplates, saveRequestTemplate, approveRequestTemplate, deleteRequestTemplate } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const all = req.nextUrl.searchParams.get("all") === "true";
  const pending = req.nextUrl.searchParams.get("pending") === "true";
  if (pending) return NextResponse.json({ templates: await getPendingTemplates() });
  return NextResponse.json({ templates: await getRequestTemplates(all) });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "approve" || body.action === "reject") {
    await approveRequestTemplate(body.id, body.action === "approve");
    return NextResponse.json({ success: true });
  }
  if (body.action === "delete") {
    await deleteRequestTemplate(body.id);
    return NextResponse.json({ success: true });
  }
  const id = body.id || generateId("tpl");
  await saveRequestTemplate({ ...body, id });
  return NextResponse.json({ success: true, id });
}
