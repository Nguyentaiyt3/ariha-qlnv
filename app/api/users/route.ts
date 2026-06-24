import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getUsers } from "@/lib/mongodb/firestore";

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[API /users GET]", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
