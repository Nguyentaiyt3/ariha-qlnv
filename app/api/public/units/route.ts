import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { AppConfigModel } from "@/lib/mongodb/models";
import type { UnitDef } from "@/types";

// Đọc DB mỗi request — không cho Next.js prerender tĩnh (sẽ cache catalog rỗng lúc build)
export const dynamic = "force-dynamic";

// Public — no auth required (used by registration form before login)
export async function GET() {
  try {
    await connectDB();
    const config = await AppConfigModel.findById("unitCatalog").lean();
    const catalog: UnitDef[] = ((config?.data as Record<string, unknown>)?.catalog as UnitDef[]) ?? [];
    return NextResponse.json({ catalog });
  } catch (err) {
    console.error("[/api/public/units GET]", err);
    return NextResponse.json({ catalog: [] });
  }
}
