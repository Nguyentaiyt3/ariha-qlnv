import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import type { ResearchTopic } from "@/types";

/** GET — lấy thông tin phiên họp + đề tài để điền phiếu biểu quyết (ẩn danh). */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = await Promise.resolve(params);
  if (!token || token.length < 20) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 400 });

  await connectDB();
  const doc = await ResearchTopicModel.findOne({ "councilSessions.members.voteToken": token }).lean() as (ResearchTopic & { _id: string }) | null;
  if (!doc) return NextResponse.json({ error: "Không tìm thấy phiếu biểu quyết" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;
  const session = (topic.councilSessions ?? []).find(s => (s.members ?? []).some(m => m.voteToken === token));
  if (!session) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 404 });

  const member = (session.members ?? []).find(m => m.voteToken === token);
  if (!member) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 404 });

  // Kiểm tra đã biểu quyết chưa
  const existingVote = (session.votes ?? []).find(v => v.voteToken === token);

  return NextResponse.json({
    topic: {
      id: topic.id,
      title: topic.title,
      field: topic.field,
      year: topic.year,
      abstract: topic.abstract,
    },
    session: {
      id: session.id,
      stage: session.stage,
      scheduledAt: session.scheduledAt,
      decision: session.decision,
    },
    member: {
      name: member.name,
      role: member.role,
      department: member.department,
    },
    alreadyVoted: !!existingVote,
    existingVote: existingVote ? { vote: existingVote.vote, comment: existingVote.comment } : null,
  });
}

/** POST — nộp phiếu biểu quyết. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = await Promise.resolve(params);
  if (!token || token.length < 20) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 400 });

  await connectDB();
  const doc = await ResearchTopicModel.findOne({ "councilSessions.members.voteToken": token }).lean() as (ResearchTopic & { _id: string }) | null;
  if (!doc) return NextResponse.json({ error: "Không tìm thấy phiếu biểu quyết" }, { status: 404 });

  const topic = { ...doc, id: String(doc._id) } as ResearchTopic;
  const sessionIdx = (topic.councilSessions ?? []).findIndex(s => (s.members ?? []).some(m => m.voteToken === token));
  if (sessionIdx === -1) return NextResponse.json({ error: "Token không hợp lệ" }, { status: 404 });

  const session = topic.councilSessions[sessionIdx];
  if (session.decision) return NextResponse.json({ error: "Phiên họp đã có kết luận" }, { status: 409 });

  const member = (session.members ?? []).find(m => m.voteToken === token)!;
  const alreadyVoted = (session.votes ?? []).some(v => v.voteToken === token);
  if (alreadyVoted) return NextResponse.json({ error: "Bạn đã biểu quyết rồi" }, { status: 409 });

  const body = await req.json().catch(() => ({})) as { vote: string; comment?: string };
  if (!["approve", "reject", "abstain"].includes(body.vote)) {
    return NextResponse.json({ error: "Kết quả biểu quyết không hợp lệ" }, { status: 400 });
  }

  const newVote = {
    memberId: member.userId ?? "",
    memberName: member.name,
    voteToken: token,
    vote: body.vote as "approve" | "reject" | "abstain",
    comment: typeof body.comment === "string" ? body.comment.slice(0, 2000) : undefined,
    votedAt: new Date().toISOString(),
  };

  await ResearchTopicModel.updateOne(
    { _id: String(doc._id) },
    { $push: { [`councilSessions.${sessionIdx}.votes`]: newVote } },
  );

  return NextResponse.json({ success: true });
}
