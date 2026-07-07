"use client";

import { useEffect, useState, useMemo } from "react";
import {
  FolderOpen, Folder, FileText, Image, Film, File,
  Plus, Loader2, Search, ChevronRight,
  Trash2, Upload, Link2, ExternalLink, Home, CheckCircle2, XCircle, Clock,
  Users, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { useUnitAbbr } from "@/hooks/useUnitAbbr";
import {
  getFolders, saveFolder, deleteFolder,
  saveDocument, deleteDocument, subscribeDocuments,
  getPendingDocuments, approveDocument, addNotification,
  getUsers, getTasks,
} from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import type { DocFolder, WorkDocument, DocFileType, User, Task } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileIcon(type: DocFileType) {
  switch (type) {
    case "image": return <Image className="w-8 h-8 text-purple-500" />;
    case "pdf": return <FileText className="w-8 h-8 text-red-500" />;
    case "word": return <FileText className="w-8 h-8 text-blue-600" />;
    case "excel": return <FileText className="w-8 h-8 text-green-600" />;
    case "video": return <Film className="w-8 h-8 text-pink-500" />;
    case "link": return <Link2 className="w-8 h-8 text-teal-500" />;
    default: return <File className="w-8 h-8 text-slate-400" />;
  }
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mimeToDocFileType(mime: string): DocFileType {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("word") || mime.includes("document")) return "word";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "excel";
  if (mime.includes("powerpoint") || mime.includes("presentation")) return "other";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

// ── ShareWithPicker ───────────────────────────────────────────────────────────
type ShareMode = "single" | "multi" | "task";

function ShareWithPicker({
  allUsers,
  allTasks,
  selected,
  onChange,
}: {
  allUsers: User[];
  allTasks: Task[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const abbr = useUnitAbbr();
  const [mode, setMode] = useState<ShareMode>("multi");
  const [search, setSearch] = useState("");
  const [taskId, setTaskId] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q)
    );
  }, [allUsers, search]);

  function toggle(id: string) {
    if (mode === "single") {
      onChange(selected.includes(id) ? [] : [id]);
    } else {
      onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    }
  }

  function addTaskMembers() {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    const memberIds = Array.from(
      new Set(
        [task.mainPerformerId, task.creatorId, ...task.stakeholders.map((s) => s.userId)].filter(
          Boolean
        )
      )
    );
    onChange(Array.from(new Set([...selected, ...memberIds])));
  }

  const selectedTask = allTasks.find((t) => t.id === taskId);
  const taskMemberIds = selectedTask
    ? Array.from(
        new Set(
          [
            selectedTask.mainPerformerId,
            selectedTask.creatorId,
            ...selectedTask.stakeholders.map((s) => s.userId),
          ].filter(Boolean)
        )
      )
    : [];

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800 transition text-sm font-medium text-[var(--foreground)]"
      >
        <span className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          Chia sẻ với
          {selected.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white rounded-full">
              {selected.length}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-3 space-y-2.5">
          {/* Mode tabs */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
            {(
              [
                { key: "single", label: "Một người" },
                { key: "multi", label: "Nhiều người" },
                { key: "task", label: "Nhóm nhiệm vụ" },
              ] as { key: ShareMode; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMode(tab.key);
                  setSearch("");
                  setTaskId("");
                  onChange([]);
                }}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition",
                  mode === tab.key
                    ? "bg-blue-600 text-white"
                    : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((id) => {
                const u = allUsers.find((x) => x.id === id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full"
                  >
                    {u?.name ?? id}
                    <button
                      type="button"
                      onClick={() => onChange(selected.filter((x) => x !== id))}
                      className="hover:text-red-600 leading-none"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {mode === "task" ? (
            <div className="space-y-2">
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn nhiệm vụ --</option>
                {allTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {taskId && (
                <>
                  <p className="text-xs text-slate-500">
                    {taskMemberIds.length} thành viên:{" "}
                    {taskMemberIds.map((id) => allUsers.find((u) => u.id === id)?.name ?? id).join(", ")}
                  </p>
                  <button
                    type="button"
                    onClick={addTaskMembers}
                    className="w-full py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-blue-700 dark:text-blue-300 text-xs rounded-lg hover:bg-blue-100 transition"
                  >
                    + Thêm tất cả thành viên
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm người..."
                className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">Không tìm thấy người dùng</p>
                ) : (
                  filtered.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition text-left",
                        selected.includes(u.id)
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-[var(--muted)]"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition",
                          selected.includes(u.id)
                            ? "bg-blue-600 border-blue-600"
                            : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {selected.includes(u.id) && (
                          <span className="text-white text-[9px] font-bold leading-none">✓</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "font-medium leading-tight truncate",
                            selected.includes(u.id) ? "text-blue-700 dark:text-blue-300" : "text-[var(--foreground)]"
                          )}
                        >
                          {u.name}
                        </p>
                        {u.department && (
                          <p className="text-[10px] text-slate-400 truncate">{abbr(u.department)}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add link modal ────────────────────────────────────────────────────────────
function AddLinkModal({
  folderId,
  currentUser,
  canApprove,
  onClose,
}: {
  folderId: string | null;
  currentUser: { id: string; name: string; department?: string };
  canApprove: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("https://");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  useEffect(() => {
    getUsers().then(setAllUsers);
    getTasks().then(setAllTasks);
  }, []);

  async function handleSave() {
    if (!url.trim() || !name.trim()) {
      toast.error("Vui lòng điền tên và đường dẫn.");
      return;
    }
    setSaving(true);
    try {
      const doc_: WorkDocument = {
        id: generateId("doc"),
        name: name.trim(),
        description: desc.trim() || undefined,
        folderId,
        fileUrl: url.trim(),
        fileType: "link",
        status: canApprove ? "published" : "pending",
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        department: currentUser.department,
        tags: [],
        sharedWithRoles: ["staff", "teamLead", "director", "hrAdmin"],
        sharedWithUsers: sharedUserIds,
        downloadCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDocument(doc_);
      toast.success(
        canApprove ? "Đã thêm liên kết." : "Đã gửi tài liệu. Chờ quản lý phê duyệt để công khai."
      );
      onClose();
    } catch {
      toast.error("Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-[var(--foreground)]">Thêm liên kết tài liệu</h2>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên tài liệu *"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Mô tả (tuỳ chọn)"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <ShareWithPicker
            allUsers={allUsers}
            allTasks={allTasks}
            selected={sharedUserIds}
            onChange={setSharedUserIds}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition"
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload file modal ─────────────────────────────────────────────────────────
function UploadFileModal({
  folderId,
  currentUser,
  canApprove,
  onClose,
}: {
  folderId: string | null;
  currentUser: { id: string; name: string; department?: string };
  canApprove: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [desc, setDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  useEffect(() => {
    getUsers().then(setAllUsers);
    getTasks().then(setAllTasks);
  }, []);

  async function handleUpload() {
    if (!file) {
      toast.error("Vui lòng chọn tệp.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "documents");
      const doc_: WorkDocument = {
        id: generateId("doc"),
        name: file.name,
        description: desc.trim() || undefined,
        folderId,
        fileUrl: url,
        fileType: mimeToDocFileType(file.type),
        status: canApprove ? "published" : "pending",
        fileSize: file.size,
        mimeType: file.type,
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        department: currentUser.department,
        tags: [],
        sharedWithRoles: ["staff", "teamLead", "director", "hrAdmin"],
        sharedWithUsers: sharedUserIds,
        downloadCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDocument(doc_);
      toast.success(
        canApprove ? "Đã tải lên tài liệu." : "Đã gửi tài liệu. Chờ quản lý phê duyệt để công khai."
      );
      onClose();
    } catch {
      toast.error("Tải lên thất bại.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-[var(--foreground)]">Tải lên tài liệu</h2>
        <div className="space-y-3">
          <label
            className={cn(
              "flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition",
              file
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/10"
                : "border-[var(--border)] hover:border-blue-300"
            )}
          >
            <Upload className={cn("w-8 h-8", file ? "text-blue-500" : "text-slate-400")} />
            <span className="text-sm text-center text-[var(--foreground)]">
              {file ? file.name : "Nhấn để chọn tệp"}
            </span>
            {file && <span className="text-xs text-slate-400">{formatSize(file.size)}</span>}
            <input
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Mô tả (tuỳ chọn)"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <ShareWithPicker
            allUsers={allUsers}
            allTasks={allTasks}
            selected={sharedUserIds}
            onChange={setSharedUserIds}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition"
          >
            Huỷ
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />} Tải lên
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create folder modal ───────────────────────────────────────────────────────
function CreateFolderModal({
  currentUser,
  onSave,
  onClose,
}: {
  currentUser: { id: string; name: string; department?: string };
  onSave: (name: string, sharedUserIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [folderName, setFolderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  useEffect(() => {
    getUsers().then(setAllUsers);
    getTasks().then(setAllTasks);
  }, []);

  async function handleSave() {
    if (!folderName.trim()) {
      toast.error("Vui lòng nhập tên thư mục.");
      return;
    }
    setSaving(true);
    try {
      await onSave(folderName.trim(), sharedUserIds);
      onClose();
    } catch {
      toast.error("Tạo thư mục thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-[var(--foreground)]">Tạo thư mục mới</h2>
        <div className="space-y-3">
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Tên thư mục *"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <ShareWithPicker
            allUsers={allUsers}
            allTasks={allTasks}
            selected={sharedUserIds}
            onChange={setSharedUserIds}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition"
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Tạo thư mục
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { currentUser } = useAuthStore();
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [pendingDocs, setPendingDocs] = useState<WorkDocument[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddLink, setShowAddLink] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<{ id: string; reason: string } | null>(null);

  const canCreate = !!(currentUser && hasPermission(currentUser.role, "document:create"));
  const canManage = !!(currentUser && hasPermission(currentUser.role, "document:manage"));
  const canApprove = !!(currentUser && hasPermission(currentUser.role, "document:approve"));

  useEffect(() => {
    getFolders().then(setFolders);
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeDocuments(
      currentFolderId,
      (docs) => {
        setDocuments(docs);
        setLoading(false);
      },
      currentUser?.id,
      canApprove
    );
    return () => unsub();
  }, [currentFolderId, currentUser?.id, canApprove]);

  useEffect(() => {
    if (!canApprove) return;
    getPendingDocuments().then(setPendingDocs);
  }, [canApprove]);

  const subFolders = useMemo(
    () => folders.filter((f) => f.parentId === currentFolderId),
    [folders, currentFolderId]
  );

  const filteredDocs = useMemo(() => {
    if (!search) return documents;
    const q = search.toLowerCase();
    return documents.filter(
      (d) => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
    );
  }, [documents, search]);

  const breadcrumb = useMemo(() => {
    const path: DocFolder[] = [];
    let id = currentFolderId;
    while (id) {
      const f = folders.find((x) => x.id === id);
      if (!f) break;
      path.unshift(f);
      id = f.parentId;
    }
    return path;
  }, [currentFolderId, folders]);

  async function handleCreateFolder(name: string, sharedUserIds: string[]) {
    if (!currentUser) return;
    const f: DocFolder = {
      id: generateId("folder"),
      name,
      parentId: currentFolderId,
      ownerId: currentUser.id,
      department: currentUser.department,
      sharedWithRoles: ["staff", "teamLead", "director", "hrAdmin"],
      sharedWithUsers: sharedUserIds,
      color: "#3b82f6",
      createdAt: new Date().toISOString(),
    };
    await saveFolder(f);
    setFolders((prev) => [...prev, f]);
    toast.success("Đã tạo thư mục.");
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm("Xóa thư mục này? Tài liệu bên trong sẽ không bị xóa.")) return;
    await deleteFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    toast.success("Đã xóa thư mục.");
  }

  async function handleDeleteDoc(id: string) {
    if (!confirm("Xóa tài liệu này?")) return;
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    toast.success("Đã xóa tài liệu.");
  }

  async function handleApproveDoc(id: string, approve: boolean, reason?: string) {
    const target = pendingDocs.find((d) => d.id === id);
    setApprovingId(id);
    try {
      await approveDocument(id, approve, reason);
      setPendingDocs((prev) => prev.filter((d) => d.id !== id));
      setRejectingDoc(null);
      toast.success(approve ? "Đã duyệt tài liệu." : "Đã từ chối tài liệu.");
      if (target && currentUser && target.ownerId !== currentUser.id) {
        await addNotification({
          userId: target.ownerId,
          type: approve ? "request_approved" : "request_rejected",
          title: approve ? "Tài liệu được duyệt" : "Tài liệu bị từ chối",
          body: approve
            ? `"${target.name}" đã được ${currentUser.name} phê duyệt và công khai.`
            : `"${target.name}" bị từ chối bởi ${currentUser.name}.${reason ? ` Lý do: ${reason}` : ""}`,
          link: "/documents",
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

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            Kho Tài liệu
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Lưu trữ tập trung, phân quyền rõ ràng</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-blue-300 hover:text-blue-600 rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Thư mục mới
            </button>
            <button
              onClick={() => setShowAddLink(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-blue-300 hover:text-blue-600 rounded-xl transition"
            >
              <Link2 className="w-4 h-4" /> Thêm liên kết
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition"
            >
              <Upload className="w-4 h-4" /> Tải lên
            </button>
          </div>
        )}
      </div>

      {/* Pending docs approval — managers only */}
      {canApprove && pendingDocs.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Tài liệu chờ duyệt ({pendingDocs.length})
          </h2>
          <div className="space-y-2">
            {pendingDocs.map((doc_) => (
              <div
                key={doc_.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-800 overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  {fileIcon(doc_.fileType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{doc_.name}</p>
                    <p className="text-xs text-slate-400">
                      {doc_.ownerName} · {new Date(doc_.createdAt).toLocaleDateString("vi-VN")}
                      {doc_.description && ` · ${doc_.description}`}
                    </p>
                    {doc_.sharedWithUsers && doc_.sharedWithUsers.length > 0 && (
                      <p className="text-xs text-blue-500 mt-0.5 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Chia sẻ với {doc_.sharedWithUsers.length} người
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setRejectingDoc(
                          rejectingDoc?.id === doc_.id ? null : { id: doc_.id, reason: "" }
                        )
                      }
                      disabled={approvingId === doc_.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-xs font-medium transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Từ chối
                    </button>
                    <button
                      onClick={() => handleApproveDoc(doc_.id, true)}
                      disabled={approvingId === doc_.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
                    >
                      {approvingId === doc_.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      Duyệt
                    </button>
                  </div>
                </div>
                {rejectingDoc?.id === doc_.id && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
                    <p className="text-xs font-medium text-red-600 pt-2">
                      Lý do từ chối <span className="text-red-500">*</span>
                    </p>
                    <textarea
                      autoFocus
                      rows={2}
                      value={rejectingDoc.reason}
                      onChange={(e) => setRejectingDoc({ ...rejectingDoc, reason: e.target.value })}
                      placeholder="Nhập lý do từ chối..."
                      className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg bg-white dark:bg-slate-900 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRejectingDoc(null)}
                        className="flex-1 py-1.5 border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition"
                      >
                        Huỷ
                      </button>
                      <button
                        onClick={() => {
                          if (!rejectingDoc.reason.trim()) {
                            toast.error("Vui lòng nhập lý do từ chối.");
                            return;
                          }
                          handleApproveDoc(doc_.id, false, rejectingDoc.reason.trim());
                        }}
                        disabled={approvingId === doc_.id}
                        className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
                      >
                        {approvingId === doc_.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
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

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button
          onClick={() => setCurrentFolderId(null)}
          className="flex items-center gap-1 text-slate-400 hover:text-blue-500 transition"
        >
          <Home className="w-3.5 h-3.5" /> Gốc
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <button
              onClick={() => setCurrentFolderId(f.id)}
              className="text-slate-400 hover:text-blue-500 transition"
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm tài liệu..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Sub-folders */}
      {subFolders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Thư mục</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {subFolders.map((f) => (
              <div
                key={f.id}
                className="group relative flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-blue-300 transition cursor-pointer"
                onClick={() => setCurrentFolderId(f.id)}
              >
                <Folder className="w-8 h-8 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--foreground)] truncate block">{f.name}</span>
                  {f.sharedWithUsers && f.sharedWithUsers.length > 0 && (
                    <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {f.sharedWithUsers.length} người
                    </span>
                  )}
                </div>
                {canManage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(f.id);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div>
        {subFolders.length > 0 && (
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tài liệu</p>
        )}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400 border-2 border-dashed border-[var(--border)] rounded-2xl">
            <FolderOpen className="w-12 h-12" />
            <p className="font-medium">Thư mục trống</p>
            {canCreate && (
              <p className="text-sm">Nhấn "Tải lên" hoặc "Thêm liên kết" để thêm tài liệu đầu tiên</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDocs.map((doc_) => (
              <div
                key={doc_.id}
                className={cn(
                  "group relative flex flex-col gap-3 p-4 bg-[var(--card)] border rounded-xl transition",
                  doc_.status === "pending"
                    ? "border-amber-300 bg-amber-50/30 dark:bg-amber-900/10"
                    : "border-[var(--border)] hover:border-blue-300"
                )}
              >
                {doc_.status === "pending" && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                    Chờ duyệt
                  </span>
                )}
                <div className="flex items-start gap-3">
                  {fileIcon(doc_.fileType)}
                  <div className="flex-1 min-w-0 pr-14">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{doc_.name}</p>
                    {doc_.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{doc_.description}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">
                      {doc_.ownerName} · {new Date(doc_.createdAt).toLocaleDateString("vi-VN")}
                      {doc_.fileSize ? ` · ${formatSize(doc_.fileSize)}` : ""}
                    </p>
                    {doc_.sharedWithUsers && doc_.sharedWithUsers.length > 0 && (
                      <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-0.5">
                        <Users className="w-2.5 h-2.5" />
                        Chia sẻ với {doc_.sharedWithUsers.length} người
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={doc_.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {doc_.fileType === "link" ? "Mở liên kết" : "Tải xuống"}
                  </a>
                  {doc_.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] bg-[var(--muted)] text-slate-500 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>

                {(canManage || doc_.ownerId === currentUser?.id) && (
                  <button
                    onClick={() => handleDeleteDoc(doc_.id)}
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddLink && currentUser && (
        <AddLinkModal
          folderId={currentFolderId}
          currentUser={currentUser}
          canApprove={canApprove}
          onClose={() => setShowAddLink(false)}
        />
      )}

      {showUpload && currentUser && (
        <UploadFileModal
          folderId={currentFolderId}
          currentUser={currentUser}
          canApprove={canApprove}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showNewFolder && currentUser && (
        <CreateFolderModal
          currentUser={currentUser}
          onSave={handleCreateFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}
    </div>
  );
}
