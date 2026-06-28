import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { UserModel, ResearchTopicModel, AppConfigModel } from "@/lib/mongodb/models";
import { generateId } from "@/lib/utils";
import type { UnitDef } from "@/types";

const CATALOG_KEY = "unitCatalog";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

async function getCatalog(): Promise<UnitDef[]> {
  const config = await AppConfigModel.findById(CATALOG_KEY).lean();
  return ((config?.data as Record<string, unknown>)?.catalog as UnitDef[]) ?? [];
}

async function saveCatalog(catalog: UnitDef[]) {
  await AppConfigModel.findByIdAndUpdate(
    CATALOG_KEY,
    { data: { catalog }, updatedAt: new Date().toISOString() },
    { upsert: true }
  );
}

/**
 * GET /api/units
 * Trả về:
 *   catalog: UnitDef[]   — danh mục đơn vị đã quản lý
 *   discovered: string[] — tên đơn vị phát hiện từ DB chưa có trong catalog
 */
export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();

    const [userDepts, researchDepts, catalog] = await Promise.all([
      UserModel.distinct("department"),
      ResearchTopicModel.distinct("department"),
      getCatalog(),
    ]);

    // Tên đơn vị đã có trong catalog
    const catalogNames = new Set(catalog.map(u => u.name.trim().toLowerCase()));

    // Phát hiện từ DB, chưa trong catalog
    const discovered = [...new Set([...userDepts, ...researchDepts])]
      .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
      .filter(d => !catalogNames.has(d.trim().toLowerCase()))
      .sort((a, b) => a.localeCompare(b, "vi"));

    return NextResponse.json({ catalog, discovered });
  } catch (err) {
    console.error("[/api/units GET]", err);
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 });
  }
}

/**
 * POST /api/units
 * Thêm hoặc cập nhật một UnitDef trong catalog.
 * Body: Partial<UnitDef> & { name: string; unitLevel: 2|3 }
 * Nếu body.id trùng với existing → update; không thì → insert.
 */
export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Partial<UnitDef>;
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (body.unitLevel !== 2 && body.unitLevel !== 3) {
    return NextResponse.json({ error: "unitLevel must be 2 or 3" }, { status: 400 });
  }

  try {
    await connectDB();
    const catalog = await getCatalog();

    if (body.id) {
      // Update existing
      const updated = catalog.map(u =>
        u.id === body.id
          ? { ...u, name: body.name!.trim(), abbr: body.abbr?.trim() || undefined, parentId: body.parentId || undefined, unitLevel: body.unitLevel! }
          : u
      );
      await saveCatalog(updated);
      return NextResponse.json({ ok: true, catalog: updated });
    } else {
      // Insert new
      const newUnit: UnitDef = {
        id: generateId(),
        name: body.name.trim(),
        abbr: body.abbr?.trim() || undefined,
        parentId: body.parentId || undefined,
        unitLevel: body.unitLevel,
        source: body.source ?? "manual",
        createdAt: new Date().toISOString(),
      };
      const updated = [...catalog, newUnit];
      await saveCatalog(updated);
      return NextResponse.json({ ok: true, unit: newUnit, catalog: updated });
    }
  } catch (err) {
    console.error("[/api/units POST]", err);
    return NextResponse.json({ error: "Failed to save unit" }, { status: 500 });
  }
}

/**
 * DELETE /api/units
 * Xóa một UnitDef và các đơn vị con của nó khỏi catalog.
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({ id: "" })) as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await connectDB();
    const catalog = await getCatalog();
    // Xóa cả đơn vị con
    const updated = catalog.filter(u => u.id !== id && u.parentId !== id);
    await saveCatalog(updated);
    return NextResponse.json({ ok: true, catalog: updated });
  } catch (err) {
    console.error("[/api/units DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
