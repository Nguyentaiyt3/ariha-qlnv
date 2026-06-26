import mongoose, { Schema, Document } from "mongoose";
import type { Task } from "@/types";

export interface ITask extends Omit<Task, "id">, Document {}

// strict: false lets Mongoose store all Task fields without defining each nested type
const taskSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    status: {
      type: String,
      required: true,
      index: true,
      enum: ["todo", "in_progress", "review", "done", "cancelled"],
    },
    phase: { type: String, enum: ["prepare", "execute", "finalize"] },
    priority: { type: String, index: true, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    deadlineBase: String,
    deadlinePrepare: String,
    deadlineExecute: String,
    deadlineFinalize: String,
    creatorId: { type: String, index: true },
    mainPerformerId: { type: String, required: true, index: true },
    // Complex nested — stored as-is
    stakeholders: { type: Schema.Types.Mixed, default: [] },
    dependencies: { type: [String], default: [] },
    workflowId: String,
    workflowName: String,
    steps: { type: Schema.Types.Mixed, default: [] },
    subtasks: { type: Schema.Types.Mixed, default: [] },
    kpi: Schema.Types.Mixed,
    progress: { type: Number, default: 0 },
    riskFlag: { type: Boolean, default: false },
    timeLogs: { type: Schema.Types.Mixed, default: [] },
    approved: { type: Boolean, default: false },
    approvedBy: String,
    approvedAt: String,
    evaluation: String,
    evaluationRating: Number,
    totalAmount: Number,
    totalIncome: Number,
    totalExpense: Number,
    completionProposal: Schema.Types.Mixed,
    pendingChangeRequest: Schema.Types.Mixed,
    resources: { type: Schema.Types.Mixed, default: [] },
    googleCalendarEventId: String,
    department: String,
    tags: { type: [String], default: [] },
    projectId: String,
    planId: { type: String, index: true },
    planItemParentId: String,
    planContribution: Number,
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
    completedAt: String,
  },
  { _id: false }
);

export const TaskModel =
  (mongoose.models.Task as mongoose.Model<ITask>) ||
  mongoose.model<ITask>("Task", taskSchema, "tasks");
