import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { connectDB } from "@/lib/mongodb/config";
import { hasPermission } from "@/lib/rbac/permissions";
import { ensurePermissionOverridesLoaded } from "@/lib/rbac/ensurePermissions";
import { parseBody } from "@/lib/validation";
import mongoose from "mongoose";

const openingBalanceSchema = z.object({
  amount: z.number().finite(),
  date: z.string().optional(),
});

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

// Singleton config collection to store opening balance
async function getConfigCollection() {
  await connectDB();
  return mongoose.connection.collection("finance_config");
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const col = await getConfigCollection();
  const doc = await col.findOne({ _id: "opening_balance" as any });
  return NextResponse.json({ balance: doc ? { amount: doc.amount, date: doc.date, updatedBy: doc.updatedBy, updatedAt: doc.updatedAt } : null });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensurePermissionOverridesLoaded();
  const me = await getUser(user.userId);
  if (!me || !hasPermission(me.role, "finance:manage")) {
    return NextResponse.json({ error: "Không có quyền quản lý cấu hình tài chính" }, { status: 403 });
  }
  const parsed = await parseBody(req, openingBalanceSchema);
  if ("error" in parsed) return parsed.error;
  const { amount, date } = parsed.data;
  const col = await getConfigCollection();
  const now = new Date().toISOString();
  await col.updateOne(
    { _id: "opening_balance" as any },
    { $set: { amount, date: date ?? now, updatedBy: user.userId, updatedAt: now } },
    { upsert: true }
  );
  return NextResponse.json({ success: true });
}
