import { NextRequest, NextResponse } from "next/server";
import { getResearchTopics, updateResearchTopic, createNotification } from "@/lib/mongodb/firestore";
import { getUser } from "@/lib/mongodb/auth";
import { sendMail } from "@/lib/email/mailer";

/**
 * Tự động từ chối đề tài NCKH quá thời hạn nộp lại sau "Yêu cầu sửa đổi" (revisionDueAt đã đặt ở
 * tab Tổng hợp kết quả) mà tác giả vẫn chưa nộp lại (revisionResubmittedAt còn trống).
 * Gọi bởi node-cron hoặc cron ngoài, mỗi ngày 1 lần — yêu cầu header x-cron-secret (cùng quy ước
 * với app/api/cron/deadline-check).
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const topics = await getResearchTopics();
    const overdue = topics.filter((t) =>
      t.revisionDueAt &&
      new Date(t.revisionDueAt) < now &&
      !t.revisionResubmittedAt &&
      t.stage !== "rejected" && t.stage !== "completed"
    );

    for (const topic of overdue) {
      const stamp = now.toISOString();
      const dueLabel = new Date(topic.revisionDueAt!).toLocaleDateString("vi-VN");
      await updateResearchTopic(topic.id, {
        stage: "rejected",
        rejectionReason: `Quá thời hạn nộp lại sau yêu cầu chỉnh sửa (hạn: ${dueLabel}).`,
      });

      const pi = topic.principalInvestigatorId ? await getUser(topic.principalInvestigatorId) : null;
      const notifyIds = [...new Set(
        [topic.principalInvestigatorId, topic.mainPerformerId].filter((v): v is string => !!v)
      )];
      await Promise.all(notifyIds.map((uid) =>
        createNotification({
          userId: uid,
          type: "approval_request",
          title: "Đề tài đã bị từ chối do quá hạn nộp lại",
          body: `Đề tài "${topic.title}" đã quá thời hạn nộp lại (${dueLabel}) sau yêu cầu chỉnh sửa — hệ thống đã tự động chuyển sang trạng thái Từ chối.`,
          link: `/research/${topic.id}`,
          read: false,
          priority: "urgent",
          createdAt: stamp,
        }).catch(() => {})
      ));

      const authorEmail = topic.submitterEmail ?? pi?.email;
      if (authorEmail) {
        await sendMail({
          to: authorEmail,
          subject: `[ARiHA] Đề tài đã bị từ chối do quá hạn nộp lại: ${topic.title}`,
          html:
            `<p>Kính gửi ${topic.principalInvestigatorName ?? pi?.name ?? "Quý tác giả"},</p>` +
            `<p>Đề tài "${topic.title}" đã quá thời hạn nộp lại bản chỉnh sửa theo yêu cầu của phản biện (hạn: ${dueLabel}).</p>` +
            `<p>Hệ thống đã tự động chuyển đề tài sang trạng thái <strong>Từ chối</strong>.</p>` +
            `<p>Vui lòng liên hệ bộ phận Quản lý NCKH nếu cần hỗ trợ thêm.</p>`,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, rejected: overdue.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
