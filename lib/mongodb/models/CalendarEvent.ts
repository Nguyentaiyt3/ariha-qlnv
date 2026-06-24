import mongoose, { Schema, Document } from "mongoose";
import type { CalendarEvent } from "@/types";

export interface ICalendarEvent extends Omit<CalendarEvent, "id">, Document {}

const calendarEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    userName: String,
    title: { type: String, required: true },
    description: String,
    start: { type: String, required: true, index: true },
    end: { type: String, required: true },
    allDay: Boolean,
    type: { type: String, enum: ["internal", "google", "meeting"], default: "internal" },
    taskId: String,
    meetLink: String,
    location: String,
    status: { type: String, enum: ["pending", "published"], default: "published", index: true },
    changeRequest: Schema.Types.Mixed,
    googleEventId: String,
    color: String,
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

export const CalendarEventModel =
  (mongoose.models.CalendarEvent as mongoose.Model<ICalendarEvent>) ||
  mongoose.model<ICalendarEvent>("CalendarEvent", calendarEventSchema, "calendarEvents");
