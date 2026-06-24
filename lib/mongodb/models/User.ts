import mongoose, { Schema, Document } from "mongoose";
import type { User, UserRole } from "@/types";

export interface IUser extends Omit<User, "id">, Document {}

const userSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true, enum: ["admin", "director", "manager", "staff", "hr", "guest", "hrAdmin"] },
    department: String,
    avatar: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String },
  },
  { _id: false }
);

userSchema.index({ email: 1 });
userSchema.index({ isActive: 1 });

export const UserModel = mongoose.model<IUser>("User", userSchema, "users");
