import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

// Stream a private Vercel Blob through the server so the browser can view it.
// Private blobs cannot be fetched directly by URL — they require the SDK's
// get() which signs the request with BLOB_READ_WRITE_TOKEN.
export async function GET(req: NextRequest) {
  const blobUrl = req.nextUrl.searchParams.get("url");

  if (!blobUrl || !/\.blob\.vercel-storage\.com\//i.test(blobUrl)) {
    return new NextResponse("Invalid URL", { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new NextResponse("Storage not configured", { status: 503 });
  }

  try {
    const result = await get(blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return new NextResponse("File not found", { status: 404 });
    }

    const headers = new Headers();
    if (result.blob.contentType) headers.set("Content-Type", result.blob.contentType);
    if (result.blob.contentDisposition) headers.set("Content-Disposition", result.blob.contentDisposition);
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(result.stream as unknown as BodyInit, { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error fetching file";
    return new NextResponse(msg, { status: 500 });
  }
}
