import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/email/mailer";
import { getUsers, addEmailLog } from "@/lib/firebase/firestore";

interface Recipient {
  name: string;
  email: string;
  id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { senderUserId, recipients, subject, body: emailBody, taskId, stepName } = body as {
      senderUserId?: string;
      recipients: Recipient[];
      subject: string;
      body: string;
      taskId?: string;
      stepName?: string;
    };

    if (!subject || !emailBody || !recipients?.length) {
      return NextResponse.json({ error: "subject, body, recipients là bắt buộc" }, { status: 400 });
    }

    const to = recipients.map((r) => r.email).filter(Boolean);
    if (to.length === 0) {
      return NextResponse.json({ error: "Không có email hợp lệ" }, { status: 400 });
    }

    const users = await getUsers();
    const sender = senderUserId ? users.find((u) => u.id === senderUserId) : undefined;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const taskUrl = taskId ? `${appUrl}/tasks/${taskId}` : null;

    const initials = (name: string) =>
      name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2);

    const senderCardHtml = sender ? `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f1f5f9;border-radius:12px;margin-top:20px;">
        <div style="width:38px;height:38px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${sender.avatar
            ? `<img src="${sender.avatar}" alt="" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">`
            : `<span style="color:#fff;font-size:14px;font-weight:700;">${initials(sender.name)}</span>`}
        </div>
        <div style="min-width:0;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#0f172a;">${sender.name}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b;">${sender.email}${sender.department ? ` · ${sender.department}` : ""}</p>
        </div>
        <div style="margin-left:auto;flex-shrink:0;">
          <span style="font-size:11px;color:#94a3b8;white-space:nowrap;">Người gửi</span>
        </div>
      </div>` : "";

    const stepBadgeHtml = stepName ? `
      <div style="display:inline-block;padding:4px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1d4ed8;font-weight:600;margin-bottom:16px;">
        📋 Bước: ${stepName}
      </div>` : "";

    const taskLinkHtml = taskUrl ? `
      <div style="text-align:center;margin-top:20px;">
        <a href="${taskUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;">
          Xem nhiệm vụ →
        </a>
      </div>` : "";

    const safeBody = emailBody
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const html = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:24px 32px;">
      <span style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">ARiHA WorkHub</span>
      <h1 style="color:#fff;margin:8px 0 0;font-size:20px;font-weight:700;line-height:1.3;">${subject}</h1>
    </div>
    <div style="padding:28px 32px;">
      ${stepBadgeHtml}
      <div style="color:#374151;font-size:15px;line-height:1.75;">${safeBody}</div>
      ${taskLinkHtml}
      ${senderCardHtml}
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">ARiHA WorkHub · Hệ thống quản lý nhiệm vụ nội bộ</p>
    </div>
  </div>
</body>
</html>`;

    await sendMail({
      to,
      subject,
      html,
      senderName: sender?.name,
      senderEmail: sender?.email,
    });

    if (taskId) {
      await addEmailLog({
        taskId,
        recipientIds: recipients.map((r) => r.id ?? r.email),
        recipientEmails: to,
        eventType: "step_notification",
        subject,
        sentAt: new Date().toISOString(),
        status: "sent",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[email/custom]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
