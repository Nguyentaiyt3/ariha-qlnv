import mongoose, { Schema, Document } from "mongoose";
import type { MilestoneConfig } from "@/types";

export interface IMilestoneConfig extends Omit<MilestoneConfig, "id">, Document {}

const milestoneConfigSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    daysBeforeForPrepare: { type: Number, required: true },
    daysAfterForFinalize: { type: Number, required: true },
    department: String,
    isDefault: { type: Boolean, default: false, index: true },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

export const MilestoneConfigModel =
  (mongoose.models.MilestoneConfig as mongoose.Model<IMilestoneConfig>) ||
  mongoose.model<IMilestoneConfig>("MilestoneConfig", milestoneConfigSchema, "milestoneConfigs");
