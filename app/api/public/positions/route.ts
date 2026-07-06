import { NextResponse } from "next/server";
import { getPositions } from "@/lib/mongodb/firestore";

// Đọc DB mỗi request — không cho Next.js prerender tĩnh (sẽ cache danh sách rỗng lúc build)
export const dynamic = "force-dynamic";

// Public — no auth required (used by registration form before login)
export async function GET() {
  try {
    const positions = await getPositions();
    return NextResponse.json({ positions });
  } catch (e) {
    return NextResponse.json({ positions: [] });
  }
}
