import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { addProofToTransaction } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "addProof") {
    if (!body.proof) return NextResponse.json({ error: "proof là bắt buộc" }, { status: 400 });
    await addProofToTransaction(params.id, body.proof);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
