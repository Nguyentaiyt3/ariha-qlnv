import { sendMail } from "./mailer";
import { addEmailLog } from "@/lib/firebase/firestore";
import type { Task, User, EmailEventType, StakeholderRole } from "@/types";
import { renderTaskAssigned } from "./templates/TaskAssigned";
import { renderDeadlineAlert } from "./templates/DeadlineAlert";
import { renderTaskOverdue } from "./templates/TaskOverdue";
import { renderApprovalRequest } from "./templates/ApprovalRequest";
import { renderTaskCompleted } from "./templates/TaskCompleted";

// ─── Batch queue to merge events in 5 min window ─────────────

const batchQueues = new Map<string, { timer: ReturnType<typeof setTimeout>; events: EmailEventType[] }>();

const STAKEHOLDER_EMAIL_RULES: Record<StakeholderRole, EmailEventType[]> = {
  assignee: ["task_assigned", "deadline_alert", "task_overdue", "comment_mention", "approval_request", "task_completed"],
  collaborator: ["task_assigned", "deadline_alert", "task_overdue", "task_completed"],
  watcher: ["task_completed", "task_overdue"],
  approver: ["approval_request", "task_completed"],
};

const URGENT_EVENTS: EmailEventType[] = ["task_overdue", "approval_request"];

export interface EmailTriggerPayload {
  event: EmailEventType;
  task: Task;
  users: User[];
  sender?: User;  // the logged-in user who performed the action
  extraData?: Record<string, unknown>;
}

export async function triggerEmail({ event, task, users, sender, extraData }: EmailTriggerPayload) {
  // Determine recipients based on stakeholder group + email preferences
  const stakeholders = task.stakeholders ?? [];
  const recipientMap = new Map<string, { user: User; eventTypes: EmailEventType[] }>();

  for (const s of stakeholders) {
    const eventTypes = STAKEHOLDER_EMAIL_RULES[s.role] ?? [];
    if (!eventTypes.includes(event)) continue;

    const user = users.find((u) => u.id === s.userId);
    if (!user) continue;

    // Check user notification prefs
    if (user.notificationPrefs?.emailEnabled === false) {
      if (!URGENT_EVENTS.includes(event)) continue;
    }
    if (user.notificationPrefs?.disabledEventTypes?.includes(event)) {
      if (!URGENT_EVENTS.includes(event)) continue;
    }

    recipientMap.set(user.id, { user, eventTypes });
  }

  if (recipientMap.size === 0) return;

  const recipients = Array.from(recipientMap.values()).map((r) => r.user);

  // Urgent events bypass batching
  if (URGENT_EVENTS.includes(event)) {
    await sendEmailGroup({ event, task, recipients, sender, extraData });
    return;
  }

  // Batch non-urgent events (5 min window per task+event combination)
  const batchKey = `${task.id}:${event}`;
  if (batchQueues.has(batchKey)) {
    batchQueues.get(batchKey)!.events.push(event);
    return;
  }

  const timer = setTimeout(async () => {
    await sendEmailGroup({ event, task, recipients, sender, extraData });
    batchQueues.delete(batchKey);
  }, 5 * 60 * 1000); // 5 minutes

  batchQueues.set(batchKey, { timer, events: [event] });
}

async function sendEmailGroup({
  event, task, recipients, sender, extraData,
}: {
  event: EmailEventType;
  task: Task;
  recipients: User[];
  sender?: User;
  extraData?: Record<string, unknown>;
}) {
  const emails = recipients.map((u) => u.email).filter(Boolean);
  if (emails.length === 0) return;

  let subject = "";
  let html = "";

  const senderName  = sender?.name;
  const senderEmail = sender?.email;

  try {
    switch (event) {
      case "task_assigned":
        subject = `[WorkHub] Bạn được giao nhiệm vụ: ${task.name}`;
        html = renderTaskAssigned(task, recipients, sender);
        break;
      case "deadline_alert":
        subject = `[WorkHub] ⏰ Sắp đến hạn: ${task.name}`;
        html = renderDeadlineAlert(task, recipients, sender);
        break;
      case "task_overdue":
        subject = `[WorkHub] 🚨 Quá hạn: ${task.name}`;
        html = renderTaskOverdue(task, recipients, sender);
        break;
      case "approval_request":
        subject = `[WorkHub] ✅ Cần phê duyệt: ${task.name}`;
        html = renderApprovalRequest(task, recipients, sender);
        break;
      case "task_completed":
        subject = `[WorkHub] ✅ Hoàn thành: ${task.name}`;
        html = renderTaskCompleted(task, recipients, sender);
        break;
      default:
        return;
    }

    await sendMail({ to: emails, subject, html, senderName, senderEmail });

    // Log to Firestore
    await addEmailLog({
      taskId: task.id,
      recipientIds: recipients.map((u) => u.id),
      recipientEmails: emails,
      eventType: event,
      subject,
      sentAt: new Date().toISOString(),
      status: "sent",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await addEmailLog({
      taskId: task.id,
      recipientIds: recipients.map((u) => u.id),
      recipientEmails: emails,
      eventType: event,
      subject: subject || `Email for ${event}`,
      sentAt: new Date().toISOString(),
      status: "failed",
      errorMessage: errMsg,
    });
    console.error("Email send failed:", errMsg);
  }
}
