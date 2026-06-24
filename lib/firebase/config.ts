// Firebase->MongoDB config adapter
export * from "../mongodb/config";

// MongoDB connection
export async function getDb() {
  const { connectDB } = await import("../mongodb/config");
  return connectDB();
}
