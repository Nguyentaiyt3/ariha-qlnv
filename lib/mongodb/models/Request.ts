import mongoose, { Schema, Document } from "mongoose";
import type { RequestTemplate, WorkRequest } from "@/types";

export interface IRequestTemplate extends Omit<RequestTemplate, "id">, Document {}

const requestTemplateSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    description: String,
    icon: String,
    fields: { type: Schema.Types.Mixed, default: [] },
    approverRole: String,
    isActive: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ["pending", "published"], default: "published", index: true },
    createdBy: { type: String, required: true, index: true },
    createdByName: String,
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

export const RequestTemplateModel =
  (mongoose.models.RequestTemplate as mongoose.Model<IRequestTemplate>) ||
  mongoose.model<IRequestTemplate>("RequestTemplate", requestTemplateSchema, "requestTemplates");

export interface IWorkRequest extends Omit<WorkRequest, "id">, Document {}

const workRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    templateId: { type: String, required: true, index: true },
    templateName: String,
    type: String,
    title: String,
    submittedBy: { type: String, required: true, index: true },
    submittedByName: String,
    submittedByAvatar: String,
    department: String,
    formData: Schema.Types.Mixed,
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending", index: true },
    reviewedBy: String,
    reviewedByName: String,
    reviewedAt: String,
    reviewComment: String,
    attachments: { type: Schema.Types.Mixed, default: [] },
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
  },
  { _id: false }
);

export const WorkRequestModel =
  (mongoose.models.WorkRequest as mongoose.Model<IWorkRequest>) ||
  mongoose.model<IWorkRequest>("WorkRequest", workRequestSchema, "workRequests");
