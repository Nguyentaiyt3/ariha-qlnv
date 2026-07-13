import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getTasks, getTasksByPlan, createTask, updateTask } from "@/lib/mongodb/firestore";
import { isTaskVisible } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const planId = req.nextUrl.searchParams.get("planId");
    const tasks = planId ? await getTasksByPlan(planId) : await getTasks();

    const me = await getUser(auth.userId);
    const visible = me
      ? tasks.filter((t) => isTaskVisible(t, me.id, me.role, me.department))
      : tasks;

    return NextResponse.json({ tasks: visible });
  } catch (error) {
    console.error("[API /tasks GET]", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePermissionOverridesLoaded();
  const me = await getUser(auth.userId);
  if (!me || !hasPermission(me.role, "task:create")) {
    return NextResponse.json({ error: "Bạn không có quyền tạo nhiệm vụ" }, { status: 403 });
  }

  try {
    const body = await req.json();
    await createTask(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /tasks POST]", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
