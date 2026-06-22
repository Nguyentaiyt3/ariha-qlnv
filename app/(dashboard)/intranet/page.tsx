"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Globe, Plus, Send, Loader2, Pin, MessageSquare,
  ChevronDown, ChevronUp, Hash, Lock, Megaphone, CheckCircle2, XCircle, Clock,
  Search, Users, X, Settings, Trash2, UserPlus, UserMinus,
  Smile, Paperclip, Camera, FileText, Download, Image as ImageIcon, Pencil,
} from "lucide-react";
import { ChannelChat } from "@/components/intranet/ChannelChat";
import { toast } from "sonner";
import { cn, getInitials, avatarColor } from "@/lib/utils";
import { generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  subscribeAnnouncements, saveAnnouncement, updateAnnouncement, deleteAnnouncement,
  reactToAnnouncement, markAnnouncementViewed, approveAnnouncement, addNotification,
  getAnnouncementComments, addAnnouncementComment,
  subscribeChannels, saveChannel, updateChannel, deleteChannel,
} from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import type { Announcement, Channel, AnnouncementComment, User, UserRole, Attachment } from "@/types";

// ── Announcement card ─────────────────────────────────────────────────────────
const EMOJIS = ["👍", "❤️", "🎉", "🙌", "💡"];

const QUICK_EMOJIS = [
  "😊","👍","🎉","🔥","💡","❤️","🌟","✅","⚠️","📢",
  "🗓️","💬","🤝","🏆","💪","🚀","🎯","📊","📌","🔔",
  "🙏","😄","👏","🎊","🌈","⭐","💼","📋","🔑","🎁",
];

const ROLE_LABELS: Record<string, string> = {
  staff: "Nhân viên",
  teamLead: "Trưởng nhóm",
  director: "Giám đốc",
  hrAdmin: "HR / Admin",
};
const ALL_SELECTABLE_ROLES: UserRole[] = ["staff", "teamLead", "director", "hrAdmin"];

function AnnouncementCard({ item, currentUserId, canDelete, canApprove, onApprove }: {
  item: Announcement;
  currentUserId: string;
  canDelete: boolean;
  canApprove?: boolean;
  onApprove?: (id: string, approve: boolean, reason?: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<AnnouncementComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const { currentUser } = useAuthStore();
  const isAuthor = item.authorId === currentUserId;

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editContent, setEditContent] = useState(item.content);
  const [editPinned, setEditPinned] = useState(item.pinned);
  const [editAttachments, setEditAttachments] = useState<Attachment[]>(item.attachments ?? []);
  const [editShowEmoji, setEditShowEmoji] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const editContentRef = useRef<HTMLTextAreaElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const editCameraRef = useRef<HTMLInputElement>(null);

  // ── Comment composer state ──────────────────────────────────────────────────
  const [commentText, setCommentText] = useState("");
  const [commentFiles, setCommentFiles] = useState<Attachment[]>([]);
  const [commentShowEmoji, setCommentShowEmoji] = useState(false);
  const [uploadingComment, setUploadingComment] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const commentTextRef = useRef<HTMLTextAreaElement>(null);

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

  async function handleReact(emoji: string) {
    const users = item.reactions?.[emoji] ?? [];
    const already = users.includes(currentUserId);
    await reactToAnnouncement(item.id, emoji, currentUserId, !already).catch(() => {});
  }

  // ── Edit handlers ───────────────────────────────────────────────────────────
  function insertEmojiInEdit(emoji: string) {
    const ta = editContentRef.current;
    if (ta) {
      const s = ta.selectionStart; const e = ta.selectionEnd;
      setEditContent((v) => v.slice(0, s) + emoji + v.slice(e));
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + emoji.length; ta.focus(); }, 0);
    } else {
      setEditContent((v) => v + emoji);
    }
    setEditShowEmoji(false);
  }

  async function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    for (const file of files) {
      try {
        const url = await uploadFile(file, "announcements");
        setEditAttachments((prev) => [...prev, { id: generateId("att"), name: file.name, url, type: file.type, size: file.size }]);
      } catch { toast.error("Tải file thất bại."); }
    }
    if (editFileRef.current) editFileRef.current.value = "";
    if (editCameraRef.current) editCameraRef.current.value = "";
  }

  async function handleSaveEdit() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setSavingEdit(true);
    try {
      await updateAnnouncement(item.id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        pinned: editPinned,
        attachments: editAttachments,
        updatedAt: new Date().toISOString(),
      });
      setEditing(false);
      toast.success("Đã cập nhật thông báo.");
    } catch {
      toast.error("Cập nhật thất bại.");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Comment handlers ────────────────────────────────────────────────────────
  function insertEmojiInComment(emoji: string) {
    const ta = commentTextRef.current;
    if (ta) {
      const s = ta.selectionStart; const e = ta.selectionEnd;
      setCommentText((v) => v.slice(0, s) + emoji + v.slice(e));
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + emoji.length; ta.focus(); }, 0);
    } else {
      setCommentText((v) => v + emoji);
    }
    setCommentShowEmoji(false);
  }

  async function handleCommentFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingComment(true);
    for (const file of files) {
      try {
        const url = await uploadFile(file, "announcements/comments");
        setCommentFiles((prev) => [...prev, { id: generateId("att"), name: file.name, url, type: file.type, size: file.size }]);
      } catch { toast.error("Tải file thất bại."); }
    }
    setUploadingComment(false);
    if (commentFileRef.current) commentFileRef.current.value = "";
    if (commentCameraRef.current) commentCameraRef.current.value = "";
  }

  async function handleSendComment() {
    if ((!commentText.trim() && commentFiles.length === 0) || !currentUser) return;
    setSubmitting(true);
    try {
      const c: AnnouncementComment = {
        id: generateId("ac"),
        announcementId: item.id,
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar,
        content: commentText.trim(),
        attachments: commentFiles,
        createdAt: new Date().toISOString(),
      };
      await addAnnouncementComment(item.id, c);
      setComments((prev) => [...prev, c]);
      setCommentText("");
      setCommentFiles([]);
    } catch {
      toast.error("Gửi bình luận thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "bg-[var(--card)] border rounded-2xl overflow-hidden",
        item.status === "pending" ? "border-amber-300 dark:border-amber-600 opacity-90" : "border-[var(--border)]",
        item.pinned && item.status !== "pending" && "border-amber-300 dark:border-amber-600"
      )}
      onClick={() => { setEditShowEmoji(false); setCommentShowEmoji(false); }}
    >
      {/* Pending banner */}
      {item.status === "pending" && (
        <div className="border-b border-amber-200 dark:border-amber-700">
          <div className="flex items-center justify-between px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20">
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-semibold">
              <Clock className="w-3 h-3" /> Chờ phê duyệt
            </span>
            {canApprove && (
              <div className="flex gap-1.5">
                <button onClick={() => onApprove?.(item.id, true)} className="flex items-center gap-1 px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold rounded-md transition">
                  <CheckCircle2 className="w-3 h-3" /> Duyệt
                </button>
                <button
                  onClick={() => { setShowRejectForm((v) => !v); setRejectReason(""); }}
                  className="flex items-center gap-1 px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-semibold rounded-md transition"
                >
                  <XCircle className="w-3 h-3" /> Từ chối
                </button>
              </div>
            )}
          </div>
          {showRejectForm && (
            <div className="px-4 pb-3 pt-2 space-y-2 bg-red-50 dark:bg-red-900/10">
              <p className="text-[10px] font-medium text-red-600">Lý do từ chối <span className="text-red-500">*</span></p>
              <textarea
                autoFocus rows={2} value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối..."
                className="w-full px-3 py-2 text-xs border border-red-200 rounded-lg bg-white dark:bg-slate-900 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowRejectForm(false)}
                  className="flex-1 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] text-[var(--foreground)] hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  Huỷ
                </button>
                <button
                  onClick={() => {
                    if (!rejectReason.trim()) { toast.error("Vui lòng nhập lý do từ chối."); return; }
                    onApprove?.(item.id, false, rejectReason.trim());
                    setShowRejectForm(false);
                  }}
                  className="flex-1 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-[10px] font-semibold transition"
                >
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pinned label */}
      {item.pinned && item.status === "published" && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold border-b border-amber-200 dark:border-amber-700">
          <Pin className="w-3 h-3" /> Đã ghim
        </div>
      )}

      <div className="p-5">
        {/* Author row */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", avatarColor(item.authorName))}>
            {item.authorAvatar
              ? <img src={item.authorAvatar} className="w-full h-full rounded-full object-cover" alt="" />
              : getInitials(item.authorName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)]">{item.authorName}</p>
            <p className="text-[10px] text-slate-400">
              {new Date(item.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {item.updatedAt !== item.createdAt && <span className="ml-1 italic">(đã sửa)</span>}
            </p>
          </div>
          {/* Author actions */}
          {isAuthor && !editing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
              >
                <Pencil className="w-3 h-3" /> Sửa
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteAnnouncement(item.id).catch(() => {}); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              >
                <Trash2 className="w-3 h-3" /> Xóa
              </button>
            </div>
          )}
          {/* Manager delete (non-author) */}
          {!isAuthor && canDelete && !editing && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteAnnouncement(item.id).catch(() => {}); }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
            >
              <Trash2 className="w-3 h-3" /> Xóa
            </button>
          )}
        </div>

        {/* Content — or inline edit form */}
        {editing ? (
          <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Tiêu đề *"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="relative">
              <textarea
                ref={editContentRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {editShowEmoji && (
                <div
                  className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 grid grid-cols-10 gap-0.5 w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  {QUICK_EMOJIS.map((em) => (
                    <button key={em} onClick={() => insertEmojiInEdit(em)}
                      className="text-xl p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition hover:scale-110 leading-none">
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Toolbar */}
            <div className="flex items-center gap-1">
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setEditShowEmoji((v) => !v); }}
                className={cn("p-1.5 rounded-lg text-sm transition",
                  editShowEmoji ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}>
                <Smile className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => editFileRef.current?.click()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => editCameraRef.current?.click()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Existing + new attachments */}
            {editAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {editAttachments.map((f) => {
                  const isImg = f.type.startsWith("image/");
                  return (
                    <div key={f.id} className="relative">
                      {isImg
                        ? <img src={f.url} alt={f.name} className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                        : <div className="flex items-center gap-1 pl-2 pr-5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] text-slate-600 dark:text-slate-400 max-w-[120px]">
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">{f.name}</span>
                          </div>}
                      <button
                        onClick={() => setEditAttachments((prev) => prev.filter((x) => x.id !== f.id))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={editPinned} onChange={(e) => setEditPinned(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
              <Pin className="w-3 h-3 text-amber-500" /> Ghim thông báo
            </label>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setEditing(false); setEditTitle(item.title); setEditContent(item.content); setEditPinned(item.pinned); setEditAttachments(item.attachments ?? []); }}
                className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition">
                Huỷ
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim() || !editContent.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl transition"
              >
                {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />} Lưu
              </button>
            </div>
            {/* Hidden inputs */}
            <input ref={editFileRef} type="file" className="hidden" multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
              onChange={handleEditFileChange} />
            <input ref={editCameraRef} type="file" className="hidden" accept="image/*" capture="user" onChange={handleEditFileChange} />
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-[var(--foreground)] mb-1">{item.title}</h3>
            <p className="text-sm text-[var(--muted-foreground)] whitespace-pre-wrap leading-relaxed">{item.content}</p>
          </>
        )}

        {/* Attachments display (view mode) */}
        {!editing && item.attachments?.length > 0 && (
          <div className="mt-3 space-y-2">
            {(() => {
              const images = item.attachments.filter((a) => a.type.startsWith("image/"));
              if (!images.length) return null;
              return (
                <div className={cn("grid gap-1.5 rounded-xl overflow-hidden",
                  images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3"
                )}>
                  {images.map((att) => (
                    <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer">
                      <img src={att.url} alt={att.name} loading="lazy" className="w-full h-40 object-cover hover:opacity-90 transition" />
                    </a>
                  ))}
                </div>
              );
            })()}
            {item.attachments.filter((a) => a.type.startsWith("video/")).map((att) => (
              <video key={att.id} src={att.url} controls className="w-full rounded-xl max-h-64" />
            ))}
            {item.attachments.filter((a) => !a.type.startsWith("image/") && !a.type.startsWith("video/")).map((att) => (
              <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs text-[var(--foreground)] flex-1 truncate">{att.name}</span>
                <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Reactions */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {EMOJIS.map((emoji) => {
            const users = item.reactions?.[emoji] ?? [];
            const active = users.includes(currentUserId);
            return (
              <button key={emoji} onClick={() => handleReact(emoji)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-sm border transition",
                  active ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 text-blue-700 dark:text-blue-400" : "border-[var(--border)] hover:bg-[var(--muted)]"
                )}
              >
                {emoji} {users.length > 0 && <span className="text-xs font-medium">{users.length}</span>}
              </button>
            );
          })}
          <button onClick={toggleComments}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition">
            <MessageSquare className="w-3.5 h-3.5" />
            {item.commentsCount > 0 ? `${item.commentsCount} bình luận` : "Bình luận"}
            {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Comments section */}
        {showComments && (
          <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4" onClick={(e) => e.stopPropagation()}>
            {loadingComments && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}

            {/* Comment list */}
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", avatarColor(c.authorName))}>
                  {c.authorAvatar
                    ? <img src={c.authorAvatar} className="w-full h-full rounded-full object-cover" alt="" />
                    : getInitials(c.authorName)}
                </div>
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-[var(--foreground)]">{c.authorName}
                    <span className="ml-1.5 font-normal text-slate-400">{new Date(c.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </p>
                  {c.content && <p className="text-xs text-[var(--foreground)] whitespace-pre-wrap">{c.content}</p>}
                  {c.attachments && c.attachments.length > 0 && (
                    <div className="space-y-1 pt-0.5">
                      {c.attachments.filter((a) => a.type.startsWith("image/")).map((att) => (
                        <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer">
                          <img src={att.url} alt={att.name} loading="lazy" className="max-w-[180px] rounded-xl border border-slate-200 dark:border-slate-700 hover:opacity-90 transition" />
                        </a>
                      ))}
                      {c.attachments.filter((a) => !a.type.startsWith("image/")).map((att) => (
                        <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-700 rounded-lg text-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition">
                          <FileText className="w-3 h-3" /> {att.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Rich comment composer */}
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              {/* Pending files */}
              {(commentFiles.length > 0 || uploadingComment) && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {uploadingComment && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-[10px] text-blue-600">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Đang tải...
                    </div>
                  )}
                  {commentFiles.map((f) => {
                    const isImg = f.type.startsWith("image/");
                    return (
                      <div key={f.id} className="relative">
                        {isImg
                          ? <img src={f.url} alt={f.name} className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                          : <div className="flex items-center gap-1 pl-1.5 pr-5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] text-slate-600 dark:text-slate-400 max-w-[100px]">
                              <FileText className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{f.name}</span>
                            </div>}
                        <button onClick={() => setCommentFiles((prev) => prev.filter((x) => x.id !== f.id))}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full flex items-center justify-center">
                          <X className="w-2 h-2" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Emoji panel */}
              {commentShowEmoji && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 grid grid-cols-10 gap-0.5"
                  onClick={(e) => e.stopPropagation()}>
                  {QUICK_EMOJIS.map((em) => (
                    <button key={em} onClick={() => insertEmojiInComment(em)}
                      className="text-lg p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition leading-none">
                      {em}
                    </button>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div className="flex items-end gap-2">
                <div className="w-6 h-6 shrink-0" />
                <div className="flex-1 flex items-end gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-2 py-1.5">
                  <textarea
                    ref={commentTextRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
                    }}
                    placeholder="Viết bình luận..."
                    rows={1}
                    className="flex-1 text-xs bg-transparent text-[var(--foreground)] placeholder-slate-400 focus:outline-none resize-none max-h-20 overflow-y-auto"
                    style={{ minHeight: "20px" }}
                    onInput={(e) => {
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      t.style.height = Math.min(t.scrollHeight, 80) + "px";
                    }}
                  />
                  {/* Toolbar */}
                  <div className="flex items-center gap-0.5 shrink-0 mb-0.5">
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setCommentShowEmoji((v) => !v); }}
                      className={cn("p-1 rounded-lg transition", commentShowEmoji ? "text-blue-500 bg-blue-50 dark:bg-blue-900/30" : "text-slate-400 hover:text-slate-600")}>
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => commentFileRef.current?.click()}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition">
                      <Paperclip className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => commentCameraRef.current?.click()}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition">
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleSendComment}
                  disabled={submitting || (!commentText.trim() && commentFiles.length === 0)}
                  className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full transition shrink-0"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Hidden file inputs */}
            <input ref={commentFileRef} type="file" className="hidden" multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
              onChange={handleCommentFileChange} />
            <input ref={commentCameraRef} type="file" className="hidden" accept="image/*" capture="user" onChange={handleCommentFileChange} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create channel modal ──────────────────────────────────────────────────────
function CreateChannelModal({
  currentUser,
  allUsers,
  onSave,
  onClose,
}: {
  currentUser: { id: string; name: string };
  allUsers: User[];
  onSave: (name: string, type: Channel["type"], memberIds: string[], description?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Channel["type"]>("private");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const otherUsers = useMemo(
    () => allUsers.filter((u) => u.id !== currentUser.id),
    [allUsers, currentUser.id]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return otherUsers;
    const q = search.toLowerCase();
    return otherUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q)
    );
  }, [otherUsers, search]);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedIds(otherUsers.map((u) => u.id));
  }
  function clearAll() {
    setSelectedIds([]);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Vui lòng nhập tên nhóm."); return; }
    if (selectedIds.length === 0) { toast.error("Vui lòng chọn ít nhất 1 thành viên."); return; }
    setSaving(true);
    try {
      await onSave(name.trim(), type, [currentUser.id, ...selectedIds], description.trim() || undefined);
      onClose();
    } catch {
      toast.error("Tạo nhóm thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="font-bold text-[var(--foreground)]">Tạo nhóm chat mới</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name + type row */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Tên nhóm *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd: marketing-q3, dev-team..."
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Mô tả (tuỳ chọn)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mục đích của nhóm..."
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Type selector */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Loại nhóm</label>
              <div className="flex gap-2">
                {([
                  { key: "private", icon: Lock, label: "Riêng tư", desc: "Chỉ thành viên được chọn" },
                  { key: "public", icon: Hash, label: "Công khai", desc: "Mọi người đều thấy" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setType(opt.key)}
                    className={cn(
                      "flex-1 flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition",
                      type === opt.key
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-[var(--border)] hover:border-blue-300"
                    )}
                  >
                    <opt.icon className={cn("w-4 h-4 mt-0.5 shrink-0", type === opt.key ? "text-blue-600" : "text-slate-400")} />
                    <div>
                      <p className={cn("text-sm font-semibold", type === opt.key ? "text-blue-700 dark:text-blue-300" : "text-[var(--foreground)]")}>{opt.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Member picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Thêm thành viên
                {selectedIds.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                    {selectedIds.length}
                  </span>
                )}
              </label>
              <div className="flex gap-2 text-[10px]">
                <button type="button" onClick={selectAll} className="text-blue-500 hover:underline">Chọn tất cả</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={clearAll} className="text-slate-400 hover:underline">Bỏ chọn</button>
              </div>
            </div>

            {/* Selected chips */}
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-[var(--muted)] rounded-xl">
                {selectedIds.map((id) => {
                  const u = allUsers.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full"
                    >
                      {u?.name ?? id}
                      <button type="button" onClick={() => toggle(id)} className="hover:text-red-600 leading-none">
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search input */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc phòng ban..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Creator row (non-removable) */}
            <div className="flex items-center gap-2.5 px-2.5 py-2 mb-0.5 rounded-xl bg-[var(--muted)] opacity-70">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", avatarColor(currentUser.name))}>
                {getInitials(currentUser.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400">Người tạo · luôn là thành viên</p>
              </div>
              <div className="w-4 h-4 rounded border border-blue-600 bg-blue-600 flex items-center justify-center shrink-0">
                <span className="text-white text-[9px] font-bold">✓</span>
              </div>
            </div>

            {/* User list */}
            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Không tìm thấy người dùng</p>
              ) : (
                filtered.map((u) => {
                  const checked = selectedIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                        checked
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-[var(--muted)]"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", avatarColor(u.name))}>
                        {u.avatar
                          ? <img src={u.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                          : getInitials(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", checked ? "text-blue-700 dark:text-blue-300" : "text-[var(--foreground)]")}>
                          {u.name}
                        </p>
                        {u.department && (
                          <p className="text-[10px] text-slate-400 truncate">{u.department}</p>
                        )}
                      </div>
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition",
                        checked ? "bg-blue-600 border-blue-600" : "border-slate-300 dark:border-slate-600"
                      )}>
                        {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-[var(--border)] shrink-0">
          <button onClick={onClose} className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition">
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || selectedIds.length === 0}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Tạo nhóm {selectedIds.length > 0 && `(${selectedIds.length + 1} người)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage channel modal ──────────────────────────────────────────────────────
function ManageChannelModal({
  channel,
  allUsers,
  currentUser,
  canManage,
  onUpdate,
  onDelete,
  onClose,
}: {
  channel: Channel;
  allUsers: User[];
  currentUser: { id: string; name: string };
  canManage: boolean;
  onUpdate: (id: string, data: Partial<Channel>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"members" | "settings">("members");
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(channel.memberIds);
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCreator = channel.createdBy === currentUser.id;
  const canEdit = isCreator || canManage;

  // Current members with user info
  const currentMembers = useMemo(
    () =>
      memberIds
        .map((id) => allUsers.find((u) => u.id === id))
        .filter(Boolean) as User[],
    [memberIds, allUsers]
  );

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return currentMembers;
    const q = search.toLowerCase();
    return currentMembers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q)
    );
  }, [currentMembers, search]);

  // Users not yet in the group
  const nonMembers = useMemo(
    () => allUsers.filter((u) => !memberIds.includes(u.id)),
    [allUsers, memberIds]
  );

  const filteredNonMembers = useMemo(() => {
    if (!addSearch.trim()) return nonMembers;
    const q = addSearch.toLowerCase();
    return nonMembers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q)
    );
  }, [nonMembers, addSearch]);

  function removeMember(id: string) {
    if (id === channel.createdBy) return; // creator cannot be removed
    setMemberIds((prev) => prev.filter((x) => x !== id));
  }

  function addMember(id: string) {
    setMemberIds((prev) => [...prev, id]);
    setAddSearch("");
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Tên nhóm không được để trống."); return; }
    if (memberIds.length < 2) { toast.error("Nhóm cần ít nhất 2 thành viên."); return; }
    setSaving(true);
    try {
      await onUpdate(channel.id, {
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim() || undefined,
        memberIds,
      });
      toast.success("Đã cập nhật nhóm chat.");
      onClose();
    } catch {
      toast.error("Cập nhật thất bại.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(channel.id);
      toast.success(`Đã xoá nhóm #${channel.name}.`);
      onClose();
    } catch {
      toast.error("Xoá nhóm thất bại.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            {channel.type === "private" ? <Lock className="w-4 h-4 text-slate-400" /> : <Hash className="w-4 h-4 text-slate-400" />}
            <h2 className="font-bold text-[var(--foreground)]">{channel.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] shrink-0">
          {([
            { key: "members", label: `Thành viên (${memberIds.length})`, icon: Users },
            { key: "settings", label: "Cài đặt nhóm", icon: Settings },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 transition",
                tab === t.key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-400 hover:text-[var(--foreground)]"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* ── MEMBERS TAB ── */}
          {tab === "members" && (
            <>
              {/* Search existing members */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Thành viên hiện tại
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm trong nhóm..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                  {filteredMembers.map((u) => {
                    const isOwner = u.id === channel.createdBy;
                    return (
                      <div
                        key={u.id}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[var(--muted)] group"
                      >
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", avatarColor(u.name))}>
                          {u.avatar
                            ? <img src={u.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                            : getInitials(u.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">
                            {u.name}
                            {isOwner && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 rounded-full font-semibold">
                                Người tạo
                              </span>
                            )}
                          </p>
                          {u.department && <p className="text-[10px] text-slate-400 truncate">{u.department}</p>}
                        </div>
                        {canEdit && !isOwner && (
                          <button
                            onClick={() => removeMember(u.id)}
                            title="Xoá khỏi nhóm"
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {filteredMembers.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3">Không tìm thấy thành viên</p>
                  )}
                </div>
              </div>

              {/* Add new members */}
              {canEdit && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" /> Thêm thành viên mới
                    {nonMembers.length > 0 && (
                      <span className="text-slate-400 font-normal">· {nonMembers.length} người chưa trong nhóm</span>
                    )}
                  </label>
                  {nonMembers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">Tất cả người dùng đã là thành viên.</p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          value={addSearch}
                          onChange={(e) => setAddSearch(e.target.value)}
                          placeholder="Tìm người để thêm..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
                        {filteredNonMembers.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => addMember(u.id)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-left group"
                          >
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", avatarColor(u.name))}>
                              {u.avatar
                                ? <img src={u.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                                : getInitials(u.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--foreground)] truncate">{u.name}</p>
                              {u.department && <p className="text-[10px] text-slate-400 truncate">{u.department}</p>}
                            </div>
                            <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-blue-600 font-semibold transition">
                              <UserPlus className="w-3 h-3" /> Thêm
                            </span>
                          </button>
                        ))}
                        {filteredNonMembers.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-3">Không tìm thấy người dùng</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── SETTINGS TAB ── */}
          {tab === "settings" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Tên nhóm *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canEdit}
                  placeholder="tên-nhóm"
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Mô tả</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canEdit}
                  rows={3}
                  placeholder="Mục đích của nhóm..."
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
                />
              </div>

              {/* Danger zone */}
              {canEdit && (
                <div className="border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-red-600">Vùng nguy hiểm</p>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm transition w-full"
                    >
                      <Trash2 className="w-4 h-4" />
                      Xoá nhóm chat này
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-red-600 font-medium">
                        Xác nhận xoá? Tất cả tin nhắn trong nhóm sẽ bị mất vĩnh viễn.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 py-1.5 border border-[var(--border)] rounded-xl text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition"
                        >
                          Huỷ
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1"
                        >
                          {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                          Xoá vĩnh viễn
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="flex gap-3 px-5 py-4 border-t border-[var(--border)] shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition"
            >
              Đóng
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Lưu thay đổi
            </button>
          </div>
        )}
        {!canEdit && (
          <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
            <button onClick={onClose} className="w-full py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition">
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create announcement modal ─────────────────────────────────────────────────
function CreateAnnouncementModal({
  onSave,
  onClose,
  posting,
}: {
  onSave: (title: string, content: string, attachments: Attachment[], pinned: boolean, targetRoles: UserRole[]) => void;
  onClose: () => void;
  posting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [targetRoles, setTargetRoles] = useState<UserRole[]>([]);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function insertEmoji(emoji: string) {
    const ta = contentRef.current;
    if (ta) {
      const start = ta.selectionStart ?? content.length;
      const end = ta.selectionEnd ?? content.length;
      setContent((v) => v.slice(0, start) + emoji + v.slice(end));
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + emoji.length;
        ta.focus();
      }, 0);
    } else {
      setContent((v) => v + emoji);
    }
    setShowEmoji(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingFile(true);
    try {
      for (const file of files) {
        const url = await uploadFile(file, "announcements");
        setPendingFiles((prev) => [
          ...prev,
          { id: generateId("att"), name: file.name, url, type: file.type, size: file.size },
        ]);
      }
    } catch {
      toast.error("Tải file thất bại.");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function toggleRole(role: UserRole) {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => { e.stopPropagation(); setShowEmoji(false); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-500" /> Đăng thông báo mới
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề thông báo *"
            className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Content + emoji panel */}
          <div className="relative">
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nội dung thông báo..."
              rows={5}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {showEmoji && (
              <div
                className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 grid grid-cols-10 gap-0.5 w-full"
                onClick={(e) => e.stopPropagation()}
              >
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => insertEmoji(em)}
                    className="text-xl p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition hover:scale-110 leading-none"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowEmoji((v) => !v); }}
              title="Chèn emoji"
              className={cn(
                "p-2 rounded-xl text-sm transition",
                showEmoji
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <Smile className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm file / ảnh"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              title="Chụp / chọn ảnh từ camera"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {/* Pending attachments preview */}
          {(pendingFiles.length > 0 || uploadingFile) && (
            <div className="flex flex-wrap gap-2">
              {uploadingFile && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> Đang tải...
                </div>
              )}
              {pendingFiles.map((f) => {
                const isImage = f.type.startsWith("image/");
                return (
                  <div key={f.id} className="relative">
                    {isImage ? (
                      <img
                        src={f.url} alt={f.name}
                        className="w-16 h-16 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 pl-2 pr-6 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs max-w-[140px]">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-slate-700 dark:text-slate-300">{f.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Target roles */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Hiển thị đến</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTargetRoles([])}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition",
                  targetRoles.length === 0
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                Tất cả
              </button>
              {ALL_SELECTABLE_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition",
                    targetRoles.includes(role)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          {/* Pin */}
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <Pin className="w-3.5 h-3.5 text-amber-500" /> Ghim thông báo
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button" onClick={onClose}
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300"
          >
            Huỷ
          </button>
          <button
            onClick={() => {
              if (title.trim() && content.trim())
                onSave(title.trim(), content.trim(), pendingFiles, pinned, targetRoles);
            }}
            disabled={posting || !title.trim() || !content.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Đăng
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef} type="file" className="hidden" multiple
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef} type="file" className="hidden"
        accept="image/*" capture="user"
        onChange={handleFileChange}
      />
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
  const [posting, setPosting] = useState(false);

  // Channel modals
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [managingChannel, setManagingChannel] = useState<Channel | null>(null);

  const canCreate = !!(currentUser && hasPermission(currentUser.role, "intranet:create"));
  const canApprovePost = !!(currentUser && hasPermission(currentUser.role, "intranet:approve"));
  const canManageChannels = !!(currentUser && hasPermission(currentUser.role, "intranet:manage"));
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

  async function handleApproveAnnouncement(id: string, approve: boolean, reason?: string) {
    const target = announcements.find((a) => a.id === id);
    try {
      await approveAnnouncement(id, approve, reason);
      toast.success(approve ? "Đã duyệt và công khai bản tin." : "Đã từ chối bản tin.");
      if (target && currentUser && target.authorId !== currentUser.id) {
        await addNotification({
          userId: target.authorId,
          type: approve ? "request_approved" : "request_rejected",
          title: approve ? "Bản tin được duyệt" : "Bản tin bị từ chối",
          body: approve
            ? `Bản tin "${target.title}" đã được ${currentUser.name} duyệt và công khai.`
            : `Bản tin "${target.title}" bị từ chối bởi ${currentUser.name}.${reason ? ` Lý do: ${reason}` : ""}`,
          link: "/intranet",
          read: false,
          priority: "normal",
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      toast.error("Thao tác thất bại.");
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  async function handlePost(
    title: string,
    content: string,
    attachments: Attachment[],
    pinned: boolean,
    targetRoles: UserRole[],
  ) {
    if (!currentUser) return;
    setPosting(true);
    try {
      const a: Announcement = {
        id: generateId("ann"),
        title,
        content,
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorRole: currentUser.role,
        authorAvatar: currentUser.avatar,
        targetRoles,
        attachments,
        reactions: {},
        pinned,
        commentsCount: 0,
        viewedBy: [currentUser.id],
        status: canApprovePost ? "published" : "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveAnnouncement(a);
      setShowPostForm(false);
      toast.success(canApprovePost ? "Đã đăng bản tin." : "Đã gửi bản tin. Chờ quản lý phê duyệt để công khai.");
    } catch {
      toast.error("Đăng thất bại.");
    } finally {
      setPosting(false);
    }
  }

  async function handleCreateChannel(
    name: string,
    type: Channel["type"],
    memberIds: string[],
    description?: string,
  ) {
    if (!currentUser) return;
    const ch: Channel = {
      id: generateId("ch"),
      name: name.toLowerCase().replace(/\s+/g, "-"),
      description,
      type,
      memberIds,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    await saveChannel(ch);
    setChannels((prev) => [ch, ...prev]);
    setActiveChannelId(ch.id);
    toast.success(`Đã tạo nhóm #${ch.name} với ${memberIds.length} thành viên.`);
  }

  async function handleUpdateChannel(id: string, data: Partial<Channel>) {
    await updateChannel(id, data);
    setChannels((prev) => prev.map((ch) => (ch.id === id ? { ...ch, ...data } : ch)));
    if (managingChannel?.id === id) setManagingChannel((prev) => prev ? { ...prev, ...data } : prev);
  }

  async function handleDeleteChannel(id: string) {
    await deleteChannel(id);
    setChannels((prev) => prev.filter((ch) => ch.id !== id));
    if (activeChannelId === id) setActiveChannelId(null);
    setManagingChannel(null);
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
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nhóm chat</p>
              <button
                onClick={() => setShowNewChannel(true)}
                title="Tạo nhóm mới"
                className="p-1 text-slate-400 hover:text-blue-500 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto">
              {channels.length === 0 && <p className="text-xs text-slate-400 py-3">Chưa có kênh nào</p>}
              {channels.map((ch) => {
                const canEdit = ch.createdBy === uid || canManageChannels;
                const isActive = activeChannelId === ch.id;
                return (
                  <div key={ch.id} className="group relative">
                    <button
                      onClick={() => setActiveChannelId(ch.id)}
                      className={cn(
                        "w-full flex items-center gap-2 pl-3 pr-8 py-2 rounded-xl text-sm transition text-left",
                        isActive ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                      )}
                    >
                      {ch.type === "private" ? <Lock className="w-3.5 h-3.5 shrink-0" /> : <Hash className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{ch.name}</span>
                    </button>
                    {canEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setManagingChannel(ch); }}
                        title="Quản lý nhóm"
                        className={cn(
                          "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition opacity-0 group-hover:opacity-100",
                          isActive
                            ? "text-white/70 hover:text-white hover:bg-white/10"
                            : "text-slate-400 hover:text-slate-600 hover:bg-[var(--muted)]"
                        )}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Channel messages */}
          <div className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden flex flex-col min-h-0">
            {activeChannel && currentUser ? (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
                  {activeChannel.type === "private"
                    ? <Lock className="w-4 h-4 text-slate-400" />
                    : <Hash className="w-4 h-4 text-slate-400" />}
                  <span className="font-semibold text-sm text-[var(--foreground)]">{activeChannel.name}</span>
                  <span className="text-xs text-slate-400">
                    · {activeChannel.memberIds.length} thành viên
                  </span>
                  {activeChannel.description && (
                    <span className="text-xs text-slate-400 truncate hidden sm:block">
                      · {activeChannel.description}
                    </span>
                  )}
                  {(activeChannel.createdBy === uid || canManageChannels) && (
                    <button
                      onClick={() => setManagingChannel(activeChannel)}
                      title="Quản lý nhóm"
                      className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 hover:bg-[var(--muted)] rounded-lg transition"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
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

      {/* Create announcement modal */}
      {showPostForm && (
        <CreateAnnouncementModal
          onSave={handlePost}
          onClose={() => setShowPostForm(false)}
          posting={posting}
        />
      )}

      {/* Create channel modal */}
      {showNewChannel && currentUser && (
        <CreateChannelModal
          currentUser={currentUser}
          allUsers={users}
          onSave={handleCreateChannel}
          onClose={() => setShowNewChannel(false)}
        />
      )}

      {/* Manage channel modal */}
      {managingChannel && currentUser && (
        <ManageChannelModal
          channel={managingChannel}
          allUsers={users}
          currentUser={currentUser}
          canManage={canManageChannels}
          onUpdate={handleUpdateChannel}
          onDelete={handleDeleteChannel}
          onClose={() => setManagingChannel(null)}
        />
      )}
    </div>
  );
}
