import mongoose, { Schema, Document } from "mongoose";
import type { Notification } from "@/types";

export interface INotification extends Omit<Notification, "id">, Document {}

const notificationSchema = new Schema<INotification>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    title: String,
    message: String,
    actionRequired: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    taskId: String,
    link: String,
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ read: 1 });

export const NotificationModel = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
  "notifications"
);
