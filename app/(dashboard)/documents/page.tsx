"use client";

import { useEffect, useState, useMemo } from "react";
import {
  FolderOpen, Folder, FileText, Image, Film, File,
  Plus, Loader2, Search, ChevronRight, Download,
  Trash2, Upload, Link2, ExternalLink, Home,
} from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  getFolders, saveFolder, deleteFolder,
  getDocuments, saveDocument, deleteDocument, subscribeDocuments,
} from "@/lib/firebase/firestore";
import type { DocFolder, WorkDocument, DocFileType } from "@/types";

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

// ── Add link modal ────────────────────────────────────────────────────────────
function AddLinkModal({
  folderId,
  currentUser,
  onClose,
  onAdded,
}: {
  folderId: string | null;
  currentUser: { id: string; name: string; department?: string };
  onClose: () => void;
  onAdded: (d: WorkDocument) => void;
}) {
  const [url, setUrl] = useState("https://");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!url.trim() || !name.trim()) { toast.error("Vui lòng điền tên và đường dẫn."); return; }
    setSaving(true);
    try {
      const doc_: WorkDocument = {
        id: generateId("doc"),
        name: name.trim(),
        description: desc.trim() || undefined,
        folderId,
        fileUrl: url.trim(),
        fileType: "link",
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        department: currentUser.department,
        tags: [],
        sharedWithRoles: ["staff", "teamLead", "director", "hrAdmin"],
        sharedWithUsers: [],
        downloadCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDocument(doc_);
      toast.success("Đã thêm liên kết.");
      onAdded(doc_);
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
        <h2 className="font-bold text-[var(--foreground)]">Thêm liên kết tài liệu</h2>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên tài liệu *"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả (tuỳ chọn)"
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition">Huỷ</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddLink, setShowAddLink] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const canCreate = !!(currentUser && hasPermission(currentUser.role, "document:create"));
  const canManage = !!(currentUser && hasPermission(currentUser.role, "document:manage"));

  useEffect(() => {
    getFolders().then(setFolders);
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeDocuments(currentFolderId, (docs) => {
      setDocuments(docs);
      setLoading(false);
    });
    return () => unsub();
  }, [currentFolderId]);

  const subFolders = useMemo(() =>
    folders.filter((f) => f.parentId === currentFolderId),
    [folders, currentFolderId]
  );

  const filteredDocs = useMemo(() => {
    if (!search) return documents;
    const q = search.toLowerCase();
    return documents.filter((d) => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
  }, [documents, search]);

  // Breadcrumb path
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

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !currentUser) return;
    const f: DocFolder = {
      id: generateId("folder"),
      name: newFolderName.trim(),
      parentId: currentFolderId,
      ownerId: currentUser.id,
      department: currentUser.department,
      sharedWithRoles: ["staff", "teamLead", "director", "hrAdmin"],
      color: "#3b82f6",
      createdAt: new Date().toISOString(),
    };
    await saveFolder(f);
    setFolders((prev) => [...prev, f]);
    setNewFolderName("");
    setShowNewFolder(false);
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
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition"
            >
              <Link2 className="w-4 h-4" /> Thêm liên kết
            </button>
          </div>
        )}
      </div>

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
            <button onClick={() => setCurrentFolderId(f.id)} className="text-slate-400 hover:text-blue-500 transition">
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

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex gap-2 items-center p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 rounded-xl">
          <Folder className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder="Tên thư mục..."
            className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--foreground)]"
          />
          <button onClick={handleCreateFolder} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg">Tạo</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="text-slate-400 hover:text-slate-600 text-xs">Huỷ</button>
        </div>
      )}

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
                <span className="text-sm font-medium text-[var(--foreground)] truncate">{f.name}</span>
                {canManage && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}
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
        {subFolders.length > 0 && <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tài liệu</p>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400 border-2 border-dashed border-[var(--border)] rounded-2xl">
            <FolderOpen className="w-12 h-12" />
            <p className="font-medium">Thư mục trống</p>
            {canCreate && <p className="text-sm">Nhấn "Thêm liên kết" để thêm tài liệu đầu tiên</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDocs.map((doc_) => (
              <div key={doc_.id} className="group relative flex flex-col gap-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-blue-300 transition">
                <div className="flex items-start gap-3">
                  {fileIcon(doc_.fileType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{doc_.name}</p>
                    {doc_.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{doc_.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{doc_.ownerName} · {new Date(doc_.createdAt).toLocaleDateString("vi-VN")}</p>
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
                    <span key={tag} className="px-2 py-0.5 text-[10px] bg-[var(--muted)] text-slate-500 rounded-full">{tag}</span>
                  ))}
                </div>

                {(canManage || doc_.ownerId === currentUser?.id) && (
                  <button
                    onClick={() => handleDeleteDoc(doc_.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddLink && currentUser && (
        <AddLinkModal
          folderId={currentFolderId}
          currentUser={currentUser}
          onClose={() => setShowAddLink(false)}
          onAdded={(d) => setDocuments((prev) => [d, ...prev])}
        />
      )}
    </div>
  );
}
