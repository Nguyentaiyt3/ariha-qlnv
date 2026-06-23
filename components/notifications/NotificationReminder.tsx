"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";

/**
 * Hiển thị banner cảnh báo khi URL có ?remind=1.
 * Thường được gắn vào khi bấm vào thông báo yêu cầu hành động
 * (phê duyệt node, quyết toán tạm ứng, ...) mà người dùng chưa xử lý.
 */
export function NotificationReminder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(searchParams.get("remind") === "1");
  }, [searchParams]);

  function dismiss() {
    setVisible(false);
    // Xóa ?remind=1 khỏi URL mà không reload
    const params = new URLSearchParams(searchParams.toString());
    params.delete("remind");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 rounded-xl mb-4 animate-fade-in">
      <div className="shrink-0 mt-0.5">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Vẫn chưa giải quyết
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          Mục này đang chờ hành động của bạn. Vui lòng xem xét và xử lý sớm.
        </p>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 p-1 text-amber-400 hover:text-amber-600 transition"
        aria-label="Đóng nhắc nhở"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
