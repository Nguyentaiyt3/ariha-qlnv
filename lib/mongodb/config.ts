import mongoose, { Connection } from "mongoose";

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
