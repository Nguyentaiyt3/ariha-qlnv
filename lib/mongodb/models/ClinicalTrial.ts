import mongoose, { Schema, Document } from "mongoose";
import type { ClinicalTrial } from "@/types";

export interface IClinicalTrial extends Omit<ClinicalTrial, "id">, Document {}

const clinicalTrialSchema = new Schema(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true, index: true },
    title: { type: String, required: true },
    abbreviation: String,
    nctCode: String,

    principalInvestigatorId: { type: String, index: true },
    principalInvestigatorName: String,
    department: { type: String, index: true },
    coordinatorId: { type: String, index: true },

    sponsor: String,
    cro: String,
    smo: String,
    cra: { type: Schema.Types.Mixed },
    crc: { type: Schema.Types.Mixed },

    startPeriod: String,
    endPeriod: String,
    firstEnrollmentDate: String,

    status: { type: String, required: true, default: "feasibility", index: true },
    statusReason: String,
    deploymentDecisionNo: String,

    competitiveEnrollment: Boolean,
    enrollment: { type: Schema.Types.Mixed, default: {} },

    documents: { type: Schema.Types.Mixed, default: [] },
    zaloGroupUrl: String,
    formPrefillUrl: String,
    shortLink: String,

    payments: { type: Schema.Types.Mixed, default: [] },

    createdBy: { type: String, required: true, index: true },
    createdByName: String,
    createdAt: { type: String, required: true },
    updatedAt: String,
  },
  { _id: false, strict: false }  // strict:false preserves any future fields not yet in schema
);

export const ClinicalTrialModel =
  (mongoose.models.ClinicalTrial as mongoose.Model<IClinicalTrial>) ||
  mongoose.model<IClinicalTrial>("ClinicalTrial", clinicalTrialSchema, "clinicalTrials");
