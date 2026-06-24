/**
 * Client-safe config stub.
 * Server-side code imports directly from lib/mongodb/config.
 * getDb() là placeholder — không dùng trực tiếp trên client.
 */
export async function getDb(): Promise<never> {
  throw new Error("getDb() không dùng được phía client. Dùng fetch() API thay thế.");
}
