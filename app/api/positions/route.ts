import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getPositions, savePositions } from "@/lib/mongodb/firestore";
import { generateId } from "@/lib/utils";
import type { PositionDef } from "@/types";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const positions = await getPositions();
    return NextResponse.json({ positions });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as Partial<PositionDef> & { bulk?: PositionDef[] };

    // Bulk import (migration from localStorage)
    if (Array.isArray(body.bulk)) {
      await savePositions(body.bulk);
      return NextResponse.json({ positions: body.bulk });
    }

    if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

    const positions = await getPositions();

    if (body.id) {
      // Update
      const updated = positions.map(p =>
        p.id === body.id
          ? { ...p, title: body.title!.trim(), name: (body.name?.trim() || body.title!.trim()), unitLevel: body.unitLevel ?? p.unitLevel }
          : p,
      );
      await savePositions(updated);
      return NextResponse.json({ positions: updated });
    } else {
      // Insert
      const newPos: PositionDef = {
        id: generateId(),
        title: body.title.trim(),
        name: body.name?.trim() || body.title.trim(),
        unitLevel: body.unitLevel ?? 2,
        createdAt: new Date().toISOString(),
      };
      const updated = [...positions, newPos];
      await savePositions(updated);
      return NextResponse.json({ position: newPos, positions: updated });
    }
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const positions = await getPositions();
    const updated = positions.filter(p => p.id !== id);
    await savePositions(updated);
    return NextResponse.json({ positions: updated });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
