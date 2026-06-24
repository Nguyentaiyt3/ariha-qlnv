import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getWorkNode, saveWorkNode } from "@/lib/mongodb/firestore";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

type Params = { params: { nodeId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const node = await getWorkNode(params.nodeId);
  if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });
  if (!["in_progress", "rejected"].includes(node.status)) {
    return NextResponse.json({ error: `Không thể nộp node ở trạng thái "${node.status}".` }, { status: 409 });
  }
  if (!node.outputAttachments?.length) {
    return NextResponse.json({ error: "Bắt buộc phải có ít nhất 1 đầu ra trước khi nộp." }, { status: 422 });
  }
  await saveWorkNode({ ...node, status: "review", updatedAt: new Date().toISOString() });
  return NextResponse.json({ message: "Đã nộp nghiệm thu. Đang chờ phê duyệt.", status: "review" });
}
