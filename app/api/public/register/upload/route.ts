import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_MB = 20;

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Lưu trữ file chưa được cấu hình — liên hệ quản trị viên" },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || file.size === 0)
      return NextResponse.json({ error: "Không có file" }, { status: 400 });
    if (file.size > MAX_MB * 1024 * 1024)
      return NextResponse.json({ error: `File quá lớn — tối đa ${MAX_MB}MB` }, { status: 400 });
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: "Chỉ hỗ trợ PDF, DOC, DOCX" }, { status: 400 });

    const safeName = (file.name.split(/[\\/]/).pop() ?? file.name)
      .replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 120);
    const blob = await put(`proposals/${Date.now()}_${safeName}`, file, { access: "private" });
    return NextResponse.json({ url: blob.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Lỗi lưu file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
