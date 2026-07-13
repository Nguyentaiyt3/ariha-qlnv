// Nhãn tiếng Việt cho SystemAuditLog.action/entityType — dùng chung giữa trang Nhật ký hệ thống
// và tab "Lịch sử" trên các trang chi tiết (Employee, Task...), tránh khai trùng nhiều nơi.

export const ACTION_LABEL: Record<string, string> = {
  "permission.updated":  "Cập nhật phân quyền",
  "user.created":        "Tạo nhân viên mới",
  "user.merged":         "Gộp nhân viên trùng lặp",
  "user.role_changed":   "Đổi vai trò nhân viên",
  "user.activated":      "Kích hoạt tài khoản",
  "user.deactivated":    "Vô hiệu hoá tài khoản",
  "request.approved":    "Duyệt đơn từ",
  "request.rejected":    "Từ chối đơn từ",
  "trial.status_changed":                 "Đổi trạng thái TNLS",
  "research.stage_changed":               "Đổi giai đoạn đề tài NCKH",
  "finance.advance_approved":              "Duyệt tạm ứng",
  "finance.advance_rejected":              "Từ chối tạm ứng",
  "finance.advance_settlement_approved":   "Duyệt quyết toán tạm ứng",
  "finance.advance_settlement_rejected":   "Từ chối quyết toán tạm ứng",
  "finance.reimbursement_approved":        "Duyệt hoàn ứng",
  "finance.reimbursement_rejected":        "Từ chối hoàn ứng",
  edited:                "Chỉnh sửa nhiệm vụ",
  approved:              "Phê duyệt nhiệm vụ",
  status_changed:        "Đổi trạng thái nhiệm vụ",
  completion_proposed:   "Đề xuất kết thúc nhiệm vụ",
  completion_approved:   "Duyệt kết thúc nhiệm vụ",
  completion_rejected:   "Từ chối kết thúc nhiệm vụ",
  progress_updated:      "Cập nhật tiến độ nhiệm vụ",
  step_assigned:         "Phân công bước quy trình",
  risk_flagged:          "Gắn cờ rủi ro",
  comment_added:         "Thêm bình luận",
  deleted:               "Xoá nhiệm vụ",
  reassigned:            "Đổi người thực hiện chính",
  deadline_changed:      "Đổi hạn nhiệm vụ",
};

export const ENTITY_TYPE_LABEL: Record<string, string> = {
  Task: "Nhiệm vụ",
  User: "Nhân viên",
  PermissionConfig: "Phân quyền",
  WorkRequest: "Đơn từ",
  ClinicalTrial: "Thử nghiệm lâm sàng",
  ResearchTopic: "Đề tài NCKH",
  AdvanceRequest: "Tạm ứng",
  ReimbursementRequest: "Hoàn ứng",
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ").replace(/\./g, " · ");
}
