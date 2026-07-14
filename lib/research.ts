import type {
  ResearchTopic, ResearchStepKey, ResearchStepState, ResearchStage, ResearchReview,
  TaskStep, TaskStatus,
} from "@/types";
import { generateId } from "@/lib/utils";

/** Danh mục bước cố định của quy trình đề tài NCKH cấp cơ sở. */
export const RESEARCH_STEPS: {
  key: ResearchStepKey;
  label: string;
  stage: ResearchStage;          // giai đoạn chứa bước
  needsTwoReviews?: boolean;     // bước "gửi 2 phản biện kín"
  isCouncil?: boolean;           // bước họp Hội đồng KHCN
}[] = [
  { key: "create",       label: "Nhân viên tạo đề tài",                    stage: "init" },
  { key: "approve_task", label: "Quản lý phê duyệt task",                  stage: "init" },
  { key: "notify",       label: "Thông báo nhân viên",                     stage: "init" },
  { key: "p_intake",     label: "Tiếp nhận",                               stage: "proposal" },
  { key: "p_compile",    label: "Tổng hợp đề cương, nộp báo cáo quản lý",  stage: "proposal" },
  { key: "p_assign",     label: "Phê duyệt thực hiện & gán người (theo nhóm)", stage: "proposal" },
  { key: "p_review",     label: "Thẩm định — 2 phản biện kín",             stage: "proposal", needsTwoReviews: true },
  { key: "p_council",    label: "Họp Hội đồng KHCN thông qua",             stage: "proposal", isCouncil: true },
  { key: "p_ethics",     label: "Chứng nhận y đức",                        stage: "proposal" },
  { key: "p_agree",      label: "Đồng ý cho thực hiện",                    stage: "proposal" },
  { key: "exec_start",   label: "Bắt đầu triển khai",                      stage: "executing" },
  { key: "exec_midterm", label: "Báo cáo tiến độ giữa kỳ",                 stage: "executing" },
  { key: "exec_submit",  label: "Nộp báo cáo kết quả",                     stage: "executing" },
  { key: "r_intake",     label: "Tiếp nhận kết quả",                       stage: "recognition" },
  { key: "r_review",     label: "Thẩm định — 2 phản biện kín",             stage: "recognition", needsTwoReviews: true },
  { key: "r_council",    label: "Họp Hội đồng KHCN thông qua",             stage: "recognition", isCouncil: true },
  { key: "r_recognize",  label: "Công nhận phạm vi ảnh hưởng",             stage: "recognition" },
];

export const STAGE_LABEL: Record<ResearchStage, string> = {
  init:        "Khởi tạo",
  proposal:    "GĐ1 · Thẩm định đề cương",
  executing:   "Đang triển khai",
  recognition: "GĐ2 · Nghiệm thu & Công nhận",
  completed:   "Đã hoàn tất",
  rejected:    "Đã từ chối",
};

/**
 * Các bước thuộc quy trình quản lý/nhiệm vụ nội bộ (không phải mốc thẩm định) — ẩn khỏi timeline
 * khi người xem chỉ là phản biện (không phải quản lý/tác giả), để họ chỉ thấy đúng các mốc thẩm
 * định liên quan đến việc đánh giá của mình, không cần biết chi tiết vận hành nội bộ đề tài.
 */
export const TASK_ONLY_STEP_KEYS = new Set<ResearchStepKey>([
  "create", "approve_task", "notify", "p_compile", "p_assign", "exec_start",
]);

export function stepMeta(key: ResearchStepKey) {
  return RESEARCH_STEPS.find((s) => s.key === key)!;
}

export function stepIndex(key: ResearchStepKey): number {
  return RESEARCH_STEPS.findIndex((s) => s.key === key);
}

/** Trạng thái bước ban đầu khi tạo đề tài (bước "create" đã xong). */
export function buildInitialSteps(): ResearchStepState[] {
  return RESEARCH_STEPS.map((s, i) => ({
    key: s.key,
    status: i === 0 ? "passed" : i === 1 ? "in_progress" : "pending",
  }));
}

/**
 * Phiếu phản biện thuộc VÒNG THẨM ĐỊNH HIỆN TẠI của 1 giai đoạn — loại các phiếu vòng trước khi
 * đề tài đã bị yêu cầu sửa đổi (revisionCount tăng) và nộp lại. Phiếu vòng cũ vẫn còn nguyên
 * trong topic.reviews để xem lại lịch sử, chỉ không được tính vào "đã đủ 2 phiếu chưa"/điểm
 * trung bình của vòng hiện tại nữa — tránh phiếu thẩm định bản CŨ (trước khi sửa) bị tính nhầm
 * là đã thẩm định xong cho bản đã chỉnh sửa lại.
 */
export function activeReviews(
  topic: Pick<ResearchTopic, "reviews" | "revisionCount">,
  stage: "proposal" | "recognition",
): ResearchReview[] {
  const round = topic.revisionCount ?? 0;
  return (topic.reviews ?? []).filter((r) => r.stage === stage && (r.round ?? 0) === round);
}

/** Số phản biện đã nộp của vòng thẩm định hiện tại (giai đoạn tương ứng). */
export function submittedReviewCount(
  topic: Pick<ResearchTopic, "reviews" | "revisionCount">,
  stage: "proposal" | "recognition",
): number {
  return activeReviews(topic, stage).filter((r) => r.status === "submitted").length;
}

/**
 * 4 kết quả tổng hợp có thể xếp loại cho 1 đề tài đã đủ 2 phiếu thẩm định (vòng hiện tại):
 *  - "pass"                 : cả 2 phiếu ĐẠT — chuyển thẳng Hội đồng.
 *  - "fail"                 : có phiếu KHÔNG ĐẠT — từ chối đề tài.
 *  - "revise_no_reconfirm"  : có phiếu ĐẠT nếu chỉnh sửa, không phiếu nào yêu cầu nộp lại
 *                             cho phản biện xem lại (needResubmit=false) — sửa xong chuyển
 *                             thẳng Hội đồng, không cần thẩm định lại.
 *  - "revise_reconfirm"     : có phiếu ĐẠT nếu chỉnh sửa VÀ yêu cầu nộp lại cho phản biện xác
 *                             nhận (needResubmit=true) — sửa xong phải gửi lại đúng phản biện
 *                             đó xác nhận trước khi chuyển Hội đồng.
 * Trả về null nếu chưa đủ 2 phiếu đã nộp.
 */
export type SynthesisOutcome = "pass" | "fail" | "revise_no_reconfirm" | "revise_reconfirm";

export function classifySynthesisOutcome(reviews: ResearchReview[]): SynthesisOutcome | null {
  const submitted = reviews.filter((r) => r.status === "submitted");
  if (submitted.length < 2) return null;
  if (submitted.some((r) => r.verdict === "fail")) return "fail";
  if (submitted.some((r) => r.verdict === "pass_if_revised")) {
    return submitted.some((r) => r.verdict === "pass_if_revised" && r.needResubmit)
      ? "revise_reconfirm"
      : "revise_no_reconfirm";
  }
  return "pass";
}

/**
 * Trong 1 danh sách phiếu đã nộp, lọc ra đúng (các) phản biện đã yêu cầu xem lại bản chỉnh sửa
 * (verdict "ĐẠT nếu chỉnh sửa" + đã tick "cần nộp lại") — CHỈ những người này mới nhận phiếu xác
 * nhận rút gọn, không phải toàn bộ phản biện của vòng đó.
 */
export function reviewersRequiringReconfirm(reviews: ResearchReview[]): ResearchReview[] {
  return reviews.filter((r) => r.status === "submitted" && r.verdict === "pass_if_revised" && r.needResubmit);
}

/**
 * Xác định (các) phản biện cần gửi lại phiếu xác nhận rút gọn cho 1 round cụ thể (round =
 * revisionCount hiện tại - 1, tức vòng vừa được đánh giá) — dùng chung cho cả 2 trường hợp:
 *  - Vòng vừa rồi là phiếu thẩm định ĐẦY ĐỦ (mode "full", lần đầu tiên xếp loại "cần PB xác
 *    nhận" ở Tổng hợp kết quả) → theo verdict + needResubmit (reviewersRequiringReconfirm).
 *  - Vòng vừa rồi đã LÀ 1 vòng xác nhận rút gọn (mode "confirm", vòng lặp tác giả↔phản biện đang
 *    chạy) → chỉ gửi lại cho (các) phản biện đã "Không đồng ý" ở vòng đó (verdict "fail") — người
 *    đã "Đồng ý" thì không cần hỏi lại.
 */
export function reviewersToResendForReconfirm(priorRoundReviews: ResearchReview[]): ResearchReview[] {
  const confirmReviews = priorRoundReviews.filter((r) => r.mode === "confirm");
  if (confirmReviews.length > 0) {
    return confirmReviews.filter((r) => r.status === "submitted" && r.verdict === "fail");
  }
  return reviewersRequiringReconfirm(priorRoundReviews);
}

/**
 * Đề tài đang ở trạng thái "yêu cầu sửa đổi, chờ tác giả nộp lại" sau khi phản biện — khác với
 * intakeStatus="revision_needed" (chỉ áp dụng cho bước tiếp nhận ban đầu). True khi đã có ít
 * nhất 1 lần "Yêu cầu sửa đổi" (revisionCount > 0) và đề tài đang đứng lại đúng bước ngay trước
 * thẩm định của vòng hiện tại (p_compile cho GĐ1, r_intake cho GĐ2) — nghĩa là tác giả chưa
 * nộp lại bản chỉnh sửa cho vòng này.
 */
export function isAwaitingRevisionResubmit(
  topic: Pick<ResearchTopic, "revisionCount" | "currentStep" | "revisionResubmittedAt">,
): boolean {
  return (topic.revisionCount ?? 0) > 0 &&
    (topic.currentStep === "p_compile" || topic.currentStep === "r_intake") &&
    !topic.revisionResubmittedAt;
}

/**
 * Đề tài đã được tác giả nộp lại bản chỉnh sửa cho vòng sửa đổi hiện tại, nhưng vẫn đang đứng ở
 * bước ngay trước thẩm định (p_compile/r_intake) chờ quản lý xử lý tiếp (phê duyệt/tiếp nhận) —
 * giai đoạn 2 của cùng 1 chu trình "yêu cầu sửa đổi", tiếp theo isAwaitingRevisionResubmit.
 */
export function isAwaitingRevisionProcessing(
  topic: Pick<ResearchTopic, "revisionCount" | "currentStep" | "revisionResubmittedAt">,
): boolean {
  return (topic.revisionCount ?? 0) > 0 &&
    (topic.currentStep === "p_compile" || topic.currentStep === "r_intake") &&
    !!topic.revisionResubmittedAt;
}

/** % tiến độ chung = số bước passed / tổng bước. */
export function researchProgress(topic: ResearchTopic): number {
  const total = RESEARCH_STEPS.length;
  const done = topic.steps.filter((s) => s.status === "passed").length;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

// ─── Liên kết Task per-đề-tài (hub tích hợp progress/risk/3T/plan) ─────────────

/**
 * Sinh các bước nhiệm vụ (TaskStep) cho Task per-đề-tài: gồm GĐ Triển khai + GĐ2 Nghiệm thu.
 * Chuỗi tuyến tính (mỗi bước phụ thuộc bước liền trước), gán cho người thực hiện chính.
 */
export function buildResearchTaskSteps(topic: ResearchTopic): TaskStep[] {
  const assignee = topic.mainPerformerId || topic.principalInvestigatorId || "";
  const keys = RESEARCH_STEPS.filter((s) => s.stage === "executing" || s.stage === "recognition");
  const ids = keys.map(() => generateId("step"));
  return keys.map((s, i) => ({
    id: ids[i],
    name: s.label,
    assigneeId: assignee,
    status: "pending" as const,
    progress: 0,
    kpiTarget: 0,
    kpiCurrent: 0,
    kpiUnit: "bước",
    proofs: [],
    dependsOn: i > 0 ? [ids[i - 1]] : [],
  }));
}

/**
 * Suy ra trạng thái + tiến độ của Task liên kết từ trạng thái pipeline của đề tài.
 * Dùng để đồng bộ mỗi khi đề tài chuyển bước → task vào heatmap/risk-flag/Hiệu suất.
 */
export function researchTaskSync(topic: ResearchTopic): { progress: number; status: TaskStatus } {
  const progress = researchProgress(topic);
  const status: TaskStatus =
    topic.stage === "completed" ? "done"
    : topic.stage === "rejected" ? "cancelled"
    : progress > 0 ? "in_progress"
    : "todo";
  return { progress, status };
}

/** Ẩn danh tính phản biện viên (dùng khi trả cho người không có quyền quản trị). */
export function redactReviewer(r: ResearchReview): ResearchReview {
  return {
    ...r,
    reviewerId: undefined,
    reviewerName: undefined,
    reviewerEmail: undefined,
    reviewerOrg: undefined,
  };
}

/**
 * Ẩn danh tính phản biện theo đúng nguyên tắc phản biện kín 2 chiều, tính theo góc nhìn của
 * 1 người xem cụ thể:
 *  - Tác giả/đồng tác giả KHÔNG được biết danh tính bất kỳ phản biện nào của đề tài mình —
 *    kể cả khi họ đồng thời có quyền quản lý (director/hrAdmin/Quản lý NCKH tự đăng ký đề tài).
 *  - 1 phản biện (bất kể đang phản biện giai đoạn nào) KHÔNG được biết danh tính bất kỳ phản
 *    biện nào khác của CẢ ĐỀ TÀI — kể cả phản biện ở giai đoạn khác (GĐ1 và GĐ2 không được biết
 *    nhau), kể cả khi họ đồng thời có quyền quản lý.
 *  - Phiếu của chính người xem luôn hiển thị đầy đủ.
 *  - Chỉ "Quản lý NCKH" thật (isNckhManager — hrAdmin hoặc được gán chỉ định "researchManager")
 *    mới thấy đầy đủ danh tính để điều phối/phân công khi không phải tác giả/phản biện của đề
 *    tài đó. Người khác có quyền `research:manage` qua cấu hình phân quyền chung (vd. toàn bộ
 *    vai trò "staff" trong 1 số tổ chức) nhưng KHÔNG phải Quản lý NCKH thật thì vẫn bị ẩn — quyền
 *    quản lý khác không đồng nghĩa được xem danh tính phản biện.
 */
export function redactTopicReviewsForViewer(
  reviews: ResearchReview[] | undefined,
  viewerId: string,
  viewerIsAuthor: boolean,
  viewerIsNckhManager: boolean,
): ResearchReview[] {
  const list = reviews ?? [];
  const viewerIsReviewer = list.some((rr) => rr.reviewerId === viewerId);
  return list.map((r) => {
    if (r.reviewerId === viewerId) return r;
    if (viewerIsAuthor || viewerIsReviewer || !viewerIsNckhManager) return redactReviewer(r);
    return r;
  });
}

/**
 * Ẩn danh tính tác giả/nhóm thực hiện đề tài — chiều còn lại của phản biện kín 2 chiều: phản
 * biện không được biết mình đang chấm đề tài của ai. Áp dụng khi người xem là 1 phản biện của đề
 * tài, ngay cả khi họ đồng thời có quyền quản lý — đã là phản biện của đề tài này thì không còn
 * là "Quản lý NCKH thuần" cho riêng đề tài đó nữa. Các field bắt buộc kiểu string
 * (principalInvestigatorId, createdBy) trả về "" thay vì undefined để giữ đúng kiểu ResearchTopic.
 */
export function redactAuthorForReviewer(topic: ResearchTopic): ResearchTopic {
  return {
    ...topic,
    principalInvestigatorId: "",
    principalInvestigatorName: undefined,
    mainPerformerId: undefined,
    supervisorId: undefined,
    contributors: undefined,
    memberIds: undefined,
    memberNames: undefined,
    memberDepartments: undefined,
    submitterName: undefined,
    submitterEmail: undefined,
    submitterPhone: undefined,
    createdBy: "",
    createdByName: undefined,
  };
}

/**
 * File đề cương chỉ được sửa/xoá/thay thế TRƯỚC khi nộp thẩm định GĐ1 (còn ở GĐ0, hoặc đang ở
 * bước "Tổng hợp đề cương" p_compile trước khi bấm Nộp thẩm định). Một khi đã nộp (currentStep
 * chuyển sang p_assign trở đi, hoặc đã qua hẳn giai đoạn khác), file bị khoá vĩnh viễn cho vòng
 * thẩm định đó — vì phản biện có thể đã/đang đánh giá đúng file này.
 */
export function isProposalFileLocked(topic: Pick<ResearchTopic, "stage" | "currentStep">): boolean {
  return !(
    topic.stage === "init" ||
    (topic.stage === "proposal" && (topic.currentStep === "p_intake" || topic.currentStep === "p_compile"))
  );
}

/**
 * File đề tài/báo cáo tổng kết chỉ được sửa/xoá/thay thế TRƯỚC khi nộp thẩm định GĐ2, hoặc khi
 * đang ở bước tiếp nhận (r_intake) — kể cả sau khi bị "Yêu cầu sửa đổi" (currentStep quay lại
 * r_intake nhưng stage vẫn là "recognition") để tác giả có thể nộp lại file đã chỉnh sửa. Một khi
 * đã qua r_intake (đã nộp thẩm định), file bị khoá vì phản biện GĐ2 có thể đã/đang đánh giá đúng
 * file này.
 */
export function isFinalReportFileLocked(topic: Pick<ResearchTopic, "stage" | "currentStep">): boolean {
  if (topic.stage === "completed") return true;
  if (topic.stage !== "recognition") return false;
  return topic.currentStep !== "r_intake";
}
