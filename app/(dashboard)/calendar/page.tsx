"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, RefreshCw, ExternalLink, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import type { CalendarEvent, Task } from "@/types";
import type { BigCalEvent } from "@/components/calendar/CalendarView";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { toast } from "sonner";

const CalendarView = dynamic(() => import("@/components/calendar/CalendarView"), { ssr: false });

function taskToCalEvent(task: Task): BigCalEvent | null {
  if (!task.deadlineBase) return null;
  const start = new Date(task.deadlineBase);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const isOverdue = start < new Date() && task.status !== "done";
  return {
    id: task.id,
    title: task.name,
    start,
    end,
    resource: { type: "internal", taskId: task.id, isOverdue },
  };
}

function googleToCalEvent(ev: { id?: string | null; summary?: string | null; start?: { dateTime?: string | null; date?: string | null } | null; end?: { dateTime?: string | null; date?: string | null } | null }): BigCalEvent | null {
  const startStr = ev.start?.dateTime ?? ev.start?.date;
  const endStr = ev.end?.dateTime ?? ev.end?.date;
  if (!startStr || !endStr || !ev.id) return null;
  return {
    id: ev.id,
    title: ev.summary ?? "(Không có tiêu đề)",
    start: new Date(startStr),
    end: new Date(endStr),
    resource: { type: "google" },
  };
}

export default function CalendarPage() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();
  const [showGoogle, setShowGoogle] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<BigCalEvent[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [connected, setConnected] = useState(false);

  const internalEvents: BigCalEvent[] = tasks
    .map(taskToCalEvent)
    .filter((e): e is BigCalEvent => e !== null);

  useEffect(() => {
    if (currentUser?.googleCalendarToken) {
      setConnected(true);
    }
  }, [currentUser]);

  const connectGoogle = async () => {
    if (!currentUser) return;
    const res = await fetch(`/api/calendar/google?state=${currentUser.id}`);
    const { url } = await res.json();
    // Append state param to auth URL
    const authUrl = url.includes("state=") ? url : `${url}&state=${currentUser.id}`;
    window.location.href = authUrl;
  };

  const loadGoogleEvents = useCallback(async (start: Date, end: Date) => {
    if (!currentUser?.googleCalendarToken || !currentUser.id) return;
    setLoadingGoogle(true);
    try {
      const params = new URLSearchParams({
        userId: currentUser.id,
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
      });
      const res = await fetch(`/api/calendar/google/events?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const { events } = await res.json();
      setGoogleEvents((events ?? []).map(googleToCalEvent).filter((e: BigCalEvent | null): e is BigCalEvent => e !== null));
    } catch {
      toast.error("Không thể tải sự kiện Google Calendar");
    } finally {
      setLoadingGoogle(false);
    }
  }, [currentUser]);

  const handleRangeChange = useCallback(
    (start: Date, end: Date) => {
      if (showGoogle && connected) {
        loadGoogleEvents(start, end);
      }
    },
    [showGoogle, connected, loadGoogleEvents],
  );

  const handleToggleGoogle = () => {
    if (!connected) {
      connectGoogle();
      return;
    }
    const next = !showGoogle;
    setShowGoogle(next);
    if (next) {
      const now = new Date();
      loadGoogleEvents(startOfMonth(now), endOfMonth(addMonths(now, 1)));
    }
  };

  return (
    <div className="flex flex-col h-full px-4 py-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-500" />
            Lịch công việc
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Xem tất cả deadline nhiệm vụ và sự kiện
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Google Calendar
            </div>
          ) : null}
          <button
            onClick={handleToggleGoogle}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showGoogle
                ? "bg-red-50 text-red-600 border-red-200"
                : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:border-blue-300"
            }`}
          >
            {loadingGoogle ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            {showGoogle ? "Ẩn Google Calendar" : connected ? "Hiện Google Calendar" : "Kết nối Google"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-500" /> Nhiệm vụ nội bộ
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500" /> Quá hạn
        </div>
        {showGoogle && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#ea4335]" /> Google Calendar
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <CalendarView
          internalEvents={internalEvents}
          googleEvents={googleEvents}
          showGoogle={showGoogle}
          onRangeChange={handleRangeChange}
        />
      </div>
    </div>
  );
}
