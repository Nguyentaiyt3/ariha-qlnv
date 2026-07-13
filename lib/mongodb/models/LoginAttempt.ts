import mongoose, { Schema, Document } from "mongoose";

/** Đếm số lần đăng nhập sai theo khoá "ip:email" — TTL tự xoá khi hết cửa sổ thời gian. */
export interface ILoginAttempt extends Document {
  count: number;
  expiresAt: Date;
}

const loginAttemptSchema = new Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

// TTL index: MongoDB tự xoá document sau khi expiresAt trôi qua.
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttemptModel =
  (mongoose.models.LoginAttempt as mongoose.Model<ILoginAttempt>) ||
  mongoose.model<ILoginAttempt>("LoginAttempt", loginAttemptSchema, "loginAttempts");
