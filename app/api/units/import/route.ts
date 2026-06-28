import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verifyToken } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { AppConfigModel } from "@/lib/mongodb/models";
import { generateId } from "@/lib/utils";
import type { UnitDef } from "@/types";

const CATALOG_KEY = "unitCatalog";

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

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  catalog: UnitDef[];
}

/**
 * POST /api/units/import
 * Body: FormData với field "file" là file .xlsx
 *
 * Quy trình:
 *   1. Đọc sheet đầu tiên, bỏ qua 2 dòng đầu (header + hint)
 *   2. Pass 1 — import tất cả đơn vị cấp 2
 *   3. Pass 2 — import đơn vị cấp 3, resolve parentId từ cấp 2
 *   4. Bỏ qua tên trùng với catalog hiện tại (case-insensitive)
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  // Read file buffer
  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // Parse Excel
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Không đọc được file Excel" }, { status: 400 });
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as (string | number | undefined)[][];

  // Skip row 0 (header) và row 1 (hints) — dữ liệu từ row 2
  const dataRows = raw.slice(2).filter(row => {
    const name = String(row[0] ?? "").trim();
    return name.length > 0;
  });

  if (dataRows.length === 0) {
    return NextResponse.json({ error: "File không có dữ liệu (từ dòng 3 trở đi)" }, { status: 400 });
  }

  await connectDB();
  const existing = await getCatalog();
  const existingNames = new Set(existing.map(u => normalize(u.name)));

  const errors: string[] = [];
  let skipped = 0;
  const now = new Date().toISOString();

  // Parsed rows
  interface RawRow {
    name: string;
    abbr: string;
    unitLevel: 2 | 3;
    parentName: string;
  }

  const parsedRows: RawRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 3; // dòng thực trong file (1-based, sau 2 dòng header)

    const name = String(row[0] ?? "").trim();
    if (!name) { errors.push(`Dòng ${rowNum}: Tên đầy đủ trống — bỏ qua`); skipped++; continue; }

    const abbr = String(row[1] ?? "").trim();
    const rawLevel = Number(row[2]);
    const unitLevel: 2 | 3 = rawLevel === 3 ? 3 : 2;
    if (rawLevel !== 2 && rawLevel !== 3) {
      errors.push(`Dòng ${rowNum}: Cấp "${row[2]}" không hợp lệ — mặc định Cấp 2`);
    }
    const parentName = String(row[3] ?? "").trim();

    parsedRows.push({ name, abbr, unitLevel, parentName });
  }

  // Catalog mutable (existing + newly imported in this batch)
  const catalog: UnitDef[] = [...existing];
  let importedCount = 0;

  // Pass 1: cấp 2
  for (const row of parsedRows.filter(r => r.unitLevel === 2)) {
    if (existingNames.has(normalize(row.name))) {
      errors.push(`"${row.name}": đã tồn tại trong danh mục — bỏ qua`);
      skipped++;
      continue;
    }
    const unit: UnitDef = {
      id: generateId(),
      name: row.name,
      abbr: row.abbr || undefined,
      unitLevel: 2,
      source: "manual",
      createdAt: now,
    };
    catalog.push(unit);
    existingNames.add(normalize(row.name));
    importedCount++;
  }

  // Pass 2: cấp 3 — cần resolve parentId
  for (const row of parsedRows.filter(r => r.unitLevel === 3)) {
    if (existingNames.has(normalize(row.name))) {
      errors.push(`"${row.name}": đã tồn tại trong danh mục — bỏ qua`);
      skipped++;
      continue;
    }

    let parentId: string | undefined;
    if (row.parentName) {
      const parent = catalog.find(
        u => u.unitLevel === 2 && normalize(u.name) === normalize(row.parentName)
      );
      if (parent) {
        parentId = parent.id;
      } else {
        errors.push(`"${row.name}": không tìm thấy đơn vị cha "${row.parentName}" — import là cấp 2`);
      }
    }

    const unit: UnitDef = {
      id: generateId(),
      name: row.name,
      abbr: row.abbr || undefined,
      unitLevel: parentId ? 3 : 2,
      parentId,
      source: "manual",
      createdAt: now,
    };
    catalog.push(unit);
    existingNames.add(normalize(row.name));
    importedCount++;
  }

  await saveCatalog(catalog);

  const result: ImportResult = {
    imported: importedCount,
    skipped,
    errors,
    catalog,
  };

  return NextResponse.json(result);
}
