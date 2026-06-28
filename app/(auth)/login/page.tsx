"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Loader2, Building2, User, UserPlus, LogIn, ChevronDown, Search, Briefcase } from "lucide-react";
import type { UnitDef } from "@/types";
// MongoDB auth via API routes
async function loginWithEmail(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Đăng nhập thất bại");
  }
  return (await res.json()).user;
}

async function createUserAccount(
  email: string,
  password: string,
  name: string,
  department?: string,
  position?: string,
) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, department, position }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Đăng ký thất bại");
  }
  return (await res.json()).user;
}

function loginWithGoogle() {
  window.location.href = "/api/auth/google";
}
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");

  // Show error from Google OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) toast.error(`Lỗi đăng nhập Google: ${decodeURIComponent(err)}`);
  }, []);

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Register-only fields
  const [name, setName] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");

  // Unit catalog (public — no auth needed)
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [unitQuery, setUnitQuery] = useState("");
  const [unitOpen, setUnitOpen] = useState(false);
  const unitRef = useRef<HTMLDivElement>(null);

  // Position catalog (public)
  const [positionOptions, setPositionOptions] = useState<string[]>([]);
  const [posQuery, setPosQuery] = useState("");
  const [posOpen, setPosOpen] = useState(false);
  const posRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/public/units")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.catalog)) setUnits(d.catalog); })
      .catch(() => {});
    fetch("/api/public/positions")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.positions)) {
          setPositionOptions([...new Set((d.positions as Array<{ title: string }>).map(p => p.title))]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (unitRef.current && !unitRef.current.contains(e.target as Node)) setUnitOpen(false);
      if (posRef.current && !posRef.current.contains(e.target as Node)) setPosOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filteredPositions = posQuery.trim()
    ? positionOptions.filter(p => p.toLowerCase().includes(posQuery.toLowerCase()))
    : positionOptions;

  const filteredUnits = unitQuery.trim()
    ? units.filter(u =>
        u.name.toLowerCase().includes(unitQuery.toLowerCase()) ||
        u.abbr?.toLowerCase().includes(unitQuery.toLowerCase()),
      )
    : units;

  function switchMode(next: Mode) {
    setMode(next);
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPwd("");
    setShowPwd(false);
    setShowConfirmPwd(false);
    setDepartment("");
    setPosition("");
    setUnitQuery("");
    setPosQuery("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error("Vui lòng nhập email và mật khẩu."); return; }
    setLoading(true);
    try {
      const user = await loginWithEmail(email, password);
      setCurrentUser(user);
      toast.success(`Chào mừng, ${user.name}!`);
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Vui lòng nhập họ tên."); return; }
    if (!email) { toast.error("Vui lòng nhập email."); return; }
    if (password.length < 6) { toast.error("Mật khẩu tối thiểu 6 ký tự."); return; }
    if (password !== confirmPwd) { toast.error("Mật khẩu xác nhận không khớp."); return; }
    setLoading(true);
    try {
      const user = await createUserAccount(
        email, password, name.trim(),
        department.trim() || undefined,
        position.trim() || undefined,
      );
      setCurrentUser(user);
      toast.success("Đăng ký thành công! Tài khoản của bạn đang chờ Admin phân quyền.");
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    loginWithGoogle();
  }

  const isRegister = mode === "register";

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold">ARiHA WorkHub</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Quản lý nhiệm vụ<br />
            <span className="text-blue-400">hiệu quả hơn</span>
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed">
            Hệ thống theo dõi & đánh giá hiệu suất nhân viên enterprise-grade.
            Phân quyền theo vai trò, thông báo thông minh, phân tích chuyên sâu.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { label: "Visibility", desc: "Nhìn thấy tiến độ ngay" },
              { label: "Accountability", desc: "Audit trail mọi hành động" },
              { label: "Adaptivity", desc: "Giao diện cá nhân hóa" },
            ].map((item) => (
              <div key={item.label} className="bg-white/10 rounded-xl p-4">
                <div className="text-blue-300 font-semibold text-sm">{item.label}</div>
                <div className="text-slate-300 text-xs mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-slate-500 text-sm">© 2026 ARiHA WorkHub v2.0</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">ARiHA WorkHub</span>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            {/* Mode switcher tabs */}
            <div className="flex rounded-xl bg-white/10 p-1 mb-7">
              <button
                onClick={() => switchMode("login")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition",
                  !isRegister ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                )}
              >
                <LogIn className="w-4 h-4" /> Đăng nhập
              </button>
              <button
                onClick={() => switchMode("register")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition",
                  isRegister ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                )}
              >
                <UserPlus className="w-4 h-4" /> Đăng ký
              </button>
            </div>

            {isRegister ? (
              <>
                <h2 className="text-xl font-bold text-white mb-1">Tạo tài khoản</h2>
                <p className="text-slate-400 text-sm mb-6">
                  Tài khoản sẽ được tạo với vai trò <span className="text-amber-400 font-medium">Khách</span>.
                  Admin sẽ phân quyền phù hợp sau.
                </p>

                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">Họ và tên</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nguyễn Văn A"
                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                        required
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ten@ariha.vn"
                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                        required
                      />
                    </div>
                  </div>

                  {/* Unit — searchable dropdown */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">
                      Đơn vị / Phòng ban
                      <span className="text-slate-500 font-normal ml-1">(tùy chọn)</span>
                    </label>
                    <div ref={unitRef} className="relative">
                      <button
                        type="button"
                        onClick={() => { setUnitOpen(o => !o); }}
                        className={cn(
                          "w-full flex items-center gap-2 pl-10 pr-3 py-3 bg-white/10 border border-white/20 rounded-xl text-sm transition text-left",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500",
                          unitOpen && "ring-2 ring-blue-500 border-blue-500/50",
                          department ? "text-white" : "text-slate-500",
                        )}
                      >
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <span className="flex-1 truncate">{department || "Chọn đơn vị..."}</span>
                        {department && (
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); setDepartment(""); setUnitQuery(""); }}
                            className="text-slate-400 hover:text-slate-200 px-1 cursor-pointer"
                          >✕</span>
                        )}
                        <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", unitOpen && "rotate-180")} />
                      </button>

                      {unitOpen && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
                          <div className="p-2 border-b border-white/10">
                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/10 rounded-lg">
                              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <input
                                autoFocus
                                value={unitQuery}
                                onChange={e => setUnitQuery(e.target.value)}
                                placeholder="Tìm đơn vị..."
                                className="flex-1 bg-transparent text-sm outline-none text-white placeholder-slate-500"
                              />
                            </div>
                          </div>
                          <div className="max-h-44 overflow-y-auto">
                            {filteredUnits.length === 0 ? (
                              <p className="text-xs text-slate-500 text-center py-4">
                                {units.length === 0 ? "Chưa có đơn vị nào trong danh mục" : "Không tìm thấy"}
                              </p>
                            ) : (
                              filteredUnits.map(u => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => { setDepartment(u.name); setUnitQuery(""); setUnitOpen(false); }}
                                  className={cn(
                                    "w-full flex items-start gap-2 px-3 py-2 text-left transition hover:bg-white/10",
                                    department === u.name && "bg-blue-900/40",
                                  )}
                                >
                                  <span className="flex-1 min-w-0">
                                    <span className={cn(
                                      "block text-sm truncate",
                                      u.unitLevel === 3 && "pl-3 border-l border-slate-600",
                                      department === u.name ? "text-blue-300 font-medium" : "text-white",
                                    )}>
                                      {u.name}
                                    </span>
                                    {u.abbr && (
                                      <span className="block text-xs text-slate-500 truncate">{u.abbr}</span>
                                    )}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Position — searchable dropdown */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">
                      Chức vụ
                      <span className="text-slate-500 font-normal ml-1">(tùy chọn)</span>
                    </label>
                    <div ref={posRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setPosOpen(o => !o)}
                        className={cn(
                          "w-full flex items-center gap-2 pl-10 pr-3 py-3 bg-white/10 border border-white/20 rounded-xl text-sm transition text-left",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500",
                          posOpen && "ring-2 ring-blue-500 border-blue-500/50",
                          position ? "text-white" : "text-slate-500",
                        )}
                      >
                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <span className="flex-1 truncate">{position || "Chọn hoặc nhập chức vụ..."}</span>
                        {position && (
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); setPosition(""); setPosQuery(""); }}
                            className="text-slate-400 hover:text-slate-200 px-1 cursor-pointer"
                          >✕</span>
                        )}
                        <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", posOpen && "rotate-180")} />
                      </button>

                      {posOpen && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
                          <div className="p-2 border-b border-white/10">
                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/10 rounded-lg">
                              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <input
                                autoFocus
                                value={posQuery}
                                onChange={e => setPosQuery(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && posQuery.trim()) {
                                    setPosition(posQuery.trim());
                                    setPosQuery("");
                                    setPosOpen(false);
                                  }
                                }}
                                placeholder="Tìm hoặc nhập chức vụ mới..."
                                className="flex-1 bg-transparent text-sm outline-none text-white placeholder-slate-500"
                              />
                            </div>
                          </div>
                          <div className="max-h-44 overflow-y-auto">
                            {/* Nhập tự do nếu không có trong danh sách */}
                            {posQuery.trim() && !filteredPositions.includes(posQuery.trim()) && (
                              <button
                                type="button"
                                onClick={() => { setPosition(posQuery.trim()); setPosQuery(""); setPosOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition"
                              >
                                <span className="text-xs text-slate-500">Dùng:</span>
                                <span className="text-sm text-blue-300 font-medium">"{posQuery.trim()}"</span>
                              </button>
                            )}
                            {filteredPositions.length === 0 && !posQuery.trim() ? (
                              <p className="text-xs text-slate-500 text-center py-4">
                                Chưa có chức vụ nào — nhập để tạo mới
                              </p>
                            ) : (
                              filteredPositions.map(p => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => { setPosition(p); setPosQuery(""); setPosOpen(false); }}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-sm transition hover:bg-white/10",
                                    position === p ? "text-blue-300 font-medium bg-blue-900/40" : "text-white",
                                  )}
                                >
                                  {p}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">Mật khẩu</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type={showPwd ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Tối thiểu 6 ký tự"
                        className="w-full pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                        required
                      />
                      <button type="button" onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">Xác nhận mật khẩu</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type={showConfirmPwd ? "text" : "password"}
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        placeholder="Nhập lại mật khẩu"
                        className={cn(
                          "w-full pl-10 pr-10 py-3 bg-white/10 border rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition text-sm",
                          confirmPwd && confirmPwd !== password
                            ? "border-red-500/60 focus:ring-red-500"
                            : "border-white/20 focus:ring-blue-500"
                        )}
                        required
                      />
                      <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                        {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPwd && confirmPwd !== password && (
                      <p className="text-xs text-red-400 mt-0.5">Mật khẩu không khớp</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 text-sm mt-2"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang tạo tài khoản...</> : "Tạo tài khoản"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-2">Đăng nhập</h2>
                <p className="text-slate-400 text-sm mb-8">Nhập thông tin tài khoản để tiếp tục</p>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ten@ariha.vn"
                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-300">Mật khẩu</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type={showPwd ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                        required
                      />
                      <button type="button" onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang đăng nhập...</> : "Đăng nhập"}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-slate-500 text-xs">hoặc</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 disabled:opacity-60 border border-white/20 text-white font-medium rounded-xl transition flex items-center justify-center gap-3 text-sm"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Đăng nhập bằng Google
                </button>
              </>
            )}

            <p className="text-center text-slate-500 text-xs mt-6">
              {isRegister ? (
                <>Đã có tài khoản?{" "}
                  <button onClick={() => switchMode("login")} className="text-blue-400 hover:text-blue-300 font-medium transition">
                    Đăng nhập
                  </button>
                </>
              ) : (
                <>Chưa có tài khoản?{" "}
                  <button onClick={() => switchMode("register")} className="text-blue-400 hover:text-blue-300 font-medium transition">
                    Đăng ký ngay
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
