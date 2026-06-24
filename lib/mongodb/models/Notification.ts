import mongoose, { Schema, Document } from "mongoose";
import type { Notification } from "@/types";

export interface INotification extends Omit<Notification, "id">, Document {}

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: String,
    read: { type: Boolean, default: false, index: true },
    priority: { type: String, enum: ["low", "normal", "urgent"], default: "normal" },
    taskId: String,
    actionRequired: { type: Boolean, default: false },
    createdAt: { type: String, required: true, index: true },
  },
  { _id: false }
);

export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<INotification>) ||
  mongoose.model<INotification>("Notification", notificationSchema, "notifications");
