"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Send, Loader2, Smile, Paperclip, Camera, Mic, MicOff,
  Play, Pause, Check, CheckCheck, RotateCcw, Trash2, Copy,
  Download, X, Image as ImageIcon, FileText, Volume2, Keyboard,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, avatarColor, generateId } from "@/lib/utils";
import { uploadFile } from "@/lib/firebase/storage";
import {
  subscribeChannelMessages,
  sendChannelMessage,
  updateChannelMessage,
  markChannelRead,
} from "@/lib/firebase/firestore";
import type { Channel, ChannelMessage } from "@/types";

// ── Emoji data ────────────────────────────────────────────────────────────────
const EMOJI_GROUPS = [
  {
    icon: "😊", label: "Cảm xúc",
    emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🥱","😶","😑","😬","🙄","😯","😦","😧","😮","😲","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤒","🤕","🤧","🤢","🤮","😵","🥴","🤤","😴","😈","👿","💀"],
  },
  {
    icon: "👍", label: "Cử chỉ",
    emojis: ["👍","👎","👋","🤚","🖐","✋","🖖","🤙","💪","🦾","✍","💅","☝","👆","👇","👈","👉","🤞","🤟","🤘","👌","🤌","🤏","✌","🖕","🤜","🤛","👊","✊","👏","🙌","🫶","🤝","🙏","💆","💇","🧖","🧘","🏃","🚶","🧍","🧎","🏋","⛹","🤸","🤼","🤺","🤾","🏄","🏊"],
  },
  {
    icon: "❤️", label: "Tim",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️","💋","💍","💎","✨","🌟","⭐","🌠","🌈","🔥","💥"],
  },
  {
    icon: "🎉", label: "Vui",
    emojis: ["🎉","🎊","🎈","🎁","🎀","🎗","🎟","🎫","🎖","🏆","🥇","🥈","🥉","🏅","🎯","🎪","🎭","🎨","🎬","🎤","🎧","🎼","🎵","🎶","🎸","🥁","🎹","🎷","🎺","🎻","🎮","🕹","🎲","🧩","🎰","🧸","🪆","🪅","🔮","🪄","🚀","🛸","☀️","🌤","⛅","🌦","🌧","⛈","🌩","❄️","☃️","⛄","🌊"],
  },
  {
    icon: "🐶", label: "Động vật",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🐝","🐛","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐙","🐠","🐟","🐬","🐳","🦈","🐊","🐅","🐆","🦓","🦒","🐘","🦛","🦏","🐪","🦘","🐕","🐈"],
  },
  {
    icon: "🍎", label: "Đồ ăn",
    emojis: ["🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🍆","🥕","🌽","🍄","🥜","🍞","🥐","🧀","🥚","🍳","🥞","🥓","🍗","🌭","🍔","🍟","🍕","🌮","🌯","🍱","🍣","🍦","🍧","🍩","🍪","🎂","🍰","🧁","🍫","🍬","🍭","☕","🍵","🧃","🥤","🍺","🍻","🥂","🍷","🍸","🍹"],
  },
];

// ── Inline audio player ───────────────────────────────────────────────────────
function InlineAudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl min-w-[160px]",
      isMe ? "bg-blue-500/30" : "bg-[var(--muted)]"
    )}>
      <audio
        ref={audioRef} src={url}
        onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        onClick={toggle}
        className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition",
          isMe ? "bg-white/20 hover:bg-white/30 text-white" : "bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-[var(--foreground)]"
        )}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn("h-1.5 rounded-full overflow-hidden", isMe ? "bg-white/20" : "bg-slate-300 dark:bg-slate-600")}>
          <div
            className={cn("h-full rounded-full transition-all", isMe ? "bg-white/80" : "bg-blue-500")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={cn("text-[10px] mt-0.5", isMe ? "text-white/60" : "text-slate-400")}>
          <Volume2 className="w-2.5 h-2.5 inline mr-1" />
          {fmt(duration)}
        </p>
      </div>
    </div>
  );
}

// ── Emoji picker ──────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const [activeGroup, setActiveGroup] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-14 left-2 z-30 w-72 bg-white dark:bg-slate-900 border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
      {/* Category tabs */}
      <div className="flex border-b border-[var(--border)]">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={i}
            onClick={() => setActiveGroup(i)}
            title={g.label}
            className={cn(
              "flex-1 py-2 text-base transition hover:bg-[var(--muted)]",
              activeGroup === i ? "border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""
            )}
          >
            {g.icon}
          </button>
        ))}
      </div>
      {/* Emoji grid */}
      <div className="h-52 overflow-y-auto p-2 grid grid-cols-9 gap-0.5">
        {EMOJI_GROUPS[activeGroup].emojis.map((e, i) => (
          <button
            key={i}
            onClick={() => onSelect(e)}
            className="text-xl p-1 rounded-lg hover:bg-[var(--muted)] transition hover:scale-125 leading-none"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────
function MessageContextMenu({
  msg,
  isMe,
  x,
  y,
  onRecall,
  onDeleteLocal,
  onCopy,
  onClose,
}: {
  msg: ChannelMessage;
  isMe: boolean;
  x: number;
  y: number;
  onRecall: () => void;
  onDeleteLocal: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const canRecall = isMe && !msg.recalled &&
    Date.now() - new Date(msg.timestamp).getTime() < 5 * 60 * 1000;

  // Adjust position to stay in viewport
  const menuW = 160, menuH = 120;
  const adjX = Math.min(x, window.innerWidth - menuW - 8);
  const adjY = Math.min(y, window.innerHeight - menuH - 8);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-40 bg-white dark:bg-slate-800 border border-[var(--border)] rounded-xl shadow-2xl py-1 text-sm overflow-hidden"
      style={{ left: adjX, top: adjY }}
    >
      {msg.content && !msg.recalled && (
        <button
          onClick={() => { onCopy(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--muted)] text-[var(--foreground)] transition"
        >
          <Copy className="w-3.5 h-3.5 text-slate-400" /> Sao chép
        </button>
      )}
      {canRecall && (
        <button
          onClick={() => { onRecall(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Thu hồi
        </button>
      )}
      <button
        onClick={() => { onDeleteLocal(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition"
      >
        <Trash2 className="w-3.5 h-3.5" /> Xoá (phía tôi)
      </button>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  isMe,
  showAvatar,
  isRead,
  onContextMenu,
}: {
  msg: ChannelMessage;
  isMe: boolean;
  showAvatar: boolean;
  isRead: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const hasText = !msg.recalled && !!msg.content;
  const hasAttachments = !msg.recalled && msg.attachments.length > 0;

  return (
    <div className={cn("flex items-end gap-2", isMe && "flex-row-reverse")}>
      {/* Avatar */}
      <div className="w-6 shrink-0">
        {showAvatar && (
          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white", avatarColor(msg.senderName))}>
            {msg.senderAvatar
              ? <img src={msg.senderAvatar} className="w-full h-full rounded-full object-cover" alt="" />
              : getInitials(msg.senderName)}
          </div>
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn("max-w-[72%] space-y-1", isMe ? "items-end" : "items-start")}
        onContextMenu={onContextMenu}
      >
        {/* Sender name (others only, first message in group) */}
        {!isMe && showAvatar && (
          <p className="text-[10px] text-slate-400 pl-1">{msg.senderName}</p>
        )}

        {/* Recalled placeholder */}
        {msg.recalled ? (
          <div className={cn(
            "px-3 py-2 rounded-2xl text-xs italic opacity-60",
            isMe ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-[var(--muted)] text-[var(--foreground)]"
          )}>
            Tin nhắn đã bị thu hồi
          </div>
        ) : (
          <div className={cn(
            "rounded-2xl overflow-hidden",
            isMe ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-[var(--muted)] text-[var(--foreground)]"
          )}>
            {/* Attachments */}
            {hasAttachments && (
              <div className="space-y-1 p-1">
                {msg.attachments.map((att) => {
                  const isImage = att.type.startsWith("image/");
                  const isAudio = att.type.startsWith("audio/");
                  const isVideo = att.type.startsWith("video/");

                  if (isImage) {
                    return (
                      <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={att.url}
                          alt={att.name}
                          className="max-w-[240px] max-h-[200px] object-cover rounded-xl"
                          loading="lazy"
                        />
                      </a>
                    );
                  }
                  if (isAudio) {
                    return <InlineAudioPlayer key={att.id} url={att.url} isMe={isMe} />;
                  }
                  if (isVideo) {
                    return (
                      <video key={att.id} src={att.url} controls
                        className="max-w-[240px] rounded-xl" />
                    );
                  }
                  return (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl transition",
                        isMe ? "bg-blue-500/30 hover:bg-blue-500/40 text-white" : "bg-white/60 dark:bg-slate-700 hover:bg-white dark:hover:bg-slate-600 text-[var(--foreground)]"
                      )}
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="text-xs truncate max-w-[160px]">{att.name}</span>
                      <Download className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    </a>
                  );
                })}
              </div>
            )}
            {/* Text */}
            {hasText && (
              <p className={cn("text-sm leading-relaxed whitespace-pre-wrap px-3",
                hasAttachments ? "pb-2 pt-1" : "py-2"
              )}>
                {msg.content}
              </p>
            )}
          </div>
        )}

        {/* Time + read receipt */}
        <div className={cn("flex items-center gap-1", isMe ? "justify-end" : "justify-start")}>
          <p className="text-[10px] text-slate-400">
            {new Date(msg.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {isMe && !msg.recalled && (
            isRead
              ? <CheckCheck className="w-3 h-3 text-blue-500" />
              : <Check className="w-3 h-3 text-slate-400" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Camera modal ──────────────────────────────────────────────────────────────
function CameraModal({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => setReady(true));
        }
      })
      .catch((e) => setErrMsg(e.message ?? "Không thể mở camera."));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => { if (blob) { onCapture(blob); onClose(); } }, "image/jpeg", 0.85);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-slate-900 rounded-2xl overflow-hidden w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="text-white font-semibold flex items-center gap-2">
            <Camera className="w-4 h-4" /> Chụp ảnh
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative bg-black aspect-video flex items-center justify-center">
          {errMsg ? (
            <p className="text-red-400 text-sm p-4 text-center">{errMsg}</p>
          ) : (
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          )}
          {!ready && !errMsg && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-center py-4 bg-slate-800">
          <button
            onClick={capture}
            disabled={!ready}
            className="w-14 h-14 rounded-full bg-white disabled:opacity-40 flex items-center justify-center shadow-lg hover:bg-slate-100 transition"
          >
            <Camera className="w-6 h-6 text-slate-900" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ChannelChat ──────────────────────────────────────────────────────────
export function ChannelChat({
  channel,
  currentUser,
}: {
  channel: Channel;
  currentUser: { id: string; name: string; avatar?: string };
}) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<
    { id: string; name: string; url: string; type: string; size?: number }[]
  >([]);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [listening, setListening] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    msg: ChannelMessage; x: number; y: number;
  } | null>(null);
  const [hiddenMsgIds, setHiddenMsgIds] = useState<string[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Subscribe messages
  useEffect(() => {
    const unsub = subscribeChannelMessages(channel.id, (msgs) => {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    });
    return () => unsub();
  }, [channel.id]);

  // Mark as read when channel opens or new messages arrive
  useEffect(() => {
    if (messages.length === 0) return;
    markChannelRead(channel.id, currentUser.id).catch(() => {});
  }, [channel.id, currentUser.id, messages.length]);

  // Visible messages (filter locally deleted)
  const visibleMessages = useMemo(
    () => messages.filter((m) => !hiddenMsgIds.includes(m.id) && !m.deletedFor?.includes(currentUser.id)),
    [messages, hiddenMsgIds, currentUser.id]
  );

  // Read receipts: other members' latest read timestamp
  const othersLastRead = useMemo(() => {
    const others = channel.memberIds.filter((id) => id !== currentUser.id);
    const map = channel.memberLastRead ?? {};
    const ts = others.map((id) => map[id] ?? "").filter(Boolean);
    if (ts.length === 0) return "";
    return ts.reduce((a, b) => (a > b ? a : b)); // max = latest read among others
  }, [channel.memberIds, channel.memberLastRead, currentUser.id]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSend() {
    if ((!text.trim() && pendingFiles.length === 0) || sending) return;
    setSending(true);
    try {
      await sendChannelMessage(channel.id, {
        channelId: channel.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: text.trim(),
        attachments: pendingFiles.map((f) => ({
          id: f.id, name: f.name, url: f.url, type: f.type, size: f.size,
        })),
        reactions: {},
        timestamp: new Date().toISOString(),
        recalled: false,
        deletedFor: [],
      });
      setText("");
      setPendingFiles([]);
      setShowEmoji(false);
    } catch {
      toast.error("Gửi tin thất bại.");
    } finally {
      setSending(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploadingFile(true);
    try {
      for (const file of files) {
        const url = await uploadFile(file, "chat-files");
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
    }
  }

  async function handleCameraCapture(blob: Blob) {
    setUploadingFile(true);
    try {
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      const url = await uploadFile(file, "chat-images");
      setPendingFiles((prev) => [
        ...prev,
        { id: generateId("att"), name: file.name, url, type: "image/jpeg", size: blob.size },
      ]);
      toast.success("Đã chụp ảnh. Nhấn gửi để chia sẻ.");
    } catch {
      toast.error("Tải ảnh thất bại.");
    } finally {
      setUploadingFile(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"]
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length === 0) {
          toast.error("Không thu được âm thanh. Hãy thử lại.");
          return;
        }
        const actualMime = mr.mimeType || mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        if (blob.size < 100) {
          toast.error("Đoạn ghi âm quá ngắn. Hãy giữ nút ghi âm lâu hơn.");
          return;
        }
        setUploadingFile(true);
        try {
          const ext = actualMime.includes("ogg") ? "ogg" : actualMime.includes("mp4") ? "mp4" : "webm";
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: actualMime });
          const url = await uploadFile(file, "chat-audio");
          setPendingFiles((prev) => [
            ...prev,
            { id: generateId("att"), name: "Tin nhắn thoại", url, type: actualMime, size: blob.size },
          ]);
        } catch (err) {
          console.error("[ChannelChat] audio upload failed:", err);
          toast.error("Không thể tải âm thanh lên. Kiểm tra kết nối và quyền Storage.");
        } finally { setUploadingFile(false); }
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordTime(0);
      recordTimerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000);
    } catch (err) {
      console.error("[ChannelChat] getUserMedia failed:", err);
      toast.error("Không thể truy cập microphone. Kiểm tra quyền trình duyệt.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);
    setRecordTime(0);
  }

  function startSpeechToText() {
    type SpeechRecognitionCtor = new () => {
      lang: string; continuous: boolean; interimResults: boolean;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      onresult: ((e: { results: { [index: number]: { [index: number]: { transcript: string } }; length: number } }) => void) | null;
      start(): void;
    };
    const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined;
    const SR = (w?.["SpeechRecognition"] ?? w?.["webkitSpeechRecognition"]) as SpeechRecognitionCtor | undefined;
    if (!SR) { toast.error("Trình duyệt không hỗ trợ nhận diện giọng nói."); return; }
    const rec = new SR();
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error("Nhận diện giọng nói thất bại."); };
    rec.onresult = (e) => {
      const results = e.results;
      let transcript = "";
      for (let i = 0; i < results.length; i++) transcript += results[i][0].transcript;
      setText(transcript);
    };
    rec.start();
    recognitionRef.current = rec;
    toast.info("Đang lắng nghe... Nói để chuyển thành văn bản.");
  }

  async function recallMessage(msgId: string) {
    try {
      await updateChannelMessage(channel.id, msgId, { recalled: true, content: "" });
    } catch {
      toast.error("Thu hồi thất bại.");
    }
  }

  function deleteMessageLocally(msgId: string) {
    setHiddenMsgIds((prev) => [...prev, msgId]);
  }

  function fmtRecordTime(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  // Group messages by sender for avatar logic
  function shouldShowAvatar(i: number) {
    if (i === 0) return true;
    return visibleMessages[i].senderId !== visibleMessages[i - 1].senderId;
  }

  function isMessageRead(msg: ChannelMessage) {
    return !!othersLastRead && msg.timestamp <= othersLastRead;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="flex flex-col h-full relative">
      {/* Message list */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-1.5"
        onClick={() => { setShowEmoji(false); setContextMenu(null); }}
      >
        {visibleMessages.length === 0 && (
          <div className="text-center py-10 text-xs text-slate-400">
            Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!
          </div>
        )}
        {visibleMessages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMe={msg.senderId === currentUser.id}
            showAvatar={shouldShowAvatar(i)}
            isRead={isMessageRead(msg)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ msg, x: e.clientX, y: e.clientY });
            }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <EmojiPicker
          onSelect={(emoji) => setText((t) => t + emoji)}
          onClose={() => setShowEmoji(false)}
        />
      )}

      {/* Pending files preview */}
      {(pendingFiles.length > 0 || uploadingFile) && (
        <div className="flex flex-wrap gap-2 px-3 py-2 border-t border-[var(--border)] bg-[var(--muted)]">
          {uploadingFile && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" /> Đang tải...
            </div>
          )}
          {pendingFiles.map((f) => {
            const isImage = f.type.startsWith("image/");
            const isAudio = f.type.startsWith("audio/");
            return (
              <div
                key={f.id}
                className="relative flex items-center gap-1.5 pl-2 pr-6 py-1.5 bg-white dark:bg-slate-800 border border-[var(--border)] rounded-xl text-xs max-w-[140px]"
              >
                {isImage
                  ? <ImageIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  : isAudio
                  ? <Volume2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  : <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <span className="truncate text-[var(--foreground)]">{f.name}</span>
                <button
                  onClick={() => setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Recording bar */}
      {recording && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--border)] bg-red-50 dark:bg-red-900/10">
          <span className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            Đang ghi âm {fmtRecordTime(recordTime)}
          </span>
          <button
            onClick={stopRecording}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition"
          >
            <MicOff className="w-3.5 h-3.5" /> Dừng
          </button>
        </div>
      )}

      {/* Input bar */}
      {!recording && (
        <div className="flex items-end gap-2 p-3 border-t border-[var(--border)]">
          {/* Emoji */}
          <button
            onClick={() => setShowEmoji((v) => !v)}
            title="Emoji"
            className={cn(
              "p-2 rounded-xl transition shrink-0",
              showEmoji ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30" : "text-slate-400 hover:text-slate-600 hover:bg-[var(--muted)]"
            )}
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={`Nhắn tin vào #${channel.name}...`}
              rows={1}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-28 overflow-y-auto"
              style={{ height: "auto", minHeight: "40px" }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 112) + "px";
              }}
            />
            {listening && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-medium animate-pulse">
                Đang nghe...
              </span>
            )}
          </div>

          {/* Attach file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Đính kèm file"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-[var(--muted)] rounded-xl transition shrink-0"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Camera */}
          <button
            onClick={() => setShowCamera(true)}
            title="Chụp ảnh"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-[var(--muted)] rounded-xl transition shrink-0"
          >
            <Camera className="w-5 h-5" />
          </button>

          {/* Mic / Voice recording */}
          <button
            onClick={startRecording}
            title="Ghi âm"
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition shrink-0"
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Speech to text */}
          <button
            onClick={startSpeechToText}
            title="Chuyển giọng nói thành văn bản"
            className={cn(
              "p-2 rounded-xl transition shrink-0",
              listening ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 animate-pulse" : "text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            )}
          >
            <Keyboard className="w-5 h-5" />
          </button>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={(text.trim() === "" && pendingFiles.length === 0) || sending}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition shrink-0"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
        onChange={handleFileChange}
      />

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          msg={contextMenu.msg}
          isMe={contextMenu.msg.senderId === currentUser.id}
          x={contextMenu.x}
          y={contextMenu.y}
          onRecall={() => recallMessage(contextMenu.msg.id)}
          onDeleteLocal={() => deleteMessageLocally(contextMenu.msg.id)}
          onCopy={() => {
            navigator.clipboard.writeText(contextMenu.msg.content).catch(() => {});
            toast.success("Đã sao chép.");
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Camera modal */}
      {showCamera && (
        <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}
    </div>
  );
}
