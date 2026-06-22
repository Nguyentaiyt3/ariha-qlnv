import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryConstraint,
  writeBatch,
  limit,
  startAfter,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  User, Task, Message, Notification, EmailLog, CalendarEvent,
  Workflow, MilestoneConfig, KPIFramework, Evaluation, AuditEvent,
  RequestTemplate, WorkRequest,
  DocFolder, WorkDocument,
  Announcement, AnnouncementComment, Channel, ChannelMessage,
} from "@/types";
import { generateId } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────

function toDate(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === "string") return val;
  return new Date().toISOString();
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

// ─── USERS ────────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User;
}

export async function getUsers(): Promise<User[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
}

export async function saveUser(user: Partial<User> & { id: string }): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "users", user.id), stripUndefined(user), { merge: true });
}

export async function deleteUser(userId: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "users", userId), { isActive: false });
}

export function subscribeUsers(callback: (users: User[]) => void) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "users"), where("isActive", "==", true)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User))),
    (err) => console.error("[subscribeUsers]", err.code, err.message)
  );
}

// ─── TASKS ────────────────────────────────────────────────────

export async function getTask(taskId: string): Promise<Task | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "tasks", taskId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Task;
}

export async function getTasks(constraints: QueryConstraint[] = []): Promise<Task[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "tasks"), orderBy("createdAt", "desc"), ...constraints)
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
}

export async function getTasksByUser(userId: string): Promise<Task[]> {
  const db = getDb();
  const [asMain, asHelper] = await Promise.all([
    getDocs(query(collection(db, "tasks"), where("mainPerformerId", "==", userId))),
    getDocs(query(collection(db, "tasks"), where("stakeholders", "array-contains", { userId, role: "assignee" }))),
  ]);
  const taskMap = new Map<string, Task>();
  [...asMain.docs, ...asHelper.docs].forEach((d) => taskMap.set(d.id, { id: d.id, ...d.data() } as Task));
  return Array.from(taskMap.values());
}

export async function saveTask(task: Partial<Task> & { id: string }): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, "tasks", task.id),
    { ...stripUndefined(task), updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function createTask(task: Omit<Task, "id">): Promise<Task> {
  const db = getDb();
  const id = generateId("t");
  const newTask: Task = { ...task, id };
  await setDoc(doc(db, "tasks", id), newTask);
  return newTask;
}

function deepStrip<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "tasks", taskId), {
    ...deepStrip(stripUndefined(updates)),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "tasks", taskId));
}

export function subscribeTasks(
  callback: (tasks: Task[]) => void,
  constraints: QueryConstraint[] = []
) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "tasks"), orderBy("createdAt", "desc"), ...constraints),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task))),
    (err) => console.error("[subscribeTasks]", err.code, err.message)
  );
}

export function subscribeTask(taskId: string, callback: (task: Task | null) => void) {
  const db = getDb();
  return onSnapshot(
    doc(db, "tasks", taskId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Task) : null),
    (err) => console.error("[subscribeTask]", err.code, err.message)
  );
}

// ─── AUDIT TRAIL ──────────────────────────────────────────────

export async function addAuditEvent(taskId: string, event: Omit<AuditEvent, "id">): Promise<void> {
  const db = getDb();
  const id = generateId("audit");
  await setDoc(doc(db, "tasks", taskId, "auditTrail", id), { ...event, id });
}

export async function getAuditTrail(taskId: string): Promise<AuditEvent[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "tasks", taskId, "auditTrail"),
      orderBy("timestamp", "desc"),
      limit(50)
    )
  );
  return snap.docs.map((d) => d.data() as AuditEvent);
}

// ─── MESSAGES ────────────────────────────────────────────────

export async function getMessages(taskId: string): Promise<Message[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "tasks", taskId, "messages"), orderBy("timestamp", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
}

export async function addMessage(taskId: string, message: Omit<Message, "id">): Promise<Message> {
  const db = getDb();
  const id = generateId("msg");
  const newMsg: Message = { ...message, id };
  // Strip undefined fields — Firestore rejects them
  const data = Object.fromEntries(Object.entries(newMsg).filter(([, v]) => v !== undefined));
  await setDoc(doc(db, "tasks", taskId, "messages", id), data);
  return newMsg;
}

export async function updateMessage(taskId: string, msgId: string, data: Partial<Message>): Promise<void> {
  const db = getDb();
  const stripped = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  await updateDoc(doc(db, "tasks", taskId, "messages", msgId), stripped);
}

export function subscribeMessages(taskId: string, callback: (messages: Message[]) => void) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "tasks", taskId, "messages"), orderBy("timestamp", "asc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message))),
    (err) => console.error("[subscribeMessages]", err.code, err.message)
  );
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export async function getNotifications(userId: string): Promise<Notification[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, "notifications", userId, "items"),
      orderBy("createdAt", "desc"),
      limit(50)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
}

export async function addNotification(notif: Omit<Notification, "id">): Promise<void> {
  const db = getDb();
  const id = generateId("notif");
  await setDoc(doc(db, "notifications", notif.userId, "items", id), { ...notif, id });
}

export async function markNotificationRead(userId: string, notifId: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "notifications", userId, "items", notifId), { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "notifications", userId, "items"), where("read", "==", false))
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

export function subscribeNotifications(userId: string, callback: (notifs: Notification[]) => void) {
  const db = getDb();
  return onSnapshot(
    query(
      collection(db, "notifications", userId, "items"),
      orderBy("createdAt", "desc"),
      limit(50)
    ),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification))),
    (err) => console.error("[subscribeNotifications]", err.code, err.message)
  );
}

// ─── EMAIL LOGS ───────────────────────────────────────────────

export async function addEmailLog(log: Omit<EmailLog, "id">): Promise<void> {
  const db = getDb();
  const id = generateId("emaillog");
  await setDoc(doc(db, "emailLogs", id), { ...log, id });
}

export async function getEmailLogs(taskId: string): Promise<EmailLog[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "emailLogs"), where("taskId", "==", taskId), orderBy("sentAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmailLog));
}

// ─── CALENDAR ────────────────────────────────────────────────

export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "calendarEvents"), where("userId", "==", userId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
}

export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "calendarEvents", event.id), event, { merge: true });
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "calendarEvents", eventId));
}

export function subscribeCalendarEvents(userId: string, callback: (events: CalendarEvent[]) => void) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "calendarEvents"), where("userId", "==", userId)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent))),
    (err) => console.error("[subscribeCalendarEvents]", err.code, err.message)
  );
}

export async function getPendingCalendarEvents(): Promise<CalendarEvent[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, "calendarEvents"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CalendarEvent))
    .filter((e) => e.status === "pending")
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function approveCalendarEvent(id: string, approve: boolean, reason?: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "calendarEvents", id), {
    status: approve ? "published" : "rejected",
    ...(reason && { rejectionReason: reason }),
  });
}

// ─── WORKFLOWS ────────────────────────────────────────────────

export async function getWorkflows(canApprove = false, currentUserId?: string): Promise<Workflow[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "workflows"), orderBy("createdAt", "desc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Workflow))
    .filter((w) =>
      canApprove ||
      w.status === "published" ||
      w.status === undefined ||
      (currentUserId && w.createdBy === currentUserId)
    );
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "workflows", workflow.id), deepStrip(workflow), { merge: true });
}

export async function approveWorkflow(id: string, approve: boolean, reason?: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "workflows", id), {
    status: approve ? "published" : "rejected",
    ...(reason && { rejectionReason: reason }),
  });
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "workflows", workflowId));
}

// ─── MILESTONE CONFIG ─────────────────────────────────────────

export async function getMilestoneConfigs(): Promise<MilestoneConfig[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, "milestoneConfig"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MilestoneConfig));
}

export async function getDefaultMilestoneConfig(): Promise<MilestoneConfig | null> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "milestoneConfig"), where("isDefault", "==", true), limit(1))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as MilestoneConfig;
}

export async function saveMilestoneConfig(config: MilestoneConfig): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "milestoneConfig", config.id), config, { merge: true });
}

// ─── KPI FRAMEWORKS ───────────────────────────────────────────

export async function getKPIFrameworks(): Promise<KPIFramework[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "kpiFrameworks"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as KPIFramework));
}

export async function saveKPIFramework(framework: KPIFramework): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "kpiFrameworks", framework.id), framework, { merge: true });
}

// ─── EVALUATIONS ──────────────────────────────────────────────

export async function getEvaluations(userId: string): Promise<Evaluation[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "evaluations"), where("evaluatedUserId", "==", userId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Evaluation));
}

export async function getAllEvaluations(): Promise<Evaluation[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "evaluations"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Evaluation));
}

export async function saveEvaluation(evaluation: Evaluation): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "evaluations", evaluation.id), deepStrip(evaluation) as DocumentData, { merge: true });
}

// ─── REQUEST TEMPLATES ────────────────────────────────────────

export async function getRequestTemplates(includeAllStatuses = false): Promise<RequestTemplate[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "requestTemplates"), where("isActive", "==", true)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as RequestTemplate))
    .filter((t) => includeAllStatuses || t.status === "published" || t.status === undefined)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getPendingTemplates(): Promise<RequestTemplate[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "requestTemplates"), where("isActive", "==", true)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as RequestTemplate))
    .filter((t) => t.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function approveRequestTemplate(id: string, approve: boolean, reason?: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "requestTemplates", id), {
    status: approve ? "published" : "rejected",
    isActive: approve,
    ...(reason && { rejectionReason: reason }),
  });
}

export async function saveRequestTemplate(t: RequestTemplate): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "requestTemplates", t.id), deepStrip(t), { merge: true });
}

export async function deleteRequestTemplate(id: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "requestTemplates", id), { isActive: false });
}

// ─── WORK REQUESTS / ĐƠN TỪ ─────────────────────────────────

export async function getRequests(constraints: QueryConstraint[] = []): Promise<WorkRequest[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "requests"), orderBy("createdAt", "desc"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkRequest));
}

export async function getRequest(id: string): Promise<WorkRequest | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "requests", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as WorkRequest) : null;
}

export async function saveRequest(r: WorkRequest): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "requests", r.id), deepStrip({ ...r, updatedAt: new Date().toISOString() }), { merge: true });
}

export async function updateRequest(id: string, updates: Partial<WorkRequest>): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "requests", id), { ...updates, updatedAt: new Date().toISOString() });
}

export function subscribeRequests(userId: string, isManager: boolean, callback: (reqs: WorkRequest[]) => void) {
  const db = getDb();
  // Avoid composite index requirement: filter/sort client-side for non-manager queries
  const q = isManager
    ? query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(100))
    : query(collection(db, "requests"), where("submittedBy", "==", userId));
  return onSnapshot(q,
    (snap) => {
      const reqs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WorkRequest))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(reqs);
    },
    (err) => console.error("[subscribeRequests]", err.code)
  );
}

// ─── DOCUMENTS / TÀI LIỆU ────────────────────────────────────

export async function getFolders(): Promise<DocFolder[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "folders"), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocFolder));
}

export async function saveFolder(f: DocFolder): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "folders", f.id), deepStrip(f), { merge: true });
}

export async function deleteFolder(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "folders", id));
}

export async function getDocuments(folderId: string | null): Promise<WorkDocument[]> {
  const db = getDb();
  const q = query(collection(db, "documents"), where("folderId", "==", folderId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as WorkDocument))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveDocument(doc_: WorkDocument): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "documents", doc_.id), deepStrip({ ...doc_, updatedAt: new Date().toISOString() }), { merge: true });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "documents", id));
}

export function subscribeDocuments(folderId: string | null, callback: (docs: WorkDocument[]) => void, userId?: string, canApprove?: boolean) {
  const db = getDb();
  const q = query(collection(db, "documents"), where("folderId", "==", folderId));
  return onSnapshot(q,
    (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WorkDocument))
        .filter(
          (d) =>
            canApprove ||
            d.status === "published" ||
            d.status === undefined ||
            d.ownerId === userId ||
            (userId && d.sharedWithUsers?.includes(userId))
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(docs);
    },
    (err) => console.error("[subscribeDocuments]", err.code)
  );
}

export async function getPendingDocuments(): Promise<WorkDocument[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, "documents"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as WorkDocument))
    .filter((d) => d.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function approveDocument(id: string, approve: boolean, reason?: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "documents", id), {
    status: approve ? "published" : "rejected",
    ...(reason && { rejectionReason: reason }),
  });
}

// ─── ANNOUNCEMENTS / MẠng NỘI BỘ ────────────────────────────

export async function getAnnouncements(): Promise<Announcement[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Announcement))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
}

export async function saveAnnouncement(a: Announcement): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "announcements", a.id), deepStrip({ ...a, updatedAt: new Date().toISOString() }), { merge: true });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "announcements", id));
}

export async function reactToAnnouncement(announcementId: string, emoji: string, userId: string, add: boolean): Promise<void> {
  const db = getDb();
  const ref = doc(db, "announcements", announcementId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions: Record<string, string[]> = (snap.data().reactions as Record<string, string[]>) ?? {};
  const users = reactions[emoji] ?? [];
  reactions[emoji] = add ? (users.includes(userId) ? users : [...users, userId]) : users.filter((u) => u !== userId);
  if (reactions[emoji].length === 0) delete reactions[emoji];
  await updateDoc(ref, { reactions });
}

export async function markAnnouncementViewed(announcementId: string, userId: string): Promise<void> {
  const db = getDb();
  const ref = doc(db, "announcements", announcementId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const viewedBy: string[] = snap.data().viewedBy ?? [];
  if (!viewedBy.includes(userId)) {
    await updateDoc(ref, { viewedBy: [...viewedBy, userId] });
  }
}

export function subscribeAnnouncements(callback: (items: Announcement[]) => void, userId?: string, canApprove?: boolean) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Announcement))
        .filter((a) => canApprove || a.status === "published" || a.status === undefined || a.authorId === userId)
        .sort((a, b) => {
          // pending items for own author float to top for staff
          const aScore = (b.pinned ? 2 : 0) + (b.status === "pending" && canApprove ? 1 : 0);
          const bScore = (a.pinned ? 2 : 0) + (a.status === "pending" && canApprove ? 1 : 0);
          return aScore - bScore || b.createdAt.localeCompare(a.createdAt);
        });
      callback(items);
    },
    (err) => console.error("[subscribeAnnouncements]", err.code)
  );
}

export async function updateAnnouncement(id: string, data: Partial<Announcement>): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "announcements", id), deepStrip(data) as DocumentData);
}

export async function approveAnnouncement(id: string, approve: boolean, reason?: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "announcements", id), {
    status: approve ? "published" : "rejected",
    ...(reason && { rejectionReason: reason }),
  });
}

export async function getAnnouncementComments(announcementId: string): Promise<AnnouncementComment[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "announcements", announcementId, "comments"), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AnnouncementComment));
}

export async function addAnnouncementComment(announcementId: string, comment: Omit<AnnouncementComment, "id">): Promise<void> {
  const db = getDb();
  const id = generateId("ac");
  await setDoc(doc(db, "announcements", announcementId, "comments", id), { ...comment, id });
  const snap = await getDoc(doc(db, "announcements", announcementId));
  const current = snap.data()?.commentsCount;
  await updateDoc(doc(db, "announcements", announcementId), { commentsCount: typeof current === "number" ? current + 1 : 1 });
}

// ─── CHANNELS / NHÓM CHAT ────────────────────────────────────

export async function getChannels(userId: string): Promise<Channel[]> {
  const db = getDb();
  const [publicSnap, memberSnap] = await Promise.all([
    getDocs(query(collection(db, "channels"), where("type", "==", "public"))),
    getDocs(query(collection(db, "channels"), where("memberIds", "array-contains", userId))),
  ]);
  const map = new Map<string, Channel>();
  [...publicSnap.docs, ...memberSnap.docs].forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Channel));
  return Array.from(map.values()).sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

export async function saveChannel(ch: Channel): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "channels", ch.id), ch, { merge: true });
}

export function subscribeChannels(userId: string, callback: (channels: Channel[]) => void) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "channels"), where("memberIds", "array-contains", userId)),
    (snap) => {
      const channels = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Channel))
        .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
      callback(channels);
    },
    (err) => console.error("[subscribeChannels]", err.code)
  );
}

export function subscribeChannelMessages(channelId: string, callback: (msgs: ChannelMessage[]) => void) {
  const db = getDb();
  return onSnapshot(
    query(collection(db, "channels", channelId, "messages"), orderBy("timestamp", "asc"), limit(100)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChannelMessage))),
    (err) => console.error("[subscribeChannelMessages]", err.code)
  );
}

export async function sendChannelMessage(channelId: string, msg: Omit<ChannelMessage, "id">): Promise<void> {
  const db = getDb();
  const id = generateId("cmsg");
  const message: ChannelMessage = { ...msg, id };
  await setDoc(doc(db, "channels", channelId, "messages", id), message);
  await updateDoc(doc(db, "channels", channelId), {
    lastMessageAt: msg.timestamp,
    lastMessagePreview: msg.content.slice(0, 80),
  });
}

export async function updateChannel(id: string, data: Partial<Channel>): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "channels", id), deepStrip(data) as DocumentData);
}

export async function deleteChannel(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "channels", id));
}

export async function updateChannelMessage(channelId: string, msgId: string, data: Partial<ChannelMessage>): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "channels", channelId, "messages", msgId), deepStrip(data) as DocumentData);
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "channels", channelId), {
    [`memberLastRead.${userId}`]: new Date().toISOString(),
  });
}
