"use client";

import { useState, useMemo, useCallback } from "react";
import {
  X, Search, UserPlus, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, Users, ClipboardList, Trash2, Mail, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isTopicAuthor } from "@/lib/researchUtils";
import type { ResearchTopic, ResearchReview, User } from "@/types";

// ─── Types ─────────────────────────────────────────────────────

interface Props {
  topics: ResearchTopic[];                        // đề tài được chọn
  users: User[];                                  // toàn bộ nhân viên
  currentUser: { id: string; name: string; email?: string };
  canManage: boolean;
  onClose: () => void;
  onTopicUpdate: (id: string, updates: Partial<ResearchTopic>) => void;
}

type Tab = "direct" | "delegate";

interface ReviewerSlot {
  topicId: string;
  slot: 1 | 2;
  review?: ResearchReview;   // đã được chỉ định
}

// ─── Helpers ───────────────────────────────────────────────────

function genReviewLink(token: string): string {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/review/${token}`;
}

function proposalReviewCount(topic: ResearchTopic): number {
  return (topic.reviews ?? []).filter(r => r.stage === "proposal").length;
}

// ─── Reviewer search dropdown ──────────────────────────────────

function ReviewerPicker({
  users,
  excludeIds,
  onSelect,
  placeholder = "Tìm nhân viên...",
}: {
  users: User[];
  excludeIds: string[];
  onSelect: (user: User) => void;
  placeholder?: string;
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
          Không tìm thấy nhân viên phù hợp
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

export function AssignReviewersModal({ topics, users, currentUser, canManage, onClose, onTopicUpdate }: Props) {
  const [tab, setTab] = useState<Tab>(canManage ? "direct" : "direct");

  // Direct-assign state: pending[] per topic
  const [pending, setPending] = useState<
    Record<string, Array<{ type: "internal"; user: User } | { type: "external"; name: string; email: string; org: string }>>
  >({});
  const [saving, setSaving] = useState(false);

  // Delegate state
  const [delegateTo, setDelegateTo] = useState<User | null>(null);
  const [delegateNote, setDelegateNote] = useState("");
  const [delegateDue, setDelegateDue] = useState("");
  const [delegateSaving, setDelegateSaving] = useState(false);

  const addPending = useCallback((topicId: string, entry: (typeof pending)[string][number]) => {
    setPending(prev => {
      const cur = prev[topicId] ?? [];
      // tổng reviewers hiện tại + pending không vượt 2
      const topic = topics.find(t => t.id === topicId);
      const existing = topic ? proposalReviewCount(topic) : 0;
      if (existing + cur.length >= 2) {
        toast.error("Đề tài chỉ cần 2 phản biện độc lập");
        return prev;
      }
      // kiểm tra trùng
      const isDup = cur.some(e =>
        e.type === "internal" && entry.type === "internal" && e.user.id === entry.user.id
      );
      if (isDup) { toast.error("Phản biện này đã trong danh sách"); return prev; }
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

  // Cảnh báo COI
  function isCOI(userId: string, topic: ResearchTopic): boolean {
    return isTopicAuthor({ id: userId }, topic);
  }

  async function handleSaveDirect() {
    setSaving(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      for (const topic of topics) {
        const entries = pending[topic.id] ?? [];
        if (entries.length === 0) continue;

        for (const entry of entries) {
          const body =
            entry.type === "internal"
              ? { stage: "proposal", reviewerType: "internal", reviewerId: entry.user.id, reviewerName: entry.user.name, reviewerEmail: entry.user.email ?? undefined }
              : { stage: "proposal", reviewerType: "external", reviewerName: entry.name, reviewerEmail: entry.email, reviewerOrg: entry.org || undefined };

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
          if (data.isCOI) {
            toast.warning(`Cảnh báo: ${entry.type === "internal" ? entry.user.name : entry.name} là tác giả/đồng tác giả của "${topic.title}"`);
          }

          // Gửi email thông báo nếu có email
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

          // Cập nhật local state
          const updatedTopic = await fetch(`/api/research/${topic.id}`).then(r => r.json()).catch(() => null);
          if (updatedTopic?.topic) {
            onTopicUpdate(topic.id, updatedTopic.topic);
          }
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

        // Gửi thông báo nội bộ
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

        {/* Tabs */}
        {canManage && (
          <div className="flex border-b border-slate-200 dark:border-slate-700 px-5 gap-4">
            {([
              { key: "direct" as Tab, label: "Chỉ định trực tiếp", icon: ClipboardList },
              { key: "delegate" as Tab, label: "Giao nhân viên phụ trách", icon: Users },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition",
                  tab === key
                    ? "border-violet-600 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Tab: Chỉ định trực tiếp ── */}
          {tab === "direct" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn phản biện cho từng đề tài. Mỗi đề tài cần 2 phản biện độc lập.
                Phản biện kín — tác giả không biết danh tính phản biện và ngược lại.
              </p>

              {topics.map(topic => {
                const existing = (topic.reviews ?? []).filter(r => r.stage === "proposal");
                const entries = pending[topic.id] ?? [];
                const total = existing.length + entries.length;
                const full = total >= 2;

                return (
                  <div key={topic.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {/* Topic header */}
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
                      {/* Existing assigned reviews */}
                      {existing.map((r, i) => (
                        <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">PB{i + 1}: {r.reviewerName ?? "Ẩn danh"}</p>
                            <p className="text-[10px] text-slate-400">{r.status === "submitted" ? "Đã nộp phiếu" : "Chờ phản biện"}</p>
                          </div>
                        </div>
                      ))}

                      {/* Pending to be saved */}
                      {entries.map((entry, i) => {
                        const entryName = entry.type === "internal" ? entry.user.name : entry.name;
                        const userId = entry.type === "internal" ? entry.user.id : undefined;
                        const hasCOI = userId ? isCOI(userId, topic) : false;
                        return (
                          <div key={i} className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border",
                            hasCOI
                              ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                              : "bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800"
                          )}>
                            {hasCOI
                              ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              : <UserPlus className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                PB{existing.length + i + 1}: {entryName}
                                {entry.type === "external" && <span className="ml-1 text-slate-400">(ngoài)</span>}
                              </p>
                              {hasCOI && (
                                <p className="text-[10px] text-red-500 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" /> Là tác giả/đồng tác giả — nên thay phản biện khác
                                </p>
                              )}
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

                      {/* Add picker — only if not full */}
                      {!full && (
                        <div className="space-y-2 pt-1">
                          <ReviewerPicker
                            users={users}
                            excludeIds={[
                              ...existing.map(r => r.reviewerId).filter(Boolean) as string[],
                              ...entries.filter(e => e.type === "internal").map(e => (e as { type: "internal"; user: User }).user.id),
                            ]}
                            onSelect={u => addPending(topic.id, { type: "internal", user: u })}
                            placeholder="Tìm nhân viên để thêm làm phản biện..."
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
            </div>
          )}

          {/* ── Tab: Giao nhân viên phụ trách ── */}
          {tab === "delegate" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Giao việc chỉ định phản biện cho một nhân viên phụ trách.
                Nhân viên sẽ nhận thông báo và có thể tự chỉ định phản biện cho các đề tài này.
              </p>

              {/* Topics list */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {topics.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ClipboardList className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-white truncate">{t.title}</p>
                      <p className="text-[11px] text-slate-400">{t.code ?? "—"} · {t.year}</p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {proposalReviewCount(t)}/2 PB
                    </span>
                  </div>
                ))}
              </div>

              {/* Staff picker */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Giao cho nhân viên *</label>
                {delegateTo ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/10">
                    <div className="w-7 h-7 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
                      {delegateTo.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-white">{delegateTo.name}</p>
                      {delegateTo.email && <p className="text-[11px] text-slate-400">{delegateTo.email}</p>}
                    </div>
                    <button
                      onClick={() => setDelegateTo(null)}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <ReviewerPicker
                    users={users}
                    excludeIds={[currentUser.id]}
                    onSelect={u => setDelegateTo(u)}
                    placeholder="Tìm nhân viên phụ trách..."
                  />
                )}
              </div>

              {/* Due date */}
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

              {/* Note */}
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
              disabled={saving || totalPending === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {saving ? "Đang phân công..." : `Phân công (${totalPending} phản biện)`}
            </button>
          )}

          {tab === "delegate" && (
            <button
              onClick={handleDelegate}
              disabled={delegateSaving || !delegateTo}
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
