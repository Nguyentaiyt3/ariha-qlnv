import { connectDB } from "./config";
import { UserModel } from "./models/User";
import { TaskModel } from "./models/Task";
import { NotificationModel } from "./models/Notification";
import type {
  User, Task, Notification, EmailLog, CalendarEvent,
  Workflow, MilestoneConfig, KPIFramework, Evaluation, AuditEvent,
  RequestTemplate, WorkRequest, DocFolder, WorkDocument,
  Announcement, AnnouncementComment, Channel, ChannelMessage,
} from "@/types";
import { generateId } from "@/lib/utils";

// ─── USERS ────────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User | null> {
  await connectDB();
  const user = await UserModel.findById(userId);
  if (!user) return null;
  const { password: _, ...rest } = user.toObject();
  return { id: user._id, ...rest } as User;
}

export async function getUsers(): Promise<User[]> {
  await connectDB();
  const users = await UserModel.find({ isActive: true });
  return users.map((u) => {
    const { password: _, ...rest } = u.toObject();
    return { id: u._id, ...rest } as User;
  });
}

export async function saveUser(user: Partial<User> & { id: string }): Promise<void> {
  await connectDB();
  const { id, ...updateData } = user;
  await UserModel.findByIdAndUpdate(id, {
    ...updateData,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await connectDB();
  await UserModel.findByIdAndUpdate(userId, { isActive: false });
}

export function subscribeUsers(callback: (users: User[]) => void) {
  // MongoDB doesn't have real-time subscriptions like Firestore
  // For now, we'll call the callback once. In production, use changeStreams or polling
  getUsers().then(callback).catch(console.error);
  return () => {};
}

// ─── TASKS ────────────────────────────────────────────────────

export async function getTask(taskId: string): Promise<Task | null> {
  await connectDB();
  const task = await TaskModel.findById(taskId);
  if (!task) return null;
  return { id: task._id, ...task.toObject() } as Task;
}

export async function getTasks(): Promise<Task[]> {
  await connectDB();
  const tasks = await TaskModel.find().sort({ createdAt: -1 });
  return tasks.map((t) => ({ id: t._id, ...t.toObject() } as Task));
}

export async function getTasksByUser(userId: string): Promise<Task[]> {
  await connectDB();
  const tasks = await TaskModel.find({
    $or: [
      { mainPerformerId: userId },
      { "stakeholders.userId": userId },
    ],
  }).sort({ createdAt: -1 });
  return tasks.map((t) => ({ id: t._id, ...t.toObject() } as Task));
}

export async function saveTask(task: Partial<Task> & { id: string }): Promise<void> {
  await connectDB();
  const { id, ...updateData } = task;
  await TaskModel.findByIdAndUpdate(id, {
    ...updateData,
    updatedAt: new Date().toISOString(),
  });
}

export async function createTask(task: Omit<Task, "id">): Promise<Task> {
  await connectDB();
  const id = generateId("t");
  const newTask = new TaskModel({
    _id: id,
    ...task,
    createdAt: new Date().toISOString(),
  });
  await newTask.save();
  return { id, ...task };
}

export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
  actor?: { id: string; name: string }
): Promise<void> {
  await connectDB();
  await TaskModel.findByIdAndUpdate(taskId, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await connectDB();
  await TaskModel.findByIdAndDelete(taskId);
}

export function subscribeTasks(callback: (tasks: Task[]) => void) {
  getTasks().then(callback).catch(console.error);
  return () => {};
}

export function subscribeTask(taskId: string, callback: (task: Task | null) => void) {
  getTask(taskId).then(callback).catch(console.error);
  return () => {};
}

// ─── AUDIT TRAIL ──────────────────────────────────────────────
// TODO: Implement audit trail as a sub-collection or separate collection

export async function addAuditEvent(taskId: string, event: Omit<AuditEvent, "id">): Promise<void> {
  await connectDB();
  // For now, store audit events in a separate collection
  // const id = generateId("audit");
  // await db.collection("tasks").doc(taskId).collection("auditTrail").doc(id).set({ ...event, id });
}

export async function getAuditTrail(taskId: string): Promise<AuditEvent[]> {
  // TODO: Implement
  return [];
}

// ─── MESSAGES ────────────────────────────────────────────────
// TODO: Implement task messages as a sub-collection

export async function getMessages(taskId: string) {
  return [];
}

export async function addMessage(taskId: string, message: any) {
  return { id: generateId("msg"), ...message };
}

export async function updateMessage(taskId: string, msgId: string, data: any): Promise<void> {}

export function subscribeMessages(taskId: string, callback: (messages: any[]) => void) {
  callback([]);
  return () => {};
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export async function getNotifications(userId: string): Promise<Notification[]> {
  await connectDB();
  const notifs = await NotificationModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50);
  return notifs.map((n) => ({ id: n._id, ...n.toObject() } as Notification));
}

export async function addNotification(notif: Omit<Notification, "id">): Promise<void> {
  await connectDB();
  const id = generateId("notif");
  const newNotif = new NotificationModel({
    _id: id,
    ...notif,
    createdAt: new Date().toISOString(),
  });
  await newNotif.save();
}

export async function markNotificationRead(userId: string, notifId: string): Promise<void> {
  await connectDB();
  await NotificationModel.findByIdAndUpdate(notifId, { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await connectDB();
  await NotificationModel.updateMany({ userId, read: false }, { read: true });
}

export function subscribeNotifications(userId: string, callback: (notifs: Notification[]) => void) {
  getNotifications(userId).then(callback).catch(console.error);
  return () => {};
}

export async function deleteNotification(userId: string, notifId: string): Promise<void> {
  await connectDB();
  await NotificationModel.findByIdAndDelete(notifId);
}

export async function deleteAllReadNotifications(userId: string): Promise<void> {
  await connectDB();
  await NotificationModel.deleteMany({ userId, read: true });
}

export async function cleanupOldNotifications(userId: string, retentionDays: number): Promise<number> {
  await connectDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await NotificationModel.deleteMany({
    userId,
    read: true,
    createdAt: { $lt: cutoff.toISOString() },
    actionRequired: { $ne: true },
  });

  return result.deletedCount || 0;
}

// ─── EMAIL LOGS ───────────────────────────────────────────────
// TODO: Create EmailLog model

export async function addEmailLog(log: Omit<EmailLog, "id">): Promise<void> {
  // TODO: Implement
}

export async function getEmailLogs(taskId: string): Promise<EmailLog[]> {
  return [];
}

// ─── CALENDAR ────────────────────────────────────────────────
// TODO: Create CalendarEvent model

export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  return [];
}

export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {}

export async function deleteCalendarEvent(eventId: string): Promise<void> {}

export function subscribeCalendarEvents(userId: string, callback: (events: CalendarEvent[]) => void) {
  callback([]);
  return () => {};
}

export async function getPendingCalendarEvents(): Promise<CalendarEvent[]> {
  return [];
}

export async function approveCalendarEvent(id: string, approve: boolean, reason?: string): Promise<void> {}

// ─── WORKFLOWS ────────────────────────────────────────────────
// TODO: Create Workflow model

export async function getWorkflows(canApprove = false, currentUserId?: string): Promise<Workflow[]> {
  return [];
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {}

export async function approveWorkflow(id: string, approve: boolean, reason?: string): Promise<void> {}

export async function deleteWorkflow(workflowId: string): Promise<void> {}

// ─── MILESTONE CONFIG ─────────────────────────────────────────
// TODO: Create MilestoneConfig model

export async function getMilestoneConfigs(): Promise<MilestoneConfig[]> {
  return [];
}

export async function getDefaultMilestoneConfig(): Promise<MilestoneConfig | null> {
  return null;
}

export async function saveMilestoneConfig(config: MilestoneConfig): Promise<void> {}

// ─── KPI FRAMEWORKS ───────────────────────────────────────────
// TODO: Create KPIFramework model

export async function getKPIFrameworks(): Promise<KPIFramework[]> {
  return [];
}

export async function saveKPIFramework(framework: KPIFramework): Promise<void> {}

// ─── EVALUATIONS ──────────────────────────────────────────────
// TODO: Create Evaluation model

export async function getEvaluations(userId: string): Promise<Evaluation[]> {
  return [];
}

export async function getTaskEvaluations(taskId: string): Promise<Evaluation[]> {
  return [];
}

export async function getAllEvaluations(): Promise<Evaluation[]> {
  return [];
}

export async function saveEvaluation(evaluation: Evaluation): Promise<void> {}

// ─── REQUEST TEMPLATES ────────────────────────────────────────
// TODO: Create RequestTemplate model

export async function getRequestTemplates(includeAllStatuses = false): Promise<RequestTemplate[]> {
  return [];
}

export async function getPendingTemplates(): Promise<RequestTemplate[]> {
  return [];
}

export async function approveRequestTemplate(id: string, approve: boolean, reason?: string): Promise<void> {}

export async function saveRequestTemplate(t: RequestTemplate): Promise<void> {}

export async function deleteRequestTemplate(id: string): Promise<void> {}

// ─── WORK REQUESTS ────────────────────────────────────────────
// TODO: Create WorkRequest model

export async function getRequests(): Promise<WorkRequest[]> {
  return [];
}

export async function getRequest(id: string): Promise<WorkRequest | null> {
  return null;
}

export async function saveRequest(r: WorkRequest): Promise<void> {}

export async function updateRequest(id: string, updates: Partial<WorkRequest>): Promise<void> {}

export function subscribeRequests(userId: string, isManager: boolean, callback: (reqs: WorkRequest[]) => void) {
  callback([]);
  return () => {};
}

// ─── DOCUMENTS ────────────────────────────────────────────────
// TODO: Create Document models

export async function getFolders(): Promise<DocFolder[]> {
  return [];
}

export async function saveFolder(f: DocFolder): Promise<void> {}

export async function deleteFolder(id: string): Promise<void> {}

export async function getDocuments(folderId: string | null): Promise<WorkDocument[]> {
  return [];
}

export async function saveDocument(doc_: WorkDocument): Promise<void> {}

export async function deleteDocument(id: string): Promise<void> {}

export function subscribeDocuments(folderId: string | null, callback: (docs: WorkDocument[]) => void) {
  callback([]);
  return () => {};
}

export async function getPendingDocuments(): Promise<WorkDocument[]> {
  return [];
}

export async function approveDocument(id: string, approve: boolean, reason?: string): Promise<void> {}

// ─── ANNOUNCEMENTS ────────────────────────────────────────────
// TODO: Create Announcement model

export async function getAnnouncements(): Promise<Announcement[]> {
  return [];
}

export async function saveAnnouncement(a: Announcement): Promise<void> {}

export async function deleteAnnouncement(id: string): Promise<void> {}

export async function reactToAnnouncement(announcementId: string, emoji: string, userId: string, add: boolean): Promise<void> {}

export async function markAnnouncementViewed(announcementId: string, userId: string): Promise<void> {}

export function subscribeAnnouncements(callback: (items: Announcement[]) => void) {
  callback([]);
  return () => {};
}

export async function updateAnnouncement(id: string, data: Partial<Announcement>): Promise<void> {}

export async function approveAnnouncement(id: string, approve: boolean, reason?: string): Promise<void> {}

export async function getAnnouncementComments(announcementId: string): Promise<AnnouncementComment[]> {
  return [];
}

export async function addAnnouncementComment(announcementId: string, comment: Omit<AnnouncementComment, "id">): Promise<void> {}

// ─── CHANNELS ────────────────────────────────────────────────
// TODO: Create Channel models

export async function getChannels(userId: string): Promise<Channel[]> {
  return [];
}

export async function saveChannel(ch: Channel): Promise<void> {}

export function subscribeChannels(userId: string, callback: (channels: Channel[]) => void) {
  callback([]);
  return () => {};
}

export function subscribeChannelMessages(channelId: string, callback: (msgs: ChannelMessage[]) => void) {
  callback([]);
  return () => {};
}

export async function sendChannelMessage(channelId: string, msg: Omit<ChannelMessage, "id">): Promise<void> {}

export async function updateChannel(id: string, data: Partial<Channel>): Promise<void> {}

export async function deleteChannel(id: string): Promise<void> {}

export async function updateChannelMessage(channelId: string, msgId: string, data: Partial<ChannelMessage>): Promise<void> {}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {}

// ─── EVALUATION CONFIG ────────────────────────────────────────
// TODO: Create EvaluationConfig model

export async function getEvaluationConfig() {
  return {};
}

export async function saveEvaluationConfig(config: any): Promise<void> {}

// ─── PERMISSION CONFIG ────────────────────────────────────────
// TODO: Create PermissionConfig model

export async function getPermissionConfig() {
  return {};
}

export async function savePermissionConfig(config: any): Promise<void> {}
