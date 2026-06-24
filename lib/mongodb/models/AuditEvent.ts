import mongoose, { Schema, Document } from "mongoose";
import type { AuditEvent } from "@/types";

export interface IAuditEvent extends Omit<AuditEvent, "id">, Document {}

const auditEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    userName: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    note: String,
    timestamp: { type: String, required: true, index: true },
  },
  { _id: false }
);

export const AuditEventModel =
  (mongoose.models.AuditEvent as mongoose.Model<IAuditEvent>) ||
  mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema, "auditEvents");
