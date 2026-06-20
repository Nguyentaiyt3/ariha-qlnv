// ============================================================
// ARiHA WorkHub v2 — Core TypeScript Type Definitions
// ============================================================

// ─── USERS & AUTH ────────────────────────────────────────────

export type UserRole = "guest" | "staff" | "teamLead" | "director" | "hrAdmin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
  avatar?: string;
  phone?: string;
  position?: string;
  createdAt: string;
  dashboardProfiles?: DashboardProfile[];
  notificationPrefs?: NotificationPrefs;
  googleCalendarToken?: GoogleToken;
  isActive: boolean;
}

export interface NotificationPrefs {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestFreq: "realtime" | "daily" | "weekly";
  disabledEventTypes?: EmailEventType[];
}

export interface GoogleToken {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

// ─── PROJECTS ────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  teamIds: string[];
  color?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── TASKS ───────────────────────────────────────────────────

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";
export type TaskPhase = "prepare" | "execute" | "finalize";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type StakeholderRole = "assignee" | "collaborator" | "watcher" | "approver";

export interface Stakeholder {
  userId: string;
  role: StakeholderRole;
}

export interface SubTask {
  id: string;
  name: string;
  completed: boolean;
  assigneeId?: string;
  deadline?: string;
}

export interface TaskStep {
  id: string;
  name: string;
  assigneeId: string;
  status: "pending" | "in_progress" | "completed";
  progress: number;
  kpiTarget: number;
  kpiCurrent: number;
  kpiUnit: string;
  proofs: Proof[];
  amount?: number;
  amountType?: "none" | "income" | "expense";
  durationDays?: number;
  deadline?: string;
  completedAt?: string;
}

export interface Proof {
  id: string;
  fileName: string;
  fileType: "image" | "pdf" | "link" | "video";
  fileUrl: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface TimeLog {
  id: string;
  userId: string;
  minutes: number;
  date: string;
  note?: string;
  taskId: string;
}

export interface Task {
  id: string;
  projectId?: string;
  name: string;
  description: string;
  status: TaskStatus;
  phase: TaskPhase;
  priority: TaskPriority;

  // Deadlines (3-phase)
  deadlineBase: string;
  deadlinePrepare: string;
  deadlineExecute: string;
  deadlineFinalize: string;

  // People
  creatorId: string;
  mainPerformerId: string;
  stakeholders: Stakeholder[];

  // Dependencies
  dependencies: string[];

  // Workflow
  workflowId?: string;
  workflowName?: string;

  // Steps & subtasks
  steps: TaskStep[];
  subtasks: SubTask[];

  // KPI
  kpi: {
    type: "completion_time" | "output_count" | "budget_spent" | "custom";
    target: number;
    current: number;
    unit: string;
  };

  // Tracking
  progress: number;
  riskFlag: boolean;
  timeLogs: TimeLog[];

  // Approval
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;

  // Evaluation
  evaluation?: string;
  evaluationRating?: number;

  // Finance
  totalAmount?: number;
  totalIncome?: number;
  totalExpense?: number;

  // Google Calendar
  googleCalendarEventId?: string;

  // Meta
  department?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AuditEvent {
  id: string;
  taskId: string;
  action: string;
  userId: string;
  userName: string;
  before?: Partial<Task>;
  after?: Partial<Task>;
  note?: string;
  timestamp: string;
}

// ─── MESSAGES ────────────────────────────────────────────────

export interface Message {
  id: string;
  taskId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  mentions: string[];
  attachments: Attachment[];
  timestamp: string;
  edited?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number;
}

// ─── WORKFLOWS ───────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  order: number;
  durationDays?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  department?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── MILESTONE CONFIG (3-phase deadline) ─────────────────────

export interface MilestoneConfig {
  id: string;
  name: string;
  daysBeforeForPrepare: number;
  daysAfterForFinalize: number;
  department?: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
}

// ─── PERFORMANCE & KPI ────────────────────────────────────────

export interface KPIIndicator {
  id: string;
  name: string;
  description?: string;
  weight: number;
  unit: string;
  targetPerPeriod?: number;
}

export interface KPIFramework {
  id: string;
  name: string;
  department?: string;
  year: number;
  period: "monthly" | "quarterly" | "yearly";
  indicators: KPIIndicator[];
  createdBy: string;
  createdAt: string;
}

export type EvaluationType = "self" | "manager" | "peer";

export interface Evaluation {
  id: string;
  frameworkId?: string;
  taskId?: string;
  evaluatedUserId: string;
  evaluatorId: string;
  type: EvaluationType;
  isAnonymous: boolean;
  scores: Record<string, number>;
  comment: string;
  period: string;
  overallScore?: number;
  createdAt: string;
}

export interface PerformanceScore {
  userId: string;
  period: string;
  executionScore: number;
  qualitativeScore: number;
  overallScore: number;
  onTimeRate: number;
  tasksCompleted: number;
  avgProgress: number;
  rank?: number;
  trend?: "up" | "down" | "stable";
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export type NotificationType =
  | "task_assigned"
  | "task_overdue"
  | "deadline_alert"
  | "status_changed"
  | "comment_mention"
  | "approval_request"
  | "task_completed"
  | "calendar_change_request"
  | "calendar_change_approved"
  | "risk_flag"
  | "digest";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  priority: "low" | "normal" | "urgent";
  taskId?: string;
  createdAt: string;
}

// ─── EMAIL ───────────────────────────────────────────────────

export type EmailEventType =
  | "task_assigned"
  | "deadline_alert"
  | "task_overdue"
  | "comment_mention"
  | "approval_request"
  | "task_completed"
  | "calendar_change"
  | "digest_daily"
  | "digest_weekly";

export interface EmailLog {
  id: string;
  taskId?: string;
  recipientIds: string[];
  recipientEmails: string[];
  eventType: EmailEventType;
  subject: string;
  sentAt: string;
  status: "sent" | "failed" | "bounced";
  errorMessage?: string;
}

// ─── CALENDAR ────────────────────────────────────────────────

export type CalendarEventType = "internal" | "google" | "meeting";

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  type: CalendarEventType;
  taskId?: string;
  meetLink?: string;
  location?: string;
  changeRequest?: CalendarChangeRequest;
  googleEventId?: string;
  color?: string;
}

export interface CalendarChangeRequest {
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  reason?: string;
  newStart?: string;
  newEnd?: string;
  newTitle?: string;
}

// ─── DASHBOARD WIDGETS ────────────────────────────────────────

export type WidgetType =
  | "my_tasks"
  | "kpi_week"
  | "calendar_mini"
  | "deadline_alert"
  | "team_leaderboard"
  | "workload_heatmap"
  | "internal_messages"
  | "risk_flags"
  | "analytics_summary"
  | "quick_actions";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  settings?: Record<string, unknown>;
}

export interface DashboardProfile {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  isDefault: boolean;
  createdAt: string;
}

// ─── TRANSACTIONS (Finance) ───────────────────────────────────

export interface Transaction {
  id: string;
  taskId?: string;
  stepId?: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  status: "completed" | "pending";
  department: string;
  assigneeName?: string;
  createdAt: string;
  isAuto?: boolean;
}

// ─── FILTER & VIEW STATE ──────────────────────────────────────

export type TaskViewMode = "kanban" | "gantt" | "list" | "calendar";

export interface TaskFilters {
  search: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assigneeId?: string;
  department?: string;
  phase?: TaskPhase;
  riskOnly?: boolean;
  nearDeadline?: boolean;
  dateRange?: { start: string; end: string };
}

// ─── API RESPONSES ────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}
