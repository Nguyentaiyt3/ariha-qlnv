"use client";

import { useState, useEffect } from "react";
import { X, Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { cn, generateId } from "@/lib/utils";
import { buildInitialSteps } from "@/lib/research";
import { saveResearchTopic } from "@/lib/firebase/firestore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { ResearchTopicFormBody } from "./ResearchTopicFormBody";
import type { ResearchTopic } from "@/types";
import type { ResearchTopicFormData } from "./ResearchTopicFormBody";

const FORM_ID = "register-topic-modal-form";

interface Props {
  defaultPI?: string;
  defaultDept?: string;
  defaultTaskId?: string;
  defaultTaskName?: string;
  creatorId: string;
  creatorName: string;
  initialData?: ResearchTopic;
  onClose: () => void;
  onCreated: (t: ResearchTopic) => void;
}

function useTemplateUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/upload/template")
      .then(r => r.json())
      .then((d: { url: string | null }) => setUrl(d.url))
      .catch(() => {});
  }, []);
  return url;
}

export function RegisterTopicModal({
  defaultPI = "", defaultDept = "", defaultTaskId, defaultTaskName,
  creatorId, creatorName, initialData, onClose, onCreated,
}: Props) {
  const isEdit = !!initialData;
  const isRevisionResubmit = initialData?.intakeStatus === "revision_needed";

  const templateUrl = useTemplateUrl();
  const { tasks } = useTaskStore();
  const { currentUser: me } = useAuthStore();

  const [saving, setSaving] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);

  const sessionUser = me
    ? { id: me.id, name: me.name, email: me.email ?? "", department: me.department ?? "" }
    : { id: creatorId, name: defaultPI, email: "", department: defaultDept };

  async function handleSubmit(data: ResearchTopicFormData) {
    setSaving(true);
    try {
      if (isEdit && initialData) {
        const updates: Partial<ResearchTopic> = {
          title:                     data.title,
          principalInvestigatorName: data.principalInvestigatorName,
          field:                     data.field,
          abstract:                  data.abstract,
          memberNames:               data.memberNames,
          memberDepartments:         data.memberDepartments,
          department:                data.department,
          completionTimeline:        data.completionTimeline,
          submitterName:             data.submitterName,
          submitterEmail:            data.submitterEmail,
          submitterPhone:            data.submitterPhone,
          proposalFileUrl:           data.proposalFileUrl,
          proposedReviewers:         data.proposedReviewers,
          excludedReviewers:         data.excludedReviewers,
          updatedAt:                 new Date().toISOString(),
          ...(isRevisionResubmit && { intakeStatus: "awaiting", intakeNote: undefined }),
        };
        const res = await fetch(`/api/research/${initialData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(resData?.error || "Cập nhật thất bại");
        if (resData?.pending) {
          toast.success("Đã gửi yêu cầu sửa — chờ trưởng nhóm cùng đơn vị duyệt");
          onCreated(initialData);
        } else {
          toast.success("Đã cập nhật đề cương");
          onCreated({ ...initialData, ...updates });
        }
      } else {
        const completionY = parseInt(data.completionTimeline.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear()));
        const topic: ResearchTopic = {
          id:                        generateId("rsch"),
          source:                    "internal",
          title:                     data.title,
          principalInvestigatorId:   creatorId,
          principalInvestigatorName: data.principalInvestigatorName,
          field:                     data.field,
          abstract:                  data.abstract,
          memberIds:                 [],
          memberNames:               data.memberNames,
          memberDepartments:         data.memberDepartments,
          department:                data.department,
          year:                      completionY,
          stage:                     "init",
          currentStep:               "approve_task",
          steps:                     buildInitialSteps(),
          reviews:                   [],
          councilSessions:           [],
          certificates:              [],
          documents:                 [],
          approvedToExecute:         false,
          submitterName:             data.submitterName,
          submitterEmail:            data.submitterEmail,
          submitterPhone:            data.submitterPhone,
          proposalFileUrl:           data.proposalFileUrl,
          completionTimeline:        data.completionTimeline,
          proposedReviewers:         data.proposedReviewers,
          excludedReviewers:         data.excludedReviewers,
          registrationNotes:         data.registrationNotes,
          submissionType:            "new",
          taskId:                    data.linkedTaskId,
          intakeStatus:              "awaiting",
          createdBy:                 creatorId,
          createdByName:             creatorName,
          createdAt:                 new Date().toISOString(),
        };
        const result = await saveResearchTopic(topic);
        const finalTopic = result?.taskId ? { ...topic, taskId: result.taskId } : topic;
        if (result?.autoLinked) {
          toast.success("Đã nộp đăng ký — tự động liên kết nhiệm vụ NCKH phù hợp");
        } else {
          toast.success("Đã nộp đăng ký đề cương — đang chờ phê duyệt");
        }
        onCreated(finalTopic);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : (isEdit ? "Cập nhật thất bại" : "Nộp thất bại, vui lòng thử lại"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-500" />
              {isEdit ? "Sửa đề cương nghiên cứu khoa học" : "Đăng ký đề cương nghiên cứu khoa học"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit
                ? "Cập nhật thông tin đề tài · Lịch sử tiếp nhận vẫn được giữ nguyên"
                : "Đề tài NCKH cấp cơ sở · Chờ phê duyệt sau khi nộp"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <ResearchTopicFormBody
            mode="internal"
            formId={FORM_ID}
            initialData={initialData
              ? {
                  ...initialData,
                  intakeNote:          initialData.intakeNote          ?? undefined,
                  intakeRevisionCount: initialData.intakeRevisionCount ?? undefined,
                  code:                initialData.code                ?? undefined,
                  year:                initialData.year                ?? undefined,
                }
              : undefined
            }
            sessionUser={sessionUser}
            availableTasks={tasks}
            defaultTaskId={defaultTaskId}
            isEdit={isEdit}
            isRevisionResubmit={isRevisionResubmit}
            uploadEndpoint="/api/upload"
            templateUrl={templateUrl}
            onSubmit={handleSubmit}
            onValidityChange={setCanSubmit}
            saving={saving}
          />
        </div>

        {/* Footer */}
        <div className={cn(
          "sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3 rounded-b-2xl",
        )}>
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Huỷ
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving || !canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {isEdit ? "Đang lưu..." : "Đang nộp..."}</>
              : <><FlaskConical className="w-4 h-4" /> {isEdit ? "Lưu thay đổi" : "Nộp đăng ký"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
