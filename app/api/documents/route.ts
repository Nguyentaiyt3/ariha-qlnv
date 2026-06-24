import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getFolders, saveFolder, deleteFolder, getDocuments, saveDocument, getPendingDocuments, approveDocument } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  if (type === "folders") {
    const folders = await getFolders();
    return NextResponse.json({ folders });
  }
  if (type === "pending") {
    const documents = await getPendingDocuments();
    return NextResponse.json({ documents });
  }
  const folderId = req.nextUrl.searchParams.get("folderId") ?? null;
  const documents = await getDocuments(folderId);
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.type === "folder") {
    const id = body.id || generateId("folder");
    await saveFolder({ ...body.data, id });
    return NextResponse.json({ success: true, id });
  }
  if (body.action === "deleteFolder") {
    await deleteFolder(body.id);
    return NextResponse.json({ success: true });
  }
  if (body.action === "approve" || body.action === "reject") {
    await approveDocument(body.id, body.action === "approve");
    return NextResponse.json({ success: true });
  }
  const id = body.id || generateId("doc");
  await saveDocument({ ...body, id });
  return NextResponse.json({ success: true, id });
}
