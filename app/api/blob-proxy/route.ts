import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const blobUrl = req.nextUrl.searchParams.get("url");

  if (!blobUrl || !/\.blob\.vercel-storage\.com\//i.test(blobUrl)) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new NextResponse("Storage not configured", { status: 503 });
  }

  try {
    const res = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return new NextResponse("File not found", { status: 404 });

    const headers = new Headers();
    const ct = res.headers.get("content-type");
    const cd = res.headers.get("content-disposition");
    if (ct) headers.set("Content-Type", ct);
    if (cd) headers.set("Content-Disposition", cd);
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(res.body, { headers });
  } catch {
    return new NextResponse("Error fetching file", { status: 500 });
  }
}
