import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { verifyToken } from "@/lib/mongodb/auth";

const MAX_SIZE_MB = 20;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];

export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string | null) ?? "misc";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return NextResponse.json({ error: `File quá lớn (tối đa ${MAX_SIZE_MB}MB)` }, { status: 413 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Định dạng file không được hỗ trợ" }, { status: 415 });

  const safeName  = sanitizeFilename(file.name);
  const finalName = `${Date.now()}_${safeName}`;

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`${folder}/${finalName}`, file, { access: "private" });
      return NextResponse.json({ url: blob.url, name: file.name, size: file.size, type: file.type });
    }

    // Dev fallback: no Vercel Blob token configured — store on local disk under public/uploads
    const safeFolder = (folder || "misc").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const uploadDir = path.join(process.cwd(), "public", "uploads", safeFolder);
    await mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, finalName), buffer);

    return NextResponse.json({
      url: `/uploads/${safeFolder}/${finalName}`,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Lỗi lưu file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 120);
}
