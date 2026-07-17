import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { isNckhFullManager } from "@/lib/researchUtils";
import { sendMail } from "@/lib/email/mailer";
import type { ResearchTopic } from "@/types";

/** POST — tạo voteToken cho từng thành viên phiên họp + (nếu có email) gửi link biểu quyết. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authToken = req.cookies.get("auth-token")?.value;
  const payload = authToken ? verifyToken(authToken) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await getUser(payload.userId);
  if (!me || !isNckhFullManager(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sessionId } = await req.json() as { sessionId: string };
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  await connectDB();
  const doc = await ResearchTopicModel.findById(params.id).lean() as (ResearchTopic & { _id: string }) | null;
  if (!doc) return NextResponse.json({ error: "Không tìm thấy đề tài" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;
  const sessionIdx = (topic.councilSessions ?? []).findIndex(s => s.id === sessionId);
  if (sessionIdx === -1) return NextResponse.json({ error: "Không tìm thấy phiên họp" }, { status: 404 });

  const session = topic.councilSessions[sessionIdx];
  const members = session.members ?? [];

  // Generate token for each member that doesn't have one yet
  const updatedMembers = members.map(m => ({
    ...m,
    voteToken: m.voteToken ?? randomBytes(24).toString("hex"),
  }));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ar-i-ha-work-hub.vercel.app";
  const stageLabel = session.stage === "recognition" ? "Nghiệm thu GĐ2" : "Thẩm định đề cương GĐ1";

  // Send emails to members who have email and token is newly generated
  const emailErrors: string[] = [];
  for (const [i, member] of updatedMembers.entries()) {
    const email = member.email;
    if (!email) continue;
    const isNew = !members[i].voteToken; // only send if token was just generated
    if (!isNew) continue;
    const link = `${baseUrl}/council-vote/${member.voteToken}`;
    try {
      await sendMail({
        to: [email],
        subject: `[ARiHA NCKH] Mời biểu quyết Hội đồng KHCN — ${topic.title}`,
        html: `
<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
  <h2 style="color:#6d28d9;margin-bottom:4px">ARiHA WorkHub · Hội đồng KHCN</h2>
  <p style="color:#64748b;font-size:13px;margin-top:0">${stageLabel}</p>
  <p>Kính gửi <strong>${member.name}</strong>,</p>
  <p>Bạn được mời biểu quyết trong phiên họp Hội đồng KHCN cho đề tài:</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0">
    <strong style="font-size:15px">${topic.title}</strong>
    ${topic.field ? `<p style="color:#64748b;margin:4px 0 0">${topic.field} · ${topic.year}</p>` : ""}
  </div>
  <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
    Gửi phiếu biểu quyết →
  </a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Đường dẫn chỉ dùng được một lần. Nếu bạn chưa biểu quyết, vui lòng bấm vào link trên.</p>
</div>`,
      });
    } catch (e) {
      emailErrors.push(`${member.name}: ${e instanceof Error ? e.message : "lỗi"}`);
    }
  }

  // Save updated members with tokens
  await ResearchTopicModel.updateOne(
    { _id: params.id },
    { $set: { [`councilSessions.${sessionIdx}.members`]: updatedMembers } },
  );

  return NextResponse.json({
    success: true,
    tokens: updatedMembers.map(m => ({
      name: m.name,
      email: m.email,
      voteToken: m.voteToken,
      link: `${baseUrl}/council-vote/${m.voteToken}`,
    })),
    emailErrors: emailErrors.length ? emailErrors : undefined,
  });
}
