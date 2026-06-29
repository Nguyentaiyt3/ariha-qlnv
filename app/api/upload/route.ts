import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
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

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `File quá lớn (tối đa ${MAX_SIZE_MB}MB)` }, { status: 413 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Định dạng file không được hỗ trợ" }, { status: 415 });
  }

  const safeName  = sanitizeFilename(file.name);
  const finalName = `${folder}/${Date.now()}_${safeName}`;

  const blob = await put(finalName, file, { access: "public" });

  return NextResponse.json({
    url:  blob.url,
    name: file.name,
    size: file.size,
    type: file.type,
  });
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 120);
}
