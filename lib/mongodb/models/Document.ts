import mongoose, { Schema, Document } from "mongoose";
import type { DocFolder, WorkDocument } from "@/types";

export interface IDocFolder extends Omit<DocFolder, "id">, Document {}

const docFolderSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    parentId: { type: String, default: null, index: true },
    ownerId: { type: String, required: true, index: true },
    department: String,
    sharedWithRoles: { type: [String], default: [] },
    sharedWithUsers: { type: [String], default: [] },
    color: String,
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

export const DocFolderModel =
  (mongoose.models.DocFolder as mongoose.Model<IDocFolder>) ||
  mongoose.model<IDocFolder>("DocFolder", docFolderSchema, "docFolders");

export interface IWorkDocument extends Omit<WorkDocument, "id">, Document {}

const workDocumentSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    folderId: { type: String, default: null, index: true },
    fileUrl: { type: String, required: true },
    fileType: String,
    status: { type: String, enum: ["pending", "published"], default: "published", index: true },
    fileSize: Number,
    mimeType: String,
    ownerId: { type: String, required: true, index: true },
    ownerName: String,
    department: String,
    tags: { type: [String], default: [] },
    sharedWithRoles: { type: [String], default: [] },
    sharedWithUsers: { type: [String], default: [] },
    taskId: String,
    downloadCount: { type: Number, default: 0 },
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
  },
  { _id: false }
);

export const WorkDocumentModel =
  (mongoose.models.WorkDocument as mongoose.Model<IWorkDocument>) ||
  mongoose.model<IWorkDocument>("WorkDocument", workDocumentSchema, "workDocuments");
