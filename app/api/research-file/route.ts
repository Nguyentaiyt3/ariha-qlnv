import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const ALLOWED_BASE = "uploads";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  // Strip leading slash, normalize separators
  const normalized = filePath.replace(/^\/+/, "").replace(/\\/g, "/");

  // Must start with uploads/
  if (!normalized.startsWith(ALLOWED_BASE + "/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent path traversal
  const segments = normalized.split("/").filter(s => s !== ".." && s !== ".");
  const safePath = segments.join(path.sep);

  const absPath = path.join(process.cwd(), "public", safePath);

  try {
    const buffer = await readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const contentType =
      ext === ".pdf"  ? "application/pdf" :
      ext === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
      ext === ".doc"  ? "application/msword" :
      "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${path.basename(absPath)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
