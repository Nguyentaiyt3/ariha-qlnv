import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getWorkNode, saveWorkNode } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

type Params = { params: { nodeId: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!await auth(_req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const node = await getWorkNode(params.nodeId);
  if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });
  return NextResponse.json({ node });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const node = await getWorkNode(params.nodeId);
  if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { ...body, updatedAt: now };

  // Auto-calculate progress from checklist
  if (body.checklist) {
    const done = body.checklist.filter((c: { completed: boolean }) => c.completed).length;
    updates.progress = body.checklist.length > 0 ? Math.round((done / body.checklist.length) * 100) : 0;
  }

  // Auto-calculate T3 from actualCost
  if (body.actualCost !== undefined && node.budget) {
    const variance = body.actualCost - node.budget;
    updates.t3Resources = {
      budgeted: node.budget,
      actual: body.actualCost,
      variance,
      variancePct: (variance / node.budget) * 100,
      status: body.actualCost <= node.budget ? "under_budget" : "over_budget",
    };
  }

  await saveWorkNode({ ...node, ...updates } as any);
  const updated = await getWorkNode(params.nodeId);
  return NextResponse.json({ node: updated });
}
