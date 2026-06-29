import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";

const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_MB = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  await connectDB();
  const doc = await ResearchTopicModel.findOne({ resubmitToken: token }).lean() as Record<string, unknown> | null;
  if (!doc) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 403 });
  const expiry = doc.resubmitTokenExpiry as string | undefined;
  if (expiry && new Date(expiry) < new Date()) return NextResponse.json({ error: "Token đã hết hạn" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "Không có file" }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `File quá lớn — tối đa ${MAX_MB}MB` }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Định dạng không được hỗ trợ" }, { status: 400 });

  const safeName = (file.name.split(/[\\/]/).pop() ?? file.name)
    .replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 120);
  const blob = await put(`proposals/${Date.now()}_${safeName}`, file, { access: "public" });

  return NextResponse.json({ url: blob.url });
}
