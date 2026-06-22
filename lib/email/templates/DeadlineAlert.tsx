import type { Task, User } from "@/types";
import { formatDate, daysUntilDeadline } from "@/lib/utils";
import { senderBlock } from "./_shared";

export function renderDeadlineAlert(task: Task, recipients: User[], sender?: User): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const days = task.deadlineBase ? daysUntilDeadline(task.deadlineBase) : 0;

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Sắp đến hạn</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:24px;">⏰</span>
        <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">ARiHA WorkHub · Cảnh báo deadline</span>
      </div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Sắp đến hạn: còn ${days} ngày</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#475569;font-size:15px;margin:0 0 20px;">Nhiệm vụ sau đây đang tiến gần đến deadline:</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h2 style="color:#0f172a;font-size:17px;font-weight:700;margin:0 0 10px;">${task.name}</h2>
        <p style="color:#78350f;font-size:14px;margin:0 0 12px;">Tiến độ hiện tại: <strong>${task.progress}%</strong></p>
        <p style="color:#92400e;font-size:13px;margin:0;">Hạn chót: <strong>${task.deadlineBase ? formatDate(task.deadlineBase) : "—"}</strong></p>
      </div>
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${appUrl}/tasks/${task.id}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;">
          Cập nhật tiến độ ngay →
        </a>
      </div>
      ${senderBlock(sender)}
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">ARiHA WorkHub · Email tự động</p>
    </div>
  </div>
</body>
</html>`;
}
