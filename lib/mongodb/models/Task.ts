import mongoose, { Schema, Document } from "mongoose";
import type { Task } from "@/types";

export interface ITask extends Omit<Task, "id">, Document {}

const taskSchema = new Schema<ITask>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    status: {
      type: String,
      required: true,
      enum: ["pending", "in_progress", "review", "done", "canceled"],
    },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    mainPerformerId: { type: String, required: true },
    creatorId: String,
    stakeholders: [
      {
        userId: String,
        role: String,
        _id: false,
      },
    ],
    startDate: String,
    deadline: String,
    completedAt: String,
    milestone: String,
    riskFlags: [String],
    evaluations: [
      {
        evaluatorId: String,
        score: Number,
        timestamp: String,
        _id: false,
      },
    ],
    createdAt: { type: String, required: true },
    updatedAt: { type: String },
  },
  { _id: false }
);

taskSchema.index({ mainPerformerId: 1 });
taskSchema.index({ creatorId: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ "stakeholders.userId": 1 });

export const TaskModel = mongoose.model<ITask>("Task", taskSchema, "tasks");
