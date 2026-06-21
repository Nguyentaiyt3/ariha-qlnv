"use client";

import { useEffect, useState, useRef } from "react";
import {
  Globe, Plus, Send, Loader2, Pin, MessageSquare,
  ChevronDown, ChevronUp, Hash, Lock, Megaphone, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, avatarColor } from "@/lib/utils";
import { generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  subscribeAnnouncements, saveAnnouncement, deleteAnnouncement,
  reactToAnnouncement, markAnnouncementViewed, approveAnnouncement,
  getAnnouncementComments, addAnnouncementComment,
  subscribeChannels, saveChannel, subscribeChannelMessages, sendChannelMessage,
} from "@/lib/firebase/firestore";
import type { Announcement, Channel, ChannelMessage, AnnouncementComment } from "@/types";

// ── Announcement card ─────────────────────────────────────────────────────────
const EMOJIS = ["👍", "❤️", "🎉", "🙌", "💡"];

function AnnouncementCard({ item, currentUserId, canDelete, canApprove, onApprove }: {
  item: Announcement;
  currentUserId: string;
  canDelete: boolean;
  canApprove?: boolean;
  onApprove?: (id: string, approve: boolean) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<AnnouncementComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { currentUser } = useAuthStore();

  useEffect(() => {
    markAnnouncementViewed(item.id, currentUserId).catch(() => {});
  }, [item.id, currentUserId]);

  async function toggleComments() {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      const c = await getAnnouncementComments(item.id).catch(() => []);
      setComments(c);
      setLoadingComments(false);
    }
    setShowComments((v) => !v);
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    setSubmitting(true);
    try {
      const c: AnnouncementComment = {
        id: generateId("ac"),
        announcementId: item.id,
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar,
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
      };
      await addAnnouncementComment(item.id, c);
      setComments((prev) => [...prev, c]);
      setNewComment("");
    } catch {
      toast.error("Gửi bình luận thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReact(emoji: string) {
    const users = item.reactions?.[emoji] ?? [];
    const already = users.includes(currentUserId);
    await reactToAnnouncement(item.id, emoji, currentUserId, !already).catch(() => {});
  }

  return (
    <div className={cn(
      "bg-[var(--card)] border rounded-2xl overflow-hidden",
      item.status === "pending" ? "border-amber-300 dark:border-amber-600 opacity-90" : "border-[var(--border)]",
      item.pinned && item.status !== "pending" && "border-amber-300 dark:border-amber-600"
    )}>
      {item.status === "pending" && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700">
          <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <Clock className="w-3 h-3" /> Chờ phê duyệt
          </span>
          {canApprove && (
            <div className="flex gap-1.5">
              <button onClick={() => onApprove?.(item.id, true)} className="flex items-center gap-1 px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold rounded-md transition">
                <CheckCircle2 className="w-3 h-3" /> Duyệt
              </button>
              <button onClick={() => onApprove?.(item.id, false)} className="flex items-center gap-1 px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-semibold rounded-md transition">
                <XCircle className="w-3 h-3" /> Từ chối
              </button>
            </div>
          )}
        </div>
      )}
      {item.pinned && item.status === "published" && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold border-b border-amber-200 dark:border-amber-700">
          <Pin className="w-3 h-3" /> Đã ghim
        </div>
      )}
      <div className="p-5">
        {/* Author */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", avatarColor(item.authorName))}>
            {item.authorAvatar
              ? <img src={item.authorAvatar} className="w-full h-full rounded-full object-cover" alt="" />
              : getInitials(item.authorName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)]">{item.authorName}</p>
            <p className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          {canDelete && item.authorId === currentUserId && (
            <button onClick={() => deleteAnnouncement(item.id).catch(() => {})} className="text-slate-400 hover:text-red-500 text-xs transition">Xóa</button>
          )}
        </div>

        {/* Content */}
        <h3 className="font-semibold text-[var(--foreground)] mb-1">{item.title}</h3>
        <p className="text-sm text-[var(--muted-foreground)] whitespace-pre-wrap leading-relaxed">{item.content}</p>

        {/* Reactions */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {EMOJIS.map((emoji) => {
            const users = item.reactions?.[emoji] ?? [];
            const active = users.includes(currentUserId);
            return (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-sm border transition",
                  active ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 text-blue-700 dark:text-blue-400" : "border-[var(--border)] hover:bg-[var(--muted)]"
                )}
              >
                {emoji} {users.length > 0 && <span className="text-xs font-medium">{users.length}</span>}
              </button>
            );
          })}

          <button
            onClick={toggleComments}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {item.commentsCount > 0 ? `${item.commentsCount} bình luận` : "Bình luận"}
            {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Comments section */}
        {showComments && (
          <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
            {loadingComments && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", avatarColor(c.authorName))}>
                  {getInitials(c.authorName)}
                </div>
                <div className="flex-1 bg-[var(--muted)] rounded-xl px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--foreground)]">{c.authorName}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{c.content}</p>
                </div>
              </div>
            ))}
            <form onSubmit={handleComment} className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Viết bình luận..."
                className="flex-1 px-3 py-1.5 text-xs border border-[var(--border)] rounded-full bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={submitting || !newComment.trim()} className="p-1.5 bg-blue-600 disabled:opacity-50 text-white rounded-full transition">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Channel chat ──────────────────────────────────────────────────────────────
function ChannelChat({ channel, currentUser }: { channel: Channel; currentUser: { id: string; name: string; avatar?: string } }) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeChannelMessages(channel.id, (msgs) => {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return () => unsub();
  }, [channel.id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendChannelMessage(channel.id, {
        channelId: channel.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: text.trim(),
        attachments: [],
        reactions: {},
        timestamp: new Date().toISOString(),
      });
      setText("");
    } catch {
      toast.error("Gửi tin thất bại.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 p-3">
        {messages.length === 0 && (
          <div className="text-center py-10 text-xs text-slate-400">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.id;
          return (
            <div key={msg.id} className={cn("flex items-end gap-2", isMe && "flex-row-reverse")}>
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", avatarColor(msg.senderName))}>
                {getInitials(msg.senderName)}
              </div>
              <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-[var(--muted)] text-[var(--foreground)] rounded-bl-sm"
              )}>
                {!isMe && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{msg.senderName}</p>}
                {msg.content}
                <p className={cn("text-[9px] mt-0.5 opacity-60", isMe ? "text-right" : "")}>
                  {new Date(msg.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-[var(--border)]">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Nhắn tin vào #${channel.name}...`}
          className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" disabled={!text.trim() || sending}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntranetPage() {
  const { currentUser } = useAuthStore();
  const { users } = useTaskStore();
  const [tab, setTab] = useState<"feed" | "channels">("feed");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // New announcement form
  const [showPostForm, setShowPostForm] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postPinned, setPostPinned] = useState(false);
  const [posting, setPosting] = useState(false);

  // New channel form
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [channelName, setChannelName] = useState("");

  const canCreate = !!(currentUser && hasPermission(currentUser.role, "intranet:create"));
  const canApprovePost = !!(currentUser && hasPermission(currentUser.role, "intranet:approve"));
  const uid = currentUser?.id ?? "";

  useEffect(() => {
    if (!currentUser) return;
    const unsubA = subscribeAnnouncements(
      (items) => { setAnnouncements(items); setLoading(false); },
      uid, canApprovePost,
    );
    const unsubC = subscribeChannels(uid, setChannels);
    return () => { unsubA(); unsubC(); };
  }, [currentUser, uid, canApprovePost]);

  async function handleApproveAnnouncement(id: string, approve: boolean) {
    try {
      await approveAnnouncement(id, approve);
      toast.success(approve ? "Đã duyệt và công khai bản tin." : "Đã từ chối bản tin.");
    } catch {
      toast.error("Thao tác thất bại.");
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim() || !currentUser) return;
    setPosting(true);
    try {
      const a: Announcement = {
        id: generateId("ann"),
        title: postTitle.trim(),
        content: postContent.trim(),
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorRole: currentUser.role,
        authorAvatar: currentUser.avatar,
        targetRoles: [],
        attachments: [],
        reactions: {},
        pinned: postPinned,
        commentsCount: 0,
        viewedBy: [currentUser.id],
        status: canApprovePost ? "published" : "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveAnnouncement(a);
      setPostTitle(""); setPostContent(""); setPostPinned(false); setShowPostForm(false);
      toast.success(canApprovePost ? "Đã đăng bản tin." : "Đã gửi bản tin. Chờ quản lý phê duyệt để công khai.");
    } catch {
      toast.error("Đăng thất bại.");
    } finally {
      setPosting(false);
    }
  }

  async function handleCreateChannel() {
    if (!channelName.trim() || !currentUser) return;
    const ch: Channel = {
      id: generateId("ch"),
      name: channelName.trim().toLowerCase().replace(/\s+/g, "-"),
      type: "public",
      memberIds: users.map((u) => u.id),
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    await saveChannel(ch);
    setChannels((prev) => [ch, ...prev]);
    setActiveChannelId(ch.id);
    setChannelName(""); setShowNewChannel(false);
    toast.success(`Đã tạo kênh #${ch.name}`);
  }

  // Birthday reminder banner
  const today = new Date();
  const birthdayUsers = users.filter((u) => {
    if (!u.birthday) return false;
    const [, mm, dd] = u.birthday.split("-").map(Number);
    return mm === today.getMonth() + 1 && dd === today.getDate();
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col px-4 py-6 max-w-6xl mx-auto gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
        <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-500" />
          Mạng nội bộ
        </h1>
        <div className="flex gap-2">
          <div className="flex bg-[var(--muted)] rounded-xl p-1">
            <button onClick={() => setTab("feed")} className={cn("px-3 py-1.5 text-sm font-medium rounded-lg transition", tab === "feed" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-500 hover:text-[var(--foreground)]")}>
              <Megaphone className="w-4 h-4 inline mr-1" />Bảng tin
            </button>
            <button onClick={() => setTab("channels")} className={cn("px-3 py-1.5 text-sm font-medium rounded-lg transition", tab === "channels" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-500 hover:text-[var(--foreground)]")}>
              <Hash className="w-4 h-4 inline mr-1" />Nhóm chat
            </button>
          </div>
          {canCreate && tab === "feed" && (
            <button onClick={() => setShowPostForm((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition">
              <Plus className="w-4 h-4" /> Đăng bản tin
            </button>
          )}
        </div>
      </div>

      {/* Birthday banner */}
      {birthdayUsers.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-pink-50 dark:bg-pink-900/10 border border-pink-200 dark:border-pink-700 rounded-xl text-sm shrink-0">
          <span className="text-2xl">🎂</span>
          <p className="text-pink-700 dark:text-pink-300 font-medium">
            Hôm nay là sinh nhật của{" "}
            {birthdayUsers.map((u) => <strong key={u.id}>{u.name}</strong>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])}!
            Gửi lời chúc mừng nhé 🎉
          </p>
        </div>
      )}

      {/* ── FEED TAB ─────────────────────────────────────────────────────────── */}
      {tab === "feed" && (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Post form */}
          {showPostForm && (
            <form onSubmit={handlePost} className="bg-[var(--card)] border border-blue-300 rounded-2xl p-5 space-y-3">
              <h3 className="font-semibold text-[var(--foreground)]">Đăng thông báo mới</h3>
              <input
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="Tiêu đề thông báo *"
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Nội dung thông báo..."
                rows={4}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
                  <input type="checkbox" checked={postPinned} onChange={(e) => setPostPinned(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  <Pin className="w-3.5 h-3.5 text-amber-500" /> Ghim thông báo
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowPostForm(false)} className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-xl hover:bg-[var(--muted)] transition">Huỷ</button>
                  <button type="submit" disabled={posting || !postTitle.trim() || !postContent.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition">
                    {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Đăng
                  </button>
                </div>
              </div>
            </form>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
              <Megaphone className="w-12 h-12" />
              <p className="font-medium">Chưa có thông báo nào</p>
              {canCreate && <p className="text-sm">Nhấn "Đăng thông báo" để bắt đầu</p>}
            </div>
          ) : (
            announcements.map((a) => (
              <AnnouncementCard
                key={a.id} item={a} currentUserId={uid}
                canDelete={canApprovePost || a.authorId === uid}
                canApprove={canApprovePost}
                onApprove={handleApproveAnnouncement}
              />
            ))
          )}
        </div>
      )}

      {/* ── CHANNELS TAB ─────────────────────────────────────────────────────── */}
      {tab === "channels" && (
        <div className="flex-1 overflow-hidden flex gap-4 min-h-0">
          {/* Channel sidebar */}
          <div className="w-56 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kênh</p>
              <button onClick={() => setShowNewChannel((v) => !v)} className="p-1 text-slate-400 hover:text-blue-500 transition">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {showNewChannel && (
              <div className="flex gap-1">
                <input
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                  placeholder="tên-kênh"
                  className="flex-1 px-2 py-1 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none"
                  autoFocus
                />
                <button onClick={handleCreateChannel} className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg">+</button>
              </div>
            )}
            <div className="space-y-1 overflow-y-auto">
              {channels.length === 0 && <p className="text-xs text-slate-400 py-3">Chưa có kênh nào</p>}
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
                  className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition text-left",
                    activeChannelId === ch.id ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  )}
                >
                  {ch.type === "private" ? <Lock className="w-3.5 h-3.5 shrink-0" /> : <Hash className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Channel messages */}
          <div className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden flex flex-col min-h-0">
            {activeChannel && currentUser ? (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold text-sm text-[var(--foreground)]">{activeChannel.name}</span>
                  <span className="text-xs text-slate-400 ml-1">· {activeChannel.memberIds.length} thành viên</span>
                </div>
                <ChannelChat channel={activeChannel} currentUser={currentUser} />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Hash className="w-12 h-12" />
                <p className="font-medium">Chọn một kênh để bắt đầu trò chuyện</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
