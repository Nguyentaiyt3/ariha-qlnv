import type { Task, User } from "@/types";
import { formatDate, daysUntilDeadline } from "@/lib/utils";
import { senderBlock } from "./_shared";

export function renderTaskOverdue(task: Task, recipients: User[], sender?: User): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const days = task.deadlineBase ? Math.abs(daysUntilDeadline(task.deadlineBase)) : 0;

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Nhiệm vụ quá hạn</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:24px;">🚨</span>
        <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">ARiHA WorkHub · Khẩn cấp</span>
      </div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Nhiệm vụ đã QUÁ HẠN ${days} ngày</h1>
    </div>
    <div style="padding:28px 32px;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h2 style="color:#0f172a;font-size:17px;font-weight:700;margin:0 0 10px;">${task.name}</h2>
        <p style="color:#7f1d1d;font-size:14px;margin:0 0 8px;">Hạn chót đã qua: <strong>${task.deadlineBase ? formatDate(task.deadlineBase) : "—"}</strong></p>
        <p style="color:#991b1b;font-size:14px;margin:0;">Tiến độ hiện tại: <strong>${task.progress}%</strong></p>
      </div>
      <p style="color:#475569;font-size:14px;margin:0 0 20px;">Vui lòng cập nhật tiến độ ngay hoặc liên hệ quản lý để xử lý.</p>
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${appUrl}/tasks/${task.id}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;">
          Xử lý ngay →
        </a>
      </div>
      ${senderBlock(sender)}
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">Email này được gửi tự động vì nhiệm vụ đã quá hạn.</p>
    </div>
  </div>
</body>
</html>`;
}
