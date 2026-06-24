import mongoose, { Schema, Document } from "mongoose";
import type { Workflow } from "@/types";

export interface IWorkflow extends Omit<Workflow, "id">, Document {}

const workflowSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    steps: { type: Schema.Types.Mixed, default: [] },
    nodes: { type: Schema.Types.Mixed, default: [] },
    edges: { type: Schema.Types.Mixed, default: [] },
    departments: { type: [String], default: [] },
    department: String,
    status: { type: String, enum: ["pending", "published"], default: "pending", index: true },
    createdBy: { type: String, required: true, index: true },
    createdByName: String,
    createdAt: { type: String, required: true },
    updatedAt: String,
  },
  { _id: false }
);

export const WorkflowModel =
  (mongoose.models.Workflow as mongoose.Model<IWorkflow>) ||
  mongoose.model<IWorkflow>("Workflow", workflowSchema, "workflows");
