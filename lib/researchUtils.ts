import type { ResearchTopic } from "@/types";

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
