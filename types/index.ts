// ============================================================
// ARiHA WorkHub v2 — Core TypeScript Type Definitions
// ============================================================

// ─── USERS & AUTH ────────────────────────────────────────────

export type UserRole =
  | "guest"
  | "staff"
  | "teamLead"       // unitHead: Trưởng/Phó phòng, khoa, viện, trung tâm
  | "director"       // Ban Giám đốc: Phó GĐ, Giám đốc
  | "hrAdmin"
  | "financeViewer"      // Theo dõi tài chính — chỉ xem
  | "financeAuditor"     // Kiểm tra tài chính — xem + đối soát/ghi chú
  | "financeSupervisor"; // Giám sát tài chính — xem + duyệt + quản lý

/**
 * Một vị trí chức vụ cụ thể — dùng cho kiêm nhiệm.
 * User.positions[] có thể chứa nhiều OrgPosition cùng lúc.
 */
export interface OrgPosition {
  /** Quyền hạn hệ thống của vị trí này. */
  role: UserRole;
  /** Chức danh hiển thị (VD: "Giám đốc", "Viện trưởng", "Trưởng phòng Kế hoạch"). */
  title: string;
  /** Loại đơn vị. null = toàn cơ quan. */
  unitType?: "phong" | "khoa" | "vien" | "trung_tam" | "co_quan";
  /** ID đơn vị quản lý. null/undefined = phạm vi toàn cơ quan. */
  scopeUnitId?: string | null;
  /** Tên đơn vị (cache để hiển thị). */
  unitName?: string;
  /** Từ ngày nhận chức. */
  from?: string;
  /** Đến ngày (nếu đã kết thúc kiêm nhiệm). */
  to?: string;
}

// ─── CHỨC VỤ & QUY TRÌNH PHÊ DUYỆT ────────────────────────────

/** Cấp tổ chức: 1=Ban GĐ, 2=Khoa/Phòng/TT/Viện, 3=Đơn vị thuộc TT/Viện, 4=Nhân viên */
export type UnitLevel = 1 | 2 | 3 | 4;

/** Định nghĩa một chức vụ/chức danh trong danh mục hệ thống */
export interface PositionDef {
  id: string;
  title: string;      // Chức danh ngắn: "Trưởng phòng", "Giám đốc"
  name: string;       // Tên đầy đủ: "Trưởng phòng Kế hoạch tổng hợp"
  unitLevel: UnitLevel;
  createdAt: string;
}

/** Một bước trong chuỗi phê duyệt (có thứ tự) */
export interface ApprovalStep {
  order: number;          // 1, 2, 3...
  label: string;          // "Trưởng khoa/phòng", "Giám đốc TT", "Giám đốc"
  positionIds: string[];  // chức vụ nào có thể duyệt bước này
}

/** Quy tắc trình/duyệt cho một phạm vi */
export interface ApprovalRule {
  id: string;
  /**
   * "default" — mặc định cho tất cả đơn vị cùng unitLevel chưa có rule riêng
   * "unit"    — ghi đè default cho một đơn vị cụ thể
   */
  scope: "default" | "unit";
  unitLevel?: 2 | 3;             // scope="default": cấp đơn vị áp dụng
  unitName?: string;             // scope="unit": tên đơn vị cụ thể
  submitterPositionIds: string[];
  steps: ApprovalStep[];         // chuỗi duyệt có thứ tự
  description?: string;
  updatedAt: string;
}

/** Định nghĩa một đơn vị (Khoa/Phòng/TT/Viện hoặc đơn vị con) trong danh mục */
export interface UnitDef {
  id: string;
  name: string;          // Tên đầy đủ: "Khoa Nội tim mạch"
  abbr?: string;         // Tên viết tắt: "K.NTM"
  parentId?: string;     // ID đơn vị cha — null/undefined = đơn vị gốc (cấp 2)
  unitLevel: 2 | 3;     // 2 = Khoa/Phòng/TT/Viện, 3 = Đơn vị con thuộc TT/Viện
  source: "auto" | "manual"; // auto = phát hiện từ DB, manual = admin thêm
  createdAt: string;
}

export interface BankAccount {
  bankId: string;         // Mã BIN ngân hàng (VD: "970436" = VCB)
  bankName: string;       // Tên ngân hàng hiển thị
  accountNumber: string;  // Số tài khoản
  accountName: string;    // Tên chủ tài khoản
}

export type ContractType = "indefinite" | "fixed_term" | "probation" | "collaborator";

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  indefinite:   "Không xác định thời hạn",
  fixed_term:   "Có thời hạn",
  probation:    "Thử việc",
  collaborator: "Cộng tác viên",
};

export type CredentialType = "degree" | "license" | "cme" | "other";

export const CREDENTIAL_TYPE_LABEL: Record<CredentialType, string> = {
  degree:  "Bằng cấp",
  license: "Chứng chỉ hành nghề",
  cme:     "CME / Đào tạo liên tục",
  other:   "Khác",
};

/** Chứng chỉ/bằng cấp của nhân viên — theo dõi hạn để cảnh báo trước khi hết hiệu lực. */
export interface StaffCredential {
  id: string;
  name: string;          // Tên chứng chỉ/bằng cấp
  type: CredentialType;
  issuer?: string;        // Nơi cấp
  issueDate?: string;
  expiryDate?: string;    // Bỏ trống nếu không có hạn (vd. bằng đại học)
  fileUrl?: string;       // Ảnh/PDF minh chứng — lưu dạng base64 data URL (theo pattern Proof hiện có)
  fileName?: string;
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
  idNumber?: string;          // Số CCCD/CMND
  // ── Hồ sơ hợp đồng ──
  employeeCode?: string;      // Mã nhân viên
  contractType?: ContractType;
  contractStart?: string;     // Ngày bắt đầu hợp đồng hiện tại
  contractEnd?: string;       // Ngày kết thúc — dùng để cảnh báo sắp hết hạn
  /** Chứng chỉ/bằng cấp — dùng cho dashboard cảnh báo hết hạn CME/chứng chỉ hành nghề. */
  credentials?: StaffCredential[];
  /** Task quy trình hội nhập — tự sinh khi tài khoản được duyệt từ "guest" sang vai trò chính thức. */
  onboardingTaskId?: string;
  /** Task quy trình nghỉ việc — tự sinh khi đơn "Nghỉ việc" được phê duyệt. */
  offboardingTaskId?: string;
  // ── Hồ sơ học vấn & khoa học ──
  educationLevel?: string;   // Trình độ (Đại học, Thạc sĩ, Tiến sĩ...)
  major?: string;            // Chuyên ngành
  academicTitle?: string;    // Học hàm / học vị (GS, PGS, TS, ThS...)
  scientificProfile?: string;// Lý lịch khoa học (công trình, bài báo, đề tài...)
  workHistory?: string;      // Quá trình công tác
  // ── Bảo mật mật khẩu ──
  mustChangePassword?: boolean; // Bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo
  passwordUpdatedAt?: string;   // Lần đổi mật khẩu gần nhất
  createdAt: string;
  bankAccount?: BankAccount;
  dashboardProfiles?: DashboardProfile[];
  notificationPrefs?: NotificationPrefs;
  googleCalendarToken?: GoogleToken;
  isActive: boolean;
  /**
   * Danh sách chức vụ (bao gồm kiêm nhiệm).
   * Khi check quyền: lấy role cao nhất trong mảng.
   * Khi lọc dữ liệu: dùng scopeUnitId của từng position.
   * Nếu mảng rỗng/không có: dùng User.role làm fallback.
   */
  positions?: OrgPosition[];
  /**
   * Chỉ định cố định trong hệ thống NCKH — dùng để lọc khi chọn phản biện/hội đồng.
   * Độc lập với việc được gán vào từng đề tài cụ thể (ResearchReview / ResearchCouncilSession).
   */
  researchDesignations?: ResearchDesignation[];
}

export interface NotificationPrefs {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestFreq: "realtime" | "daily" | "weekly";
  disabledEventTypes?: EmailEventType[];
  /** Số ngày giữ thông báo đã đọc trước khi tự xóa. 0 = không tự xóa. Mặc định 30. */
  retentionDays?: number;
}

// ─── UNIT PLANS (kế hoạch chỉ tiêu đơn vị) ──────────────────────

export type PlanItemStatus = "todo" | "doing" | "done";

/** Một nhiệm vụ trong kế hoạch — lồng nhiều cấp (con/cháu/chít) qua parentId. */
export interface PlanItem {
  id: string;
  parentId: string | null;   // null = cấp 1 (con trực tiếp của kế hoạch)
  name: string;
  status: PlanItemStatus;
  assigneeId?: string;
  deadline?: string;
  note?: string;
  order?: number;
  taskId?: string;           // tuỳ chọn: liên kết với Task đã tạo
}

/** Cách cộng dồn nhiệm vụ để so với chỉ tiêu kế hoạch. */
export type PlanMetricType = "count" | "revenue" | "expense";

/** Kế hoạch thực hiện một chỉ tiêu chung của đơn vị (VD: Hội thảo — 4 cái/năm). */
export interface UnitPlan {
  id: string;
  name: string;            // VD: "Tổ chức Hội thảo khoa học"
  description?: string;
  year: number;
  target: number;          // chỉ tiêu năm (VD: 4)
  unit: string;            // đơn vị tính (VD: "hội thảo", "buổi", "đề tài")
  /** Cách tính đạt chỉ tiêu: đếm số nhiệm vụ đạt / cộng thu / cộng chi. Mặc định "count". */
  metricType?: PlanMetricType;
  department?: string;
  ownerId?: string;
  items: PlanItem[];       // cây nhiệm vụ con/cháu/chít
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

// ─── NGHIÊN CỨU KHOA HỌC (thẩm định & công nhận đề tài cấp cơ sở) ─

/** Giai đoạn tổng của đề tài. */
export type ResearchStage =
  | "init"        // Đăng ký — chờ tiếp nhận
  | "proposal"    // GĐ1 — Thẩm định đề cương
  | "executing"   // Đang triển khai thực hiện (sau khi đề cương được duyệt)
  | "recognition" // GĐ2 — Nghiệm thu & công nhận
  | "completed"   // Hoàn tất
  | "rejected";   // Từ chối / Đình chỉ

/** Các bước trong quy trình đề tài (cố định). */
export type ResearchStepKey =
  | "create"        // GĐ0: nhân viên tạo đề tài
  | "approve_task"  // GĐ0: quản lý phê duyệt task
  | "notify"        // GĐ0: thông báo nhân viên
  | "p_intake"      // GĐ1: tiếp nhận
  | "p_compile"     // GĐ1: tổng hợp đề cương, nộp báo cáo quản lý
  | "p_assign"      // GĐ1: phê duyệt thực hiện + gán người thực hiện chính/giám sát (theo nhóm)
  | "p_review"      // GĐ1: 2 phản biện kín
  | "p_council"     // GĐ1: họp Hội đồng KHCN
  | "p_ethics"      // GĐ1: chứng nhận y đức
  | "p_agree"       // GĐ1: đồng ý cho thực hiện
  | "exec_start"    // Triển khai: bắt đầu thực hiện đề tài
  | "exec_midterm"  // Triển khai: báo cáo tiến độ giữa kỳ (optional)
  | "exec_submit"   // Triển khai: nộp báo cáo kết quả (chuyển sang GĐ2)
  | "r_intake"      // GĐ2: tiếp nhận kết quả
  | "r_review"      // GĐ2: 2 phản biện kín
  | "r_council"     // GĐ2: họp Hội đồng KHCN
  | "r_recognize";  // GĐ2: công nhận phạm vi ảnh hưởng

export type ResearchStepStatus = "pending" | "in_progress" | "passed" | "failed";

export interface ResearchStepState {
  key: ResearchStepKey;
  status: ResearchStepStatus;
  note?: string;
  completedAt?: string;
  completedBy?: string;
}

/**
 * 7 tiêu chí đánh giá đề tài (mỗi tiêu chí 1-5 điểm, tổng tối đa 35).
 * Khớp với cấu trúc "PHIẾU NHẬN XÉT ĐỀ TÀI CẤP CƠ SỞ".
 */
export interface ReviewScores {
  datvande: number;         // 1. Đặt vấn đề
  muctieu: number;          // 2. Mục tiêu
  ppThietke: number;        // 3a. Phương pháp — thiết kế & đối tượng
  ppQuytrinh: number;       // 3b. Phương pháp — quy trình thu thập & phân tích
  ketqua: number;           // 4. Kết quả
  ketluanBandluan: number;  // 5. Kết luận - Bàn luận
  cachTrinhbay: number;     // 6. Cách trình bày
}

export type ReviewVerdict = "pass" | "pass_if_revised" | "fail";
export type ReviewGrade   = "excellent" | "good" | "average" | "fail";

export interface IntakeLog {
  id: string;
  action: "accepted" | "revision_requested";
  userId: string;
  userName: string;
  note?: string;
  timestamp: string;
}

/** Phiếu phản biện kín — nội bộ (có tài khoản) hoặc chuyên gia ngoài. */
export interface ResearchReview {
  id: string;
  stage: "proposal" | "recognition";
  reviewerType: "internal" | "external";
  reviewerId?: string;      // nếu nội bộ
  reviewerName?: string;    // nếu ngoài (hoặc hiển thị)
  reviewerEmail?: string;
  reviewerOrg?: string;
  assignedAt: string;
  assignedBy?: string;      // userId người chỉ định
  assignedByName?: string;
  token?: string;           // token bảo mật — gửi qua email để phản biện không cần đăng nhập
  dueAt?: string;
  submittedAt?: string;

  // ── Chi tiết phiếu nhận xét ──
  topicFileUrl?: string;    // File PDF đề tài (Google Drive hoặc upload)
  scores?: ReviewScores;    // 7 tiêu chí (1-5 mỗi tiêu chí)

  // 4 trường đánh giá định tính
  urgency?: string;         // Tính cấp thiết
  methodFit?: string;       // Sự phù hợp thiết kế
  novelty?: string;         // Tính mới kết quả
  significance?: string;    // Ý nghĩa khoa học & ứng dụng

  revisionPoints?: string;  // Các điểm cần chỉnh sửa
  additionalComments?: string; // Ý kiến thêm

  verdict?: ReviewVerdict;  // KẾT LUẬN: ĐẠT / KHÔNG ĐẠT / ĐẠT nếu chỉnh sửa
  grade?: ReviewGrade;      // Xếp loại: Giỏi / Khá / Trung bình / KHÔNG ĐẠT
  needResubmit?: boolean;   // Cần nộp lại bài?

  // ── Ghi chú & highlight của phản biện viên (riêng tư, không chia sẻ) ──
  reviewerNotes?: string;                  // Ghi chú văn bản tự do
  reviewerAnnotations?: ResearchAnnotation[]; // Highlight + ghi chú trên file

  // ── Email tracking (quản lý gửi mail mời / nhắc nhở phản biện) ──
  emailSentAt?: string;      // ISO — lần đầu gửi mail mời
  lastReminderAt?: string;   // ISO — lần nhắc nhở gần nhất
  reminderCount?: number;    // tổng số lần nhắc nhở đã gửi

  // ── Legacy fields (kept for compatibility) ──
  recommendation?: "pass" | "revise" | "fail";
  score?: number;           // Tổng điểm (tự tính từ scores)
  comments?: string;
  fileUrl?: string;
  status: "assigned" | "submitted";
}

/**
 * Highlight + ghi chú trên file đề cương (Word/PDF render). Neo theo nội dung
 * văn bản (text-quote anchoring) để bám đúng vị trí qua mỗi lần render lại.
 */
export interface ResearchAnnotation {
  id: string;
  fileUrl: string;            // file mà annotation này gắn vào
  color: "yellow" | "green" | "pink" | "blue";
  quote: string;              // đoạn văn bản được bôi
  prefix?: string;            // ~40 ký tự ngay trước (để neo chính xác)
  suffix?: string;            // ~40 ký tự ngay sau
  occurrence?: number;        // lần xuất hiện thứ mấy của quote (0-based) khi trùng
  note?: string;              // ghi chú kèm theo (có thể rỗng = chỉ highlight)
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ResearchCouncilVote {
  memberId: string;
  memberName?: string;  // bản sao tên khi bỏ phiếu (qua link email)
  voteToken?: string;   // token link một lần (phiếu gửi qua email)
  vote: "approve" | "reject" | "abstain";
  comment?: string;
  votedAt: string;
}

/** Phiên họp Hội đồng KHCN — họp trực tiếp (quyết nghị chung) hoặc online (phiếu biểu quyết). */
export interface ResearchCouncilSession {
  id: string;
  stage: "proposal" | "recognition";
  mode: "in_person" | "online";
  scheduledAt?: string;
  location?: string;
  /** Danh sách thành viên với vai trò (chủ tịch / thành viên / thư ký). */
  members?: ResearchCouncilMember[];
  /** @deprecated dùng members[].userId thay thế */
  memberIds?: string[];
  votes?: ResearchCouncilVote[];               // chế độ online
  decision?: "passed" | "failed" | "revise";   // kết luận chung
  conclusion?: string;
  minutesUrl?: string;                         // biên bản họp
  createdAt: string;
}

export interface ResearchCertificate {
  type: "ethics" | "recognition";
  number?: string;
  issuedAt?: string;
  issuedBy?: string;
  fileUrl?: string;
  scope?: string;   // phạm vi ảnh hưởng (cấp cơ sở)
}

/**
 * Chỉ định NCKH cố định của người dùng — khác với việc được gán vào từng đề tài.
 * Lưu trong User.researchDesignations[] để lọc khi chọn phản biện / hội đồng.
 * - researchManager : Quản lý NCKH — cấp canMonitor (giám sát, tiếp nhận đề cương)
 * - reviewer        : được phép làm phản biện kín
 * - councilMember   : thành viên Hội đồng KHCN
 * - councilChair    : Chủ tịch Hội đồng KHCN
 * - councilSecretary: Thư ký Hội đồng KHCN
 */
export type ResearchDesignation =
  | "researchManager"
  | "reviewer"
  | "councilMember"
  | "councilChair"
  | "councilSecretary";

export const RESEARCH_DESIGNATION_LABEL: Record<ResearchDesignation, string> = {
  researchManager:  "Quản lý NCKH",
  reviewer:         "Phản biện NCKH",
  councilMember:    "Thành viên HĐ KHCN",
  councilChair:     "Chủ tịch HĐ KHCN",
  councilSecretary: "Thư ký HĐ KHCN",
};

/**
 * Vai trò của một người trong đề tài NCKH (context role — khác với system role).
 * Một người có thể là tác giả đề tài A, phản biện đề tài B, hội đồng đề tài C.
 */
export type ResearchContributorRole = "author" | "coAuthor" | "participant";

/** Thành viên đóng góp trong đề tài (tác giả / đồng tác giả / tham gia). */
export interface ResearchContributor {
  userId?: string;            // null nếu là người ngoài chưa có tài khoản
  name: string;
  role: ResearchContributorRole;
  department?: string;
  academicTitle?: string;     // Học hàm / học vị (TS, ThS, GS, PGS...)
  contributionNote?: string;  // Mô tả vai trò cụ thể
  order?: number;             // Thứ tự liệt kê (tác giả 1, tác giả 2...)
}

/** Vai trò trong phiên họp Hội đồng KHCN. */
export type CouncilMemberRole = "chair" | "member" | "secretary";

/** Thành viên Hội đồng KHCN với vai trò cụ thể trong phiên họp. */
export interface ResearchCouncilMember {
  userId?: string;            // null nếu mời chuyên gia ngoài
  name: string;
  role: CouncilMemberRole;
  department?: string;
  academicTitle?: string;
  /** true nếu đã xác nhận tham dự. */
  confirmed?: boolean;
  /** Email để gửi phiếu biểu quyết (cho hội đồng ngoài hoặc online). */
  email?: string;
  /** Token 1 lần để biểu quyết qua link email. */
  voteToken?: string;
}

/** Nhóm đề tài NCKH — 1 người thực hiện phụ trách nhiều đề tài trong cùng nhóm. */
export interface ResearchGroup {
  id: string;
  name: string;
  year: number;
  field?: string;
  description?: string;
  mainPerformerId: string;   // người thực hiện chính
  supervisorId?: string;     // người giám sát
  topicIds: string[];        // danh sách ID đề tài trong nhóm
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ResearchTopic {
  id: string;
  code?: string;                       // mã đề tài
  title: string;
  field?: string;                      // lĩnh vực / chuyên ngành
  principalInvestigatorId: string;     // chủ nhiệm đề tài (tác giả chính)
  /**
   * Danh sách thành viên đề tài có phân vai trò.
   * Ưu tiên dùng trường này. principalInvestigatorId + memberIds giữ lại để compat.
   */
  contributors?: ResearchContributor[];
  /** @deprecated dùng contributors thay thế */
  memberIds?: string[];                // thành viên (legacy)
  groupId?: string;                    // ID nhóm đề tài (ResearchGroup)
  groupName?: string;                  // tên nhóm (cache để hiển thị)
  mainPerformerId?: string;            // người thực hiện chính (kế thừa từ nhóm)
  supervisorId?: string;               // người giám sát (kế thừa từ nhóm)
  department?: string;
  year: number;
  abstract?: string;
  compileNote?: string;                // đề cương / tóm tắt nộp ở bước p_compile

  stage: ResearchStage;
  currentStep: ResearchStepKey;
  steps: ResearchStepState[];

  reviews: ResearchReview[];
  councilSessions: ResearchCouncilSession[];
  certificates: ResearchCertificate[];
  documents: TaskResource[];
  annotations?: ResearchAnnotation[];  // highlight + ghi chú trên file đề cương

  taskId?: string;                     // Task "ô" theo quý (gom nhóm NCKH — auto-match lúc tạo)
  executionTaskId?: string;            // Task per-đề-tài tự sinh khi vào Triển khai (hub: progress/risk/3T/plan)
  planId?: string;                     // Kế hoạch NCKH liên kết (roll-up khi công nhận)
  approvedToExecute?: boolean;
  revisionCount?: number;              // số lần yêu cầu sửa đổi
  revisionNote?: string;              // ghi chú lần sửa đổi gần nhất
  rejectionReason?: string;           // lý do từ chối

  // Registration form fields (from Google Form / Import)
  principalInvestigatorName?: string; // plain text PI name (for import/external reg)
  memberNames?: string;               // multiline: one name per line
  memberDepartments?: string;         // multiline: departments of members
  submitterName?: string;             // person who filled the form (may differ from PI)
  submitterEmail?: string;
  submitterPhone?: string;
  proposalFileUrl?: string;           // attached file đề cương (URL)
  completionTimeline?: string;        // "Quý III, năm 2026"
  proposedReviewers?: string;         // suggested reviewer names (multiline)
  excludedReviewers?: string;         // excluded reviewer names (multiline)
  submissionType?: "new" | "resubmit";
  registrationNotes?: string;
  /** "public" = submitted via no-auth public form; "internal" = submitted while logged in */
  source?: "public" | "internal";

  // B02 intake screening result
  intakeStatus?: "awaiting" | "passed" | "revision_needed" | "rejected";
  intakeNote?: string;                  // ghi chú yêu cầu chỉnh sửa / từ chối
  intakeRevisionCount?: number;         // số lần yêu cầu chỉnh sửa
  intakeLogs?: IntakeLog[];             // lịch sử thao tác tiếp nhận

  // Phân công phản biện
  reviewAssignment?: {
    delegatedTo?: string;       // userId nhân viên được giao chọn phản biện
    delegatedName?: string;
    delegatedAt?: string;
    dueAt?: string;
    note?: string;
  };

  // Public resubmit link (no-auth form)
  resubmitToken?: string;              // secure token for public resubmit form
  resubmitTokenExpiry?: string;        // ISO date — token expires after 30 days

  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GoogleToken {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

// ─── THỬ NGHIỆM LÂM SÀNG (Clinical Trials) ────────────────────

/** Vòng đời chuẩn của một thử nghiệm lâm sàng (theo cột "Tiến độ nghiên cứu" thực tế). */
export type ClinicalTrialStatus =
  | "feasibility"            // Đang khảo sát tính khả thi
  | "awaiting_sponsor"       // Chờ chấp thuận tài trợ
  | "preparing_ethics"       // Đang chuẩn bị hồ sơ nộp HĐĐĐ Quốc gia
  | "national_ethics_met"    // Đã họp HĐĐĐ Quốc gia (chưa có quyết định)
  | "lec_approved"           // Đã thông qua LEC (Hội đồng Đạo đức cơ sở)
  | "awaiting_moh"           // Đang chờ / đợi chấp thuận của Bộ Y tế
  | "pre_deployment"         // Chuẩn bị triển khai (đã có QĐ, chưa tuyển bệnh)
  | "running_pre_enroll"     // Đang chạy, chờ thu tuyển bệnh nhân
  | "running_enrolled"       // Đang chạy, đã thu tuyển được bệnh nhân
  | "completed"              // Đã kết thúc
  | "terminated_no_efficacy" // Kết thúc do không có hiệu quả
  | "not_feasible";          // Không thực hiện được / không đủ điều kiện

export const CLINICAL_TRIAL_STATUS_LABEL: Record<ClinicalTrialStatus, string> = {
  feasibility:            "Khảo sát tính khả thi",
  awaiting_sponsor:       "Chờ chấp thuận tài trợ",
  preparing_ethics:       "Chuẩn bị hồ sơ HĐĐĐ Quốc gia",
  national_ethics_met:    "Đã họp HĐĐĐ Quốc gia",
  lec_approved:           "Đã thông qua LEC",
  awaiting_moh:           "Chờ chấp thuận Bộ Y tế",
  pre_deployment:         "Chuẩn bị triển khai",
  running_pre_enroll:     "Đang chạy — chờ thu tuyển",
  running_enrolled:       "Đang chạy — đã thu tuyển",
  completed:              "Đã kết thúc",
  terminated_no_efficacy: "Kết thúc — không hiệu quả",
  not_feasible:           "Không thực hiện được",
};

/** Thứ tự vòng đời chuẩn dùng để vẽ pipeline (không gồm 2 nhánh kết thúc sớm). */
export const CLINICAL_TRIAL_PIPELINE: ClinicalTrialStatus[] = [
  "feasibility", "awaiting_sponsor", "preparing_ethics", "national_ethics_met",
  "lec_approved", "awaiting_moh", "pre_deployment",
  "running_pre_enroll", "running_enrolled", "completed",
];

/** 2 nhánh kết thúc sớm (không đi qua "completed"). */
export const CLINICAL_TRIAL_TERMINAL_BRANCHES: ClinicalTrialStatus[] = [
  "terminated_no_efficacy", "not_feasible",
];

/** Một lần chuyển giai đoạn của thử nghiệm — dùng để vẽ Gantt chia đoạn theo từng trạng thái. */
export interface StatusHistoryEntry {
  status: ClinicalTrialStatus;
  changedAt: string;
  changedBy?: string;
}

export interface ClinicalTrialContact {
  name?: string;
  phone?: string;
  email?: string;
  org?: string;   // Tên công ty CRO / SMO
}

export interface EditDeleteRequest {
  type: "edit" | "delete";
  requestedAt: string;
  requestedBy: string;
  requestedByUserId: string;
  requestedByUnitName?: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  approvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  rejectionReason?: string;
  editedData?: Partial<ClinicalTrialPayment>; // For edit requests, store what needs to be changed
}

export interface SettlementConfirmation {
  confirmationType: "app" | "document"; // Xác nhận qua app hoặc đính kèm biên bản
  status: "pending" | "confirmed" | "verified"; // confirmed = trưởng đơn vị xác nhận, verified = đã kiểm duyệt
  confirmedBy?: string;        // Trưởng đơn vị xác nhận
  confirmedByUserId?: string;
  confirmedAt?: string;
  handoverDocumentUrl?: string; // Biên bản giao nhận (nếu dùng phương thức document)
  verifiedBy?: string;         // Người kiểm duyệt quyết toán
  verifiedByUserId?: string;
  verifiedAt?: string;
  verificationNote?: string;   // Ghi chú khi kiểm duyệt
  actualReceivedAmount?: number; // Số tiền thực nhận (có thể khác totalAmount nếu Tài chính giữ lại)
}

export interface CostItem {
  id: string;
  name: string;                     // "Chi phục vụ chuyên môn", "Chi hỗ trợ bệnh nhân", "Phí quản lý", "Thuế"
  percentage?: number;              // Phần trăm (0-100)
  amount?: number;                  // Số tiền cố định (VND)
  unit?: string;                    // Đơn vị nhận (vd: "Đơn vị thực hiện", "Ban GĐ", "Viện ARiHA")
  description?: string;             // Mô tả thêm
}

export interface HandoverSelection {
  selectedCostItemIds: string[];    // Các khoản chi được chọn để tính vào thực lĩnh
  netAmount: number;                 // Số tiền thực lĩnh (tổng các khoản đã chọn)
  status?: string;                   // "selection_confirmed"
  savedAt: string;
}

export interface HandoverDistribution {
  costItemId: string;               // Liên kết tới CostItem gốc
  unit: string;                     // Tên đơn vị nhận (vd: "Viện ARiHA", "Khoa Dược")
  amount: number;                    // Số tiền bàn giao cho đơn vị này
  documentUrl?: string;              // Biên bản bàn giao đã ký (upload qua /api/upload)
  documentName?: string;
  status: "pending" | "handed_over"; // Đã bàn giao cho đơn vị chưa
  handedOverAt?: string;
  handedOverBy?: string;
}

export interface ClinicalTrialPayment {
  id: string;
  batchNo?: number;                 // STT đợt
  date?: string;
  paymentName?: string;             // "Thanh toán đợt 1"
  totalAmount?: number;
  proposalFileUrl?: string;         // Tờ trình
  paymentAdviceFileUrl?: string;    // Ủy nhiệm chi
  costItems?: CostItem[];           // Các khoản chi phí linh hoạt (CHI PHỤC VỤ, CHI HỖ TRỢ, PHÍ QUẢN LÝ, THUẾ)
  splitMode?: "percentage" | "amount"; // Chế độ phân chia: phần trăm hoặc số tiền
  received: boolean;                // Đã nhận tiền chưa
  status?: "pending" | "approved" | "rejected" | "delivered"; // "delivered" = đã giao cho đơn vị nhận
  note?: string;
  // Phase 3: Edit/Delete tracking
  submitterId?: string;             // Người đề nghị thanh toán
  submitterName?: string;
  submitterUnitName?: string;
  submitterRole?: string;           // Role của người đề nghị (director/teamLead/staff...)
  submitterDepartmentHeadId?: string; // ID trưởng đơn vị của submitter
  approvedBy?: string;
  approvedByUserId?: string;
  approverRole?: string;
  approverPosition?: string;        // Chức vụ trong đơn vị của người phê duyệt
  approvedAt?: string;
  editDeleteRequests?: EditDeleteRequest[]; // Track pending edit/delete requests
  rejectionReason?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectorRole?: string;
  rejectedAt?: string;
  // Phase 4: Settlement confirmation
  settlement?: SettlementConfirmation; // Xác nhận đơn vị & quyết toán
  handoverSplits?: {
    ariha: number;
    department: number;
    subUnit1: number;
    subUnit2: number;
    finance: number;
    pharmacy: number;
  }; // Phân chia chi phí khi lập biên bản
  // Phase 5: Xác nhận số tiền thực lĩnh + bàn giao cho từng đơn vị
  handoverSelection?: HandoverSelection;
  handoverDistributions?: HandoverDistribution[]; // Bàn giao thực lĩnh cho từng đơn vị (ARiHA, Khoa Dược, ...)
  distributionStatus?: "in_progress" | "submitted_for_approval" | "approved"; // Trạng thái báo cáo bàn giao
  distributionSubmittedAt?: string;
  distributionApprovedBy?: string;
  distributionApprovedByUserId?: string;
  distributionApprovedAt?: string;
  arihaRevenueTransactionId?: string; // Liên kết tới FinancialTransaction ghi nhận thu của Viện ARiHA
}

export interface ClinicalTrialEnrollment {
  targetTotal?: number;             // Tổng số BN cần thu tuyển (toàn nghiên cứu)
  targetSite?: number;              // Chỉ tiêu phân ngẫu nhiên dự kiến cho site BVTN
  totalEnrolledAllSites?: number;
  enrolledAtSite?: number;
  icfSigned?: number;               // Đã ký phiếu đồng ý tham gia
  randomized?: number;              // Được phân ngẫu nhiên
  screenFailed?: number;            // Sàng lọc thất bại
  discontinuedDeath?: number;       // Ngưng NC sớm (tử vong)
  discontinuedDrugOnly?: number;    // Ngừng thuốc NC nhưng tiếp tục theo dõi
  onTreatment?: number;             // Đang điều trị
  lostToFollowUp?: number;          // Mất theo dõi
  completedTreatment?: number;      // Hoàn tất điều trị
  aeCount?: number;                 // Số lượng AE
  saeCount?: number;                // Số lượng SAE
}

export interface ClinicalTrial {
  id: string;
  code: string;                     // Mã đề cương / mã nghiên cứu
  title: string;
  abbreviation?: string;            // Tên viết tắt
  nctCode?: string;                 // Clinicaltrials.gov hoặc mã khác

  principalInvestigatorId?: string;
  principalInvestigatorName?: string; // plain text PI (import/chưa có tài khoản)
  department?: string;               // Khoa thực hiện
  coordinatorId?: string;            // Điều phối viên Viện ARiHA

  sponsor?: string;
  cro?: string;                      // Contract Research Organization
  smo?: string;                      // Site Management Organization
  cra?: ClinicalTrialContact[];      // Clinical Research Associate (giám sát của hãng) — có thể nhiều người
  crc?: ClinicalTrialContact[];      // Clinical Research Coordinator (điều phối tại site) — có thể nhiều người

  startPeriod?: string;              // "3/2024" — text tự do, khớp Excel gốc
  endPeriod?: string;                // "4/2031"
  firstEnrollmentDate?: string;

  status: ClinicalTrialStatus;
  statusReason?: string;             // Lý do chưa triển khai / kết thúc sớm
  statusHistory?: StatusHistoryEntry[]; // Lịch sử chuyển giai đoạn — dùng để vẽ Gantt chia đoạn
  deploymentDecisionNo?: string;     // Số quyết định triển khai

  competitiveEnrollment?: boolean;   // Thu tuyển cạnh tranh
  enrollment?: ClinicalTrialEnrollment;

  documents?: TaskResource[];        // File / link tài liệu (Drive...)
  zaloGroupUrl?: string;
  formPrefillUrl?: string;
  shortLink?: string;

  payments?: ClinicalTrialPayment[]; // Ledger thanh toán theo đợt

  executionTaskId?: string;          // Task theo dõi tự sinh (hub: tiến độ/tài chính/hiệu suất), tạo thủ công qua nút bấm
  phaseTaskIds?: {                   // 3 Task nhỏ theo giai đoạn, tự sinh/tự đóng để cộng dồn vào Kế hoạch đúng kỳ hoàn thành
    feasibility?: string;             // Khảo sát tính khả thi
    execution?: string;               // Đang triển khai
    closeout?: string;                // Kết thúc & Quyết toán
  };

  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
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
export type StakeholderRole = "assignee" | "collaborator" | "watcher" | "approver" | "supervisor";

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

export interface Eval3TScore {
  t1: number;      // 0–10
  t2: number;      // 0–10
  t3: number;      // 0–10
  total: number;   // trung bình có trọng số
  grade: "xuatSac" | "hoanThanhTot" | "hoanThanh" | "khongHoanThanh";
  computedAt: string;
}

/** Cấu hình đánh giá 3T — HR/Admin có thể chỉnh từ Settings */
export interface EvaluationConfig {
  weights: { t1: number; t2: number; t3: number }; // tổng = 1
  thresholds: {
    xuatSac: number;      // >= threshold → Xuất sắc     (default 10)
    hoanThanhTot: number; // >  threshold → Hoàn thành tốt (default 8)
    hoanThanh: number;    // >= threshold → Hoàn thành     (default 5)
    // < hoanThanh → Không hoàn thành
  };
  updatedAt?: string;
  updatedBy?: string;
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
  score3T?: Eval3TScore;
}

export type ChangeRequestType = "deadline_change" | "performer_change" | "issue_raised" | "subworkflow_change";

export interface ChangeRequest {
  type: ChangeRequestType;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  previousStatus: TaskStatus;
  status: "pending" | "approved" | "rejected";
  changedFields?: {
    deadlineBase?: { before: string; after: string };
    mainPerformerId?: { before: string; after: string };
    subWorkflowChange?: {
      stepId: string;
      stepName: string;
      proposedChildSteps: TaskStep[];
      proposedChildEdges?: WorkflowEdge[];
    };
  };
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComment?: string;
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

  // ── DAG / quy trình liền mạch ──
  /** id các bước tiền nhiệm (đầu vào của bước này). Suy từ edges của quy trình mẫu. */
  dependsOn?: string[];
  /** Vai trò gợi ý cho bước (từ template) — dùng khi gán người lúc tạo task. */
  roleRequired?: UserRole;
  /** Phòng ban gợi ý cho bước (từ template). */
  department?: string;
  /** Toạ độ node trên sơ đồ — giữ để hiển thị lại đúng vị trí. */
  position?: { x: number; y: number };
  /** Mô tả đầu ra kỳ vọng (từ template). */
  expectedOutput?: string;
  /** Tóm tắt đầu ra thực tế (người phụ trách nhập / auto suy ra). */
  outputSummary?: string;
  /** Đánh giá 3T của riêng bước (auto suy ra hoặc người duyệt chỉnh). */
  eval3T?: "tot" | "trung_binh" | "te";
  evalNote?: string;

  // ── Quy trình con (sub-workflow) ──
  /** Các bước con — bước này chứa một mini DAG riêng. */
  childSteps?: TaskStep[];
  /** Edges của quy trình con. */
  childEdges?: WorkflowEdge[];
  /** userIds của người hỗ trợ bổ sung (khác assigneeId chính). */
  helpers?: string[];
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

  // Change requests (deadline / performer / issue — requires re-approval)
  // Array to allow multiple concurrent requests; filter by status === "pending" for active ones.
  changeRequests?: ChangeRequest[];

  // Resources shared by main performer
  resources?: TaskResource[];

  // Google Calendar
  googleCalendarEventId?: string;

  // Kế hoạch đơn vị — nhiệm vụ thuộc kế hoạch
  planId?: string;              // ID của UnitPlan chứa nhiệm vụ này
  planItemParentId?: string;    // ID của PlanItem cha (undefined = cấp 1 trong kế hoạch)
  /** Ghi đè thủ công mức đóng góp của nhiệm vụ vào chỉ tiêu kế hoạch (khi số tự động sai lệch). undefined = dùng số tự động. */
  planContribution?: number;

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

/**
 * Nhật ký hệ thống dùng chung cho mọi loại đối tượng (Task, User, ClinicalTrial, WorkRequest...) —
 * append-only, không có API sửa/xoá. `entityType` + `entityId` xác định đối tượng bị tác động;
 * `actorRole` lưu vai trò TẠI THỜI ĐIỂM hành động (vai trò người dùng có thể đổi sau này).
 */
export interface SystemAuditLog {
  id: string;
  createdAt: string;
  actorId: string;
  actorName?: string;
  actorRole?: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
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
  locked?: boolean;
  /** Vai trò yêu cầu cho node (template tái sử dụng — gán người cụ thể lúc tạo task). */
  roleRequired?: UserRole;
  assigneeId?: string;
  assigneeName?: string;
  deadline?: string;
  kpiTarget?: number;
  kpiUnit?: string;
  output?: string;
  progress?: number;
  eval3T?: "tot" | "trung_binh" | "te";
  evalNote?: string;
  proofs?: { id: string; name: string; mimeType: string; dataUrl: string }[];
  /** Quy trình con — node này chứa một mini DAG. */
  childNodes?: WorkflowNode[];
  childEdges?: WorkflowEdge[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string; // nodeId or "ext::workflowId::nodeId"
  label?: string;
  required?: boolean; // true = must complete source before target
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
  // Task lifecycle
  | "task_created"
  | "task_assigned"
  | "task_overdue"
  | "deadline_alert"
  | "status_changed"
  | "comment_mention"
  | "approval_request"
  | "task_completed"
  | "risk_flag"
  | "completion_proposal"
  | "completion_reviewed"
  // Clinical Trials
  | "trial_enrollment_alert"
  | "trial_milestone_reached"
  // Calendar
  | "calendar_change_request"
  | "calendar_change_approved"
  // Finance — Tạm ứng
  | "advance_created"
  | "advance_approved"
  | "advance_rejected"
  | "advance_settlement_submitted"
  | "advance_settlement_approved"
  | "advance_settlement_rejected"
  // Finance — Hoàn ứng
  | "reimbursement_submitted"
  | "reimbursement_approved"
  | "reimbursement_paid"
  // WorkNode (governance)
  | "node_unlocked"
  | "node_submitted"
  | "node_approved"
  | "node_rejected"
  // Requests / Intranet
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
  link?: string;           // Route điều hướng khi click
  read: boolean;
  priority: "low" | "normal" | "urgent";
  taskId?: string;
  actionRequired?: boolean; // true → hiển thị cảnh báo nhắc nhở nếu chưa xử lý
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
  | "financial_overview"
  | "research_summary";

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
  | "resignation"     // Nghỉ việc — duyệt xong tự sinh Task quy trình bàn giao/thu hồi
  | "profile_change"  // Đề xuất thay đổi thông tin cá nhân — duyệt xong mới áp dụng vào hồ sơ
  | "custom";         // Đơn tùy biến

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

/**
 * Các field hồ sơ nhân viên nhân viên được TỰ đề xuất thay đổi (qua đơn "profile_change",
 * cần HR/Admin duyệt). Đây là whitelist dùng cả ở UI (settings/profile) lẫn server-side khi áp
 * dụng thay đổi sau khi duyệt (app/api/requests/[id]/route.ts) — chỉ field trong danh sách này
 * mới được ghi vào User, tránh 1 request bị chèn field khác (vd. role) để leo quyền.
 */
export const PROFILE_EDITABLE_FIELDS = [
  "name", "phone", "position", "department", "birthday", "idNumber",
  "educationLevel", "major", "academicTitle", "scientificProfile", "workHistory",
] as const;
export type ProfileEditableField = typeof PROFILE_EDITABLE_FIELDS[number];

export const PROFILE_FIELD_LABEL: Record<ProfileEditableField, string> = {
  name: "Họ tên",
  phone: "Số điện thoại",
  position: "Chức danh",
  department: "Phòng ban",
  birthday: "Ngày sinh",
  idNumber: "Số CCCD",
  educationLevel: "Trình độ",
  major: "Chuyên ngành",
  academicTitle: "Học hàm / học vị",
  scientificProfile: "Lý lịch khoa học",
  workHistory: "Quá trình công tác",
};

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
  taskName?: string;            // Tên nhiệm vụ (denormalized để hiển thị nhanh)
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
  taskName?: string;            // Tên nhiệm vụ (lưu để hiện nhanh trên finance page)
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

// ─── WORK NODE (Governance Model) ────────────────────────────

/**
 * Trạng thái vòng đời của một WorkNode.
 * locked      : Điều kiện tiên quyết chưa được đáp ứng
 * pending     : Đã mở khóa, chưa bắt đầu
 * in_progress : Đang thực hiện
 * review      : Đã nộp nghiệm thu, chờ phê duyệt
 * completed   : Đã được duyệt / hoàn thành
 * rejected    : Bị từ chối, cần làm lại
 */
export type NodeStatus =
  | "locked"
  | "pending"
  | "in_progress"
  | "review"
  | "completed"
  | "rejected";

/** Điều kiện logic mở khóa node: tất cả (ALL) hay bất kỳ (ANY) prerequisite hoàn thành */
export type PrerequisiteMode = "ALL" | "ANY";

// ── [ĐẦU VÀO] ─────────────────────────────────────────────────

export type InputResourceType = "text" | "link" | "budget";

export interface InputResource {
  id: string;
  type: InputResourceType;
  label: string;
  content: string;   // Nội dung text hoặc URL
  amount?: number;   // Chỉ dùng cho type="budget"
}

// ── [NỘI DUNG] ────────────────────────────────────────────────

export interface NodeChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

// ── [ĐẦU RA] ──────────────────────────────────────────────────

export type OutputAttachmentType = "file" | "link" | "text";

export interface OutputAttachment {
  id: string;
  type: OutputAttachmentType;
  name: string;
  content: string;    // URL cho file/link; nội dung text thuần
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

// ── [TIÊU CHÍ ĐÁNH GIÁ — 3T] ──────────────────────────────────

/** T1: Tiến độ — auto-tính khi node hoàn thành */
export interface T1Timeliness {
  completedAt: string;
  dueDate: string;
  status: "on_time" | "late";
  lateDays?: number;
  lateHours?: number;
}

/** T2: Tiêu chuẩn chất lượng — người duyệt đánh giá thủ công */
export interface T2Quality {
  rating: 1 | 2 | 3 | 4 | 5;
  verdict: "pass" | "fail";
  evaluatorId: string;
  evaluatorName: string;
  evaluatedAt: string;
  note?: string;
}

/** T3: Tài nguyên — auto-tính khi có actualCost */
export interface T3Resources {
  budgeted: number;
  actual: number;
  variance: number;       // actual − budgeted (dương = vượt ngân sách)
  variancePct: number;    // variance / budgeted × 100
  status: "under_budget" | "on_budget" | "over_budget";
}

// ── WorkNode Entity ────────────────────────────────────────────

export interface WorkNode {
  // Định danh & phân cấp
  id: string;
  rootTaskId: string;          // ID nhiệm vụ gốc (dùng để index & filter)
  parentId: string | null;     // null = con trực tiếp của task gốc (L1)
  ancestors: string[];         // Materialized path: [rootTaskId, L1Id, L2Id…] — không bao gồm id của chính node
  depth: number;               // 0 = task, 1 = step, 2 = sub-step…

  // [ĐẦU VÀO] Input & Schema
  name: string;
  description?: string;
  assigneeId: string;          // Một người chịu trách nhiệm chính duy nhất
  assigneeName: string;
  approverIds: string[];       // Người duyệt nghiệm thu (nhận thông báo khi submit)
  inputResources: InputResource[];
  prerequisites: string[];     // Mảng Node ID phải hoàn thành trước
  prerequisiteMode: PrerequisiteMode;
  startDate?: string;
  dueDate: string;
  budget?: number;             // Ngân sách được cấp (đồng bộ từ InputResource type=budget)

  // [NỘI DUNG] Process & Execution
  checklist: NodeChecklistItem[];
  status: NodeStatus;
  progress: number;            // 0–100

  // [ĐẦU RA] Output Validation
  outputAttachments: OutputAttachment[];

  // [TIÊU CHÍ] 3T Evaluation
  actualCost?: number;
  t1Timeliness?: T1Timeliness;
  t2Quality?: T2Quality;
  t3Resources?: T3Resources;

  // Meta
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
}
