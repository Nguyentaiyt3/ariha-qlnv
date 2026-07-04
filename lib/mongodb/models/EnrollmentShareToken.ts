import mongoose, { Schema } from "mongoose";

export interface IEnrollmentShareToken {
  _id: string;
  trialId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string;
  usedBy?: string;
}

const enrollmentShareTokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    trialId: { type: String, required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
    expiresAt: { type: String, required: true, index: true },
    isUsed: { type: Boolean, default: false, index: true },
    usedAt: String,
    usedBy: String,
  },
  { _id: false }
);

export const EnrollmentShareTokenModel =
  mongoose.models.EnrollmentShareToken ||
  mongoose.model<IEnrollmentShareToken>("EnrollmentShareToken", enrollmentShareTokenSchema);
