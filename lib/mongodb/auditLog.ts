import { connectDB } from "@/lib/mongodb/config";
import { SystemAuditLogModel } from "@/lib/mongodb/models";
import { generateId } from "@/lib/utils";
import type { SystemAuditLog, UserRole } from "@/types";

interface LogAuditInput {
  actorId: string;
  actorName?: string;
  actorRole?: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
}

/**
 * Ghi 1 dòng nhật ký hệ thống — gọi ở tầng API route (server), không phải tầng UI, để không thể
 * quên gọi hoặc bị client bỏ qua. Append-only: không có hàm sửa/xoá log.
 * KHÔNG throw — ghi log thất bại không được làm hỏng hành động chính đang thực hiện.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await connectDB();
    await SystemAuditLogModel.create({
      _id: generateId("audit"),
      ...input,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[logAudit] Lỗi khi ghi nhật ký hệ thống:", e);
  }
}

export interface AuditLogFilters {
  entityId?: string;
  entityType?: string;
  actorId?: string;
  action?: string;
  limit?: number;
}

export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<SystemAuditLog[]> {
  await connectDB();
  const query: Record<string, unknown> = {};
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.actorId) query.actorId = filters.actorId;
  if (filters.action) query.action = filters.action;

  const logs = await SystemAuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .limit(filters.limit ?? 200)
    .lean();

  return logs.map((l: any) => ({ id: l._id as string, ...l }) as SystemAuditLog);
}
