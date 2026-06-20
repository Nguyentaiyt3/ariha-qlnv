"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
import { createUserAccount } from "@/lib/firebase/auth";
import { getDb } from "@/lib/firebase/config";
import { collection, getDocs, limit, query } from "firebase/firestore";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [alreadySetup, setAlreadySetup] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Check if any admin/hrAdmin already exists
  useEffect(() => {
    async function check() {
      try {
        const db = getDb();
        const snap = await getDocs(query(collection(db, "users"), limit(1)));
        if (!snap.empty) setAlreadySetup(true);
      } catch {
        // ignore — allow setup if can't reach Firestore yet
      } finally {
        setChecking(false);
      }
    }
    check();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (form.password.length < 6) {
      setError("Mật khẩu phải ít nhất 6 ký tự.");
      return;
    }
    setLoading(true);
    try {
      await createUserAccount(form.email, form.password, form.name, "hrAdmin");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Tạo tài khoản thất bại.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">ARiHA WorkHub</span>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {alreadySetup ? (
            <div className="text-center space-y-4">
              <ShieldCheck className="w-12 h-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Hệ thống đã được khởi tạo</h2>
              <p className="text-slate-400 text-sm">
                Đã có tài khoản trong hệ thống. Vui lòng đăng nhập bình thường.
              </p>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition text-sm"
              >
                Đến trang đăng nhập
              </button>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <ShieldCheck className="w-12 h-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Tạo tài khoản thành công!</h2>
              <p className="text-slate-400 text-sm">Đang chuyển đến trang đăng nhập...</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Khởi tạo hệ thống</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Tạo tài khoản <span className="text-blue-400 font-medium">HR Admin</span> đầu tiên để bắt đầu sử dụng WorkHub.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1">Họ và tên</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="admin@ariha.vn"
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1">Mật khẩu</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Tối thiểu 6 ký tự"
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1">Xác nhận mật khẩu</label>
                  <input
                    type="password"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    placeholder="Nhập lại mật khẩu"
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 text-sm mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang tạo tài khoản...
                    </>
                  ) : (
                    "Tạo tài khoản Admin"
                  )}
                </button>
              </form>

              <p className="text-center text-slate-500 text-xs mt-4">
                Trang này chỉ khả dụng khi chưa có tài khoản nào trong hệ thống
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
