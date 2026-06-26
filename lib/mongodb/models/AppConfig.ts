import mongoose, { Schema } from "mongoose";

const AppConfigSchema = new Schema(
  {
    _id:       { type: String, required: true },
    data:      { type: Schema.Types.Mixed, default: {} },
    updatedAt: { type: String },
  },
  { _id: false }
);

export const AppConfigModel =
  (mongoose.models.AppConfig as mongoose.Model<{ _id: string; data: Record<string, unknown>; updatedAt?: string }>) ??
  mongoose.model<{ _id: string; data: Record<string, unknown>; updatedAt?: string }>("AppConfig", AppConfigSchema);
