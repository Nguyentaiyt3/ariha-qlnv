import mongoose, { Connection } from "mongoose";
import dns from "dns";

// Trên một số máy Windows, c-ares (Node) tự ý enumerate DNS server hệ thống thành 127.0.0.1
// (bug đã biết khi máy có nhiều network adapter ảo/disconnected), khiến truy vấn SRV record
// của MongoDB Atlas fail với ECONNREFUSED dù DNS thật của máy (qua nslookup/adapter) vẫn ổn.
// Ép dùng DNS công cộng đáng tin cậy để không phụ thuộc vào lỗi enumerate này.
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Bỏ qua nếu môi trường không cho phép set (vd. một số runtime edge) — sẽ fallback về mặc định.
}

let cachedConnection: Connection | null = null;

export async function connectDB(): Promise<Connection> {
  if (cachedConnection) {
    return cachedConnection;
  }

  // Kiểm tra env var lazily (tại thời điểm gọi), KHÔNG throw ở module-load —
  // nếu throw ở top-level, bước "Collecting page data" của `next build` sẽ crash
  // khi biến chưa được cấu hình lúc build (env chỉ cần có ở runtime).
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    cachedConnection = conn.connection;
    console.log("[MongoDB] Connected successfully");
    return cachedConnection;
  } catch (error) {
    console.error("[MongoDB] Connection failed:", error);
    throw error;
  }
}

export function getConnection(): Connection | null {
  return cachedConnection;
}

// JWT Config
export const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
export const JWT_EXPIRE = "7d";
