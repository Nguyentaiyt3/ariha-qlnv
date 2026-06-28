import type {
  ResearchTopic, ResearchStepKey, ResearchStepState, ResearchStage, ResearchReview,
} from "@/types";

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
