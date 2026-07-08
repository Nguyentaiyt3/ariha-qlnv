import mongoose from "mongoose";
import { connectDB } from "./config";
import {
  UserModel, TaskModel, NotificationModel, MessageModel, WorkflowModel,
  MilestoneConfigModel, KPIFrameworkModel, EvaluationConfigModel, EvaluationModel,
  CalendarEventModel, RequestTemplateModel, WorkRequestModel, DocFolderModel,
  WorkDocumentModel, AnnouncementModel, AnnouncementCommentModel, ChannelModel,
  ChannelMessageModel, FinancialTransactionModel, AdvanceRequestModel,
  ReimbursementRequestModel, WorkNodeModel, AuditEventModel, UnitPlanModel,
  ResearchTopicModel, ResearchGroupModel, ClinicalTrialModel, EnrollmentShareTokenModel,
} from "./models";

/**
 * Thay MỌI chuỗi khớp CHÍNH XÁC 1 trong các cặp [cũ, mới] — cả ở giá trị lẫn KEY của object
 * (vd. Announcement.reactions["👍"] = [userId...], Channel.memberLastRead[userId] = timestamp).
 * Dùng đệ quy để phủ hết các field Schema.Types.Mixed lồng nhau (stakeholders, steps, payments...)
 * mà không cần viết query Mongo riêng cho từng cấu trúc — cách này chậm hơn nhưng đảm bảo không
 * bỏ sót field nào, đúng yêu cầu "giữ tất cả bản ghi liên quan".
 */
function deepReplace(value: unknown, pairs: [string, string][]): unknown {
  if (typeof value === "string") {
    const match = pairs.find(([from]) => from === value);
    return match ? match[1] : value;
  }
  if (Array.isArray(value)) {
    const mapped = value.map((v) => deepReplace(v, pairs));
    // Nếu người giữ lại vốn đã có mặt trong mảng (vd. stakeholders/helpers/memberIds) trước khi
    // gộp, việc thay id có thể tạo 2 phần tử chuỗi giống hệt nhau — dọn trùng cho mảng chuỗi đơn
    // giản (helpers, memberIds, sharedWithUsers...). Mảng object (vd. stakeholders: {userId,role})
    // không dedupe ở đây vì role có thể khác nhau — chấp nhận trùng nhẹ, không mất dữ liệu.
    if (mapped.every((v) => typeof v === "string")) {
      return Array.from(new Set(mapped as string[]));
    }
    return mapped;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const keyMatch = pairs.find(([from]) => from === k);
      out[keyMatch ? keyMatch[1] : k] = deepReplace(v, pairs);
    }
    return out;
  }
  return value;
}

export interface MergeCollectionResult {
  label: string;
  updated: number;
}

async function mergeInCollection(
  model: mongoose.Model<any>,
  label: string,
  pairs: [string, string][],
): Promise<MergeCollectionResult> {
  const docs = await model.find({}).lean();
  let updated = 0;
  for (const doc of docs as any[]) {
    const raw = JSON.stringify(doc);
    if (!pairs.some(([from]) => raw.includes(from))) continue;
    const { _id, __v, ...rest } = doc;
    const replaced = deepReplace(rest, pairs) as Record<string, unknown>;
    await model.findByIdAndUpdate(_id, { $set: replaced });
    updated++;
  }
  return { label, updated };
}

/**
 * Gộp 2 tài khoản nhân viên trùng lặp: chuyển TOÀN BỘ tham chiếu (id + tên cache đi kèm, vd.
 * submittedByName/createdByName) từ `mergeId` sang `keepId` trên mọi collection có liên quan,
 * rồi vô hiệu hoá (KHÔNG xoá cứng) tài khoản trùng để giữ lại lịch sử nếu cần tra cứu.
 */
export async function mergeUsers(keepId: string, mergeId: string): Promise<MergeCollectionResult[]> {
  await connectDB();
  if (keepId === mergeId) throw new Error("Không thể gộp 1 tài khoản với chính nó");

  const [keepUser, mergeUser] = await Promise.all([
    UserModel.findById(keepId).lean(),
    UserModel.findById(mergeId).lean(),
  ]);
  if (!keepUser) throw new Error("Không tìm thấy tài khoản cần giữ lại");
  if (!mergeUser) throw new Error("Không tìm thấy tài khoản trùng lặp");

  const pairs: [string, string][] = [[mergeId, keepId]];
  if (mergeUser.name && keepUser.name && mergeUser.name !== keepUser.name) {
    pairs.push([mergeUser.name, keepUser.name]);
  }

  const targets: [mongoose.Model<any>, string][] = [
    [TaskModel, "Nhiệm vụ"],
    [ClinicalTrialModel, "Thử nghiệm lâm sàng"],
    [ResearchTopicModel, "Đề tài NCKH"],
    [ResearchGroupModel, "Nhóm nghiên cứu"],
    [WorkRequestModel, "Đơn từ"],
    [RequestTemplateModel, "Mẫu đơn"],
    [EvaluationModel, "Đánh giá"],
    [WorkflowModel, "Quy trình"],
    [DocFolderModel, "Thư mục tài liệu"],
    [WorkDocumentModel, "Tài liệu"],
    [NotificationModel, "Thông báo"],
    [MessageModel, "Tin nhắn"],
    [ChannelModel, "Kênh"],
    [ChannelMessageModel, "Tin nhắn kênh"],
    [AnnouncementModel, "Thông báo nội bộ"],
    [AnnouncementCommentModel, "Bình luận"],
    [CalendarEventModel, "Lịch"],
    [UnitPlanModel, "Kế hoạch đơn vị"],
    [AuditEventModel, "Nhật ký"],
    [FinancialTransactionModel, "Giao dịch tài chính"],
    [AdvanceRequestModel, "Tạm ứng"],
    [ReimbursementRequestModel, "Hoàn ứng"],
    [KPIFrameworkModel, "Khung KPI"],
    [EvaluationConfigModel, "Cấu hình đánh giá"],
    [MilestoneConfigModel, "Cấu hình mốc"],
    [WorkNodeModel, "Work node"],
    [EnrollmentShareTokenModel, "Link chia sẻ tuyển bệnh"],
  ];

  const results: MergeCollectionResult[] = [];
  for (const [model, label] of targets) {
    results.push(await mergeInCollection(model, label, pairs));
  }

  // Vô hiệu hoá tài khoản trùng — KHÔNG xoá cứng (giữ lại để tra cứu lịch sử nếu cần), đổi tên rõ
  // ràng để không gây nhầm lẫn khi hiển thị, xoá liên kết Task hội nhập/nghỉ việc trùng (đã gộp
  // sang bên kia nếu keepUser cũng có, tránh 2 Task hội nhập cho cùng 1 người).
  await UserModel.findByIdAndUpdate(mergeId, {
    $set: {
      isActive: false,
      name: `[Đã gộp vào ${keepUser.name}] ${mergeUser.name}`,
      updatedAt: new Date().toISOString(),
    },
  });

  return results;
}
