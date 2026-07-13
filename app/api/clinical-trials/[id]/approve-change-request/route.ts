import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, updateClinicalTrial, deleteClinicalTrial, createNotification } from "@/lib/mongodb/firestore";
import { hasPermission } from "@/lib/rbac/permissions";
import { sameUnit } from "@/lib/rbac/scope";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trial = await getClinicalTrial(params.id);
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const req_ = trial.pendingChangeRequest;
  if (!req_ || req_.status !== "pending") {
    return NextResponse.json({ error: "Không có yêu cầu nào đang chờ duyệt" }, { status: 404 });
  }

  const canReview =
    hasPermission(me.role, "trial:manage") &&
    (me.role !== "teamLead" || sameUnit(trial.department, me.department));
  if (!canReview) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (req_.type === "delete") {
    await deleteClinicalTrial(params.id);
  } else {
    await updateClinicalTrial(params.id, {
      ...(req_.proposedChanges || {}),
      pendingChangeRequest: {
        ...req_,
        status: "approved",
        reviewedAt: now,
        reviewedBy: me.name,
        reviewedByUserId: me.id,
      },
    });
  }

  await createNotification({
    userId: req_.requestedByUserId,
    type: "request_approved",
    title: req_.type === "edit" ? "Yêu cầu sửa thử nghiệm lâm sàng đã được duyệt" : "Yêu cầu xoá thử nghiệm lâm sàng đã được duyệt",
    body: `${me.name} đã duyệt yêu cầu ${req_.type === "edit" ? "sửa" : "xoá"} thử nghiệm "${trial.code || trial.title}"`,
    link: req_.type === "edit" ? `/clinical-trials/${trial.id}` : "/clinical-trials",
    read: false,
    priority: "normal",
    createdAt: now,
  });

  return NextResponse.json({ success: true });
}
