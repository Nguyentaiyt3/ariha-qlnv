import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getUser, saveUser, deleteUser } from "@/lib/mongodb/firestore";
import { ensureOnboardingTask } from "@/lib/mongodb/employeeTask";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const user = await getUser(params.id);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const updates = await req.json();

    // Lấy trạng thái TRƯỚC khi cập nhật để phát hiện đúng thời điểm "guest" được duyệt lên vai
    // trò chính thức (không phát hiện được sau khi đã ghi đè).
    const prevUser = updates.role ? await getUser(params.id) : null;

    await saveUser({ ...updates, id: params.id });

    // Tự sinh Task hội nhập khi tài khoản chuyển từ "guest" sang vai trò chính thức. Bọc
    // try/catch: lỗi sinh Task không được làm hỏng việc cập nhật vai trò (đã lưu thành công ở trên).
    if (prevUser && prevUser.role === "guest" && updates.role && updates.role !== "guest") {
      try {
        const updated = await getUser(params.id);
        if (updated) await ensureOnboardingTask(updated, auth.userId);
      } catch (e) {
        console.error("[users/[id]:PATCH] Lỗi khi tự sinh Task hội nhập:", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteUser(params.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
