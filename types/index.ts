// ============================================================
// ARiHA WorkHub v2 — Core TypeScript Type Definitions
// ============================================================

// ─── USERS & AUTH ────────────────────────────────────────────

export type UserRole = "guest" | "staff" | "teamLead" | "director" | "hrAdmin";

export interface BankAccount {
  bankId: string;         // Mã BIN ngân hàng (VD: "970436" = VCB)
  bankName: string;       // Tên ngân hàng hiển thị
  accountNumber: string;  // Số tài khoản
  accountName: string;    // Tên chủ tài khoản
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
  avatar?: string;
  phone?: string;
  position?: string;
  birthday?: string;
  joinDate?: string;
  exitDate?: string;
  bio?: string;
  createdAt: string;
  bankAccount?: BankAccount;
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

export interface StepSubTask {
  id: string;
  userId: string;
  priority: TaskPriority;
  deadline?: string;
  note?: string;
  progress: number;
  proofs: Proof[];
  amountType: "none" | "income" | "expense";
  amount: number;
  status: "pending" | "in_progress" | "completed";
  createdAt: string;
  completedAt?: string;
}

export interface CompletionProposal {
  submittedBy: string;
  submittedAt: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
  reviewRating?: number;
}

export interface TaskStep {
  id: string;
  name: string;
  description?: string;
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
  subTasks?: StepSubTask[];
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

export interface TaskResource {
  id: string;
  type: "file" | "link";
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  addedBy: string;
  addedByName: string;
  addedAt: string;
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

  // Completion proposal (main performer → manager approval)
  completionProposal?: CompletionProposal;

  // Resources shared by main performer
  resources?: TaskResource[];

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
  recalled?: boolean;
  deletedFor?: string[];
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

export interface WorkflowNode {
  id: string;
  name: string;
  description?: string;
  department?: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string; // nodeId or "ext::workflowId::nodeId"
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  departments?: string[];
  department?: string;
  status: "pending" | "published";
  createdBy: string;
  createdByName: string;
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
  | "completion_proposal"
  | "completion_reviewed"
  | "request_submitted"
  | "request_approved"
  | "request_rejected"
  | "birthday_reminder"
  | "announcement_new"
  | "channel_message"
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
  | "digest_weekly"
  | "step_notification";

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
  userName: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  type: CalendarEventType;
  taskId?: string;
  meetLink?: string;
  location?: string;
  status: "pending" | "published";
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
  | "support_tasks"
  | "kpi_week"
  | "calendar_mini"
  | "deadline_alert"
  | "team_leaderboard"
  | "workload_heatmap"
  | "internal_messages"
  | "risk_flags"
  | "analytics_summary"
  | "quick_actions"
  | "annual_kpi"
  | "financial_overview";

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
  overdueOnly?: boolean;
  pendingReview?: boolean;
  nearDeadline?: boolean;
  dateRange?: { start: string; end: string };
}

// ─── API RESPONSES ────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// ─── REQUESTS / ĐƠN TỪ ──────────────────────────────────────

export type RequestType =
  | "leave"           // Nghỉ phép
  | "overtime"        // Tăng ca
  | "expense"         // Hoàn ứng chi phí
  | "equipment"       // Mượn / cấp thiết bị
  | "training"        // Đăng ký đào tạo
  | "wfh"             // Làm việc từ xa
  | "custom";         // Đơn tùy biến

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RequestFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "daterange" | "number" | "select" | "file";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface RequestTemplate {
  id: string;
  name: string;
  type: RequestType;
  description?: string;
  icon?: string;
  fields: RequestFieldDef[];
  approverRole: UserRole;
  isActive: boolean;
  status: "pending" | "published";
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface WorkRequest {
  id: string;
  templateId: string;
  templateName: string;
  type: RequestType;
  title: string;
  submittedBy: string;
  submittedByName: string;
  submittedByAvatar?: string;
  department?: string;
  formData: Record<string, string | number | string[]>;
  status: RequestStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComment?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
}

// ─── DOCUMENTS / TÀI LIỆU ────────────────────────────────────

export type DocFileType = "image" | "pdf" | "word" | "excel" | "powerpoint" | "video" | "link" | "other";

export interface DocFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  department?: string;
  sharedWithRoles: UserRole[];
  sharedWithUsers?: string[];
  color?: string;
  createdAt: string;
}

export interface WorkDocument {
  id: string;
  name: string;
  description?: string;
  folderId: string | null;
  fileUrl: string;
  fileType: DocFileType;
  status: "pending" | "published";
  fileSize?: number;
  mimeType?: string;
  ownerId: string;
  ownerName: string;
  department?: string;
  tags: string[];
  sharedWithRoles: UserRole[];
  sharedWithUsers: string[];
  taskId?: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── INTRANET / MẠNG NỘI BỘ ──────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  status: "pending" | "published";
  authorAvatar?: string;
  targetRoles: UserRole[];
  attachments: Attachment[];
  reactions: Record<string, string[]>; // emoji → userIds[]
  pinned: boolean;
  commentsCount: number;
  viewedBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementComment {
  id: string;
  announcementId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: "public" | "private" | "department";
  department?: string;
  memberIds: string[];
  createdBy: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  memberLastRead?: Record<string, string>; // userId → ISO timestamp
  createdAt: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  attachments: Attachment[];
  reactions: Record<string, string[]>;
  timestamp: string;
  edited?: boolean;
  recalled?: boolean;       // thu hồi (visible to all as placeholder)
  deletedFor?: string[];    // user IDs who deleted locally
}

// ─── FINANCE MODULE ───────────────────────────────────────────
// Hệ thống quản lý tài chính tích hợp nhiệm vụ
// Luồng: Tạm ứng → Chi tiêu → Quyết toán | Tự ứng → Hoàn ứng

/**
 * Nguồn tiền của giao dịch:
 * - ADVANCE      : Chi từ khoản tạm ứng công ty đã cấp cho nhân viên
 * - OUT_OF_POCKET: Nhân viên tự bỏ tiền túi, công ty sẽ hoàn sau
 * - REVENUE      : Khoản thu về (khách hàng, đối tác, thu hồi vật liệu...)
 */
export type TransactionFundSource = "ADVANCE" | "OUT_OF_POCKET" | "REVENUE";

/** Chiều dòng tiền: DEBIT = tiền ra, CREDIT = tiền vào */
export type TransactionDirection = "DEBIT" | "CREDIT";

/**
 * Trạng thái giao dịch:
 * - PENDING_PROOF: Chờ bổ sung chứng từ (bắt buộc cho OUT_OF_POCKET)
 * - VALID        : Hợp lệ, được tính vào quyết toán
 * - REJECTED     : Từ chối (chứng từ không hợp lệ, trùng lặp...)
 */
export type TransactionStatus = "PENDING_PROOF" | "VALID" | "REJECTED";

/** Giao dịch tài chính – đơn vị ghi nhận từng khoản thu/chi */
export interface FinancialTransaction {
  id: string;
  taskId: string;
  stepId?: string;              // Gắn vào bước cụ thể (tùy chọn)
  createdBy: string;            // userId người tạo
  createdByName: string;
  amount: number;               // Số tiền (luôn dương, đơn vị VNĐ)
  direction: TransactionDirection;
  fundSource: TransactionFundSource;
  category: string;             // Phân loại: "Vật tư", "Đi lại", "Ăn uống"...
  description: string;          // Mô tả chi tiết
  proofs: FinancialProof[];     // Hóa đơn, chứng từ đính kèm
  status: TransactionStatus;
  advanceRequestId?: string;    // Liên kết đơn tạm ứng (nếu nguồn = ADVANCE)
  reimbursementRequestId?: string; // Liên kết đơn hoàn ứng (nếu nguồn = OUT_OF_POCKET)
  rejectedReason?: string;      // Lý do từ chối (nếu status = REJECTED)
  createdAt: string;
  updatedAt: string;
}

/** Chứng từ / hóa đơn đính kèm giao dịch */
export interface FinancialProof {
  id: string;
  name: string;                 // Tên file hoặc mô tả
  url: string;                  // Firebase Storage URL
  type: string;                 // MIME type
  size?: number;                // Kích thước file (bytes)
  uploadedBy: string;           // userId
  uploadedAt: string;
}

/**
 * Trạng thái đơn tạm ứng:
 * - PENDING : Chờ cấp trên duyệt
 * - APPROVED: Đã duyệt, tiền đã được giải ngân cho nhân viên
 * - REJECTED          : Bị từ chối
 * - PENDING_SETTLEMENT: Đã nộp thanh toán, chờ quản lý duyệt
 * - SETTLED           : Đã quyết toán hoàn ứng
 */
export type AdvanceRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "PENDING_SETTLEMENT" | "SETTLED";

/** Đơn đề nghị tạm ứng từ công ty */
export interface AdvanceRequest {
  id: string;
  taskId: string;
  stepId?: string;              // Bước nhiệm vụ liên quan (nếu tạo từ bước)
  stepName?: string;            // Tên bước (denormalized để hiển thị nhanh)
  requestedBy: string;          // userId nhân viên
  requestedByName: string;
  amount: number;               // Số tiền xin tạm ứng
  purpose: string;              // Mục đích sử dụng
  bankAccount?: BankAccount;    // Tài khoản nhận tiền tạm ứng
  status: AdvanceRequestStatus;
  approvedBy?: string;          // userId người duyệt
  approvedByName?: string;
  approvedAt?: string;
  rejectedReason?: string;
  // ── Theo dõi số dư sau khi duyệt ──
  usedAmount: number;           // Đã chi (tổng giao dịch ADVANCE hợp lệ)
  remainingAmount: number;      // Còn lại (= amount - usedAmount)
  // ── Thanh toán (staff nộp sau khi dùng tạm ứng) ──
  settlementAmountUsed?: number;       // Số tiền đã chi tiêu thực tế
  settlementProofs?: FinancialProof[]; // Chứng từ thanh toán
  settlementNotes?: string;            // Ghi chú của nhân viên
  settlementSubmittedAt?: string;      // Thời điểm nộp đơn thanh toán
  settlementRejectedReason?: string;   // Lý do từ chối thanh toán
  // ── Thông tin quyết toán (sau khi manager duyệt) ──
  settledAt?: string;
  settlementDifference?: number; // > 0: NV trả lại | < 0: Công ty chi thêm
  settlementType?: "RETURN_TO_COMPANY" | "PAY_EMPLOYEE_ADDITIONAL" | "BALANCED";
  settlementApprovedBy?: string;
  settlementApprovedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Trạng thái đơn đề nghị hoàn ứng (tự ứng tiền túi):
 * - DRAFT    : Tự động tạo khi có giao dịch OUT_OF_POCKET, cần bổ sung chứng từ
 * - SUBMITTED: Nhân viên đã nộp đơn chính thức, chờ kế toán/quản lý duyệt
 * - APPROVED : Đã duyệt, chờ chuyển tiền
 * - PAID     : Đã thanh toán cho nhân viên
 * - REJECTED : Từ chối (chứng từ không hợp lệ)
 */
export type ReimbursementStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";

/** Đơn đề nghị hoàn ứng – khi nhân viên tự bỏ tiền túi ra chi */
export interface ReimbursementRequest {
  id: string;
  taskId: string;
  transactionId?: string;       // Giao dịch OUT_OF_POCKET gốc (optional khi tạo trực tiếp từ bước)
  stepId?: string;              // Bước nhiệm vụ liên quan
  stepName?: string;
  requestedBy: string;          // userId nhân viên
  requestedByName: string;
  amount: number;               // Số tiền cần hoàn trả
  description: string;
  proofs: FinancialProof[];     // Bắt buộc có chứng từ
  status: ReimbursementStatus;
  submittedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  paidAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Tổng hợp tài chính của Task (denormalized để render nhanh, không cần query nhiều) */
export interface TaskFinancialSummary {
  taskId: string;
  budget: number;               // Ngân sách dự kiến được giao
  totalAdvanced: number;        // Tổng tạm ứng đã được duyệt
  totalAdvanceUsed: number;     // Đã chi từ tạm ứng (giao dịch ADVANCE hợp lệ)
  totalAdvanceRemaining: number;// Tạm ứng còn lại có thể dùng
  totalOutOfPocket: number;     // Tổng tự ứng (giao dịch OUT_OF_POCKET)
  totalPendingReimbursement: number; // Tổng chờ hoàn ứng (OUT_OF_POCKET chưa PAID)
  totalRevenue: number;         // Tổng khoản thu
  totalExpense: number;         // Tổng chi (ADVANCE + OUT_OF_POCKET)
  netCashFlow: number;          // = totalRevenue - totalExpense
  budgetUtilizationPct: number; // = totalExpense / budget * 100
  financialStatus: "ACTIVE" | "RECONCILING" | "SETTLED";
  lastUpdated: string;
}
