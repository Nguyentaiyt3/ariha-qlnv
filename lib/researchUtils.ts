import type { ResearchTopic, User } from "@/types";
import { getEffectiveRole } from "@/lib/rbac/permissions";

/**
 * Chỉ hrAdmin (quyền "*" toàn hệ thống) hoặc người có chỉ định "Quản lý NCKH"
 * (researchDesignations includes "researchManager") mới được theo dõi/quản lý quy trình
 * thẩm định đề tài NCKH (tab Giám sát tiến độ, hàng chờ tiếp nhận, kiểm tra trùng lặp, upload
 * file mẫu). Vai trò hệ thống khác (kể cả director/teamLead) KHÔNG tự động có quyền này nếu
 * chưa được gán chỉ định.
 */
export function isNckhManager(user: Pick<User, "role" | "researchDesignations"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "hrAdmin") return true;
  return (user.researchDesignations ?? []).includes("researchManager");
}

/**
 * Nguồn thẩm quyền DUY NHẤT cho "có phải người quản lý NCKH thật hay không" — dùng ở mọi nơi
 * cần quyết định quyền quản trị toàn quy trình NCKH (tiếp nhận, xác nhận, chứng nhận, từ chối,
 * xem đầy đủ danh tính phản biện...). Cố tình KHÔNG dựa vào permission "research:manage" — vì
 * permission này có thể bị cấu hình rộng cho vai trò thấp hơn qua trang Phân quyền của tổ chức
 * (đã từng gây lộ danh tính phản biện + hiện nhầm nút hành động quản lý cho nhân viên/tác giả).
 * Chỉ dựa vào 2 thứ không thể bị cấu hình lại qua trang Phân quyền: tên vai trò "director" (đã
 * ở đỉnh phân cấp thật) và chỉ định "Quản lý NCKH" (gán riêng cho từng người).
 */
export function isNckhFullManager(user: Pick<User, "role" | "researchDesignations" | "positions"> | null | undefined): boolean {
  if (!user) return false;
  if (isNckhManager(user)) return true;
  return getEffectiveRole(user) === "director";
}

/**
 * "Trưởng nhóm Quản lý NCKH" — người vừa giữ vai trò Trưởng nhóm (teamLead) vừa được chỉ định
 * "Quản lý NCKH". Đây là cấp trung gian được đề xuất (không tự quyết) cho các hành động cần điều
 * phối nhưng không nên giao thẳng cho toàn bộ Trưởng nhóm nói chung — vd. chỉ định phản biện, đề
 * xuất thành lập Hội đồng KHCN (chờ Giám đốc/hrAdmin xác nhận).
 */
export function isNckhTeamLead(user: Pick<User, "role" | "researchDesignations" | "positions"> | null | undefined): boolean {
  if (!user) return false;
  return getEffectiveRole(user) === "teamLead" && isNckhManager(user);
}

export function normText(s?: string | null): string {
  return (s ?? "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

export function jaccardWords(a: string, b: string): number {
  const wa = new Set(normText(a).split(/\s+/).filter(w => w.length > 2));
  const wb = new Set(normText(b).split(/\s+/).filter(w => w.length > 2));
  if (wa.size === 0 && wb.size === 0) return 0;
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Xung đột lợi ích: người dùng có phải tác giả / đồng tác giả của đề cương không.
 * Dùng để chặn chính tác giả tự kiểm tra / tiếp nhận đề cương của mình.
 * Khớp theo ID (tin cậy) cho chủ nhiệm, thành viên (legacy), đồng tác giả;
 * và theo email cho đề cương nộp qua form public.
 */
export function isTopicAuthor(
  user: { id?: string; email?: string } | null | undefined,
  topic: Pick<ResearchTopic,
    "principalInvestigatorId" | "submitterEmail" | "contributors" | "memberIds">,
): boolean {
  if (!user?.id) return false;
  const uid = user.id;

  if (topic.principalInvestigatorId === uid) return true;
  if ((topic.memberIds ?? []).includes(uid)) return true;
  if ((topic.contributors ?? []).some(c =>
    c.userId === uid && (c.role === "author" || c.role === "coAuthor"))) return true;

  // Đề cương nộp qua form public — khớp theo email người nộp
  if (topic.principalInvestigatorId === "public" && user.email && topic.submitterEmail &&
      user.email.toLowerCase() === topic.submitterEmail.toLowerCase()) return true;

  return false;
}

/**
 * Xung đột lợi ích: người dùng có đang là 1 trong các phản biện của đề tài không (bất kể giai
 * đoạn nào, đã nộp hay chưa). Dùng để chặn chính phản biện tự chỉ định thêm phản biện khác /
 * được giao phụ trách chỉ định phản biện cho đề tài mình đang phản biện — nếu không chặn, họ sẽ
 * biết trước danh tính người được chỉ định (bắt buộc phải thấy để chọn đúng người), phá vỡ
 * nguyên tắc phản biện kín dù giao diện xem sau đó vẫn ẩn đúng.
 */
export function isTopicReviewer(
  topic: Pick<ResearchTopic, "reviews">,
  userId: string,
): boolean {
  return (topic.reviews ?? []).some(r => r.reviewerId === userId);
}

export type DupPair = {
  a: ResearchTopic;
  b: ResearchTopic;
  titleSim: number;
  samePerson: boolean;
  reason: "title" | "title_and_person";
};

/** Find all potential duplicate pairs across a list of topics. O(n²) — fine for <500 topics. */
export function findDuplicatePairs(topics: ResearchTopic[]): DupPair[] {
  const pairs: DupPair[] = [];
  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const a = topics[i];
      const b = topics[j];
      const titleSim = jaccardWords(a.title ?? "", b.title ?? "");
      const samePerson =
        !!a.principalInvestigatorName &&
        normText(a.principalInvestigatorName) === normText(b.principalInvestigatorName);
      if (titleSim >= 0.65) {
        pairs.push({ a, b, titleSim, samePerson, reason: "title" });
      } else if (titleSim >= 0.35 && samePerson) {
        pairs.push({ a, b, titleSim, samePerson, reason: "title_and_person" });
      }
    }
  }
  return pairs.sort((x, y) => y.titleSim - x.titleSim);
}
