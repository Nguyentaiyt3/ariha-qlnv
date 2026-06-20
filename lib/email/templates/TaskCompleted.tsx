import type { Task, User } from "@/types";
import { formatDate } from "@/lib/utils";

export function renderTaskCompleted(task: Task, recipients: User[]): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Nhiệm vụ hoàn thành</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#059669,#10b981);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:24px;">🎉</span>
        <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">ARiHA WorkHub · Hoàn thành</span>
      </div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Nhiệm vụ đã hoàn thành!</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#475569;font-size:15px;margin:0 0 20px;">Nhiệm vụ sau đã được đánh dấu hoàn thành:</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #10b981;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h2 style="color:#0f172a;font-size:17px;font-weight:700;margin:0 0 10px;">${task.name}</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:3px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;width:140px;">Tiến độ cuối</td>
            <td style="padding:3px 0;color:#065f46;font-size:14px;font-weight:700;">100%</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Hạn thực hiện</td>
            <td style="padding:3px 0;color:#374151;font-size:14px;">${task.deadlineBase ? formatDate(task.deadlineBase) : "—"}</td>
          </tr>
          ${task.department ? `<tr><td style="padding:3px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Phòng ban</td><td style="padding:3px 0;color:#374151;font-size:14px;">${task.department}</td></tr>` : ""}
        </table>
      </div>
      <div style="text-align:center;">
        <a href="${appUrl}/tasks/${task.id}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;">
          Xem chi tiết →
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">ARiHA WorkHub · Email tự động</p>
    </div>
  </div>
</body>
</html>`;
}
