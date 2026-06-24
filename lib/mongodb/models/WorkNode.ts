import mongoose, { Schema, Document } from "mongoose";
import type { WorkNode } from "@/types";

export interface IWorkNode extends Omit<WorkNode, "id">, Document {}

const workNodeSchema = new Schema(
  {
    _id: { type: String, required: true },
    rootTaskId: { type: String, required: true, index: true },
    parentId: { type: String, default: null, index: true },
    ancestors: { type: [String], default: [] },
    depth: { type: Number, default: 0 },
    name: { type: String, required: true },
    description: String,
    assigneeId: { type: String, required: true, index: true },
    assigneeName: String,
    approverIds: { type: [String], default: [] },
    inputResources: { type: Schema.Types.Mixed, default: [] },
    prerequisites: { type: [String], default: [] },
    prerequisiteMode: { type: String, enum: ["ALL", "ANY"], default: "ALL" },
    startDate: String,
    dueDate: { type: String, required: true },
    budget: Number,
    checklist: { type: Schema.Types.Mixed, default: [] },
    status: {
      type: String,
      enum: ["locked", "pending", "in_progress", "review", "completed", "rejected"],
      default: "pending",
      index: true,
    },
    progress: { type: Number, default: 0 },
    outputAttachments: { type: Schema.Types.Mixed, default: [] },
    actualCost: Number,
    t1Timeliness: Schema.Types.Mixed,
    t2Quality: Schema.Types.Mixed,
    t3Resources: Schema.Types.Mixed,
    createdAt: { type: String, required: true },
    updatedAt: String,
    createdBy: String,
    createdByName: String,
  },
  { _id: false }
);

export const WorkNodeModel =
  (mongoose.models.WorkNode as mongoose.Model<IWorkNode>) ||
  mongoose.model<IWorkNode>("WorkNode", workNodeSchema, "workNodes");
