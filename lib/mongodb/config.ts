import mongoose, { Connection } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not set");
}

let cachedConnection: Connection | null = null;

export async function connectDB(): Promise<Connection> {
  if (cachedConnection) {
    return cachedConnection;
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
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
