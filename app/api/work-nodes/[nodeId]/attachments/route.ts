/**
 * POST   /api/work-nodes/[nodeId]/attachments  — Thêm đầu ra (Output Attachment)
 * DELETE /api/work-nodes/[nodeId]/attachments?attachmentId=xxx  — Xóa đầu ra
 */
import { NextRequest, NextResponse } from "next/server";
import { addOutputAttachment, removeOutputAttachment } from "@/lib/firebase/workNodes";
import type { OutputAttachmentType } from "@/types";

type Params = { params: { nodeId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json() as {
      type: OutputAttachmentType;
      name: string;
      content: string;
      uploadedBy: string;
      uploadedByName: string;
    };

    if (!body.type || !body.name || !body.content || !body.uploadedBy) {
      return NextResponse.json(
        { error: "Thiếu type, name, content hoặc uploadedBy." },
        { status: 400 }
      );
    }
    if (!["file", "link", "text"].includes(body.type)) {
      return NextResponse.json(
        { error: "type phải là file, link hoặc text." },
        { status: 400 }
      );
    }

    const attachment = await addOutputAttachment(params.nodeId, {
      ...body,
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({ attachment, message: "Đã thêm đầu ra." }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const attachmentId = req.nextUrl.searchParams.get("attachmentId");
    if (!attachmentId) {
      return NextResponse.json({ error: "attachmentId là bắt buộc." }, { status: 400 });
    }
    await removeOutputAttachment(params.nodeId, attachmentId);
    return NextResponse.json({ message: "Đã xóa đầu ra." });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
