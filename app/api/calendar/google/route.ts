import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

// URL OAuth phụ thuộc env var — đánh giá lúc runtime, không prerender tĩnh
export const dynamic = "force-dynamic";

// GET /api/calendar/google — returns OAuth2 auth URL
export async function GET(_req: NextRequest) {
  const url = getAuthUrl();
  return NextResponse.json({ url });
}
