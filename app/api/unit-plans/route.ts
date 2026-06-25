import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getUnitPlans, createUnitPlan } from "@/lib/mongodb/firestore";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const plans = await getUnitPlans();
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("[API /unit-plans GET]", error);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const plan = await createUnitPlan({
      ...body,
      createdBy: auth.userId,
      items: body.items ?? [],
    });
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[API /unit-plans POST]", error);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
