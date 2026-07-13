import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getWorkNode, saveWorkNode, getWorkNodesByTask } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

type Params = { params: { nodeId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const authUser = await auth(req);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { verdict, rating, note } = body;

  if (!verdict || !rating) {
    return NextResponse.json({ error: "Thiếu verdict hoặc rating." }, { status: 400 });
  }

  const node = await getWorkNode(params.nodeId);
  if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });
  if (node.status !== "review") {
    return NextResponse.json({ error: "Node phải ở trạng thái 'review' để đánh giá." }, { status: 409 });
  }

  // Chỉ người trong danh sách "người duyệt nghiệm thu" của node, hoặc có quyền task:approve, mới
  // được đánh giá — tránh ai đó đã đăng nhập tự duyệt/từ chối node của người khác và giả mạo tên
  // người đánh giá trong nhật ký 3T.
  await ensurePermissionOverridesLoaded();
  const me = await getUser(authUser.userId);
  const isApprover = (node.approverIds ?? []).includes(authUser.userId);
  if (!me || !(isApprover || hasPermission(me.role, "task:approve"))) {
    return NextResponse.json({ error: "Bạn không có quyền đánh giá node này." }, { status: 403 });
  }
  const evaluatorId = me.id;
  const evaluatorName = me.name;

  const now = new Date().toISOString();
  const pass = verdict === "pass";

  const t2Quality = { rating, verdict: (pass ? "pass" : "fail") as "pass" | "fail", evaluatorId, evaluatorName, evaluatedAt: now, note };

  // Auto T1 timeliness
  const t1Timeliness = node.t1Timeliness ?? (() => {
    const due = new Date(node.dueDate);
    const comp = new Date(now);
    const late = comp > due;
    const diffMs = Math.abs(comp.getTime() - due.getTime());
    return {
      completedAt: now,
      dueDate: node.dueDate,
      status: late ? "late" : "on_time",
      lateDays: late ? Math.floor(diffMs / 86400000) : undefined,
    };
  })();

  await saveWorkNode({
    ...node,
    status: pass ? "completed" : "rejected",
    t2Quality,
    t1Timeliness,
    updatedAt: now,
  });

  // Unlock dependent nodes if passed
  if (pass) {
    const siblings = await getWorkNodesByTask(node.rootTaskId);
    for (const sibling of siblings) {
      if (sibling.status !== "locked") continue;
      const prereqs = sibling.prerequisites ?? [];
      if (!prereqs.includes(params.nodeId)) continue;
      const mode = sibling.prerequisiteMode ?? "ALL";
      const completedIds = siblings.filter((n) => n.id !== sibling.id && n.status === "completed").map((n) => n.id);
      const allMet = mode === "ALL"
        ? prereqs.every((id) => completedIds.includes(id) || id === params.nodeId)
        : prereqs.some((id) => completedIds.includes(id) || id === params.nodeId);
      if (allMet) {
        await saveWorkNode({ ...sibling, status: "pending", updatedAt: now });
      }
    }
  }

  const updated = await getWorkNode(params.nodeId);
  return NextResponse.json({
    node: updated,
    message: pass ? "Node đã được duyệt. T1/T3 đã tự động tính." : "Node bị từ chối. Người thực hiện cần làm lại.",
  });
}
