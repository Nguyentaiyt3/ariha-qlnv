"use client";

import React, { useState } from "react";
import { AlertCircle, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import type { ClinicalTrialPayment, EditDeleteRequest } from "@/types";

interface EditDeleteRequestsListProps {
  payments: (ClinicalTrialPayment & {
    trialId: string;
    trialCode: string;
    trialName: string;
  })[];
  onSuccess: () => void;
}

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

export function EditDeleteRequestsList({
  payments,
  onSuccess,
}: EditDeleteRequestsListProps) {
  const { currentUser } = useAuthStore();
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pendingRequests: (EditDeleteRequest & {
    paymentId: string;
    trialCode: string;
    trialName: string;
    requestIndex: number;
    submitterId?: string;
    submitterRole?: string;
    submitterDepartmentHeadId?: string;
  })[] = [];

  payments.forEach((payment) => {
    payment.editDeleteRequests?.forEach((req, idx) => {
      if (req.status === "pending") {
        pendingRequests.push({
          ...req,
          paymentId: payment.id,
          trialCode: payment.trialCode,
          trialName: payment.trialName,
          requestIndex: idx,
          submitterId: payment.submitterId,
          submitterRole: payment.submitterRole,
          submitterDepartmentHeadId: payment.submitterDepartmentHeadId,
        });
      }
    });
  });

  function canApproveRequest(req: typeof pendingRequests[0]): boolean {
    // Financial approvers can always approve
    if (["director", "teamLead", "financeSupervisor"].includes(currentUser?.role || "")) {
      return true;
    }
    // Submitter's department head can approve
    if (currentUser?.id === req.submitterDepartmentHeadId) {
      return true;
    }
    // Submitter themselves if they have manager role
    if (
      currentUser?.id === req.submitterId &&
      ["director", "teamLead"].includes(req.submitterRole || "")
    ) {
      return true;
    }
    return false;
  }

  const canApproveAny = pendingRequests.some((req) => canApproveRequest(req));

  async function handleApproveRequest(req: typeof pendingRequests[0]) {
    setProcessing(`${req.paymentId}-${req.requestIndex}`);
    try {
      const endpoint =
        req.type === "edit"
          ? `/api/clinical-trials/payments/${req.paymentId}/approve-edit-request`
          : `/api/clinical-trials/payments/${req.paymentId}/approve-delete-request`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIndex: req.requestIndex,
          approvedBy: currentUser?.name,
          approvedByUserId: currentUser?.id,
        }),
      });

      if (!response.ok) throw new Error("Failed to approve");
      toast.success(
        req.type === "edit"
          ? "Đã phê duyệt yêu cầu sửa"
          : "Đã phê duyệt yêu cầu xoá"
      );
      onSuccess();
    } catch (error) {
      toast.error("Lỗi khi phê duyệt yêu cầu");
      console.error(error);
    } finally {
      setProcessing(null);
    }
  }

  async function handleRejectRequest(req: typeof pendingRequests[0]) {
    if (!rejectReason.trim()) return;

    setProcessing(`${req.paymentId}-${req.requestIndex}`);
    try {
      const endpoint =
        req.type === "edit"
          ? `/api/clinical-trials/payments/${req.paymentId}/reject-edit-request`
          : `/api/clinical-trials/payments/${req.paymentId}/reject-delete-request`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIndex: req.requestIndex,
          rejectionReason: rejectReason.trim(),
          rejectedBy: currentUser?.name,
          rejectedByUserId: currentUser?.id,
        }),
      });

      if (!response.ok) throw new Error("Failed to reject");
      toast.success(
        req.type === "edit"
          ? "Đã từ chối yêu cầu sửa"
          : "Đã từ chối yêu cầu xoá"
      );
      setRejectingId(null);
      setRejectReason("");
      onSuccess();
    } catch (error) {
      toast.error("Lỗi khi từ chối yêu cầu");
      console.error(error);
    } finally {
      setProcessing(null);
    }
  }

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-500" />
          Yêu cầu sửa/xoá thanh toán ({pendingRequests.length})
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Người đề nghị yêu cầu thay đổi thanh toán đã duyệt
        </p>
      </div>

      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 w-24">
                  Mã TNLS
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 w-20">
                  Loại
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400">
                  Người đề nghị
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 w-24">
                  Ngày gửi
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400 w-20">
                  Chi tiết
                </th>
                {canApproveAny && (
                  <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400 w-40">
                    Hành động
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {pendingRequests.map((req) => {
                const isExpanded = expandedId === `${req.paymentId}-${req.requestIndex}`;
                return (
                  <React.Fragment key={`${req.paymentId}-${req.requestIndex}`}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="px-3 py-2.5 font-medium text-blue-600 dark:text-blue-400">
                        {req.trialCode}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                            req.type === "edit"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                          )}
                        >
                          {req.type === "edit" ? "Sửa" : "Xoá"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-sm">
                        {req.requestedBy}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-sm">
                        {new Date(req.requestedAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : `${req.paymentId}-${req.requestIndex}`)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
                        >
                          {isExpanded ? "Ẩn" : "Xem"}
                        </button>
                      </td>
                      {canApproveRequest(req) && (
                        <td className="px-3 py-2.5 text-center space-x-1.5">
                          <button
                            onClick={() => handleApproveRequest(req)}
                            disabled={
                              processing === `${req.paymentId}-${req.requestIndex}`
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-xs font-medium transition"
                            title="Đồng ý"
                          >
                            {processing === `${req.paymentId}-${req.requestIndex}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Đồng ý
                          </button>
                          <button
                            onClick={() =>
                              setRejectingId(`${req.paymentId}-${req.requestIndex}`)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs font-medium transition"
                            title="Từ chối"
                          >
                            <X className="w-3 h-3" />
                            Từ chối
                          </button>
                        </td>
                      )}
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-slate-900/30">
                        <td colSpan={canApproveAny ? 6 : 5} className="px-6 py-4">
                          <div className="space-y-3">
                            {req.type === "edit" && req.editedData && (
                              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                                  Thay đổi đề xuất:
                                </p>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  {req.editedData.paymentName && (
                                    <div>
                                      <p className="text-slate-500 dark:text-slate-400">Tên thanh toán</p>
                                      <p className="font-medium text-slate-800 dark:text-white">{req.editedData.paymentName}</p>
                                    </div>
                                  )}
                                  {req.editedData.totalAmount && (
                                    <div>
                                      <p className="text-slate-500 dark:text-slate-400">Số tiền</p>
                                      <p className="font-medium text-slate-800 dark:text-white">{vnd(req.editedData.totalAmount)}</p>
                                    </div>
                                  )}
                                  {req.editedData.date && (
                                    <div>
                                      <p className="text-slate-500 dark:text-slate-400">Ngày</p>
                                      <p className="font-medium text-slate-800 dark:text-white">
                                        {new Date(req.editedData.date).toLocaleDateString("vi-VN")}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {req.type === "delete" && (
                              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                  ⚠️ Yêu cầu xoá thanh toán này
                                </p>
                              </div>
                            )}
                            {req.reason && (
                              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Lý do:</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{req.reason}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-white">
              Lý do từ chối yêu cầu
            </h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                className="flex-1 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Huỷ
              </button>
              <button
                onClick={() => {
                  const req = pendingRequests.find(
                    (r) => `${r.paymentId}-${r.requestIndex}` === rejectingId
                  );
                  if (req) handleRejectRequest(req);
                }}
                disabled={!rejectReason.trim() || processing === rejectingId}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition"
              >
                {processing === rejectingId ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  "Từ chối"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
