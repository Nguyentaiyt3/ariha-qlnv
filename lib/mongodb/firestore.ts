import { connectDB } from "./config";
import {
  UserModel, TaskModel, NotificationModel, MessageModel,
  WorkflowModel, MilestoneConfigModel, KPIFrameworkModel, EvaluationConfigModel,
  NckhReviewCriteriaConfigModel, RiskFlagConfigModel,
  EvaluationModel, CalendarEventModel, RequestTemplateModel, WorkRequestModel,
  DocFolderModel, WorkDocumentModel, AnnouncementModel, AnnouncementCommentModel,
  ChannelModel, ChannelMessageModel,
  FinancialTransactionModel, AdvanceRequestModel, ReimbursementRequestModel, TaskFinancialSummaryModel,
  WorkNodeModel, AuditEventModel, UnitPlanModel, ResearchTopicModel, ResearchGroupModel,
  AppConfigModel, ClinicalTrialModel, EnrollmentShareTokenModel,
} from "./models";
import type {
  User, Task, Notification, Message, EmailLog, CalendarEvent,
  Workflow, MilestoneConfig, KPIFramework, EvaluationConfig, Evaluation, AuditEvent,
  RequestTemplate, WorkRequest, DocFolder, WorkDocument,
  Announcement, AnnouncementComment, Channel, ChannelMessage,
  FinancialTransaction, AdvanceRequest, ReimbursementRequest, TaskFinancialSummary,
  WorkNode, UnitPlan, ResearchTopic, ResearchGroup, ClinicalTrial, NckhReviewCriteriaConfig,
  RiskFlagConfig,
} from "@/types";
import { DEFAULT_NCKH_REVIEW_CRITERIA } from "@/lib/research";
import { DEFAULT_RISK_FLAG_CONFIG } from "@/lib/risk-flag";
import { generateId } from "@/lib/utils";
import { sameUnit } from "@/lib/rbac/scope";
import { encryptField, decryptField } from "./fieldCrypto";

const now = () => new Date().toISOString();

// ─── USERS ──────────────────────────────────────────────────────

function decryptIdNumber<T extends { idNumber?: unknown }>(u: T): T {
  if (typeof u.idNumber === "string" && u.idNumber) {
    (u as any).idNumber = decryptField(u.idNumber);
  }
  return u;
}

export async function getUser(userId: string): Promise<User | null> {
  await connectDB();
  const user = await UserModel.findById(userId).lean();
  if (!user) return null;
  const { password: _, ...rest } = user as any;
  return decryptIdNumber({ id: String(user._id), ...rest } as User);
}

export async function getUsers(): Promise<User[]> {
  await connectDB();
  const users = await UserModel.find({ isActive: true }).lean();
  return users.map((u: any) => {
    const { password: _, ...rest } = u;
    return decryptIdNumber({ id: u._id as string, ...rest } as User);
  });
}

/** Trưởng nhóm (teamLead) cùng đơn vị — dùng để tìm người duyệt yêu cầu sửa/xoá của designation-holder. */
export async function getDepartmentTeamLeads(department?: string | null): Promise<User[]> {
  if (!department) return [];
  const users = await getUsers();
  return users.filter((u) => u.role === "teamLead" && sameUnit(u.department, department));
}

export async function saveUser(user: Partial<User> & { id: string }): Promise<void> {
  await connectDB();
  const { id, _id: _drop, ...updateData } = user as any;
  if (typeof updateData.idNumber === "string" && updateData.idNumber) {
    updateData.idNumber = encryptField(updateData.idNumber);
  }
  await UserModel.findByIdAndUpdate(id, { $set: { ...updateData, updatedAt: now() } }, { upsert: false });
}

// ─── POSITION CATALOG ────────────────────────────────────────────

export async function getPositions(): Promise<import("@/types").PositionDef[]> {
  await connectDB();
  const config = await AppConfigModel.findById("positionCatalog").lean();
  return ((config?.data as Record<string, unknown>)?.positions as import("@/types").PositionDef[]) ?? [];
}

export async function savePositions(positions: import("@/types").PositionDef[]): Promise<void> {
  await connectDB();
  await AppConfigModel.findByIdAndUpdate(
    "positionCatalog",
    { data: { positions }, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
}

export async function bulkApproveUsers(userIds: string[], role: string): Promise<number> {
  await connectDB();
  const result = await UserModel.updateMany(
    { _id: { $in: userIds } },
    { $set: { role, updatedAt: now() } },
  );
  return result.modifiedCount;
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

export async function getResearchTopics(
  taskId?: string,
  userId?: string,
  forIntake?: boolean,
  userEmail?: string,
): Promise<ResearchTopic[]> {
  await connectDB();
  const filter: Record<string, unknown> = {};

  if (taskId && forIntake) {
    // Combined: topics linked to this task OR intake-pending topics with no task.
    // Used by the task detail page to load both in one round-trip.
    filter.$or = [
      { taskId },
      {
        $and: [
          { $or: [{ taskId: { $exists: false } }, { taskId: null }] },
          { $or: [{ intakeStatus: { $exists: false } }, { intakeStatus: "awaiting" }] },
        ],
      },
    ];
  } else if (forIntake) {
    // All topics awaiting intake review — whether or not they're linked to a task.
    filter.$or = [
      { intakeStatus: { $exists: false } },
      { intakeStatus: "awaiting" },
    ];
  } else if (taskId) {
    filter.taskId = taskId;
  }

  if (userId) {
    // Khớp đúng định nghĩa "thành viên đề tài" đã dùng ở isTopicMember (app/api/research/[id]/route.ts)
    // — thiếu mainPerformerId/reviews.reviewerId/councilSessions.memberIds ở đây từng khiến phản biện
    // (không đồng thời là PI/thành viên đề tài) bị trả về danh sách rỗng ở endpoint list này, dù vẫn
    // xem được đề tài qua link chi tiết trực tiếp (route đó có đủ 3 điều kiện, route này thì thiếu).
    const userCondition: Record<string, unknown>[] = [
      { principalInvestigatorId: userId },
      { mainPerformerId: userId },
      { memberIds: userId },
      { createdBy: userId },
      { "reviews.reviewerId": userId },
      { "councilSessions.memberIds": userId },
    ];
    // Also surface public submissions whose submitterEmail matches this user. So sánh không phân
    // biệt hoa/thường — người điền form public có thể gõ email khác cách viết hoa so với tài
    // khoản thật (vd. Name@Gmail.com vs name@gmail.com), so khớp phân biệt hoa/thường sẽ bỏ sót.
    // Các bản ghi này sẽ được claimPublicTopicsByEmail gán vĩnh viễn, đây chỉ là fallback cho
    // trường hợp bản ghi vừa tạo cùng lúc request này chạy (claim chưa kịp xong).
    if (userEmail) {
      userCondition.push({
        principalInvestigatorId: "public",
        $expr: { $eq: [{ $toLower: "$submitterEmail" }, userEmail.trim().toLowerCase()] },
      });
    }
    if (filter.$or) {
      // Combine with existing $or via $and
      const existing = filter.$or;
      delete filter.$or;
      filter.$and = [{ $or: existing }, { $or: userCondition }];
    } else {
      filter.$or = userCondition;
    }
  }

  const topics = await ResearchTopicModel.find(filter).sort({ year: -1, createdAt: -1 }).lean();
  return topics.map((t: any) => {
    const { _id, ...rest } = t;
    return { id: _id as string, ...rest } as ResearchTopic;
  });
}

/**
 * Permanently claim any public-form submissions whose submitterEmail matches this user.
 * So sánh không phân biệt hoa/thường (xem giải thích ở getResearchTopics phía trên).
 */
export async function claimPublicTopicsByEmail(userId: string, email: string): Promise<number> {
  await connectDB();
  const normalizedEmail = email.trim().toLowerCase();
  const result = await ResearchTopicModel.updateMany(
    {
      principalInvestigatorId: "public",
      $expr: { $eq: [{ $toLower: "$submitterEmail" }, normalizedEmail] },
    },
    {
      $set: {
        principalInvestigatorId: userId,
        createdBy: userId,
        updatedAt: new Date().toISOString(),
      },
    },
  );
  return (result as any).modifiedCount ?? 0;
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

// ─── THỬ NGHIỆM LÂM SÀNG (Clinical Trials) ─────────────────────

export async function getClinicalTrials(userId?: string): Promise<ClinicalTrial[]> {
  await connectDB();
  const filter: Record<string, unknown> = userId
    ? {
        $or: [
          { principalInvestigatorId: userId },
          { coordinatorId: userId },
          { createdBy: userId },
        ],
      }
    : {};
  const trials = await ClinicalTrialModel.find(filter).sort({ createdAt: -1 }).lean();
  return trials.map((t: any) => {
    const { _id, ...rest } = t;
    return { id: _id as string, ...rest } as ClinicalTrial;
  });
}

/** Tra cứu 1 trial theo Task tổng theo dõi (executionTaskId) — dùng index, tránh quét cả bảng. */
export async function getClinicalTrialByExecutionTaskId(taskId: string): Promise<ClinicalTrial | null> {
  await connectDB();
  const t = await ClinicalTrialModel.findOne({ executionTaskId: taskId }).lean();
  if (!t) return null;
  const { _id, ...rest } = t as any;
  return { id: _id as string, ...rest } as ClinicalTrial;
}

export async function getClinicalTrial(id: string): Promise<ClinicalTrial | null> {
  await connectDB();
  const t = await ClinicalTrialModel.findById(id).lean();
  if (!t) return null;
  const { _id, ...rest } = t as any;
  return { id: _id as string, ...rest } as ClinicalTrial;
}

export async function createClinicalTrial(trial: ClinicalTrial): Promise<void> {
  await connectDB();
  const { id, ...data } = trial;
  const { createdAt, ...fields } = data as any;
  await ClinicalTrialModel.findByIdAndUpdate(
    id,
    {
      $set:         { ...fields, updatedAt: now() },
      $setOnInsert: { createdAt: createdAt || now() },
    },
    { upsert: true }
  );
}

export async function updateClinicalTrial(id: string, data: Partial<ClinicalTrial>): Promise<void> {
  await connectDB();
  const { id: _omit, _id: _omitId, createdAt: _omitCreated, ...rest } = data as any;
  await ClinicalTrialModel.findByIdAndUpdate(id, { $set: { ...rest, updatedAt: now() } });
}

export async function deleteClinicalTrial(id: string): Promise<void> {
  await connectDB();
  await ClinicalTrialModel.findByIdAndDelete(id);
}

export async function sendEnrollmentAlertNotification(
  userId: string,
  trial: ClinicalTrial,
  alertType: string,
  message: string,
  severity: "low" | "medium" | "high" = "low"
): Promise<void> {
  await connectDB();
  const title = `[${trial.abbreviation || trial.code}] Enrollment Alert`;
  const priority: "low" | "normal" | "urgent" = severity === "high" ? "urgent" : severity === "medium" ? "normal" : "low";
  const notif: Omit<Notification, "id"> = {
    userId,
    type: "trial_enrollment_alert",
    title,
    body: message,
    read: false,
    link: `/clinical-trials/${trial.id}`,
    priority,
    actionRequired: severity === "high",
    createdAt: now(),
  };
  await createNotification(notif);
}

export async function createEnrollmentMilestoneTask(
  trial: ClinicalTrial,
  milestone: "50_percent" | "75_percent" | "100_percent"
): Promise<Task | null> {
  await connectDB();

  const assigneeId = trial.coordinatorId || trial.principalInvestigatorId || trial.createdBy;

  if (!assigneeId) {
    console.log(`[createEnrollmentMilestoneTask] ${trial.code}: No assignee found (coordinator/PI/creator)`);
    return null; // Cannot create task without assignee
  }

  // Prevent duplicate task creation - check by task name and assignee
  // Map milestone to task name prefix for exact matching
  const milestoneNameMap = {
    "50_percent": "50% — Xem xét tiến độ",
    "75_percent": "75% — Chuẩn bị hoàn tất",
    "100_percent": "100% — Xác minh hoàn tất",
  };

  const namePattern = milestoneNameMap[milestone];
  const existingTask = await TaskModel.findOne({
    $and: [
      { name: { $regex: namePattern } },
      { mainPerformerId: assigneeId },
      { tags: `milestone_${milestone}` },
    ],
  }).lean();

  if (existingTask) {
    console.log(`[createEnrollmentMilestoneTask] ${trial.code}: Task already exists for ${milestone}`);
    return null; // Task already created for this milestone
  }

  // Map milestone to task name and description
  const milestoneConfig = {
    "50_percent": {
      name: "Cột mốc tuyển bệnh 50% — Xem xét tiến độ",
      description: "Đã đạt 50% chỉ tiêu tuyển bệnh. Vui lòng xem xét tiến độ hiện tại và các kế hoạch tiếp theo.",
    },
    "75_percent": {
      name: "Cột mốc tuyển bệnh 75% — Chuẩn bị hoàn tất",
      description: "Đã đạt 75% chỉ tiêu tuyển bệnh. Chuẩn bị cho các bước cuối cùng và hoàn tất tuyển bệnh.",
    },
    "100_percent": {
      name: "Cột mốc tuyển bệnh 100% — Xác minh hoàn tất & kiểm tra ngẫu nhiên",
      description: "Đã đạt 100% chỉ tiêu tuyển bệnh. Vui lòng xác minh hoàn tất tuyển bệnh và khởi tạo kiểm tra phân ngẫu nhiên.",
    },
  };

  const config = milestoneConfig[milestone];

  const now_str = now();
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const taskData: Omit<Task, "id"> = {
    name: config.name,
    description: config.description,
    status: "todo",
    phase: "execute",
    priority: milestone === "100_percent" ? "high" : "medium",
    deadlineBase: sevenDaysLater,
    deadlinePrepare: sevenDaysLater,
    deadlineExecute: sevenDaysLater,
    deadlineFinalize: sevenDaysLater,
    creatorId: assigneeId,
    mainPerformerId: assigneeId,
    stakeholders: [
      {
        userId: assigneeId,
        role: "assignee",
      },
    ],
    dependencies: [],
    steps: [],
    subtasks: [],
    kpi: {
      type: "completion_time",
      target: 7,
      current: 0,
      unit: "days",
    },
    progress: 0,
    riskFlag: false,
    timeLogs: [],
    approved: false,
    department: trial.department,
    tags: ["TNLS", `milestone_${milestone}`],
    createdAt: now_str,
    updatedAt: now_str,
  };

  const task = await createTask(taskData);
  return task;
}

export async function createPaymentReconciliationTask(
  trial: ClinicalTrial,
  status: "matched" | "mismatch" | "pending",
  targetAmount: number,
  receivedAmount: number,
  difference: number
): Promise<Task | null> {
  await connectDB();

  // Find finance department user or trial creator
  const assigneeId = trial.createdBy; // Could be finance manager, trial creator, or coordinator
  if (!assigneeId) {
    console.log(`[createPaymentReconciliationTask] ${trial.code}: No assignee found`);
    return null;
  }

  // Only create task for mismatch or pending (matched = no action needed)
  if (status === "matched") {
    return null;
  }

  const taskName =
    status === "mismatch"
      ? `Kiểm tra mismatch thanh toán - ${trial.abbreviation || trial.code}`
      : `Theo dõi thanh toán - ${trial.abbreviation || trial.code}`;

  const taskDescription =
    status === "mismatch"
      ? `Thanh toán không khớp: Đã nhận ${receivedAmount.toLocaleString("vi-VN")} nhưng dự tính ~${targetAmount.toLocaleString("vi-VN")} VND (chênh lệch: ${difference.toLocaleString("vi-VN")} VND). Vui lòng xem xét và điều chỉnh.`
      : `Chưa nhận thanh toán cho ${trial.code}. Dự tính: ${targetAmount.toLocaleString("vi-VN")} VND. Vui lòng theo dõi và nhắc nhở.`;

  // Check if reconciliation task already exists
  const existingTask = await TaskModel.findOne({
    $and: [{ name: { $regex: taskName.split(" - ")[0] } }, { mainPerformerId: assigneeId }, { tags: "payment_reconciliation" }],
  }).lean();

  if (existingTask) {
    return null; // Task already exists
  }

  const now_str = now();
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const taskData: Omit<Task, "id"> = {
    name: taskName,
    description: taskDescription,
    status: "todo",
    phase: "execute",
    priority: status === "mismatch" ? "high" : "medium",
    deadlineBase: sevenDaysLater,
    deadlinePrepare: sevenDaysLater,
    deadlineExecute: sevenDaysLater,
    deadlineFinalize: sevenDaysLater,
    creatorId: assigneeId,
    mainPerformerId: assigneeId,
    stakeholders: [
      {
        userId: assigneeId,
        role: "assignee",
      },
    ],
    dependencies: [],
    steps: [],
    subtasks: [],
    kpi: {
      type: "completion_time",
      target: 7,
      current: 0,
      unit: "days",
    },
    progress: 0,
    riskFlag: status === "mismatch",
    timeLogs: [],
    approved: false,
    department: "Finance", // Reconciliation belongs to finance
    tags: ["payment_reconciliation", `status_${status}`],
    createdAt: now_str,
    updatedAt: now_str,
  };

  const task = await createTask(taskData);
  return task;
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

// ─── NCKH REVIEW CRITERIA CONFIG ────────────────────────────────

export async function getNckhReviewCriteria(): Promise<NckhReviewCriteriaConfig> {
  await connectDB();
  const config = await NckhReviewCriteriaConfigModel.findById("singleton").lean();
  if (!config || !config.proposal?.length || !config.recognition?.length) return DEFAULT_NCKH_REVIEW_CRITERIA;
  return config as unknown as NckhReviewCriteriaConfig;
}

export async function saveNckhReviewCriteria(config: Partial<NckhReviewCriteriaConfig>): Promise<void> {
  await connectDB();
  await NckhReviewCriteriaConfigModel.findByIdAndUpdate(
    "singleton",
    { ...config, updatedAt: now() },
    { upsert: true }
  );
}

// ─── RISK FLAG CONFIG ────────────────────────────────────────

export async function getRiskFlagConfig(): Promise<RiskFlagConfig> {
  await connectDB();
  const config = await RiskFlagConfigModel.findById("singleton").lean();
  if (!config || !config.thresholdDays || !config.progressThreshold) return DEFAULT_RISK_FLAG_CONFIG;
  return config as unknown as RiskFlagConfig;
}

export async function saveRiskFlagConfig(config: Partial<RiskFlagConfig>): Promise<void> {
  await connectDB();
  await RiskFlagConfigModel.findByIdAndUpdate(
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
  return requests.map((r: any) => ({ id: r._id as string, ...r, mode: r.mode ?? "ADVANCE" }) as AdvanceRequest);
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
  bankAccount?: unknown;
}): Promise<void> {
  await connectDB();
  const adv = await AdvanceRequestModel.findById(advId).lean() as any;
  if (!adv) throw new Error("Đơn tạm ứng không tồn tại.");
  await AdvanceRequestModel.findByIdAndUpdate(advId, {
    status: "PENDING_SETTLEMENT",
    settlementAmountUsed: data.amountUsed,
    settlementProofs: data.proofs ?? [],
    settlementNotes: data.notes,
    ...(data.bankAccount ? { settlementBankAccount: data.bankAccount } : {}),
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
    .filter((a) => (a.mode ?? "ADVANCE") === "ADVANCE" && ["APPROVED", "PENDING_SETTLEMENT", "SETTLED"].includes(a.status))
    .reduce((s: number, a: any) => s + (a.amount ?? 0), 0);

  // Thông tin theo dõi (không phải dòng tiền công ty): tổng đã chi TỪ khoản tạm ứng, theo danh mục.
  const totalAdvanceUsed = (txns as any[])
    .filter((t) => t.direction === "DEBIT" && t.fundSource === "ADVANCE")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const totalOutOfPocket = (txns as any[])
    .filter((t) => t.direction === "DEBIT" && t.fundSource === "OUT_OF_POCKET")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  const totalRevenue = (txns as any[])
    .filter((t) => t.direction === "CREDIT" && t.fundSource === "REVENUE")
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  // Chi THỰC của công ty — lấy trực tiếp từ sổ quỹ (giao dịch đánh dấu isDisbursement), vì đây là
  // nơi DUY NHẤT ghi nhận đúng mọi thời điểm tiền thực sự rời công ty: giải ngân tạm ứng lúc duyệt,
  // hoàn ứng tự chi lúc duyệt quyết toán, VÀ cả phần chênh lệch quyết toán (chi bổ sung) nếu có.
  // Không dùng advance.amount trực tiếp vì con số đó không phản ánh chênh lệch phát sinh sau quyết toán.
  const totalExpense = (txns as any[])
    .filter((t) => t.direction === "DEBIT" && t.isDisbursement)
    .reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  // Chờ hoàn ứng: đơn tự ứng đã nộp quyết toán, chờ duyệt chi + đơn hoàn ứng cũ (model trước khi hợp nhất).
  const totalSelfPaidPending = (advances as any[])
    .filter((a) => a.mode === "SELF_PAID" && a.status === "PENDING_SETTLEMENT")
    .reduce((s: number, a: any) => s + (a.settlementAmountUsed ?? 0), 0);
  const pendingReimb = await ReimbursementRequestModel.find({ taskId, status: { $in: ["SUBMITTED", "APPROVED"] } }).lean();
  const totalPendingReimbursement = totalSelfPaidPending
    + (pendingReimb as any[]).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

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

// ─── ENROLLMENT SHARE TOKENS ────────────────────────────────────

export async function createEnrollmentShareToken(
  trialId: string,
  createdBy: string,
  expiryDays: number = 7
): Promise<{ token: string; expiresAt: string }> {
  await connectDB();

  // Generate 32-character random token
  const token = generateId().slice(0, 32);
  const now_str = now();
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const tokenDoc = {
    _id: generateId(),
    trialId,
    token,
    createdBy,
    createdAt: now_str,
    expiresAt,
    isUsed: false,
  };

  await EnrollmentShareTokenModel.findByIdAndUpdate(
    tokenDoc._id,
    tokenDoc,
    { upsert: true }
  );

  return { token, expiresAt };
}

export async function getEnrollmentShareToken(token: string) {
  await connectDB();
  const doc = await EnrollmentShareTokenModel.findOne({ token }).lean() as unknown as any;
  if (!doc) return null;

  const now_str = new Date().toISOString();
  if (doc.expiresAt < now_str || doc.isUsed) {
    return null; // Token expired or already used
  }

  return {
    _id: doc._id,
    trialId: doc.trialId,
    token: doc.token,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
  };
}

export async function markTokenAsUsed(tokenId: string, usedBy: string): Promise<void> {
  await connectDB();
  await EnrollmentShareTokenModel.findByIdAndUpdate(tokenId, {
    $set: {
      isUsed: true,
      usedAt: now(),
      usedBy,
    },
  });
}
