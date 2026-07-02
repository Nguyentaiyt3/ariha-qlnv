"use client";

import { useState, useMemo, useCallback } from "react";
import {
  X, Search, UserPlus, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, Users, ClipboardList, Trash2, Mail, ShieldAlert, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isTopicAuthor } from "@/lib/researchUtils";
import type { ResearchTopic, ResearchReview, User, ResearchDesignation } from "@/types";

// ─── Types ─────────────────────────────────────────────────────

interface Props {
  topics: ResearchTopic[];
  users: User[];
  currentUser: { id: string; name: string; email?: string };
  canManage: boolean;
  canAssignReviewer: boolean;   // research:assignReviewer permission
  onClose: () => void;
  onTopicUpdate: (id: string, updates: Partial<ResearchTopic>) => void;
}

type Tab = "direct" | "delegate";

interface ReviewerSlot {
  topicId: string;
  slot: 1 | 2;
  review?: ResearchReview;
}

// ─── Helpers ───────────────────────────────────────────────────

function proposalReviewCount(topic: ResearchTopic): number {
  return (topic.reviews ?? []).filter(r => r.stage === "proposal").length;
}

function hasDesignation(user: User, des: ResearchDesignation): boolean {
  return (user.researchDesignations ?? []).includes(des);
}

// ─── Reviewer search dropdown ──────────────────────────────────

function ReviewerPicker({
  users,
  excludeIds,
  onSelect,
  placeholder = "Tìm nhân viên...",
  emptyMsg = "Không tìm thấy nhân viên phù hợp",
}: {
  users: User[];
  excludeIds: string[];
  onSelect: (user: User) => void;
  placeholder?: string;
  emptyMsg?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() =>
    q.trim()
      ? users.filter(u =>
          !excludeIds.includes(u.id) &&
          (u.name.toLowerCase().includes(q.toLowerCase()) ||
           (u.email ?? "").toLowerCase().includes(q.toLowerCase()))
        ).slice(0, 8)
      : [],
  [users, excludeIds, q]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-violet-400">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
          {filtered.map(u => (
            <button
              key={u.id}
              type="button"
              onMouseDown={() => { onSelect(u); setQ(""); setOpen(false); }}
              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition text-left"
            >
              <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {u.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-white">{u.name}</p>
                {u.email && <p className="text-[11px] text-slate-400">{u.email}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && filtered.length === 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-3 text-sm text-slate-400">
          {emptyMsg}
        </div>
      )}
    </div>
  );
}

// ─── External reviewer form ────────────────────────────────────

function ExternalReviewerForm({ onAdd }: { onAdd: (name: string, email: string, org: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
    >
      <Mail className="w-3 h-3" /> Chuyên gia ngoài (chỉ cần email)
    </button>
  );

  return (
    <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Chuyên gia / Phản biện ngoài hệ thống</p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Họ tên *"
        className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-violet-400"
      />
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email *"
        type="email"
        className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-violet-400"
      />
      <input
        value={org}
        onChange={e => setOrg(e.target.value)}
        placeholder="Đơn vị / Tổ chức (tùy chọn)"
        className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-violet-400"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!name.trim() || !email.trim()}
          onClick={() => { onAdd(name.trim(), email.trim(), org.trim()); setName(""); setEmail(""); setOrg(""); setOpen(false); }}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
        >
          Thêm
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
          Huỷ
        </button>
      </div>
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────

export function AssignReviewersModal({
  topics, users, currentUser, canManage, canAssignReviewer, onClose, onTopicUpdate,
}: Props) {
  const canDirect = canAssignReviewer || canManage;
  const [tab, setTab] = useState<Tab>(canDirect ? "direct" : "delegate");

  // Direct-assign state
  const [pending, setPending] = useState<
    Record<string, Array<{ type: "internal"; user: User } | { type: "external"; name: string; email: string; org: string }>>
  >({});
  const [directDue, setDirectDue] = useState("");   // shared deadline for all reviews in this batch
  const [saving, setSaving] = useState(false);

  // Delegate state
  const [delegateTo, setDelegateTo] = useState<User | null>(null);
  const [delegateNote, setDelegateNote] = useState("");
  const [delegateDue, setDelegateDue] = useState("");
  const [delegateSaving, setDelegateSaving] = useState(false);

  // Users filtered by designation; fallback to all users when no one has the designation set yet
  const reviewerUsers = useMemo(() => {
    const designated = users.filter(u => hasDesignation(u, "reviewer"));
    return designated.length > 0 ? designated : users;
  }, [users]);
  const managerUsers = useMemo(() => {
    const designated = users.filter(u => hasDesignation(u, "researchManager"));
    return designated.length > 0 ? designated : users;
  }, [users]);

  // Topics where current user is PI or member → cannot assign for these
  const myTopicIds = useMemo(
    () => new Set(topics.filter(t => isTopicAuthor({ id: currentUser.id }, t)).map(t => t.id)),
    [topics, currentUser.id],
  );

  // COI for delegate
  const delegateCOITopics = useMemo(
    () => delegateTo ? topics.filter(t => isTopicAuthor({ id: delegateTo.id }, t)) : [],
    [delegateTo, topics],
  );

  const addPending = useCallback((topicId: string, entry: (typeof pending)[string][number]) => {
    setPending(prev => {
      const cur = prev[topicId] ?? [];
      const topic = topics.find(t => t.id === topicId);
      const existing = topic ? proposalReviewCount(topic) : 0;
      if (existing + cur.length >= 2) {
        toast.error("Đề tài chỉ cần 2 phản biện độc lập");
        return prev;
      }
      // Kiểm tra trùng
      const isDup = cur.some(e =>
        e.type === "internal" && entry.type === "internal" && e.user.id === (entry as { type: "internal"; user: User }).user.id
      );
      if (isDup) { toast.error("Phản biện này đã trong danh sách"); return prev; }
      // COI hard block: phản biện là PI hoặc thành viên đề tài
      if (entry.type === "internal" && topic && isTopicAuthor({ id: entry.user.id }, topic)) {
        toast.error(`${entry.user.name} là chủ nhiệm/thành viên đề tài — không thể chọn làm phản biện`);
        return prev;
      }
      return { ...prev, [topicId]: [...cur, entry] };
    });
  }, [topics]);

  const removePending = useCallback((topicId: string, idx: number) => {
    setPending(prev => {
      const cur = [...(prev[topicId] ?? [])];
      cur.splice(idx, 1);
      return { ...prev, [topicId]: cur };
    });
  }, []);

  async function handleSaveDirect() {
    setSaving(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const now = new Date().toISOString();
      for (const topic of topics) {
        // Skip topics where current user is PI/member
        if (myTopicIds.has(topic.id)) continue;

        const entries = pending[topic.id] ?? [];
        if (entries.length === 0) continue;

        for (const entry of entries) {
          const body =
            entry.type === "internal"
              ? {
                  stage: "proposal",
                  reviewerType: "internal",
                  reviewerId: entry.user.id,
                  reviewerName: entry.user.name,
                  reviewerEmail: entry.user.email ?? undefined,
                  dueAt: directDue || undefined,
                }
              : {
                  stage: "proposal",
                  reviewerType: "external",
                  reviewerName: entry.name,
                  reviewerEmail: entry.email,
                  reviewerOrg: entry.org || undefined,
                  dueAt: directDue || undefined,
                };

          const res = await fetch(`/api/research/${topic.id}/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(`${topic.title}: ${data.error ?? "Lỗi phân công"}`);
            continue;
          }

          const data = await res.json();

          // Gửi email thông báo
          const reviewerEmail = entry.type === "internal" ? (entry.user.email ?? "") : entry.email;
          const reviewerName = entry.type === "internal" ? entry.user.name : entry.name;
          if (reviewerEmail && data.token) {
            const reviewLink = `${appUrl}/review/${data.token}`;
            await fetch("/api/email/custom", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                senderUserId: currentUser.id,
                recipients: [{ id: entry.type === "internal" ? entry.user.id : "", name: reviewerName, email: reviewerEmail }],
                subject: `[ARiHA NCKH] Mời phản biện đề cương nghiên cứu`,
                body:
                  `Kính gửi ${reviewerName},\n\n` +
                  `Bạn được mời tham gia phản biện một đề cương nghiên cứu khoa học. Vì đây là phản biện kín, thông tin tác giả được ẩn.\n\n` +
                  `Vui lòng truy cập đường dẫn sau để xem đề cương và điền phiếu nhận xét:\n${reviewLink}\n\n` +
                  `Đường dẫn này chỉ dành riêng cho bạn và không cần đăng nhập.\n\n` +
                  `Trân trọng,\n${currentUser.name}`,
              }),
            }).catch(() => {});
          }
        }

        // Ghi lại người phụ trách phân công là người đang đăng nhập
        if ((pending[topic.id] ?? []).length > 0) {
          const assignUpdates: Partial<ResearchTopic> = {
            reviewAssignment: {
              ...topic.reviewAssignment,
              delegatedTo: currentUser.id,
              delegatedName: currentUser.name,
              delegatedAt: now,
              dueAt: directDue || topic.reviewAssignment?.dueAt,
            },
            updatedAt: now,
          };
          await fetch(`/api/research/${topic.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(assignUpdates),
          });
          onTopicUpdate(topic.id, assignUpdates);
        }

        // Reload topic for fresh review list
        const updatedTopic = await fetch(`/api/research/${topic.id}`).then(r => r.json()).catch(() => null);
        if (updatedTopic?.topic) {
          onTopicUpdate(topic.id, updatedTopic.topic);
        }
      }
      toast.success("Đã phân công phản biện thành công");
      onClose();
    } catch {
      toast.error("Phân công thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelegate() {
    if (!delegateTo) { toast.error("Chưa chọn nhân viên"); return; }
    if (delegateCOITopics.length > 0) {
      toast.error(
        `${delegateTo.name} là chủ nhiệm/thành viên của ${delegateCOITopics.length} đề tài — không thể tự phân công phản biện cho đề tài của mình`
      );
      return;
    }
    setDelegateSaving(true);
    try {
      const now = new Date().toISOString();
      for (const topic of topics) {
        const updates: Partial<ResearchTopic> = {
          reviewAssignment: {
            delegatedTo: delegateTo.id,
            delegatedName: delegateTo.name,
            delegatedAt: now,
            dueAt: delegateDue || undefined,
            note: delegateNote.trim() || undefined,
          },
          updatedAt: now,
        };
        await fetch(`/api/research/${topic.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        onTopicUpdate(topic.id, updates);

        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: delegateTo.id,
            type: "task_assigned",
            title: "Được giao phân công phản biện",
            body: `Bạn được giao chỉ định phản biện cho đề tài: "${topic.title}".${delegateNote ? ` Ghi chú: ${delegateNote}` : ""}`,
            link: "/research",
            read: false,
            priority: "normal",
            createdAt: now,
          }),
        }).catch(() => {});
      }
      toast.success(`Đã giao phân công phản biện cho ${delegateTo.name}`);
      onClose();
    } catch {
      toast.error("Giao nhiệm vụ thất bại");
    } finally {
      setDelegateSaving(false);
    }
  }

  const totalPending = Object.values(pending).reduce((s, arr) => s + arr.length, 0);
  const assignableTopics = topics.filter(t => !myTopicIds.has(t.id));
  const blockedTopics = topics.filter(t => myTopicIds.has(t.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-violet-500" />
              Phân công phản biện
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {topics.length} đề tài được chọn · Mỗi đề tài cần 2 phản biện độc lập, kín
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Blocked topics notice */}
        {blockedTopics.length > 0 && (
          <div className="mx-5 mt-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Không thể phân công cho đề tài của chính mình:</strong>{" "}
              {blockedTopics.map(t => t.title).join(", ")}
            </div>
          </div>
        )}

        {/* Tabs */}
        {(canDirect || canManage) && (
          <div className="flex border-b border-slate-200 dark:border-slate-700 px-5 gap-4">
            {canDirect && (
              <button
                onClick={() => setTab("direct")}
                className={cn(
                  "flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition",
                  tab === "direct"
                    ? "border-violet-600 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <ClipboardList className="w-3.5 h-3.5" /> Chỉ định trực tiếp
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setTab("delegate")}
                className={cn(
                  "flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition",
                  tab === "delegate"
                    ? "border-violet-600 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Users className="w-3.5 h-3.5" /> Giao nhân viên phụ trách
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Tab: Chỉ định trực tiếp ── */}
          {tab === "direct" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn phản biện cho từng đề tài. Mỗi đề tài cần 2 phản biện độc lập, kín.
                Chỉ hiển thị nhân viên có vai trò <strong>Phản biện</strong>.
              </p>

              {/* Global deadline */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Hạn phản biện</label>
                <input
                  type="date"
                  value={directDue}
                  onChange={e => setDirectDue(e.target.value)}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-violet-400 text-slate-800 dark:text-white"
                />
                {directDue && (
                  <button onClick={() => setDirectDue("")} className="text-slate-400 hover:text-slate-600 text-xs">Xóa</button>
                )}
              </div>

              {assignableTopics.map(topic => {
                const existing = (topic.reviews ?? []).filter(r => r.stage === "proposal");
                const entries = pending[topic.id] ?? [];
                const total = existing.length + entries.length;
                const full = total >= 2;

                return (
                  <div key={topic.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-start gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/60">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white line-clamp-1">{topic.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {topic.code ? `${topic.code} · ` : ""}{topic.department ?? "—"} · {topic.year}
                        </p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full",
                        full
                          ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                          : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                      )}>
                        {total}/2
                      </span>
                    </div>

                    <div className="px-4 py-3 space-y-2">
                      {existing.map((r, i) => (
                        <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">PB{i + 1}: {r.reviewerName ?? "Ẩn danh"}</p>
                            <p className="text-[10px] text-slate-400">{r.status === "submitted" ? "Đã nộp phiếu" : "Chờ phản biện"}{r.dueAt ? ` · Hạn: ${new Date(r.dueAt).toLocaleDateString("vi-VN")}` : ""}</p>
                          </div>
                        </div>
                      ))}

                      {entries.map((entry, i) => {
                        const entryName = entry.type === "internal" ? entry.user.name : entry.name;
                        return (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800">
                            <UserPlus className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                PB{existing.length + i + 1}: {entryName}
                                {entry.type === "external" && <span className="ml-1 text-slate-400">(ngoài)</span>}
                              </p>
                            </div>
                            <button
                              onClick={() => removePending(topic.id, i)}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}

                      {!full && (
                        <div className="space-y-2 pt-1">
                          <ReviewerPicker
                            users={reviewerUsers}
                            excludeIds={[
                              currentUser.id,
                              ...existing.map(r => r.reviewerId).filter(Boolean) as string[],
                              ...entries.filter(e => e.type === "internal").map(e => (e as { type: "internal"; user: User }).user.id),
                            ]}
                            onSelect={u => addPending(topic.id, { type: "internal", user: u })}
                            placeholder="Tìm phản biện viên..."
                            emptyMsg="Không tìm thấy — chỉ hiển thị nhân viên có vai trò Phản biện"
                          />
                          <ExternalReviewerForm
                            onAdd={(name, email, org) => addPending(topic.id, { type: "external", name, email, org })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {assignableTopics.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                  <p className="text-sm">Tất cả đề tài đã chọn đều là đề tài của bạn — không thể phân công.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Giao nhân viên phụ trách ── */}
          {tab === "delegate" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Giao việc chỉ định phản biện cho nhân viên phụ trách.
                Chỉ hiển thị nhân viên có vai trò <strong>Quản lý NCKH</strong>.
              </p>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {topics.map(t => (
                  <div key={t.id} className={cn("flex items-center gap-3 px-4 py-2.5", myTopicIds.has(t.id) && "opacity-50")}>
                    <ClipboardList className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-white truncate">{t.title}</p>
                      <p className="text-[11px] text-slate-400">{t.code ?? "—"} · {t.year}</p>
                    </div>
                    <span className="text-[11px] text-slate-400">{proposalReviewCount(t)}/2 PB</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Giao cho nhân viên *</label>
                {delegateTo ? (
                  <div className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border",
                    delegateCOITopics.length > 0
                      ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10"
                      : "border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/10"
                  )}>
                    <div className={cn(
                      "w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center",
                      delegateCOITopics.length > 0 ? "bg-red-500" : "bg-violet-600"
                    )}>
                      {delegateTo.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-white">{delegateTo.name}</p>
                      {delegateTo.email && <p className="text-[11px] text-slate-400">{delegateTo.email}</p>}
                    </div>
                    <button onClick={() => setDelegateTo(null)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <ReviewerPicker
                    users={managerUsers}
                    excludeIds={[currentUser.id]}
                    onSelect={u => setDelegateTo(u)}
                    placeholder="Tìm nhân viên Quản lý NCKH..."
                    emptyMsg="Không tìm thấy — chỉ hiển thị nhân viên có vai trò Quản lý NCKH"
                  />
                )}

                {delegateCOITopics.length > 0 && (
                  <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      Xung đột lợi ích — không thể giao
                    </div>
                    <p className="text-xs text-red-500">
                      <strong>{delegateTo!.name}</strong> là chủ nhiệm / thành viên của {delegateCOITopics.length} đề tài trong danh sách.
                    </p>
                    <ul className="space-y-0.5">
                      {delegateCOITopics.map(t => (
                        <li key={t.id} className="text-[11px] text-red-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" /> {t.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Hạn hoàn thành <span className="text-slate-400 font-normal">(tùy chọn)</span>
                </label>
                <input
                  type="date"
                  value={delegateDue}
                  onChange={e => setDelegateDue(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-violet-400 text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Ghi chú <span className="text-slate-400 font-normal">(tùy chọn)</span>
                </label>
                <textarea
                  value={delegateNote}
                  onChange={e => setDelegateNote(e.target.value)}
                  rows={3}
                  placeholder="Hướng dẫn, yêu cầu đặc biệt..."
                  className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-violet-400 resize-none text-slate-800 dark:text-white placeholder:text-slate-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            Huỷ
          </button>

          {tab === "direct" && (
            <button
              onClick={handleSaveDirect}
              disabled={saving || totalPending === 0 || assignableTopics.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {saving ? "Đang phân công..." : `Phân công (${totalPending} phản biện)`}
            </button>
          )}

          {tab === "delegate" && (
            <button
              onClick={handleDelegate}
              disabled={delegateSaving || !delegateTo || delegateCOITopics.length > 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
            >
              {delegateSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {delegateSaving ? "Đang giao..." : `Giao cho ${delegateTo?.name ?? "nhân viên"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
