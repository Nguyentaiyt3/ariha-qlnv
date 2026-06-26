import mongoose, { Schema, Document } from "mongoose";
import type { UnitPlan } from "@/types";

export interface IUnitPlan extends Omit<UnitPlan, "id">, Document {}

const unitPlanSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    year: { type: Number, required: true, index: true },
    target: { type: Number, required: true, default: 1 },
    unit: { type: String, required: true, default: "lần" },
    metricType: { type: String, enum: ["count", "revenue", "expense"], default: "count" },
    department: String,
    ownerId: String,
    items: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
    updatedAt: String,
  },
  { _id: false }
);

export const UnitPlanModel =
  (mongoose.models.UnitPlan as mongoose.Model<IUnitPlan>) ||
  mongoose.model<IUnitPlan>("UnitPlan", unitPlanSchema, "unitPlans");
