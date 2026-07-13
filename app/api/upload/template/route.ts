import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { isNckhManager } from "@/lib/researchUtils";

const TEMPLATE_FILENAME = "mau-de-cuong-nckh";
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ALLOWED_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const auth  = token ? verifyToken(token) : null;
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Trước đây so sánh sai (verifyToken không trả về role, và literal "Director"/"HRAdmin" không
  // khớp giá trị enum thật) nên luôn 403 với mọi người. Chỉ hrAdmin hoặc người có chỉ định
  // "Quản lý NCKH" mới được cập nhật file mẫu.
  const me = await getUser(auth.userId);
  if (!isNckhManager(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Chỉ chấp nhận PDF, DOC, DOCX" }, { status: 415 });
  }

  const ext      = ALLOWED_EXT[file.type] ?? ".docx";
  const filename = `${TEMPLATE_FILENAME}${ext}`;

  const dir      = path.join(process.cwd(), "public", "templates");
  await mkdir(dir, { recursive: true });

  // Remove old template files before writing new one
  const { readdir, unlink } = await import("fs/promises");
  try {
    const existing = await readdir(dir);
    await Promise.all(
      existing
        .filter(f => f.startsWith(TEMPLATE_FILENAME))
        .map(f => unlink(path.join(dir, f)).catch(() => {}))
    );
  } catch { /* dir may not exist yet */ }

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({
    url:  `/templates/${filename}`,
    name: file.name,
    size: file.size,
  });
}

export async function GET() {
  // Return current template info (no auth needed — public download)
  const { readdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "templates");
  try {
    const files = await readdir(dir);
    const found = files.find(f => f.startsWith(TEMPLATE_FILENAME) && !f.endsWith(".txt"));
    return NextResponse.json({ url: found ? `/templates/${found}` : null });
  } catch {
    return NextResponse.json({ url: null });
  }
}
