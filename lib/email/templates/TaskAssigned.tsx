import type { Task, User } from "@/types";
import { formatDate } from "@/lib/utils";

export function renderTaskAssigned(task: Task, recipients: User[]): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const taskUrl = `${appUrl}/tasks/${task.id}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nhiệm vụ mới được giao</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:18px;">📋</span>
        </div>
        <span style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">ARiHA WorkHub</span>
      </div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;line-height:1.3;">Nhiệm vụ mới được giao</h1>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="color:#475569;font-size:15px;margin:0 0 20px;">Bạn đã được giao một nhiệm vụ mới trong WorkHub:</p>

      <!-- Task card -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h2 style="color:#0f172a;font-size:18px;font-weight:700;margin:0 0 12px;">${task.name}</h2>
        ${task.description ? `<p style="color:#64748b;font-size:14px;margin:0 0 16px;line-height:1.6;">${task.description}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;width:120px;">Hạn chuẩn bị</td>
            <td style="padding:4px 0;color:#374151;font-size:14px;font-weight:500;">${task.deadlinePrepare ? formatDate(task.deadlinePrepare) : "—"}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Hạn thực hiện</td>
            <td style="padding:4px 0;color:#374151;font-size:14px;font-weight:500;">${task.deadlineExecute ? formatDate(task.deadlineExecute) : "—"}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Hạn hoàn thiện</td>
            <td style="padding:4px 0;color:#374151;font-size:14px;font-weight:500;">${task.deadlineFinalize ? formatDate(task.deadlineFinalize) : "—"}</td>
          </tr>
          ${task.department ? `<tr><td style="padding:4px 0;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;">Phòng ban</td><td style="padding:4px 0;color:#374151;font-size:14px;">${task.department}</td></tr>` : ""}
        </table>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${taskUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;">
          Xem chi tiết nhiệm vụ →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">ARiHA WorkHub · Hệ thống quản lý nhiệm vụ nội bộ</p>
      <p style="color:#cbd5e1;font-size:11px;margin:4px 0 0;">Bạn nhận email này vì là người thực hiện/hỗ trợ nhiệm vụ.</p>
    </div>
  </div>
</body>
</html>`;
}
