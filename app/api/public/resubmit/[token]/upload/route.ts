import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_MB = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Validate token
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

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dir = path.join(process.cwd(), "public", "uploads", "proposals");
  await mkdir(dir, { recursive: true });
  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._\-À-ỹ]/g, "_").slice(0, 120);
  const filename = `${Date.now()}_${safeName}`;
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({ url: `/uploads/proposals/${filename}` });
}
