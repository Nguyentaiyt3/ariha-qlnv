import mongoose, { Schema, Document } from "mongoose";
import type { ResearchGroup } from "@/types";

export interface IResearchGroup extends Omit<ResearchGroup, "id">, Document {}

const researchGroupSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    year: { type: Number, required: true, index: true },
    field: String,
    description: String,
    mainPerformerId: { type: String, required: true, index: true },
    supervisorId: { type: String, index: true },
    topicIds: { type: [String], default: [] },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: String,
  },
  { _id: false }
);

export const ResearchGroupModel =
  (mongoose.models.ResearchGroup as mongoose.Model<IResearchGroup>) ||
  mongoose.model<IResearchGroup>("ResearchGroup", researchGroupSchema, "researchGroups");
