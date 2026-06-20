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
  await setDoc(doc(db, "tasks", taskId, "messages", id), newMsg);
  return newMsg;
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

// ─── WORKFLOWS ────────────────────────────────────────────────

export async function getWorkflows(): Promise<Workflow[]> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, "workflows"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workflow));
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "workflows", workflow.id), workflow, { merge: true });
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

export async function saveEvaluation(evaluation: Evaluation): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "evaluations", evaluation.id), evaluation, { merge: true });
}
