"use client";

import { useState } from "react";
import { X, Loader2, GitMerge, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, avatarColor, roleLabel, formatDate } from "@/lib/utils";
import type { User } from "@/types";

interface Props {
  userA: User;
  userB: User;
  onClose: () => void;
  onMerged: () => void;
}

interface MergeResult {
  label: string;
  updated: number;
}

function ProfileCard({ user, selected, onSelect }: { user: User; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex-1 text-left border-2 rounded-xl p-4 transition",
        selected ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-[var(--border)] hover:border-slate-300",
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: avatarColor(user.name) }}
        >
          {getInitials(user.name)}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-[var(--foreground)] truncate">{user.name}</p>
          <p className="text-xs text-[var(--muted-foreground)] truncate">{user.email}</p>
        </div>
        {selected && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 ml-auto" />}
      </div>
      <div className="space-y-1 text-xs text-[var(--muted-foreground)]">
        <p>Vai trò: <span className="text-[var(--foreground)]">{roleLabel(user.role)}</span></p>
        <p>Phòng ban: <span className="text-[var(--foreground)]">{user.department || "—"}</span></p>
        <p>Điện thoại: <span className="text-[var(--foreground)]">{user.phone || "—"}</span></p>
        <p>Số CCCD: <span className="text-[var(--foreground)]">{user.idNumber || "—"}</span></p>
        <p>Mã NV: <span className="text-[var(--foreground)]">{user.employeeCode || "—"}</span></p>
        <p>Tạo lúc: <span className="text-[var(--foreground)]">{formatDate(user.createdAt)}</span></p>
      </div>
      {selected && (
        <p className="mt-3 text-[11px] font-medium text-blue-600">✓ Sẽ được GIỮ LẠI</p>
      )}
    </button>
  );
}

export function MergeEmployeesModal({ userA, userB, onClose, onMerged }: Props) {
  const [keepId, setKeepId] = useState(userA.id);
  const [merging, setMerging] = useState(false);
  const [results, setResults] = useState<MergeResult[] | null>(null);

  const keepUser = keepId === userA.id ? userA : userB;
  const mergeUser = keepId === userA.id ? userB : userA;

  async function handleMerge() {
    setMerging(true);
    try {
      const res = await fetch("/api/users/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeId: mergeUser.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Gộp nhân viên thất bại");
      }
      const { results: r } = await res.json();
      setResults(r);
      toast.success(`Đã gộp "${mergeUser.name}" vào "${keepUser.name}"`);
      onMerged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gộp nhân viên thất bại");
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-violet-500" /> Gộp nhân viên trùng lặp
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {results ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Đã gộp "{mergeUser.name}" vào "{keepUser.name}". Tài khoản trùng đã bị vô hiệu hoá.
              </div>
              <div className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Loại dữ liệu</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-300">Bản ghi đã chuyển</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.filter((r) => r.updated > 0).map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800/50"}>
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.label}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700 dark:text-slate-300">{r.updated}</td>
                      </tr>
                    ))}
                    {results.every((r) => r.updated === 0) && (
                      <tr><td colSpan={2} className="px-3 py-3 text-center text-slate-400">Không có bản ghi liên quan nào khác</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Chọn tài khoản GIỮ LẠI. Toàn bộ nhiệm vụ, TNLS, đề tài, đơn từ, đánh giá... của tài khoản còn lại sẽ chuyển sang, rồi tài khoản đó bị vô hiệu hoá. Không thể hoàn tác.
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <ProfileCard user={userA} selected={keepId === userA.id} onSelect={() => setKeepId(userA.id)} />
                <ProfileCard user={userB} selected={keepId === userB.id} onSelect={() => setKeepId(userB.id)} />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            {results ? "Đóng" : "Huỷ"}
          </button>
          {!results && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white transition flex items-center gap-2"
            >
              {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
              Gộp vào "{keepUser.name}"
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
