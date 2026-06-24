import mongoose, { Schema, Document } from "mongoose";
import type { Announcement, AnnouncementComment } from "@/types";

export interface IAnnouncement extends Omit<Announcement, "id">, Document {}

const announcementSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    authorId: { type: String, required: true, index: true },
    authorName: String,
    authorRole: String,
    authorAvatar: String,
    status: { type: String, enum: ["pending", "published"], default: "published", index: true },
    targetRoles: { type: [String], default: [] },
    attachments: { type: Schema.Types.Mixed, default: [] },
    reactions: { type: Schema.Types.Mixed, default: {} },
    pinned: { type: Boolean, default: false, index: true },
    commentsCount: { type: Number, default: 0 },
    viewedBy: { type: [String], default: [] },
    createdAt: { type: String, required: true, index: true },
    updatedAt: String,
  },
  { _id: false }
);

export const AnnouncementModel =
  (mongoose.models.Announcement as mongoose.Model<IAnnouncement>) ||
  mongoose.model<IAnnouncement>("Announcement", announcementSchema, "announcements");

export interface IAnnouncementComment extends Omit<AnnouncementComment, "id">, Document {}

const announcementCommentSchema = new Schema(
  {
    _id: { type: String, required: true },
    announcementId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    authorName: String,
    authorAvatar: String,
    content: { type: String, required: true },
    attachments: { type: Schema.Types.Mixed, default: [] },
    createdAt: { type: String, required: true, index: true },
  },
  { _id: false }
);

export const AnnouncementCommentModel =
  (mongoose.models.AnnouncementComment as mongoose.Model<IAnnouncementComment>) ||
  mongoose.model<IAnnouncementComment>("AnnouncementComment", announcementCommentSchema, "announcementComments");
