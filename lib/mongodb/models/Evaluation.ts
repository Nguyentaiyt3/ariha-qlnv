import mongoose, { Schema, Document } from "mongoose";
import type { Evaluation } from "@/types";

export interface IEvaluation extends Omit<Evaluation, "id">, Document {}

const evaluationSchema = new Schema(
  {
    _id: { type: String, required: true },
    frameworkId: String,
    taskId: String,
    evaluatedUserId: { type: String, required: true, index: true },
    evaluatorId: { type: String, required: true, index: true },
    type: { type: String, enum: ["self", "manager", "peer"] },
    isAnonymous: { type: Boolean, default: false },
    scores: Schema.Types.Mixed,
    comment: String,
    period: { type: String, index: true },
    overallScore: Number,
    createdAt: { type: String, required: true, index: true },
  },
  { _id: false }
);

export const EvaluationModel =
  (mongoose.models.Evaluation as mongoose.Model<IEvaluation>) ||
  mongoose.model<IEvaluation>("Evaluation", evaluationSchema, "evaluations");
