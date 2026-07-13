import mongoose, { Schema, Document } from "mongoose";
import type { FinancialTransaction, AdvanceRequest, ReimbursementRequest, TaskFinancialSummary } from "@/types";

export interface IFinancialTransaction extends Omit<FinancialTransaction, "id">, Document {}

const financialTransactionSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    taskName: String,
    stepId: String,
    createdBy: { type: String, required: true, index: true },
    createdByName: String,
    amount: { type: Number, required: true },
    direction: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
    fundSource: { type: String, enum: ["ADVANCE", "OUT_OF_POCKET", "REVENUE"], required: true },
    category: String,
    description: String,
    proofs: { type: Schema.Types.Mixed, default: [] },
    status: { type: String, enum: ["PENDING_PROOF", "VALID", "REJECTED"], default: "VALID", index: true },
    advanceRequestId: String,
    reimbursementRequestId: String,
    isDisbursement: { type: Boolean, default: false, index: true },
    rejectedReason: String,
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
  },
  { _id: false }
);

export const FinancialTransactionModel =
  (mongoose.models.FinancialTransaction as mongoose.Model<IFinancialTransaction>) ||
  mongoose.model<IFinancialTransaction>("FinancialTransaction", financialTransactionSchema, "financialTransactions");

export interface IAdvanceRequest extends Omit<AdvanceRequest, "id">, Document {}

const advanceRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    stepId: String,
    stepName: String,
    requestedBy: { type: String, required: true, index: true },
    requestedByName: String,
    mode: { type: String, enum: ["ADVANCE", "SELF_PAID"], default: "ADVANCE", index: true },
    amount: { type: Number, required: true },
    purpose: String,
    bankAccount: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "PENDING_SETTLEMENT", "SETTLED"],
      default: "PENDING",
      index: true,
    },
    approvedBy: String,
    approvedByName: String,
    approvedAt: String,
    rejectedReason: String,
    usedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, default: 0 },
    settlementAmountUsed: Number,
    settlementProofs: { type: Schema.Types.Mixed, default: [] },
    settlementNotes: String,
    settlementBankAccount: Schema.Types.Mixed,
    settlementSubmittedAt: String,
    settlementRejectedReason: String,
    settledAt: String,
    settlementDifference: Number,
    settlementType: String,
    settlementApprovedBy: String,
    settlementApprovedByName: String,
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
  },
  { _id: false }
);

export const AdvanceRequestModel =
  (mongoose.models.AdvanceRequest as mongoose.Model<IAdvanceRequest>) ||
  mongoose.model<IAdvanceRequest>("AdvanceRequest", advanceRequestSchema, "advanceRequests");

export interface IReimbursementRequest extends Omit<ReimbursementRequest, "id">, Document {}

const reimbursementRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    transactionId: String,
    stepId: String,
    stepName: String,
    requestedBy: { type: String, required: true, index: true },
    requestedByName: String,
    amount: { type: Number, required: true },
    description: String,
    proofs: { type: Schema.Types.Mixed, default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"],
      default: "DRAFT",
      index: true,
    },
    submittedAt: String,
    approvedBy: String,
    approvedByName: String,
    approvedAt: String,
    paidAt: String,
    rejectedReason: String,
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
  },
  { _id: false }
);

export const ReimbursementRequestModel =
  (mongoose.models.ReimbursementRequest as mongoose.Model<IReimbursementRequest>) ||
  mongoose.model<IReimbursementRequest>("ReimbursementRequest", reimbursementRequestSchema, "reimbursementRequests");

export type ITaskFinancialSummary = Omit<TaskFinancialSummary, "taskId"> & { _id: string } & Document;

const taskFinancialSummarySchema = new Schema(
  {
    _id: { type: String, required: true }, // taskId is the _id
    taskName: String,
    budget: { type: Number, default: 0 },
    totalAdvanced: { type: Number, default: 0 },
    totalAdvanceUsed: { type: Number, default: 0 },
    totalAdvanceRemaining: { type: Number, default: 0 },
    totalOutOfPocket: { type: Number, default: 0 },
    totalPendingReimbursement: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalExpense: { type: Number, default: 0 },
    netCashFlow: { type: Number, default: 0 },
    budgetUtilizationPct: { type: Number, default: 0 },
    financialStatus: { type: String, enum: ["ACTIVE", "RECONCILING", "SETTLED"], default: "ACTIVE" },
    lastUpdated: String,
  },
  { _id: false }
);

export const TaskFinancialSummaryModel =
  (mongoose.models.TaskFinancialSummary as mongoose.Model<ITaskFinancialSummary>) ||
  mongoose.model<ITaskFinancialSummary>("TaskFinancialSummary", taskFinancialSummarySchema, "taskFinancialSummaries");
