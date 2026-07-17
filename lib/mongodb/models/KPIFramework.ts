import mongoose, { Schema, Document } from "mongoose";
import type { KPIFramework, EvaluationConfig, NckhReviewCriteriaConfig, RiskFlagConfig } from "@/types";

export interface IKPIFramework extends Omit<KPIFramework, "id">, Document {}

const kpiFrameworkSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    department: String,
    year: { type: Number, required: true, index: true },
    period: { type: String, enum: ["monthly", "quarterly", "yearly"] },
    indicators: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

export const KPIFrameworkModel =
  (mongoose.models.KPIFramework as mongoose.Model<IKPIFramework>) ||
  mongoose.model<IKPIFramework>("KPIFramework", kpiFrameworkSchema, "kpiFrameworks");

// EvaluationConfig — singleton stored as a document
export interface IEvaluationConfig extends EvaluationConfig, Document {}

const evalConfigSchema = new Schema(
  {
    _id: { type: String, default: "singleton" },
    weights: Schema.Types.Mixed,
    thresholds: Schema.Types.Mixed,
    updatedAt: String,
    updatedBy: String,
  },
  { _id: false }
);

export const EvaluationConfigModel =
  (mongoose.models.EvaluationConfig as mongoose.Model<IEvaluationConfig>) ||
  mongoose.model<IEvaluationConfig>("EvaluationConfig", evalConfigSchema, "evaluationConfig");

// NckhReviewCriteriaConfig — singleton, bộ tiêu chí chấm điểm phản biện NCKH (GĐ1/GĐ2)
export interface INckhReviewCriteriaConfig extends NckhReviewCriteriaConfig, Document {}

const nckhReviewCriteriaSchema = new Schema(
  {
    _id: { type: String, default: "singleton" },
    proposal: { type: Schema.Types.Mixed, default: [] },
    recognition: { type: Schema.Types.Mixed, default: [] },
    updatedAt: String,
    updatedBy: String,
  },
  { _id: false }
);

export const NckhReviewCriteriaConfigModel =
  (mongoose.models.NckhReviewCriteriaConfig as mongoose.Model<INckhReviewCriteriaConfig>) ||
  mongoose.model<INckhReviewCriteriaConfig>("NckhReviewCriteriaConfig", nckhReviewCriteriaSchema, "nckhReviewCriteria");

// RiskFlagConfig — singleton, ngưỡng cờ rủi ro (số ngày gần deadline + % tiến độ tối thiểu)
export interface IRiskFlagConfig extends RiskFlagConfig, Document {}

const riskFlagConfigSchema = new Schema(
  {
    _id: { type: String, default: "singleton" },
    thresholdDays: Number,
    progressThreshold: Number,
    updatedAt: String,
    updatedBy: String,
  },
  { _id: false }
);

export const RiskFlagConfigModel =
  (mongoose.models.RiskFlagConfig as mongoose.Model<IRiskFlagConfig>) ||
  mongoose.model<IRiskFlagConfig>("RiskFlagConfig", riskFlagConfigSchema, "riskFlagConfig");
