import { connectDB } from "./config";
import {
  UserModel, TaskModel, NotificationModel, MessageModel,
  WorkflowModel, MilestoneConfigModel, KPIFrameworkModel, EvaluationConfigModel,
  EvaluationModel, CalendarEventModel, RequestTemplateModel, WorkRequestModel,
  DocFolderModel, WorkDocumentModel, AnnouncementModel, AnnouncementCommentModel,
  ChannelModel, ChannelMessageModel,
  FinancialTransactionModel, AdvanceRequestModel, ReimbursementRequestModel, TaskFinancialSummaryModel,
  WorkNodeModel, AuditEventModel, UnitPlanModel, ResearchTopicModel, ResearchGroupModel,
  AppConfigModel,
} from "./models";
import type {
  User, Task, Notification, Message, EmailLog, CalendarEvent,
  Workflow, MilestoneConfig, KPIFramework, EvaluationConfig, Evaluation, AuditEvent,
  RequestTemplate, WorkRequest, DocFolder, WorkDocument,
  Announcement, AnnouncementComment, Channel, ChannelMessage,
  FinancialTransaction, AdvanceRequest, ReimbursementRequest, TaskFinancialSummary,
  WorkNode, UnitPlan, ResearchTopic, ResearchGroup,
} from "@/types";
import { generateId } from "@/lib/utils";

const now = () => new Date().toISOString();

// ─── USERS ──────────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User | null> {
  await connectDB();
  const user = await UserModel.findById(userId).lean();
  if (!user) return null;
  const { password: _, ...rest } = user as any;
  return { id: String(user._id), ...rest } as User;
}

export async function getUsers(): Promise<User[]> {
  await connectDB();
  const users = await UserModel.find({ isActive: true }).lean();
  return users.map((u: any) => {
    const { password: _, ...rest } = u;
    return { id: u._id as string, ...rest } as User;
  });
}

export async function saveUser(user: Partial<User> & { id: string }): Promise<void> {
  await connectDB();
  const { id, _id: _drop, ...updateData } = user as any;
  await UserModel.findByIdAndUpdate(id, { $set: { ...updateData, updatedAt: now() } }, { upsert: false });
}

export async function deleteUser(userId: string): Promise<void> {
  await connectDB();
  await UserModel.findByIdAndUpdate(userId, { $set: { isActive: false, updatedAt: now() } });
}

export function subscribeUsers(callback: (users: User[]) => void) {
  getUsers().then(callback).catch(console.error);
  return () => {};
}

// ─── TASKS ──────────────────────────────────────────────────────

export async function getTask(taskId: string): Promise<Task | null> {
  await connectDB();
  const task = await TaskModel.findById(taskId).lean();
  if (!task) return null;
  return { id: String(task._id), ...(task as any) } as Task;
}

export async function getTasks(): Promise<Task[]> {
  await connectDB();
  const tasks = await TaskModel.find().sort({ createdAt: -1 }).lean();
  return tasks.map((t: any) => ({ id: t._id as string, ...t }) as Task);
}

export async function getTasksByPlan(planId: string): Promise<Task[]> {
  await connectDB();
  const tasks = await TaskModel.find({ planId }).sort({ createdAt: -1 }).lean();
  return tasks.map((t: any) => ({ id: t._id as string, ...t }) as Task);
}

export async function getTasksByUser(userId: string): Promise<Task[]> {
  await connectDB();
  const tasks = await TaskModel.find({
    $or: [{ mainPerformerId: userId }, { "stakeholders.userId": userId }],
  }).sort({ createdAt: -1 }).lean();
  return tasks.map((t: any) => ({ id: t._id as string, ...t }) as Task);
}

export async function saveTask(task: Partial<Task> & { id: string }): Promise<void> {
  await connectDB();
  const { id, _id: _drop, ...updateData } = task as any;
  await TaskModel.findByIdAndUpdate(id, { $set: { ...updateData, updatedAt: now() } });
}

export async function createTask(task: Omit<Task, "id"> & { id?: string }): Promise<Task> {
  await connectDB();
  const { id: incomingId, ...taskData } = task as any;
  const id: string = incomingId || generateId("t");
  const doc = new TaskModel({ _id: id, ...taskData, createdAt: taskData.createdAt || now(), updatedAt: now() });
  await doc.save();
  return { id, ...taskData } as Task;
}

export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
  _actor?: { id: string; name: string }
): Promise<void> {
  await connectDB();
  await TaskModel.findByIdAndUpdate(taskId, { $set: { ...updates, updatedAt: now() } });
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

export async function addAuditEvent(taskId: string, event: Omit<AuditEvent, "id">): Promise<void> {
  await connectDB();
  const id = generateId("audit");
  await new AuditEventModel({ _id: id, ...event, taskId }).save();
}

export async function getAuditTrail(taskId: string): Promise<AuditEvent[]> {
  await connectDB();
  const events = await AuditEventModel.find({ taskId }).sort({ timestamp: 1 }).lean();
  return events.map((e: any) => ({ id: e._id as string, ...e }) as AuditEvent);
}

// ─── MESSAGES ────────────────────────────────────────────────

export async function getMessages(taskId: string): Promise<Message[]> {
  await connectDB();
  const msgs = await MessageModel.find({ taskId }).sort({ timestamp: 1 }).lean();
  return msgs.map((m: any) => ({ id: m._id as string, ...m }) as Message);
}

export async function addMessage(taskId: string, message: Omit<Message, "id" | "taskId">): Promise<Message> {
  await connectDB();
  const id = generateId("msg");
  const doc = new MessageModel({ _id: id, taskId, ...message });
  await doc.save();
  return { id, taskId, ...message } as Message;
}

export async function updateMessage(taskId: string, msgId: string, data: Partial<Message>): Promise<void> {
  await connectDB();
  await MessageModel.findByIdAndUpdate(msgId, data);
}

export function subscribeMessages(taskId: string, callback: (messages: Message[]) => void) {
  getMessages(taskId).then(callback).catch(console.error);
  return () => {};
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export async function getNotifications(userId: string): Promise<Notification[]> {
  await connectDB();
  const notifs = await NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  return notifs.map((n: any) => ({ id: n._id as string, ...n }) as Notification);
}

export async function addNotification(notif: Omit<Notification, "id">): Promise<void> {
  await connectDB();
  const id = generateId("notif");
  await new NotificationModel({ _id: id, ...notif, createdAt: notif.createdAt || now() }).save();
}

export async function createNotification(notif: Omit<Notification, "id">): Promise<void> {
  return addNotification(notif);
}

export async function markNotificationRead(userId: string, notifId: string): Promise<void> {
  await connectDB();
  await NotificationModel.findByIdAndUpdate(notifId, { $set: { read: true } });
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
    userId, read: true,
    createdAt: { $lt: cutoff.toISOString() },
    actionRequired: { $ne: true },
  });
  return result.deletedCount || 0;
}

// ─── EMAIL LOGS ───────────────────────────────────────────────

export async function addEmailLog(_log: Omit<EmailLog, "id">): Promise<void> {}
export async function getEmailLogs(_taskId: string): Promise<EmailLog[]> { return []; }

// ─── CALENDAR ────────────────────────────────────────────────

export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  await connectDB();
  const events = await CalendarEventModel.find({ userId }).sort({ start: 1 }).lean();
  return events.map((e: any) => ({ id: e._id as string, ...e }) as CalendarEvent);
}

export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  await connectDB();
  const { id, ...data } = event;
  await CalendarEventModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, createdAt: (data as any).createdAt || now() },
    { upsert: true }
  );
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await connectDB();
  await CalendarEventModel.findByIdAndDelete(eventId);
}

export function subscribeCalendarEvents(userId: string, callback: (events: CalendarEvent[]) => void) {
  getCalendarEvents(userId).then(callback).catch(console.error);
  return () => {};
}

export async function getPendingCalendarEvents(): Promise<CalendarEvent[]> {
  await connectDB();
  const events = await CalendarEventModel.find({ "changeRequest.status": "pending" }).lean();
  return events.map((e: any) => ({ id: e._id as string, ...e }) as CalendarEvent);
}

export async function approveCalendarEvent(id: string, approve: boolean, _reason?: string): Promise<void> {
  await connectDB();
  await CalendarEventModel.findByIdAndUpdate(id, {
    "changeRequest.status": approve ? "approved" : "rejected",
  });
}

// ─── WORKFLOWS ────────────────────────────────────────────────

export async function getWorkflows(canApprove = false, currentUserId?: string): Promise<Workflow[]> {
  await connectDB();
  // Approvers see everything. Others see published workflows + their own
  // pending submissions (so creators can track / re-edit while awaiting approval).
  const filter = canApprove
    ? {}
    : currentUserId
    ? { $or: [{ status: "published" }, { createdBy: currentUserId }] }
    : { status: "published" };
  const workflows = await WorkflowModel.find(filter).sort({ createdAt: -1 }).lean();
  return workflows.map((w: any) => ({ id: w._id as string, ...w }) as Workflow);
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  await connectDB();
  const { id, ...data } = workflow;
  await WorkflowModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, updatedAt: now() },
    { upsert: true }
  );
}

export async function approveWorkflow(id: string, approve: boolean, _reason?: string): Promise<void> {
  await connectDB();
  await WorkflowModel.findByIdAndUpdate(id, { $set: { status: approve ? "published" : "pending", updatedAt: now() } });
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  await connectDB();
  await WorkflowModel.findByIdAndDelete(workflowId);
}

// ─── MILESTONE CONFIG ─────────────────────────────────────────

export async function getMilestoneConfigs(): Promise<MilestoneConfig[]> {
  await connectDB();
  const configs = await MilestoneConfigModel.find().lean();
  return configs.map((c: any) => ({ id: c._id as string, ...c }) as MilestoneConfig);
}

export async function getDefaultMilestoneConfig(): Promise<MilestoneConfig | null> {
  await connectDB();
  const config = await MilestoneConfigModel.findOne({ isDefault: true }).lean();
  if (!config) return null;
  return { id: (config as any)._id as string, ...(config as any) } as MilestoneConfig;
}

export async function saveMilestoneConfig(config: MilestoneConfig): Promise<void> {
  await connectDB();
  const { id, ...data } = config;
  if (data.isDefault) {
    await MilestoneConfigModel.updateMany({ isDefault: true }, { isDefault: false });
  }
  await MilestoneConfigModel.findByIdAndUpdate(
    id,
    { _id: id, ...data },
    { upsert: true }
  );
}

// ─── KPI FRAMEWORKS ───────────────────────────────────────────

export async function getKPIFrameworks(): Promise<KPIFramework[]> {
  await connectDB();
  const frameworks = await KPIFrameworkModel.find().sort({ year: -1 }).lean();
  return frameworks.map((f: any) => ({ id: f._id as string, ...f }) as KPIFramework);
}

export async function saveKPIFramework(framework: KPIFramework): Promise<void> {
  await connectDB();
  const { id, ...data } = framework;
  await KPIFrameworkModel.findByIdAndUpdate(id, { $set: { ...data }, $setOnInsert: { createdAt: (data as any).createdAt || now() } }, { upsert: true });
}

// ─── UNIT PLANS (kế hoạch chỉ tiêu đơn vị) ────────────────────

export async function getUnitPlans(): Promise<UnitPlan[]> {
  await connectDB();
  const plans = await UnitPlanModel.find().sort({ year: -1, createdAt: -1 }).lean();
  return plans.map((p: any) => ({ id: p._id as string, ...p }) as UnitPlan);
}

export async function getUnitPlan(planId: string): Promise<UnitPlan | null> {
  await connectDB();
  const p = await UnitPlanModel.findById(planId).lean();
  if (!p) return null;
  return { id: (p as any)._id as string, ...(p as any) } as UnitPlan;
}

export async function createUnitPlan(plan: Omit<UnitPlan, "id" | "createdAt">): Promise<UnitPlan> {
  await connectDB();
  const id = generateId("plan");
  const doc = { _id: id, ...plan, items: plan.items ?? [], createdAt: now(), updatedAt: now() };
  await UnitPlanModel.create(doc);
  const { _id, ...rest } = doc;
  return { id, ...rest } as UnitPlan;
}

export async function updateUnitPlan(planId: string, data: Partial<UnitPlan>): Promise<void> {
  await connectDB();
  const { id, ...rest } = data;
  await UnitPlanModel.findByIdAndUpdate(planId, { $set: { ...rest, updatedAt: now() } });
}

export async function deleteUnitPlan(planId: string): Promise<void> {
  await connectDB();
  await UnitPlanModel.findByIdAndDelete(planId);
}

// ─── NGHIÊN CỨU KHOA HỌC ──────────────────────────────────────

export async function getResearchTopics(taskId?: string, userId?: string): Promise<ResearchTopic[]> {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (taskId) filter.taskId = taskId;
  if (userId) {
    // Return only topics where the user is PI, member, or creator
    filter.$or = [
      { principalInvestigatorId: userId },
      { memberIds: userId },
      { createdBy: userId },
    ];
  }
  const topics = await ResearchTopicModel.find(filter).sort({ year: -1, createdAt: -1 }).lean();
  return topics.map((t: any) => {
    const { _id, ...rest } = t;
    return { id: _id as string, ...rest } as ResearchTopic;
  });
}

export async function getResearchTopic(id: string): Promise<ResearchTopic | null> {
  await connectDB();
  const t = await ResearchTopicModel.findById(id).lean();
  if (!t) return null;
  const { _id, ...rest } = t as any;
  return { id: _id as string, ...rest } as ResearchTopic;
}

export async function createResearchTopic(topic: ResearchTopic): Promise<void> {
  await connectDB();
  const { id, ...data } = topic;
  // Explicit $set prevents Mongoose 8 from doing a full-document replacement.
  // $setOnInsert keeps createdAt write-once (not overwritten on subsequent upserts).
  const { createdAt, ...fields } = data as any;
  await ResearchTopicModel.findByIdAndUpdate(
    id,
    {
      $set:          { ...fields, updatedAt: now() },
      $setOnInsert:  { createdAt: createdAt || now() },
    },
    { upsert: true }
  );
}

export async function updateResearchTopic(id: string, data: Partial<ResearchTopic>): Promise<void> {
  await connectDB();
  const { id: _omit, _id: _omitId, createdAt: _omitCreated, ...rest } = data as any;
  // Explicit $set prevents full-document replacement in Mongoose 8.
  await ResearchTopicModel.findByIdAndUpdate(id, { $set: { ...rest, updatedAt: now() } });
}

export async function deleteResearchTopic(id: string): Promise<void> {
  await connectDB();
  await ResearchTopicModel.findByIdAndDelete(id);
}

/** Returns true if userId is a mainPerformer, creator, or stakeholder of any task
 *  that has at least one research topic linked to it. Used to grant monitor access. */
export async function checkResearchTaskParticipant(userId: string): Promise<boolean> {
  await connectDB();
  const taskIds: string[] = await ResearchTopicModel.distinct("taskId", {
    taskId: { $exists: true, $nin: [null, ""] },
  });
  if (!taskIds.length) return false;
  const count = await TaskModel.countDocuments({
    _id: { $in: taskIds },
    $or: [
      { mainPerformerId: userId },
      { creatorId: userId },
      { "stakeholders.userId": userId },
    ],
  });
  return count > 0;
}

// ─── EVALUATIONS ──────────────────────────────────────────────

export async function getEvaluations(userId: string): Promise<Evaluation[]> {
  await connectDB();
  const evals = await EvaluationModel.find({ evaluatedUserId: userId }).sort({ createdAt: -1 }).lean();
  return evals.map((e: any) => ({ id: e._id as string, ...e }) as Evaluation);
}

export async function getTaskEvaluations(taskId: string): Promise<Evaluation[]> {
  await connectDB();
  const evals = await EvaluationModel.find({ taskId }).lean();
  return evals.map((e: any) => ({ id: e._id as string, ...e }) as Evaluation);
}

export async function getAllEvaluations(): Promise<Evaluation[]> {
  await connectDB();
  const evals = await EvaluationModel.find().sort({ createdAt: -1 }).lean();
  return evals.map((e: any) => ({ id: e._id as string, ...e }) as Evaluation);
}

export async function saveEvaluation(evaluation: Evaluation): Promise<void> {
  await connectDB();
  const { id, ...data } = evaluation;
  await EvaluationModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, createdAt: data.createdAt || now() },
    { upsert: true }
  );
}

// ─── EVALUATION CONFIG ────────────────────────────────────────

const DEFAULT_EVAL_CONFIG: EvaluationConfig = {
  weights: { t1: 0.30, t2: 0.50, t3: 0.20 },
  thresholds: { xuatSac: 10, hoanThanhTot: 8, hoanThanh: 5 },
};

export async function getEvaluationConfig(): Promise<EvaluationConfig> {
  await connectDB();
  const config = await EvaluationConfigModel.findById("singleton").lean();
  if (!config) return DEFAULT_EVAL_CONFIG;
  return config as unknown as EvaluationConfig;
}

export async function saveEvaluationConfig(config: Partial<EvaluationConfig>): Promise<void> {
  await connectDB();
  await EvaluationConfigModel.findByIdAndUpdate(
    "singleton",
    { ...config, updatedAt: now() },
    { upsert: true }
  );
}

// ─── REQUEST TEMPLATES ────────────────────────────────────────

export async function getRequestTemplates(includeAllStatuses = false): Promise<RequestTemplate[]> {
  await connectDB();
  const filter = includeAllStatuses ? {} : { status: "published", isActive: true };
  const templates = await RequestTemplateModel.find(filter).sort({ createdAt: -1 }).lean();
  return templates.map((t: any) => ({ id: t._id as string, ...t }) as RequestTemplate);
}

export async function getPendingTemplates(): Promise<RequestTemplate[]> {
  await connectDB();
  const templates = await RequestTemplateModel.find({ status: "pending" }).lean();
  return templates.map((t: any) => ({ id: t._id as string, ...t }) as RequestTemplate);
}

export async function approveRequestTemplate(id: string, approve: boolean, _reason?: string): Promise<void> {
  await connectDB();
  await RequestTemplateModel.findByIdAndUpdate(id, { $set: { status: approve ? "published" : "pending" } });
}

export async function saveRequestTemplate(t: RequestTemplate): Promise<void> {
  await connectDB();
  const { id, ...data } = t;
  await RequestTemplateModel.findByIdAndUpdate(id, { $set: { ...data } }, { upsert: true });
}

export async function deleteRequestTemplate(id: string): Promise<void> {
  await connectDB();
  await RequestTemplateModel.findByIdAndDelete(id);
}

// ─── WORK REQUESTS ────────────────────────────────────────────

export async function getRequests(): Promise<WorkRequest[]> {
  await connectDB();
  const requests = await WorkRequestModel.find().sort({ createdAt: -1 }).lean();
  return requests.map((r: any) => ({ id: r._id as string, ...r }) as WorkRequest);
}

export async function getRequest(id: string): Promise<WorkRequest | null> {
  await connectDB();
  const request = await WorkRequestModel.findById(id).lean();
  if (!request) return null;
  return { id: (request as any)._id as string, ...(request as any) } as WorkRequest;
}

export async function saveRequest(r: WorkRequest): Promise<void> {
  await connectDB();
  const { id, ...data } = r;
  await WorkRequestModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, createdAt: data.createdAt || now(), updatedAt: now() },
    { upsert: true }
  );
}

export async function updateRequest(id: string, updates: Partial<WorkRequest>): Promise<void> {
  await connectDB();
  await WorkRequestModel.findByIdAndUpdate(id, { $set: { ...updates, updatedAt: now() } });
}

export function subscribeRequests(userId: string, isManager: boolean, callback: (reqs: WorkRequest[]) => void) {
  getRequests().then((all) => {
    const filtered = isManager ? all : all.filter((r) => r.submittedBy === userId);
    callback(filtered);
  }).catch(console.error);
  return () => {};
}

// ─── DOCUMENTS ────────────────────────────────────────────────

export async function getFolders(): Promise<DocFolder[]> {
  await connectDB();
  const folders = await DocFolderModel.find().lean();
  return folders.map((f: any) => ({ id: f._id as string, ...f }) as DocFolder);
}

export async function saveFolder(f: DocFolder): Promise<void> {
  await connectDB();
  const { id, ...data } = f;
  await DocFolderModel.findByIdAndUpdate(id, { $set: { ...data } }, { upsert: true });
}

export async function deleteFolder(id: string): Promise<void> {
  await connectDB();
  await DocFolderModel.findByIdAndDelete(id);
  await WorkDocumentModel.deleteMany({ folderId: id });
}

export async function getDocuments(folderId: string | null): Promise<WorkDocument[]> {
  await connectDB();
  const docs = await WorkDocumentModel.find({ folderId }).sort({ createdAt: -1 }).lean();
  return docs.map((d: any) => ({ id: d._id as string, ...d }) as WorkDocument);
}

export async function saveDocument(doc: WorkDocument): Promise<void> {
  await connectDB();
  const { id, ...data } = doc;
  await WorkDocumentModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, createdAt: data.createdAt || now(), updatedAt: now() },
    { upsert: true }
  );
}

export async function deleteDocument(id: string): Promise<void> {
  await connectDB();
  await WorkDocumentModel.findByIdAndDelete(id);
}

export function subscribeDocuments(folderId: string | null, callback: (docs: WorkDocument[]) => void) {
  getDocuments(folderId).then(callback).catch(console.error);
  return () => {};
}

export async function getPendingDocuments(): Promise<WorkDocument[]> {
  await connectDB();
  const docs = await WorkDocumentModel.find({ status: "pending" }).lean();
  return docs.map((d: any) => ({ id: d._id as string, ...d }) as WorkDocument);
}

export async function approveDocument(id: string, approve: boolean, _reason?: string): Promise<void> {
  await connectDB();
  await WorkDocumentModel.findByIdAndUpdate(id, {
    status: approve ? "published" : "pending",
    updatedAt: now(),
  });
}

// ─── ANNOUNCEMENTS ────────────────────────────────────────────

export async function getAnnouncements(): Promise<Announcement[]> {
  await connectDB();
  const announcements = await AnnouncementModel.find({ status: "published" })
    .sort({ pinned: -1, createdAt: -1 })
    .lean();
  return announcements.map((a: any) => ({ id: a._id as string, ...a }) as Announcement);
}

export async function saveAnnouncement(a: Announcement): Promise<void> {
  await connectDB();
  const { id, ...data } = a;
  await AnnouncementModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, createdAt: data.createdAt || now(), updatedAt: now() },
    { upsert: true }
  );
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await connectDB();
  await AnnouncementModel.findByIdAndDelete(id);
  await AnnouncementCommentModel.deleteMany({ announcementId: id });
}

export async function reactToAnnouncement(
  announcementId: string, emoji: string, userId: string, add: boolean
): Promise<void> {
  await connectDB();
  const ann = await AnnouncementModel.findById(announcementId);
  if (!ann) return;
  const reactions = (ann.reactions as any) || {};
  const users: string[] = reactions[emoji] || [];
  if (add) {
    if (!users.includes(userId)) reactions[emoji] = [...users, userId];
  } else {
    reactions[emoji] = users.filter((u: string) => u !== userId);
  }
  ann.reactions = reactions;
  ann.markModified("reactions");
  await ann.save();
}

export async function markAnnouncementViewed(announcementId: string, userId: string): Promise<void> {
  await connectDB();
  await AnnouncementModel.findByIdAndUpdate(announcementId, {
    $addToSet: { viewedBy: userId },
  });
}

export function subscribeAnnouncements(callback: (items: Announcement[]) => void) {
  getAnnouncements().then(callback).catch(console.error);
  return () => {};
}

export async function updateAnnouncement(id: string, data: Partial<Announcement>): Promise<void> {
  await connectDB();
  await AnnouncementModel.findByIdAndUpdate(id, { $set: { ...data, updatedAt: now() } });
}

export async function approveAnnouncement(id: string, approve: boolean, _reason?: string): Promise<void> {
  await connectDB();
  await AnnouncementModel.findByIdAndUpdate(id, {
    status: approve ? "published" : "pending",
    updatedAt: now(),
  });
}

export async function getAnnouncementComments(announcementId: string): Promise<AnnouncementComment[]> {
  await connectDB();
  const comments = await AnnouncementCommentModel.find({ announcementId }).sort({ createdAt: 1 }).lean();
  return comments.map((c: any) => ({ id: c._id as string, ...c }) as AnnouncementComment);
}

export async function addAnnouncementComment(
  announcementId: string, comment: Omit<AnnouncementComment, "id">
): Promise<void> {
  await connectDB();
  const id = generateId("comment");
  await new AnnouncementCommentModel({ _id: id, ...comment }).save();
  await AnnouncementModel.findByIdAndUpdate(announcementId, { $inc: { commentsCount: 1 }, $set: { updatedAt: now() } });
}

// ─── CHANNELS ────────────────────────────────────────────────

export async function getChannels(userId: string): Promise<Channel[]> {
  await connectDB();
  const channels = await ChannelModel.find({
    $or: [{ type: "public" }, { memberIds: userId }],
  }).sort({ lastMessageAt: -1 }).lean();
  return channels.map((c: any) => ({ id: c._id as string, ...c }) as Channel);
}

export async function saveChannel(ch: Channel): Promise<void> {
  await connectDB();
  const { id, ...data } = ch;
  await ChannelModel.findByIdAndUpdate(id, { $set: { ...data } }, { upsert: true });
}

export function subscribeChannels(userId: string, callback: (channels: Channel[]) => void) {
  getChannels(userId).then(callback).catch(console.error);
  return () => {};
}

export async function getChannelMessages(channelId: string, limit = 50): Promise<ChannelMessage[]> {
  await connectDB();
  const msgs = await ChannelMessageModel.find({ channelId })
    .sort({ timestamp: -1 }).limit(limit).lean();
  return msgs.reverse().map((m: any) => ({ id: m._id as string, ...m }) as ChannelMessage);
}

export function subscribeChannelMessages(channelId: string, callback: (msgs: ChannelMessage[]) => void) {
  getChannelMessages(channelId).then(callback).catch(console.error);
  return () => {};
}

export async function sendChannelMessage(channelId: string, msg: Omit<ChannelMessage, "id">): Promise<void> {
  await connectDB();
  const id = generateId("cmsg");
  await new ChannelMessageModel({ _id: id, ...msg }).save();
  await ChannelModel.findByIdAndUpdate(channelId, {
    lastMessageAt: msg.timestamp,
    lastMessagePreview: (msg.content || "").slice(0, 60),
  });
}

export async function updateChannel(id: string, data: Partial<Channel>): Promise<void> {
  await connectDB();
  await ChannelModel.findByIdAndUpdate(id, data);
}

export async function deleteChannel(id: string): Promise<void> {
  await connectDB();
  await ChannelModel.findByIdAndDelete(id);
  await ChannelMessageModel.deleteMany({ channelId: id });
}

export async function updateChannelMessage(
  _channelId: string, msgId: string, data: Partial<ChannelMessage>
): Promise<void> {
  await connectDB();
  await ChannelMessageModel.findByIdAndUpdate(msgId, data);
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  await connectDB();
  await ChannelModel.findByIdAndUpdate(channelId, {
    [`memberLastRead.${userId}`]: now(),
  });
}

// ─── FINANCE ─────────────────────────────────────────────────

export async function getAllFinancialTransactions(taskId?: string): Promise<FinancialTransaction[]> {
  await connectDB();
  const filter = taskId ? { taskId } : {};
  const txns = await FinancialTransactionModel.find(filter).sort({ createdAt: -1 }).lean();
  return txns.map((t: any) => ({ id: t._id as string, ...t }) as FinancialTransaction);
}

export async function createFinancialTransaction(txn: Omit<FinancialTransaction, "id">): Promise<FinancialTransaction> {
  await connectDB();
  const id = generateId("txn");
  await new FinancialTransactionModel({ _id: id, ...txn, createdAt: txn.createdAt || now(), updatedAt: now() }).save();
  return { id, ...txn } as FinancialTransaction;
}

export async function getAllAdvanceRequests(): Promise<AdvanceRequest[]> {
  await connectDB();
  const requests = await AdvanceRequestModel.find().sort({ createdAt: -1 }).lean();
  return requests.map((r: any) => ({ id: r._id as string, ...r }) as AdvanceRequest);
}

export async function createAdvanceRequest(data: Omit<AdvanceRequest, "id">): Promise<AdvanceRequest> {
  await connectDB();
  const id = generateId("adv");
  await new AdvanceRequestModel({ _id: id, ...data, createdAt: data.createdAt || now(), updatedAt: now() }).save();
  return { id, ...data } as AdvanceRequest;
}

export async function updateAdvanceRequest(id: string, updates: Partial<AdvanceRequest>): Promise<void> {
  await connectDB();
  await AdvanceRequestModel.findByIdAndUpdate(id, { $set: { ...updates, updatedAt: now() } });
}

export async function getAllReimbursementRequests(): Promise<ReimbursementRequest[]> {
  await connectDB();
  const requests = await ReimbursementRequestModel.find().sort({ createdAt: -1 }).lean();
  return requests.map((r: any) => ({ id: r._id as string, ...r }) as ReimbursementRequest);
}

export async function createReimbursementRequest(data: Omit<ReimbursementRequest, "id">): Promise<ReimbursementRequest> {
  await connectDB();
  const id = generateId("reimb");
  await new ReimbursementRequestModel({ _id: id, ...data, createdAt: data.createdAt || now(), updatedAt: now() }).save();
  return { id, ...data } as ReimbursementRequest;
}

export async function updateReimbursementRequest(id: string, updates: Partial<ReimbursementRequest>): Promise<void> {
  await connectDB();
  await ReimbursementRequestModel.findByIdAndUpdate(id, { $set: { ...updates, updatedAt: now() } });
}

export async function getTaskFinancialSummary(taskId: string): Promise<TaskFinancialSummary | null> {
  await connectDB();
  const summary = await TaskFinancialSummaryModel.findById(taskId).lean();
  if (!summary) return null;
  return { taskId, ...(summary as any) } as TaskFinancialSummary;
}

export async function saveTaskFinancialSummary(summary: TaskFinancialSummary): Promise<void> {
  await connectDB();
  const { taskId, ...data } = summary;
  await TaskFinancialSummaryModel.findByIdAndUpdate(
    taskId,
    { _id: taskId, ...data, lastUpdated: now() },
    { upsert: true }
  );
}

// ─── WORK NODES ───────────────────────────────────────────────

export async function getWorkNode(nodeId: string): Promise<WorkNode | null> {
  await connectDB();
  const node = await WorkNodeModel.findById(nodeId).lean();
  if (!node) return null;
  return { id: (node as any)._id as string, ...(node as any) } as WorkNode;
}

export async function saveWorkNode(node: WorkNode): Promise<void> {
  await connectDB();
  const { id, ...data } = node;
  await WorkNodeModel.findByIdAndUpdate(
    id,
    { _id: id, ...data, updatedAt: now() },
    { upsert: true }
  );
}

export async function getWorkNodesByTask(taskId: string): Promise<WorkNode[]> {
  await connectDB();
  const nodes = await WorkNodeModel.find({ rootTaskId: taskId }).sort({ depth: 1, createdAt: 1 }).lean();
  return nodes.map((n: any) => ({ id: n._id as string, ...n }) as WorkNode);
}

// ─── FINANCE EXTENDED ────────────────────────────────────────

export async function addProofToTransaction(txId: string, proof: Record<string, unknown>): Promise<void> {
  await connectDB();
  await FinancialTransactionModel.findByIdAndUpdate(txId, {
    $push: { proofs: proof },
    status: "VALID",
    updatedAt: now(),
  });
}

export async function submitAdvanceSettlement(advId: string, data: {
  amountUsed: number;
  proofs?: unknown[];
  notes?: string;
}): Promise<void> {
  await connectDB();
  const adv = await AdvanceRequestModel.findById(advId).lean() as any;
  if (!adv) throw new Error("Đơn tạm ứng không tồn tại.");
  await AdvanceRequestModel.findByIdAndUpdate(advId, {
    status: "PENDING_SETTLEMENT",
    settlementAmountUsed: data.amountUsed,
    settlementProofs: data.proofs ?? [],
    settlementNotes: data.notes,
    settlementSubmittedAt: now(),
    remainingAmount: adv.amount - data.amountUsed,
    updatedAt: now(),
  });
}

export async function recomputeFinancialSummary(taskId: string): Promise<TaskFinancialSummary> {
  await connectDB();
  const txns = await FinancialTransactionModel.find({ taskId, status: "VALID" }).lean();
  const advances = await AdvanceRequestModel.find({ taskId }).lean();

  const totalAdvanced = (advances as any[])
    .filter((a) => ["APPROVED", "PENDING_SETTLEMENT", "SETTLED"].includes(a.status))
    .reduce((s: number, a: any) => s + (a.amount ?? 0), 0);

  const totalAdvanceUsed = (txns as any[])
    .filter((t) => t.direction === "DEBIT" && t.fundSource === "ADVANCE")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const totalOutOfPocket = (txns as any[])
    .filter((t) => t.direction === "DEBIT" && t.fundSource === "OUT_OF_POCKET")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const totalRevenue = (txns as any[])
    .filter((t) => t.direction === "CREDIT" && t.fundSource === "REVENUE")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const totalExpense = (txns as any[])
    .filter((t) => t.direction === "DEBIT")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const pendingReimb = await ReimbursementRequestModel.find({ taskId, status: { $in: ["SUBMITTED", "APPROVED"] } }).lean();
  const totalPendingReimbursement = (pendingReimb as any[]).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

  const taskDoc = await TaskModel.findById(taskId).lean() as any;
  const budget = taskDoc?.budget ?? 0;
  const netCashFlow = totalRevenue - totalExpense;
  const budgetUtilizationPct = budget > 0 ? Math.round((totalExpense / budget) * 100) : 0;

  const summary: TaskFinancialSummary = {
    taskId,
    taskName: taskDoc?.name,
    budget,
    totalAdvanced,
    totalAdvanceUsed,
    totalAdvanceRemaining: totalAdvanced - totalAdvanceUsed,
    totalOutOfPocket,
    totalPendingReimbursement,
    totalRevenue,
    totalExpense,
    netCashFlow,
    budgetUtilizationPct,
    financialStatus: "ACTIVE",
    lastUpdated: now(),
  };

  await saveTaskFinancialSummary(summary);
  return summary;
}

export async function reconcileAdvance(taskId: string, settledBy: string): Promise<{
  difference: number;
  settlementType: "RETURN_TO_COMPANY" | "PAY_EMPLOYEE_ADDITIONAL" | "BALANCED";
  totalAdvanced: number;
  totalActualSpent: number;
  settledRequests: string[];
}> {
  await connectDB();

  const pendingProof = await FinancialTransactionModel.countDocuments({ taskId, status: "PENDING_PROOF" });
  if (pendingProof > 0) throw new Error("Còn giao dịch thiếu chứng từ. Vui lòng bổ sung trước khi quyết toán.");

  const approvedAdvances = await AdvanceRequestModel.find({
    taskId,
    status: { $in: ["APPROVED", "PENDING_SETTLEMENT"] },
  }).lean() as any[];

  if (!approvedAdvances.length) throw new Error("Không có đơn tạm ứng nào đã được duyệt.");

  const totalAdvanced = approvedAdvances.reduce((s: number, a: any) => s + (a.amount ?? 0), 0);

  const advanceTxns = await FinancialTransactionModel.find({
    taskId, status: "VALID", direction: "DEBIT", fundSource: "ADVANCE",
  }).lean() as any[];
  const totalActualSpent = advanceTxns.reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const difference = totalAdvanced - totalActualSpent;
  const settlementType = difference > 0
    ? "RETURN_TO_COMPANY"
    : difference < 0 ? "PAY_EMPLOYEE_ADDITIONAL" : "BALANCED";

  const settledRequests = approvedAdvances.map((a: any) => a._id as string);
  await AdvanceRequestModel.updateMany(
    { _id: { $in: settledRequests } },
    { status: "SETTLED", settledAt: now(), settlementApprovedBy: settledBy, settlementDifference: difference, settlementType, updatedAt: now() }
  );

  await recomputeFinancialSummary(taskId);

  return { difference, settlementType, totalAdvanced, totalActualSpent, settledRequests };
}

// ─── RESEARCH GROUPS ──────────────────────────────────────────

export async function getResearchGroups(year?: number): Promise<ResearchGroup[]> {
  await connectDB();
  const filter = year ? { year } : {};
  const groups = await ResearchGroupModel.find(filter).sort({ year: -1, name: 1 }).lean();
  return groups.map((g: any) => ({ id: g._id as string, ...g }) as ResearchGroup);
}

export async function getResearchGroup(id: string): Promise<ResearchGroup | null> {
  await connectDB();
  const g = await ResearchGroupModel.findById(id).lean();
  if (!g) return null;
  return { id: (g as any)._id as string, ...(g as any) } as ResearchGroup;
}

export async function createResearchGroup(group: ResearchGroup): Promise<void> {
  await connectDB();
  const { id, ...data } = group;
  await ResearchGroupModel.findByIdAndUpdate(
    id, { _id: id, ...data, createdAt: data.createdAt || now(), updatedAt: now() }, { upsert: true }
  );
}

export async function updateResearchGroup(id: string, data: Partial<ResearchGroup>): Promise<void> {
  await connectDB();
  await ResearchGroupModel.findByIdAndUpdate(id, { $set: { ...data, updatedAt: now() } });
}

export async function deleteResearchGroup(id: string): Promise<void> {
  await connectDB();
  await ResearchGroupModel.findByIdAndDelete(id);
}

// ─── PERMISSION CONFIG ────────────────────────────────────────

const PERM_CONFIG_ID = "permissions";

export async function getPermissionConfig(): Promise<Record<string, unknown>> {
  await connectDB();
  const doc = await AppConfigModel.findById(PERM_CONFIG_ID).lean();
  return (doc as any)?.data ?? {};
}

export async function savePermissionConfig(config: Record<string, unknown>): Promise<void> {
  await connectDB();
  await AppConfigModel.findByIdAndUpdate(
    PERM_CONFIG_ID,
    { _id: PERM_CONFIG_ID, data: config, updatedAt: new Date().toISOString() },
    { upsert: true, new: true }
  );
}
