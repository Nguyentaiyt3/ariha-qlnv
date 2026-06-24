import mongoose, { Schema, Document } from "mongoose";
import type { Message } from "@/types";

export interface IMessage extends Omit<Message, "id">, Document {}

const messageSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: String,
    senderAvatar: String,
    content: { type: String, required: true },
    mentions: { type: [String], default: [] },
    attachments: { type: Schema.Types.Mixed, default: [] },
    timestamp: { type: String, required: true, index: true },
    edited: Boolean,
    recalled: Boolean,
    deletedFor: { type: [String], default: [] },
  },
  { _id: false }
);

export const MessageModel =
  (mongoose.models.Message as mongoose.Model<IMessage>) ||
  mongoose.model<IMessage>("Message", messageSchema, "messages");
