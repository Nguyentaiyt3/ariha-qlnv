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

/** Số phản biện đã nộp của một giai đoạn. */
export function submittedReviewCount(reviews: ResearchReview[], stage: "proposal" | "recognition"): number {
  return reviews.filter((r) => r.stage === stage && r.status === "submitted").length;
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
 *  - 1 phản biện KHÔNG được biết danh tính phản biện còn lại CÙNG giai đoạn — kể cả khi họ
 *    đồng thời có quyền quản lý.
 *  - Phiếu của chính người xem luôn hiển thị đầy đủ.
 *  - Quản lý THUẦN (không phải tác giả, không phải 1 trong 2 phản biện của đề tài đó) vẫn thấy
 *    đầy đủ danh tính để điều phối/phân công.
 */
export function redactTopicReviewsForViewer(
  reviews: ResearchReview[] | undefined,
  viewerId: string,
  viewerIsAuthor: boolean,
): ResearchReview[] {
  const list = reviews ?? [];
  return list.map((r) => {
    if (r.reviewerId === viewerId) return r;
    if (viewerIsAuthor) return redactReviewer(r);
    const viewerIsReviewerSameStage = list.some((rr) => rr.reviewerId === viewerId && rr.stage === r.stage);
    if (viewerIsReviewerSameStage) return redactReviewer(r);
    return r;
  });
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
 * File đề tài/báo cáo tổng kết chỉ được sửa/xoá/thay thế TRƯỚC khi nộp thẩm định GĐ2 (chưa bước
 * vào giai đoạn Nghiệm thu). Một khi đã nộp, file bị khoá vì phản biện GĐ2 có thể đã/đang đánh
 * giá đúng file này.
 */
export function isFinalReportFileLocked(topic: Pick<ResearchTopic, "stage">): boolean {
  return topic.stage === "recognition" || topic.stage === "completed";
}
