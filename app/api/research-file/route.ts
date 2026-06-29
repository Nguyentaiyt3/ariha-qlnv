import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";

const ALLOWED_BASE = "uploads";

/**
 * Resolve a file on disk tolerant of Unicode normalization differences.
 *
 * Vietnamese filenames can be stored in NFC (composed) or NFD (decomposed)
 * form. On Linux (the VPS), `readFile` is normalization-sensitive, so a path
 * stored as NFC won't match an NFD file on disk (and vice versa). We try the
 * exact path, then both normalized forms, then fall back to scanning the
 * directory for a file whose normalized basename matches. This guarantees that
 * any file physically present is found regardless of how it was encoded.
 */
async function resolveFile(absPath: string): Promise<Buffer | null> {
  // 1. Exact match
  try { return await readFile(absPath); } catch { /* keep trying */ }

  // 2. Normalized variants of the full path
  for (const variant of [absPath.normalize("NFC"), absPath.normalize("NFD")]) {
    if (variant === absPath) continue;
    try { return await readFile(variant); } catch { /* keep trying */ }
  }

  // 3. Directory scan — match by normalized basename
  const dir = path.dirname(absPath);
  const wanted = path.basename(absPath).normalize("NFC");
  try {
    const entries = await readdir(dir);
    const hit = entries.find(e => e.normalize("NFC") === wanted);
    if (hit) return await readFile(path.join(dir, hit));
  } catch { /* dir missing */ }

  return null;
}

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

  const buffer = await resolveFile(absPath);
  if (!buffer) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(absPath).toLowerCase();
  const contentType =
    ext === ".pdf"  ? "application/pdf" :
    ext === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
    ext === ".doc"  ? "application/msword" :
    "application/octet-stream";

  // Use latin1-safe ASCII fallback for the Content-Disposition filename to avoid
  // header-encoding errors with Vietnamese characters; provide UTF-8 via filename*.
  const base = path.basename(absPath);
  const asciiName = base.replace(/[^\x20-\x7E]/g, "_");

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(base)}`,
    },
  });
}
