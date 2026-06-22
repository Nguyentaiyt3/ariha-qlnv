import type { Task, User } from "@/types";
import { formatDate } from "@/lib/utils";
import { senderBlock } from "./_shared";

export function renderApprovalRequest(task: Task, recipients: User[], sender?: User): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const taskUrl = `${appUrl}/tasks/${task.id}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Yêu cầu phê duyệt nhiệm vụ</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#7c3aed,#8b5cf6);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:24px;">✅</span>
        <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">ARiHA WorkHub · Phê duyệt</span>
      </div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Nhiệm vụ chờ phê duyệt của bạn</h1>
    </div>
    <div style="padding:28px 32px;">
      ${sender
        ? `<p style="color:#475569;font-size:15px;margin:0 0 20px;"><strong style="color:#6d28d9;">${sender.name}</strong> yêu cầu bạn phê duyệt nhiệm vụ sau:</p>`
        : `<p style="color:#475569;font-size:15px;margin:0 0 20px;">Nhiệm vụ sau đang chờ phê duyệt để chuyển sang trạng thái hoàn thành:</p>`}
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-left:4px solid #7c3aed;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h2 style="color:#0f172a;font-size:17px;font-weight:700;margin:0 0 12px;">${task.name}</h2>
        ${task.description ? `<p style="color:#6b7280;font-size:14px;margin:0 0 12px;line-height:1.5;">${task.description}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:3px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;width:140px;">Tiến độ</td>
            <td style="padding:3px 0;color:#374151;font-size:14px;font-weight:600;">${task.progress}%</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Hạn hoàn thiện</td>
            <td style="padding:3px 0;color:#374151;font-size:14px;">${task.deadlineFinalize ? formatDate(task.deadlineFinalize) : task.deadlineBase ? formatDate(task.deadlineBase) : "—"}</td>
          </tr>
          ${task.department ? `<tr><td style="padding:3px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Phòng ban</td><td style="padding:3px 0;color:#374151;font-size:14px;">${task.department}</td></tr>` : ""}
        </table>
      </div>
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${taskUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;">
          Xem &amp; Phê duyệt ngay →
        </a>
      </div>
      ${senderBlock(sender)}
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">Bạn nhận email này vì là người phê duyệt nhiệm vụ.</p>
    </div>
  </div>
</body>
</html>`;
}
