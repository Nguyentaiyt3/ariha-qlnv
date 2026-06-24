import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { UserModel } from "@/lib/mongodb/models";

/** Public endpoint — no auth — checks if any users exist in the DB */
export async function GET() {
  try {
    await connectDB();
    const count = await UserModel.countDocuments().limit(1);
    return NextResponse.json({ hasUsers: count > 0 });
  } catch {
    return NextResponse.json({ hasUsers: false });
  }
}
