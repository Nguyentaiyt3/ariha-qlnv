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
    idNumber: String,
    // ── Hồ sơ hợp đồng ── (strict mode Mongoose bỏ qua $set field không khai báo ở đây —
    // PHẢI khai báo mọi field mới của User tại đây, nếu không sẽ âm thầm không lưu được)
    employeeCode: String,
    contractType: String,
    contractStart: String,
    contractEnd: String,
    credentials: Schema.Types.Mixed,
    onboardingTaskId: String,
    offboardingTaskId: String,
    // ── Chức vụ / kiêm nhiệm & vai trò NCKH ──
    positions: Schema.Types.Mixed,
    researchDesignations: { type: [String], default: [] },
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
