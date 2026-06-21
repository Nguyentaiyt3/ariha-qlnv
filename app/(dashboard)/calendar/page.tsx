"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar, RefreshCw, ExternalLink, CheckCircle, Plus,
  Clock, CheckCircle2, XCircle, Loader2, X as XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import type { CalendarEvent, Task } from "@/types";
import type { BigCalEvent } from "@/components/calendar/CalendarView";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  saveCalendarEvent, subscribeCalendarEvents,
  getPendingCalendarEvents, approveCalendarEvent, addNotification,
} from "@/lib/firebase/firestore";

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

// ── Add event modal ───────────────────────────────────────────────────────────
function AddEventModal({
  currentUser,
  canApprove,
  onClose,
}: {
  currentUser: { id: string; name: string };
  canApprove: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !start || !end) { toast.error("Vui lòng điền tiêu đề, ngày giờ bắt đầu và kết thúc."); return; }
    if (new Date(start) >= new Date(end)) { toast.error("Thời gian kết thúc phải sau thời gian bắt đầu."); return; }
    setSaving(true);
    try {
      const event: CalendarEvent = {
        id: generateId("cal"),
        userId: currentUser.id,
        userName: currentUser.name,
        title: title.trim(),
        description: description.trim() || undefined,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        type: "internal",
        status: canApprove ? "published" : "pending",
      };
      await saveCalendarEvent(event);
      toast.success(canApprove ? "Đã thêm sự kiện." : "Đã gửi sự kiện. Chờ quản lý phê duyệt để công khai.");
      onClose();
    } catch {
      toast.error("Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[var(--foreground)]">Thêm sự kiện</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề sự kiện *"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Bắt đầu *</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Kết thúc *</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="Mô tả (tuỳ chọn)"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        {!canApprove && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            Sự kiện sẽ được gửi để quản lý phê duyệt trước khi công khai cho toàn đội.
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition">Huỷ</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {canApprove ? "Lưu sự kiện" : "Gửi để duyệt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { currentUser } = useAuthStore();
  const { tasks } = useTaskStore();
  const [showGoogle, setShowGoogle] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<BigCalEvent[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [connected, setConnected] = useState(false);
  const [myEvents, setMyEvents] = useState<CalendarEvent[]>([]);
  const [pendingEvents, setPendingEvents] = useState<CalendarEvent[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingEvent, setRejectingEvent] = useState<{ id: string; reason: string } | null>(null);

  const canCreate = !!(currentUser && hasPermission(currentUser.role, "calendar:createPersonal"));
  const canApprove = !!(currentUser && hasPermission(currentUser.role, "calendar:approve"));

  const internalEvents: BigCalEvent[] = tasks
    .map(taskToCalEvent)
    .filter((e): e is BigCalEvent => e !== null);

  // Own events (subscribed realtime)
  const myCalBigEvents: BigCalEvent[] = myEvents
    .filter((e) => e.status === "published" || e.userId === currentUser?.id)
    .map((e) => ({
      id: e.id,
      title: e.status === "pending" ? `[Chờ duyệt] ${e.title}` : e.title,
      start: new Date(e.start),
      end: new Date(e.end),
      resource: { type: "internal" as const },
    }));

  useEffect(() => {
    if (currentUser?.googleCalendarToken) setConnected(true);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeCalendarEvents(currentUser.id, setMyEvents);
    return () => unsub();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!canApprove) return;
    getPendingCalendarEvents().then(setPendingEvents);
  }, [canApprove]);

  async function handleApproveEvent(id: string, approve: boolean, reason?: string) {
    const target = pendingEvents.find((e) => e.id === id);
    setApprovingId(id);
    try {
      await approveCalendarEvent(id, approve, reason);
      setPendingEvents((prev) => prev.filter((e) => e.id !== id));
      setRejectingEvent(null);
      toast.success(approve ? "Đã duyệt sự kiện." : "Đã từ chối sự kiện.");
      if (target && currentUser && target.userId !== currentUser.id) {
        await addNotification({
          userId: target.userId,
          type: approve ? "request_approved" : "request_rejected",
          title: approve ? "Sự kiện được duyệt" : "Sự kiện bị từ chối",
          body: approve
            ? `Sự kiện "${target.title}" đã được ${currentUser.name} phê duyệt và công khai.`
            : `Sự kiện "${target.title}" bị từ chối bởi ${currentUser.name}.${reason ? ` Lý do: ${reason}` : ""}`,
          link: "/calendar",
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      toast.error("Thao tác thất bại.");
    } finally {
      setApprovingId(null);
    }
  }

  const connectGoogle = async () => {
    if (!currentUser) return;
    const res = await fetch(`/api/calendar/google?state=${currentUser.id}`);
    const { url } = await res.json();
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
      if (showGoogle && connected) loadGoogleEvents(start, end);
    },
    [showGoogle, connected, loadGoogleEvents],
  );

  const handleToggleGoogle = () => {
    if (!connected) { connectGoogle(); return; }
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
      <div className="flex items-center justify-between flex-wrap gap-3">
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
          {canCreate && (
            <button
              onClick={() => setShowAddEvent(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Thêm sự kiện
            </button>
          )}
          {connected && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Google Calendar
            </div>
          )}
          <button
            onClick={handleToggleGoogle}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition",
              showGoogle ? "bg-red-50 text-red-600 border-red-200" : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:border-blue-300"
            )}
          >
            {loadingGoogle ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {showGoogle ? "Ẩn Google Calendar" : connected ? "Hiện Google Calendar" : "Kết nối Google"}
          </button>
        </div>
      </div>

      {/* Pending events — managers only */}
      {canApprove && pendingEvents.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Sự kiện chờ duyệt ({pendingEvents.length})
          </h2>
          <div className="space-y-2">
            {pendingEvents.map((ev) => (
              <div key={ev.id} className="bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-800 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{ev.title}</p>
                    <p className="text-xs text-slate-400">
                      {ev.userName} · {new Date(ev.start).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {ev.description && ` · ${ev.description}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setRejectingEvent(rejectingEvent?.id === ev.id ? null : { id: ev.id, reason: "" })}
                      disabled={approvingId === ev.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-xs font-medium transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Từ chối
                    </button>
                    <button
                      onClick={() => handleApproveEvent(ev.id, true)}
                      disabled={approvingId === ev.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
                    >
                      {approvingId === ev.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Duyệt
                    </button>
                  </div>
                </div>
                {rejectingEvent?.id === ev.id && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
                    <p className="text-xs font-medium text-red-600 pt-2">Lý do từ chối <span className="text-red-500">*</span></p>
                    <textarea
                      autoFocus
                      rows={2}
                      value={rejectingEvent.reason}
                      onChange={(e) => setRejectingEvent({ ...rejectingEvent, reason: e.target.value })}
                      placeholder="Nhập lý do từ chối..."
                      className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg bg-white dark:bg-slate-900 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setRejectingEvent(null)}
                        className="flex-1 py-1.5 border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition">
                        Huỷ
                      </button>
                      <button
                        onClick={() => {
                          if (!rejectingEvent.reason.trim()) { toast.error("Vui lòng nhập lý do từ chối."); return; }
                          handleApproveEvent(ev.id, false, rejectingEvent.reason.trim());
                        }}
                        disabled={approvingId === ev.id}
                        className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
                      >
                        {approvingId === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Xác nhận từ chối
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
          internalEvents={[...internalEvents, ...myCalBigEvents]}
          googleEvents={googleEvents}
          showGoogle={showGoogle}
          onRangeChange={handleRangeChange}
        />
      </div>

      {showAddEvent && currentUser && (
        <AddEventModal
          currentUser={currentUser}
          canApprove={canApprove}
          onClose={() => setShowAddEvent(false)}
        />
      )}
    </div>
  );
}
