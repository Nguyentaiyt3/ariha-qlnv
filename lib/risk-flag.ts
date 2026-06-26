import type { Task } from "@/types";
import { updateTask } from "@/lib/firebase/firestore";
import { addNotification } from "@/lib/firebase/firestore";

const RISK_THRESHOLD_DAYS = 2;
const RISK_PROGRESS_THRESHOLD = 50;

export async function checkAndUpdateRiskFlags(tasks: Task[]): Promise<string[]> {
  const flaggedIds: string[] = [];
  const now = new Date();

  for (const task of tasks) {
    if (task.status === "done" || task.status === "cancelled") continue;
    if (!task.deadlineBase) continue;

    const deadline = new Date(task.deadlineBase);
    const diffMs = deadline.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    const isNearDeadline = diffDays >= 0 && diffDays <= RISK_THRESHOLD_DAYS;
    const isOverdue = diffDays < 0;
    const isLowProgress = task.progress < RISK_PROGRESS_THRESHOLD;

    const shouldFlag = (isNearDeadline || isOverdue) && isLowProgress;

    if (shouldFlag && !task.riskFlag) {
      flaggedIds.push(task.id);
      await updateTask(task.id, { riskFlag: true });

      // Notify stakeholders — gồm cả người giám sát để nhắc nhở rủi ro
      const notifyUserIds = [
        task.mainPerformerId,
        ...task.stakeholders
          .filter((s) => s.role === "assignee" || s.role === "approver" || s.role === "supervisor")
          .map((s) => s.userId),
      ].filter((id, i, arr) => arr.indexOf(id) === i);

      for (const userId of notifyUserIds) {
        await addNotification({
          userId,
          type: isOverdue ? "task_overdue" : "risk_flag",
          title: isOverdue ? "Nhiệm vụ đã quá hạn!" : "Cảnh báo rủi ro deadline",
          body: `"${task.name}" ${isOverdue ? "đã trễ hạn" : `còn ${Math.ceil(diffDays)} ngày`} nhưng chỉ đạt ${task.progress}% tiến độ.`,
          link: `/tasks/${task.id}`,
          read: false,
          priority: isOverdue ? "urgent" : "normal",
          taskId: task.id,
          createdAt: new Date().toISOString(),
        });
      }
    } else if (!shouldFlag && task.riskFlag) {
      // Clear flag if task is back on track
      await updateTask(task.id, { riskFlag: false });
    }
  }

  return flaggedIds;
}
