"use client";

import { MessageSquare, ArrowRight } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useMemo, useEffect, useState } from "react";
import { getMessages } from "@/lib/firebase/firestore";
import type { Message } from "@/types";
import { formatRelativeTime, getInitials, avatarColor } from "@/lib/utils";
import Link from "next/link";

export default function InternalMessagesWidget() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();
  const [recentMessages, setRecentMessages] = useState<{ taskId: string; taskName: string; msg: Message }[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    const myTaskIds = tasks
      .filter(
        (t) =>
          t.mainPerformerId === currentUser.id ||
          t.stakeholders.some((s) => s.userId === currentUser.id),
      )
      .map((t) => t.id)
      .slice(0, 5);

    Promise.all(
      myTaskIds.map(async (taskId) => {
        const msgs = await getMessages(taskId);
        const task = tasks.find((t) => t.id === taskId);
        const latest = msgs[msgs.length - 1];
        if (!latest || !task) return null;
        return { taskId, taskName: task.name, msg: latest };
      }),
    ).then((results) => {
      const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
      valid.sort((a, b) => new Date(b.msg.timestamp).getTime() - new Date(a.msg.timestamp).getTime());
      setRecentMessages(valid.slice(0, 4));
    });
  }, [currentUser, tasks]);

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="font-semibold text-[var(--foreground)] text-sm flex items-center gap-1.5 mb-3">
        <MessageSquare className="w-4 h-4 text-violet-500" />
        Tin nhắn mới nhất
      </h3>
      <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
        {recentMessages.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Chưa có tin nhắn</p>
        ) : (
          recentMessages.map(({ taskId, taskName, msg }) => (
            <Link
              key={`${taskId}-${msg.id}`}
              href={`/tasks/${taskId}`}
              className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: avatarColor(msg.senderName) }}
              >
                {getInitials(msg.senderName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--foreground)] truncate">{taskName}</p>
                <p className="text-xs text-[var(--muted-foreground)] truncate">
                  <span className="font-medium">{msg.senderName}:</span> {msg.content}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{formatRelativeTime(msg.timestamp)}</p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
