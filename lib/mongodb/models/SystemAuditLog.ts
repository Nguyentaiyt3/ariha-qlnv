import mongoose, { Schema, Document } from "mongoose";
import type { SystemAuditLog } from "@/types";

export interface ISystemAuditLog extends Omit<SystemAuditLog, "id">, Document {}

const systemAuditLogSchema = new Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, required: true, index: true },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    entityLabel: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    note: String,
    createdAt: { type: String, required: true, index: true },
  },
  { _id: false }
);

export const SystemAuditLogModel =
  (mongoose.models.SystemAuditLog as mongoose.Model<ISystemAuditLog>) ||
  mongoose.model<ISystemAuditLog>("SystemAuditLog", systemAuditLogSchema, "systemAuditLogs");
