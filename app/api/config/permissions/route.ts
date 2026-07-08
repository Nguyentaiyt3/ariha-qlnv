import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getPermissionConfig, savePermissionConfig } from "@/lib/mongodb/firestore";
import { applyPermissionOverrides, hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/mongodb/auditLog";
import type { UserRole } from "@/types";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const config = await getPermissionConfig();
    // Seed server-side memory so subsequent hasPermission() calls use saved overrides
    if (Object.keys(config).length > 0) {
      applyPermissionOverrides(config as Partial<Record<UserRole, string[]>>);
    }
    return NextResponse.json(config);
  } catch (error) {
    console.error("[GET /api/config/permissions]", error);
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(auth.userId);
  if (!me || !hasPermission(me.role, "*")) {
    return NextResponse.json({ error: "Forbidden — HR Admin only" }, { status: 403 });
  }

  try {
    const before = await getPermissionConfig();
    const body = await req.json();
    await savePermissionConfig(body);
    // Apply immediately in server memory
    applyPermissionOverrides(body as Partial<Record<UserRole, string[]>>);

    await logAudit({
      actorId: me.id,
      actorName: me.name,
      actorRole: me.role,
      action: "permission.updated",
      entityType: "PermissionConfig",
      entityId: "permissions",
      before,
      after: body,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/config/permissions]", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
