import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getResearchGroups, createResearchGroup } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const year = req.nextUrl.searchParams.get("year");
  const groups = await getResearchGroups(year ? Number(year) : undefined);
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = body.id || generateId("rgrp");
  await createResearchGroup({ ...body, id, createdBy: user.userId });
  return NextResponse.json({ success: true, id });
}
