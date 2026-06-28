import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import { hasPermission } from "@/lib/rbac/permissions";
import type { ResearchAnnotation } from "@/types";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

function genId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function s(v: unknown, max = 4000): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

const COLORS = ["yellow", "green", "pink", "blue"] as const;
type Color = (typeof COLORS)[number];
function color(v: unknown): Color {
  return COLORS.includes(v as Color) ? (v as Color) : "yellow";
}

/** POST — thêm một annotation mới (author lấy từ phiên đăng nhập). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const fileUrl = s(body.fileUrl, 1000);
  const quote = s(body.quote);
  if (!fileUrl || !quote) {
    return NextResponse.json({ error: "Thiếu fileUrl hoặc quote" }, { status: 400 });
  }

  const ann: ResearchAnnotation = {
    id: genId(),
    fileUrl,
    color: color(body.color),
    quote,
    prefix: s(body.prefix, 200),
    suffix: s(body.suffix, 200),
    occurrence: typeof body.occurrence === "number" ? body.occurrence : 0,
    note: s(body.note),
    authorId: me.id,
    authorName: me.name,
    createdAt: new Date().toISOString(),
  };

  await connectDB();
  const res = await ResearchTopicModel.updateOne(
    { _id: params.id },
    { $push: { annotations: ann }, $set: { updatedAt: ann.createdAt } },
  );
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ annotation: ann });
}

/** PATCH — cập nhật ghi chú / màu của một annotation (chỉ tác giả annotation hoặc quản lý). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const annId = s(body.annotationId, 100);
  if (!annId) return NextResponse.json({ error: "Thiếu annotationId" }, { status: 400 });

  await connectDB();
  const doc = await ResearchTopicModel.findById(params.id).lean() as { annotations?: ResearchAnnotation[] } | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const target = (doc.annotations ?? []).find(a => a.id === annId);
  if (!target) return NextResponse.json({ error: "Annotation not found" }, { status: 404 });

  const isManager = hasPermission(me.role, "research:manage");
  if (target.authorId !== me.id && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const set: Record<string, unknown> = { "annotations.$[a].updatedAt": new Date().toISOString() };
  if (typeof body.note === "string") set["annotations.$[a].note"] = s(body.note);
  if (body.color !== undefined) set["annotations.$[a].color"] = color(body.color);

  await ResearchTopicModel.updateOne(
    { _id: params.id },
    { $set: set },
    { arrayFilters: [{ "a.id": annId }] },
  );
  return NextResponse.json({ success: true });
}

/** DELETE — xóa một annotation theo ?annotationId= (chỉ tác giả annotation hoặc quản lý). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await getUser(u.userId);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const annId = req.nextUrl.searchParams.get("annotationId");
  if (!annId) return NextResponse.json({ error: "Thiếu annotationId" }, { status: 400 });

  await connectDB();
  const doc = await ResearchTopicModel.findById(params.id).lean() as { annotations?: ResearchAnnotation[] } | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const target = (doc.annotations ?? []).find(a => a.id === annId);
  if (!target) return NextResponse.json({ success: true });  // already gone

  const isManager = hasPermission(me.role, "research:manage");
  if (target.authorId !== me.id && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ResearchTopicModel.updateOne(
    { _id: params.id },
    { $pull: { annotations: { id: annId } } },
  );
  return NextResponse.json({ success: true });
}
