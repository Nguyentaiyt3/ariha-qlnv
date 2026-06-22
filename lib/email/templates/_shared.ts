import type { User } from "@/types";

// Renders a "Sent by" card when a logged-in user triggered the email.
// Returns empty string for automated system events (cron, etc.).
export function senderBlock(sender?: User): string {
  if (!sender) return "";
  const initials = sender.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f1f5f9;border-radius:12px;margin-top:4px;">
      <div style="width:38px;height:38px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${sender.avatar
          ? `<img src="${sender.avatar}" alt="${initials}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">`
          : `<span style="color:#fff;font-size:14px;font-weight:700;">${initials}</span>`}
      </div>
      <div style="min-width:0;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#0f172a;">${sender.name}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">${sender.email}${sender.department ? ` · ${sender.department}` : ""}</p>
      </div>
      <div style="margin-left:auto;flex-shrink:0;">
        <span style="font-size:11px;color:#94a3b8;white-space:nowrap;">Người gửi</span>
      </div>
    </div>`;
}
