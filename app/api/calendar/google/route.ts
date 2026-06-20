import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

// GET /api/calendar/google — returns OAuth2 auth URL
export async function GET(_req: NextRequest) {
  const url = getAuthUrl();
  return NextResponse.json({ url });
}
