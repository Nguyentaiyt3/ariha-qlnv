import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_MB = 20;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.size === 0)
    return NextResponse.json({ error: "Không có file" }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024)
    return NextResponse.json({ error: `File quá lớn — tối đa ${MAX_MB}MB` }, { status: 400 });
  if (!ALLOWED.includes(file.type))
    return NextResponse.json({ error: "Chỉ hỗ trợ PDF, DOC, DOCX" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dir = path.join(process.cwd(), "public", "uploads", "proposals");
  await mkdir(dir, { recursive: true });
  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._\-À-ỹ]/g, "_").slice(0, 120);
  const filename = `${Date.now()}_${safeName}`;
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({ url: `/uploads/proposals/${filename}` });
}
