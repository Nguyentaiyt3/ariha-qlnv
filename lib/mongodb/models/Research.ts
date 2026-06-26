import mongoose, { Schema, Document } from "mongoose";
import type { ResearchTopic } from "@/types";

export interface IResearchTopic extends Omit<ResearchTopic, "id">, Document {}

const researchTopicSchema = new Schema(
  {
    _id: { type: String, required: true },
    code: String,
    title: { type: String, required: true },
    field: String,
    principalInvestigatorId: { type: String, required: true, index: true },
    memberIds: { type: [String], default: [] },
    groupName: { type: String, index: true },
    mainPerformerId: { type: String, index: true },
    supervisorId: { type: String, index: true },
    department: String,
    year: { type: Number, required: true, index: true },
    abstract: String,
    compileNote: String,

    stage: { type: String, required: true, default: "init", index: true },
    currentStep: { type: String, required: true, default: "approve_task" },
    steps: { type: Schema.Types.Mixed, default: [] },

    reviews: { type: Schema.Types.Mixed, default: [] },
    councilSessions: { type: Schema.Types.Mixed, default: [] },
    certificates: { type: Schema.Types.Mixed, default: [] },
    documents: { type: Schema.Types.Mixed, default: [] },

    taskId: { type: String, index: true },
    planId: { type: String, index: true },
    approvedToExecute: { type: Boolean, default: false },
    revisionCount: { type: Number, default: 0 },
    revisionNote: String,
    rejectionReason: String,
    groupId: String,

    // ── Registration form fields ──────────────────────────────
    principalInvestigatorName: String,
    memberNames:       String,   // one name per line
    memberDepartments: String,   // one dept abbr per line
    submitterName:     String,
    submitterEmail:    String,
    submitterPhone:    String,
    proposalFileUrl:   String,
    completionTimeline: String,
    proposedReviewers:  String,
    excludedReviewers:  String,
    submissionType:     String,  // "new" | "resubmit"
    registrationNotes:  String,

    // ── Intake screening ─────────────────────────────────────
    intakeStatus:       { type: String, index: true },   // "awaiting" | "passed" | "revision_needed" | "rejected"
    intakeNote:         String,
    intakeRevisionCount: { type: Number, default: 0 },
    intakeLogs:         { type: Schema.Types.Mixed, default: [] },

    createdBy: { type: String, required: true, index: true },
    createdByName: String,
    createdAt: { type: String, required: true },
    updatedAt: String,
  },
  { _id: false, strict: false }  // strict:false preserves any future fields not yet in schema
);

export const ResearchTopicModel =
  (mongoose.models.ResearchTopic as mongoose.Model<IResearchTopic>) ||
  mongoose.model<IResearchTopic>("ResearchTopic", researchTopicSchema, "researchTopics");
