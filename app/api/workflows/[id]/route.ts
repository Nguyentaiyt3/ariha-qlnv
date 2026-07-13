import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { saveWorkflow, deleteWorkflow, approveWorkflow } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.action === "approve" || body.action === "reject") {
    // Duyệt/từ chối quy trình — đây là CỔNG DUY NHẤT được phép đổi trạng thái published/pending.
    await ensurePermissionOverridesLoaded();
    const me = await getUser(u.userId);
    if (!me || !hasPermission(me.role, "workflow:approve")) {
      return NextResponse.json({ error: "Bạn không có quyền duyệt quy trình" }, { status: 403 });
    }
    await approveWorkflow(params.id, body.action === "approve", body.reason);
  } else {
    // Sửa quy trình: ai cũng được (tạo/sửa/xoá mở cho tất cả), nhưng KHÔNG được tự đổi status
    // qua đường này — tránh bỏ qua bước duyệt bằng cách PATCH thẳng status: "published".
    const { status: _ignoredStatus, ...safeBody } = body;
    await saveWorkflow({ ...safeBody, id: params.id });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteWorkflow(params.id);
  return NextResponse.json({ success: true });
}
