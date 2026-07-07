import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mongodb/auth";
import { getRequest, updateRequest, getUser } from "@/lib/mongodb/firestore";
import { ensureOffboardingTask } from "@/lib/mongodb/employeeTask";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const request = await getRequest(params.id);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updates = await req.json();
  const prevRequest = updates.status ? await getRequest(params.id) : null;

  await updateRequest(params.id, updates);

  // Đơn "Nghỉ việc" vừa được phê duyệt → tự sinh Task bàn giao/thu hồi. Bọc try/catch: lỗi sinh
  // Task không được làm hỏng việc duyệt đơn (đã lưu thành công ở trên).
  if (updates.status === "approved" && prevRequest?.type === "resignation" && prevRequest.status !== "approved") {
    try {
      const employee = await getUser(prevRequest.submittedBy);
      if (employee) await ensureOffboardingTask(employee, u.userId);
    } catch (e) {
      console.error("[requests/[id]:PATCH] Lỗi khi tự sinh Task nghỉ việc:", e);
    }
  }

  return NextResponse.json({ success: true });
}
