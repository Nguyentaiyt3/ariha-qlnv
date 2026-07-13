import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUser } from "@/lib/mongodb/auth";
import { updateChannel, deleteChannel, getChannelMessages, sendChannelMessage, updateChannelMessage, markChannelRead } from "@/lib/mongodb/firestore";
import { ChannelModel, ChannelMessageModel } from "@/lib/mongodb/models";

async function auth(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? verifyToken(token) : null;
}

async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const channel = await ChannelModel.findById(channelId).lean() as any;
  if (!channel) return false;
  return channel.type === "public" || (channel.memberIds ?? []).includes(userId);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isChannelMember(params.id, user.userId)) {
    return NextResponse.json({ error: "Bạn không phải thành viên kênh này" }, { status: 403 });
  }
  const messages = await getChannelMessages(params.id);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.action === "updateMessage") {
    // msgId phải là string thuần — _id trong schema này là string tự do (không phải ObjectId),
    // nên Mongoose không tự chặn injection kiểu { "$ne": null } nếu không kiểm tra kiểu trước.
    if (typeof body.msgId !== "string") {
      return NextResponse.json({ error: "msgId không hợp lệ" }, { status: 400 });
    }
    // Chỉ chủ sở hữu tin nhắn được sửa nội dung tin nhắn của chính mình.
    const msg = await ChannelMessageModel.findById(body.msgId).lean() as any;
    if (!msg || msg.senderId !== user.userId) {
      return NextResponse.json({ error: "Bạn không có quyền sửa tin nhắn này" }, { status: 403 });
    }
    // Dùng lại _id đã xác thực từ msg, không dùng lại body.msgId cho lệnh ghi.
    await updateChannelMessage(params.id, msg._id, body.data);
    return NextResponse.json({ success: true });
  }

  if (!await isChannelMember(params.id, user.userId)) {
    return NextResponse.json({ error: "Bạn không phải thành viên kênh này" }, { status: 403 });
  }

  if (body.action === "sendMessage") {
    // Danh tính người gửi luôn lấy từ phiên đăng nhập, không tin theo body.
    const me = await getUser(user.userId);
    await sendChannelMessage(params.id, {
      ...body.message,
      channelId: params.id,
      senderId: user.userId,
      senderName: me?.name ?? body.message?.senderName,
      senderAvatar: me?.avatar ?? body.message?.senderAvatar,
    });
    return NextResponse.json({ success: true });
  }
  if (body.action === "markRead") {
    await markChannelRead(params.id, user.userId);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await ChannelModel.findById(params.id).lean() as any;
  if (!channel || channel.createdBy !== user.userId) {
    return NextResponse.json({ error: "Chỉ người tạo kênh mới được chỉnh sửa" }, { status: 403 });
  }
  const body = await req.json();
  await updateChannel(params.id, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channel = await ChannelModel.findById(params.id).lean() as any;
  if (!channel || channel.createdBy !== user.userId) {
    return NextResponse.json({ error: "Chỉ người tạo kênh mới được xoá" }, { status: 403 });
  }
  await deleteChannel(params.id);
  return NextResponse.json({ success: true });
}
