import mongoose, { Schema, Document } from "mongoose";
import type { Channel, ChannelMessage } from "@/types";

export interface IChannel extends Omit<Channel, "id">, Document {}

const channelSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    type: { type: String, enum: ["public", "private", "department"], default: "public", index: true },
    department: String,
    memberIds: { type: [String], default: [] },
    createdBy: { type: String, required: true, index: true },
    lastMessageAt: String,
    lastMessagePreview: String,
    memberLastRead: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

export const ChannelModel =
  (mongoose.models.Channel as mongoose.Model<IChannel>) ||
  mongoose.model<IChannel>("Channel", channelSchema, "channels");

export interface IChannelMessage extends Omit<ChannelMessage, "id">, Document {}

const channelMessageSchema = new Schema(
  {
    _id: { type: String, required: true },
    channelId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: String,
    senderAvatar: String,
    content: { type: String, required: true },
    attachments: { type: Schema.Types.Mixed, default: [] },
    reactions: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: String, required: true, index: true },
    edited: Boolean,
    recalled: Boolean,
    deletedFor: { type: [String], default: [] },
  },
  { _id: false }
);

export const ChannelMessageModel =
  (mongoose.models.ChannelMessage as mongoose.Model<IChannelMessage>) ||
  mongoose.model<IChannelMessage>("ChannelMessage", channelMessageSchema, "channelMessages");
