/**
 * Client-safe Firestore compatibility layer.
 * All data operations go through API routes (fetch) — no Mongoose in the browser.
 * Server-side code (API routes) imports directly from lib/mongodb/firestore.
 */
import type {
  User, Task, Notification, Message, EmailLog, CalendarEvent,
  Workflow, MilestoneConfig, KPIFramework, Evaluation, AuditEvent,
  RequestTemplate, WorkRequest, DocFolder, WorkDocument,
  Announcement, AnnouncementComment, Channel, ChannelMessage,
} from "@/types";
import { generateId } from "@/lib/utils";

async function api<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── USERS ────────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User | null> {
  const data = await api<{ user: User }>(`/api/users/${userId}`);
  return data?.user ?? null;
}

export async function getUsers(): Promise<User[]> {
  const data = await api<{ users: User[] }>("/api/users");
  return data?.users ?? [];
}

export async function saveUser(user: Partial<User> & { id: string }): Promise<void> {
  await api(`/api/users/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await api(`/api/users/${userId}`, { method: "DELETE" });
}

export function subscribeUsers(callback: (users: User[]) => void) {
  getUsers().then(callback);
  return () => {};
}

// ─── TASKS ────────────────────────────────────────────────────

export async function getTask(taskId: string): Promise<Task | null> {
  const data = await api<{ task: Task }>(`/api/tasks/${taskId}`);
  return data?.task ?? null;
}

export async function getTasks(): Promise<Task[]> {
  const data = await api<{ tasks: Task[] }>("/api/tasks");
  return data?.tasks ?? [];
}

export async function getTasksByUser(userId: string): Promise<Task[]> {
  const data = await api<{ tasks: Task[] }>(`/api/tasks?userId=${userId}`);
  return data?.tasks ?? [];
}

export async function saveTask(task: Partial<Task> & { id: string }): Promise<void> {
  await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
}

export async function createTask(task: Omit<Task, "id">): Promise<Task> {
  const id = generateId("t");
  await api("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...task, id }),
  });
  return { id, ...task } as Task;
}

export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
  _actor?: { id: string; name: string }
): Promise<void> {
  await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
}

export function subscribeTasks(callback: (tasks: Task[]) => void) {
  getTasks().then(callback);
  return () => {};
}

export function subscribeTask(taskId: string, callback: (task: Task | null) => void) {
  getTask(taskId).then(callback);
  return () => {};
}

// ─── AUDIT TRAIL ──────────────────────────────────────────────

export async function addAuditEvent(_taskId: string, _event: Omit<AuditEvent, "id">): Promise<void> {}

export async function getAuditTrail(_taskId: string): Promise<AuditEvent[]> {
  return [];
}

// ─── MESSAGES ────────────────────────────────────────────────

export async function getMessages(taskId: string) {
  const data = await api<{ messages: Message[] }>(`/api/messages/${taskId}`);
  return data?.messages ?? [];
}

export async function addMessage(taskId: string, message: Omit<Message, "id" | "taskId">) {
  const data = await api<{ message: Message }>(`/api/messages/${taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  return data?.message ?? { id: generateId("msg"), taskId, ...message } as Message;
}

export async function updateMessage(taskId: string, msgId: string, data: Partial<Message>): Promise<void> {
  await api(`/api/messages/${taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", msgId, data }),
  });
}

export function subscribeMessages(taskId: string, callback: (messages: Message[]) => void) {
  getMessages(taskId).then(callback);
  return () => {};
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export async function getNotifications(_userId: string): Promise<Notification[]> {
  const data = await api<{ notifications: Notification[] }>("/api/notifications");
  return data?.notifications ?? [];
}

export async function addNotification(notif: Omit<Notification, "id">): Promise<void> {
  await api("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notif),
  });
}

export async function createNotification(notif: Omit<Notification, "id">): Promise<void> {
  return addNotification(notif);
}

export async function markNotificationRead(_userId: string, notifId: string): Promise<void> {
  await api(`/api/notifications/${notifId}`, { method: "PATCH" });
}

export async function markAllNotificationsRead(_userId: string): Promise<void> {
  await api("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "markAllRead" }),
  });
}

export function subscribeNotifications(userId: string, callback: (notifs: Notification[]) => void) {
  getNotifications(userId).then(callback);
  return () => {};
}

export async function deleteNotification(_userId: string, notifId: string): Promise<void> {
  await api(`/api/notifications/${notifId}`, { method: "DELETE" });
}

export async function deleteAllReadNotifications(userId: string): Promise<void> {
  await api(`/api/notifications?userId=${userId}&onlyRead=true`, { method: "DELETE" });
}

export async function cleanupOldNotifications(_userId: string, _days: number): Promise<number> {
  return 0;
}

// ─── EMAIL LOGS ───────────────────────────────────────────────

export async function addEmailLog(_log: Omit<EmailLog, "id">): Promise<void> {}
export async function getEmailLogs(_taskId: string): Promise<EmailLog[]> { return []; }

// ─── CALENDAR ────────────────────────────────────────────────

export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const data = await api<{ events: CalendarEvent[] }>(`/api/calendar/events?userId=${userId}`);
  return data?.events ?? [];
}
export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  await api("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
}
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await api(`/api/calendar/events/${eventId}`, { method: "DELETE" });
}
export function subscribeCalendarEvents(userId: string, callback: (events: CalendarEvent[]) => void) {
  getCalendarEvents(userId).then(callback);
  return () => {};
}
export async function getPendingCalendarEvents(): Promise<CalendarEvent[]> {
  const data = await api<{ events: CalendarEvent[] }>("/api/calendar/events?pending=true");
  return data?.events ?? [];
}
export async function approveCalendarEvent(id: string, approve: boolean, reason?: string): Promise<void> {
  await api("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : "reject", id, reason }) });
}

// ─── WORKFLOWS ────────────────────────────────────────────────

export async function getWorkflows(canApprove = false, userId?: string): Promise<Workflow[]> {
  const data = await api<{ workflows: Workflow[] }>(`/api/workflows${canApprove ? "?all=true" : ""}`);
  return data?.workflows ?? [];
}
export async function saveWorkflow(workflow: Workflow): Promise<void> {
  await api("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(workflow) });
}
export async function approveWorkflow(id: string, approve: boolean, reason?: string): Promise<void> {
  await api(`/api/workflows/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : "reject", reason }) });
}
export async function deleteWorkflow(id: string): Promise<void> {
  await api(`/api/workflows/${id}`, { method: "DELETE" });
}

// ─── MILESTONE CONFIG ─────────────────────────────────────────

export async function getMilestoneConfigs(): Promise<MilestoneConfig[]> {
  const data = await api<{ configs: MilestoneConfig[] }>("/api/milestones");
  return data?.configs ?? [];
}
export async function getDefaultMilestoneConfig(): Promise<MilestoneConfig | null> {
  const data = await api<{ config: MilestoneConfig }>("/api/milestones?default=true");
  return data?.config ?? null;
}
export async function saveMilestoneConfig(config: MilestoneConfig): Promise<void> {
  await api("/api/milestones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
}

// ─── KPI FRAMEWORKS ───────────────────────────────────────────

export async function getKPIFrameworks(): Promise<KPIFramework[]> {
  const data = await api<{ frameworks: KPIFramework[] }>("/api/kpi-frameworks");
  return data?.frameworks ?? [];
}
export async function saveKPIFramework(framework: KPIFramework): Promise<void> {
  await api("/api/kpi-frameworks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(framework) });
}

// ─── EVALUATIONS ──────────────────────────────────────────────

export async function getEvaluations(userId: string): Promise<Evaluation[]> {
  const data = await api<{ evaluations: Evaluation[] }>(`/api/evaluations?userId=${userId}`);
  return data?.evaluations ?? [];
}
export async function getTaskEvaluations(taskId: string): Promise<Evaluation[]> {
  const data = await api<{ evaluations: Evaluation[] }>(`/api/evaluations?taskId=${taskId}`);
  return data?.evaluations ?? [];
}
export async function getAllEvaluations(): Promise<Evaluation[]> {
  const data = await api<{ evaluations: Evaluation[] }>("/api/evaluations");
  return data?.evaluations ?? [];
}
export async function saveEvaluation(evaluation: Evaluation): Promise<void> {
  await api("/api/evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(evaluation) });
}

// ─── REQUEST TEMPLATES ────────────────────────────────────────

export async function getRequestTemplates(includeAll = false): Promise<RequestTemplate[]> {
  const data = await api<{ templates: RequestTemplate[] }>(`/api/request-templates${includeAll ? "?all=true" : ""}`);
  return data?.templates ?? [];
}
export async function getPendingTemplates(): Promise<RequestTemplate[]> {
  const data = await api<{ templates: RequestTemplate[] }>("/api/request-templates?pending=true");
  return data?.templates ?? [];
}
export async function approveRequestTemplate(id: string, approve: boolean, _reason?: string): Promise<void> {
  await api("/api/request-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : "reject", id }) });
}
export async function saveRequestTemplate(t: RequestTemplate): Promise<void> {
  await api("/api/request-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
}
export async function deleteRequestTemplate(id: string): Promise<void> {
  await api("/api/request-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
}

// ─── WORK REQUESTS ────────────────────────────────────────────

export async function getRequests(): Promise<WorkRequest[]> {
  const data = await api<{ requests: WorkRequest[] }>("/api/requests");
  return data?.requests ?? [];
}
export async function getRequest(id: string): Promise<WorkRequest | null> {
  const data = await api<{ request: WorkRequest }>(`/api/requests/${id}`);
  return data?.request ?? null;
}
export async function saveRequest(r: WorkRequest): Promise<void> {
  await api("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
}
export async function updateRequest(id: string, updates: Partial<WorkRequest>): Promise<void> {
  await api(`/api/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
}
export function subscribeRequests(userId: string, isManager: boolean, callback: (reqs: WorkRequest[]) => void) {
  getRequests().then(callback);
  return () => {};
}

// ─── DOCUMENTS ────────────────────────────────────────────────

export async function getFolders(): Promise<DocFolder[]> {
  const data = await api<{ folders: DocFolder[] }>("/api/documents?type=folders");
  return data?.folders ?? [];
}
export async function saveFolder(f: DocFolder): Promise<void> {
  await api("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "folder", data: f, id: f.id }) });
}
export async function deleteFolder(id: string): Promise<void> {
  await api("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteFolder", id }) });
}
export async function getDocuments(folderId: string | null): Promise<WorkDocument[]> {
  const param = folderId ? `folderId=${folderId}` : "folderId=null";
  const data = await api<{ documents: WorkDocument[] }>(`/api/documents?${param}`);
  return data?.documents ?? [];
}
export async function saveDocument(doc: WorkDocument): Promise<void> {
  await api("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });
}
export async function deleteDocument(id: string): Promise<void> {
  await api(`/api/documents/${id}`, { method: "DELETE" });
}
export function subscribeDocuments(folderId: string | null, callback: (docs: WorkDocument[]) => void, _userId?: string, _canApprove?: boolean) {
  getDocuments(folderId).then(callback);
  return () => {};
}
export async function getPendingDocuments(): Promise<WorkDocument[]> {
  const data = await api<{ documents: WorkDocument[] }>("/api/documents?type=pending");
  return data?.documents ?? [];
}
export async function approveDocument(id: string, approve: boolean, _reason?: string): Promise<void> {
  await api("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : "reject", id }) });
}

// ─── ANNOUNCEMENTS ────────────────────────────────────────────

export async function getAnnouncements(): Promise<Announcement[]> {
  const data = await api<{ announcements: Announcement[] }>("/api/announcements");
  return data?.announcements ?? [];
}
export async function saveAnnouncement(a: Announcement): Promise<void> {
  await api("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
}
export async function deleteAnnouncement(id: string): Promise<void> {
  await api(`/api/announcements/${id}`, { method: "DELETE" });
}
export async function reactToAnnouncement(announcementId: string, emoji: string, _userId: string, add: boolean): Promise<void> {
  await api("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "react", announcementId, emoji, add }) });
}
export async function markAnnouncementViewed(announcementId: string, _userId: string): Promise<void> {
  await api("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view", announcementId }) });
}
export function subscribeAnnouncements(callback: (items: Announcement[]) => void, _userId?: string, _canApprove?: boolean) {
  getAnnouncements().then(callback);
  return () => {};
}
export async function updateAnnouncement(id: string, data: Partial<Announcement>): Promise<void> {
  await api(`/api/announcements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
export async function approveAnnouncement(id: string, approve: boolean, _reason?: string): Promise<void> {
  await api("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : "reject", id }) });
}
export async function getAnnouncementComments(annId: string): Promise<AnnouncementComment[]> {
  const data = await api<{ comments: AnnouncementComment[] }>(`/api/announcements/${annId}`);
  return data?.comments ?? [];
}
export async function addAnnouncementComment(annId: string, comment: Omit<AnnouncementComment, "id">): Promise<void> {
  await api(`/api/announcements/${annId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", comment }) });
}

// ─── CHANNELS ────────────────────────────────────────────────

export async function getChannels(_userId: string): Promise<Channel[]> {
  const data = await api<{ channels: Channel[] }>("/api/channels");
  return data?.channels ?? [];
}
export async function saveChannel(ch: Channel): Promise<void> {
  await api("/api/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ch) });
}
export function subscribeChannels(userId: string, callback: (channels: Channel[]) => void) {
  getChannels(userId).then(callback);
  return () => {};
}
export function subscribeChannelMessages(channelId: string, callback: (msgs: ChannelMessage[]) => void) {
  api<{ messages: ChannelMessage[] }>(`/api/channels/${channelId}`).then((d) => callback(d?.messages ?? []));
  return () => {};
}
export async function sendChannelMessage(channelId: string, msg: Omit<ChannelMessage, "id">): Promise<void> {
  await api(`/api/channels/${channelId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sendMessage", message: msg }) });
}
export async function updateChannel(id: string, data: Partial<Channel>): Promise<void> {
  await api(`/api/channels/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
export async function deleteChannel(id: string): Promise<void> {
  await api(`/api/channels/${id}`, { method: "DELETE" });
}
export async function updateChannelMessage(channelId: string, msgId: string, data: Partial<ChannelMessage>): Promise<void> {
  await api(`/api/channels/${channelId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateMessage", msgId, data }) });
}
export async function markChannelRead(channelId: string, _userId: string): Promise<void> {
  await api(`/api/channels/${channelId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markRead" }) });
}

// ─── EVALUATION CONFIG ────────────────────────────────────────

export async function getEvaluationConfig(): Promise<import("@/types").EvaluationConfig> {
  const data = await api<{ config: import("@/types").EvaluationConfig }>("/api/evaluations?config=true");
  const cfg = data?.config;
  if (!cfg?.weights) return { weights: { t1: 0.4, t2: 0.4, t3: 0.2 }, thresholds: { xuatSac: 10, hoanThanhTot: 8, hoanThanh: 5 } };
  return cfg;
}
export async function saveEvaluationConfig(config: unknown): Promise<void> {
  await api("/api/evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveConfig", config }) });
}

// ─── PERMISSION CONFIG ────────────────────────────────────────

export async function getPermissionConfig() {
  const data = await api<Record<string, unknown>>("/api/config/permissions");
  return data ?? {};
}

export async function savePermissionConfig(_config: unknown): Promise<void> {}
