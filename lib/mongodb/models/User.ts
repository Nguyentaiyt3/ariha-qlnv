import mongoose, { Schema, Document } from "mongoose";
import type { User } from "@/types";

export interface IUser extends Omit<User, "id">, Document {
  password: string;
}

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      required: true,
      index: true,
      enum: [
        "guest",
        "staff",
        "teamLead",
        "director",
        "hrAdmin",
        "financeViewer",
        "financeAuditor",
        "financeSupervisor",
      ],
    },
    department: String,
    avatar: String,
    phone: String,
    position: String,
    birthday: String,
    joinDate: String,
    exitDate: String,
    bio: String,
    educationLevel: String,
    major: String,
    academicTitle: String,
    scientificProfile: String,
    workHistory: String,
    mustChangePassword: { type: Boolean, default: false },
    passwordUpdatedAt: String,
    isActive: { type: Boolean, default: true, index: true },
    bankAccount: Schema.Types.Mixed,
    notificationPrefs: Schema.Types.Mixed,
    googleCalendarToken: Schema.Types.Mixed,
    dashboardProfiles: Schema.Types.Mixed,
    createdAt: { type: String, required: true },
    updatedAt: String,
  },
  { _id: false }
);

export const UserModel =
  (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>("User", userSchema, "users");
