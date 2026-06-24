/**
 * Client-safe Auth compatibility layer.
 * All auth operations go through API routes — no JWT/bcrypt/Mongoose in the browser.
 * Server-side code (API routes) imports directly from lib/mongodb/auth.
 */
import type { User } from "@/types";

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export async function createUserAccount(
  email: string,
  password: string,
  name: string,
  role = "guest"
): Promise<{ user: User; token: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Đăng ký thất bại");
  }
  return res.json();
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Đăng nhập thất bại");
  }
  return res.json();
}

export async function loginWithGoogle(): Promise<never> {
  throw new Error("Google login chưa được hỗ trợ");
}

// Re-export types that components may use from the auth module
export type { User };
