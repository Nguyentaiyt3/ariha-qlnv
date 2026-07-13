import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { getClinicalTrial, updateClinicalTrial, createNotification } from "@/lib/mongodb/firestore";
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

  const body = await req.json().catch(() => ({}) as { rejectionReason?: string });
  const rejectionReason = (body?.rejectionReason || "").trim();
  if (!rejectionReason) {
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await updateClinicalTrial(params.id, {
    pendingChangeRequest: {
      ...req_,
      status: "rejected",
      rejectionReason,
      reviewedAt: now,
      reviewedBy: me.name,
      reviewedByUserId: me.id,
    },
  });

  await createNotification({
    userId: req_.requestedByUserId,
    type: "request_rejected",
    title: req_.type === "edit" ? "Yêu cầu sửa thử nghiệm lâm sàng bị từ chối" : "Yêu cầu xoá thử nghiệm lâm sàng bị từ chối",
    body: `${me.name} đã từ chối: ${rejectionReason}`,
    link: `/clinical-trials/${trial.id}`,
    read: false,
    priority: "normal",
    createdAt: now,
  });

  return NextResponse.json({ success: true });
}
