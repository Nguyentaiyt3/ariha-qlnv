import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { saveDocument, deleteDocument } from "@/lib/mongodb/firestore";
import { WorkDocumentModel } from "@/lib/mongodb/models";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

// Chỉ chủ sở hữu tài liệu hoặc người có quyền document:manage mới được sửa/xoá.
async function canManageDocument(req: NextRequest, docId: string): Promise<boolean> {
  const auth = await verifyToken(req.cookies.get("auth-token")?.value ?? "");
  if (!auth) return false;
  const doc = await WorkDocumentModel.findById(docId).lean() as any;
  if (doc && doc.ownerId === auth.userId) return true;
  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  return !!me && hasPermission(me.role, "document:manage");
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await canManageDocument(req, params.id)) {
    return NextResponse.json({ error: "Không có quyền chỉnh sửa tài liệu này" }, { status: 403 });
  }
  const body = await req.json();
  await saveDocument({ ...body, id: params.id });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await canManageDocument(req, params.id)) {
    return NextResponse.json({ error: "Không có quyền xoá tài liệu này" }, { status: 403 });
  }
  await deleteDocument(params.id);
  return NextResponse.json({ success: true });
}
