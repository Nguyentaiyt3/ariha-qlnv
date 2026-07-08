"use client";

import { useState } from "react";
import { X, Loader2, Paperclip, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveRequest } from "@/lib/firebase/firestore";
import { generateId } from "@/lib/utils";
import { PROFILE_EDITABLE_FIELDS, PROFILE_FIELD_LABEL } from "@/types";
import type { User, Attachment, WorkRequest, ProfileEditableField } from "@/types";

interface Props {
  currentUser: User;
  onClose: () => void;
  onSubmitted: () => void;
}

const MULTILINE_FIELDS = new Set<ProfileEditableField>(["scientificProfile", "workHistory"]);
const DATE_FIELDS = new Set<ProfileEditableField>(["birthday"]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProfileChangeRequestModal({ currentUser, onClose, onSubmitted }: Props) {
  const [form, setForm] = useState<Record<ProfileEditableField, string>>(() => {
    const init = {} as Record<ProfileEditableField, string>;
    for (const f of PROFILE_EDITABLE_FIELDS) init[f] = (currentUser[f] as string | undefined) ?? "";
    return init;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  async function handleSubmit() {
    const changed: Record<string, string> = {};
    for (const f of PROFILE_EDITABLE_FIELDS) {
      const cur = (currentUser[f] as string | undefined) ?? "";
      if (form[f].trim() !== cur.trim()) changed[f] = form[f].trim();
    }
    if (Object.keys(changed).length === 0) {
      toast.error("Bạn chưa thay đổi thông tin nào");
      return;
    }
    if (files.length === 0) {
      toast.error("Vui lòng đính kèm minh chứng cho thay đổi này");
      return;
    }

    setSubmitting(true);
    try {
      const attachments: Attachment[] = [];
      for (const file of files) {
        const url = await readFileAsDataUrl(file);
        attachments.push({ id: generateId("att"), name: file.name, url, type: file.type, size: file.size });
      }

      const now = new Date().toISOString();
      const req: WorkRequest = {
        id: generateId("req"),
        templateId: "profile_change_adhoc",
        templateName: "Đề xuất thay đổi thông tin cá nhân",
        type: "profile_change",
        title: `Đề xuất thay đổi thông tin — ${currentUser.name}`,
        submittedBy: currentUser.id,
        submittedByName: currentUser.name,
        submittedByAvatar: currentUser.avatar,
        department: currentUser.department,
        formData: changed,
        status: "pending",
        attachments,
        createdAt: now,
        updatedAt: now,
      };
      await saveRequest(req);
      toast.success("Đã gửi đề xuất, chờ HR/Admin phê duyệt");
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error("Gửi đề xuất thất bại");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Đề xuất thay đổi thông tin cá nhân</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
            Chỉnh sửa thông tin bên dưới và đính kèm minh chứng (ảnh/PDF). Thay đổi chỉ có hiệu lực sau khi HR/Admin phê duyệt.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROFILE_EDITABLE_FIELDS.filter((f) => !MULTILINE_FIELDS.has(f)).map((f) => (
              <div key={f}>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{PROFILE_FIELD_LABEL[f]}</label>
                <input
                  type={DATE_FIELDS.has(f) ? "date" : "text"}
                  value={form[f]}
                  onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            ))}
          </div>

          {[...PROFILE_EDITABLE_FIELDS].filter((f) => MULTILINE_FIELDS.has(f)).map((f) => (
            <div key={f}>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{PROFILE_FIELD_LABEL[f]}</label>
              <textarea
                rows={3}
                value={form[f]}
                onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Minh chứng đính kèm *</label>
            <label className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline cursor-pointer w-fit">
              <Paperclip className="w-3.5 h-3.5" /> Chọn file (ảnh/PDF)
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
                    <span className="truncate text-slate-600 dark:text-slate-300">{f.name}</span>
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            Huỷ
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Gửi đề xuất
          </button>
        </div>
      </div>
    </div>
  );
}
