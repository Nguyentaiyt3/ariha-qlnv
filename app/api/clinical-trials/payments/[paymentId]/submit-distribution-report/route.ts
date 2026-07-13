import { NextRequest, NextResponse } from "next/server";
import {
  updateClinicalTrial,
  getUsers,
  createNotification,
} from "@/lib/mongodb/firestore";
import { authorizePaymentAction, getTrialByPaymentId } from "@/lib/mongodb/clinicalTrialPayments";

const APPROVER_ROLES = ["director", "teamLead", "financeSupervisor"];

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { paymentId } = params;

    const trial = await getTrialByPaymentId(paymentId);
    if (!trial) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const auth = await authorizePaymentAction(request, trial, {});
    if (!auth.ok) return auth.response;
    const submittedBy = auth.me.name;

    const payment = trial.payments?.find((p) => p.id === paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const distributions = payment.handoverDistributions || [];
    const allHandedOver =
      distributions.length > 0 &&
      distributions.every((d) => d.status === "handed_over");

    if (!allHandedOver) {
      return NextResponse.json(
        { error: "Phải bàn giao đầy đủ cho tất cả đơn vị trước khi gửi báo cáo" },
        { status: 400 }
      );
    }

    const updatedPayments = trial.payments?.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            distributionStatus: "submitted_for_approval" as const,
            distributionSubmittedAt: new Date().toISOString(),
          }
        : p
    );

    await updateClinicalTrial(trial.id, { payments: updatedPayments });

    // Notify approvers
    const users = await getUsers();
    const approvers = users.filter((u) => APPROVER_ROLES.includes(u.role));

    for (const approver of approvers) {
      await createNotification({
        userId: approver.id,
        type: "approval_request",
        title: "Chờ duyệt hoàn tất bàn giao thanh toán",
        body: `${submittedBy || "Người đề nghị"} đã báo cáo hoàn tất bàn giao thanh toán "${payment.paymentName}" (${trial.code})`,
        link: `/clinical-trials/${trial.id}`,
        read: false,
        priority: "normal",
        actionRequired: true,
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error submitting distribution report:", error);
    return NextResponse.json(
      { error: "Lỗi khi gửi báo cáo" },
      { status: 500 }
    );
  }
}
