import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getResearchGroup, updateResearchGroup, deleteResearchGroup } from "@/lib/mongodb/firestore";
import { isNckhFullManager } from "@/lib/researchUtils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  const group = await getResearchGroup(params.id);
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ResearchGroup chứa mainPerformerId/supervisorId/createdBy — chính là danh tính mà phản biện
  // kín (redactAuthorForReviewer) đang cố ẩn khỏi đề tài. Trước đây route này không kiểm tra quyền
  // gì cả, nên bất kỳ ai lấy được groupId từ 1 đề tài đã "ẩn danh" vẫn có thể gọi thẳng route này
  // để lộ ngược lại toàn bộ danh tính — bỏ qua hẳn cơ chế ẩn danh. Chỉ Quản lý NCKH hoặc chính
  // thành viên nhóm đó mới được xem.
  const isMember = !!me && (me.id === group.mainPerformerId || me.id === group.supervisorId || me.id === group.createdBy);
  if (!me || !(isNckhFullManager(me) || isMember)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ group });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me || !isNckhFullManager(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  await updateResearchGroup(params.id, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me || !isNckhFullManager(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteResearchGroup(params.id);
  return NextResponse.json({ success: true });
}
