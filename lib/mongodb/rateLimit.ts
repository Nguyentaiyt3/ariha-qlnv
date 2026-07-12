import { connectDB } from "./config";
import { LoginAttemptModel } from "./models/LoginAttempt";

const WINDOW_MS = 15 * 60 * 1000; // 15 phút
const MAX_ATTEMPTS = 5;

/** Lấy IP client từ header (hoạt động sau reverse proxy/Cloudflare Tunnel). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function checkLoginRateLimit(
  key: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  await connectDB();
  const doc = await LoginAttemptModel.findById(key).lean();
  const now = Date.now();

  if (!doc || doc.expiresAt.getTime() < now) return { allowed: true };
  if (doc.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((doc.expiresAt.getTime() - now) / 1000) };
  }
  return { allowed: true };
}

export async function recordFailedLogin(key: string): Promise<void> {
  await connectDB();
  const now = Date.now();
  const doc = await LoginAttemptModel.findById(key);

  if (!doc || doc.expiresAt.getTime() < now) {
    await LoginAttemptModel.findByIdAndUpdate(
      key,
      { count: 1, expiresAt: new Date(now + WINDOW_MS) },
      { upsert: true }
    );
  } else {
    await LoginAttemptModel.findByIdAndUpdate(key, { $inc: { count: 1 } });
  }
}

export async function clearLoginAttempts(key: string): Promise<void> {
  await connectDB();
  await LoginAttemptModel.findByIdAndDelete(key);
}
