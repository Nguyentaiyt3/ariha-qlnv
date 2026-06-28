"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Microscope, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { ResearchTopicFormBody } from "@/components/research/ResearchTopicFormBody";
import type { ResearchTopicFormData } from "@/components/research/ResearchTopicFormBody";

const FORM_ID = "public-register-form";

function RegisterForm() {
  const searchParams = useSearchParams();
  const taskId   = searchParams.get("taskId")   ?? "";
  const taskName = searchParams.get("taskName") ?? "Nhiệm vụ NCKH";

  const [saving,    setSaving]    = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  async function handleSubmit(data: ResearchTopicFormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:                     data.title,
          principalInvestigatorName: data.principalInvestigatorName,
          department:                data.department,
          field:                     data.field,
          abstract:                  data.abstract,
          completionTimeline:        data.completionTimeline,
          memberNames:               data.memberNames,
          memberDepartments:         data.memberDepartments,
          proposedReviewers:         data.proposedReviewers,
          excludedReviewers:         data.excludedReviewers,
          registrationNotes:         data.registrationNotes,
          submitterName:             data.submitterName,
          submitterEmail:            data.submitterEmail,
          submitterPhone:            data.submitterPhone,
          proposalFileUrl:           data.proposalFileUrl,
          taskId:                    taskId || undefined,
          submissionType:            "new",
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Gửi thất bại");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi thất bại");
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-800">Đăng ký thành công!</h2>
          <p className="text-slate-500 max-w-md">
            Đề cương của bạn đã được ghi nhận và chờ tiếp nhận. Bộ phận phụ trách sẽ liên hệ qua email sau khi kiểm tra.
          </p>
          {taskId && (
            <p className="text-sm text-violet-600 font-medium">Nhiệm vụ: {taskName}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Task context banner */}
      {taskId && (
        <div className="flex items-start gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl text-sm">
          <Microscope className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-violet-700">Nhiệm vụ NCKH: </span>
            <span className="text-violet-600">{taskName}</span>
            <p className="text-xs text-violet-400 mt-0.5">Đề tài được đăng ký sẽ liên kết với nhiệm vụ này.</p>
          </div>
        </div>
      )}

      <ResearchTopicFormBody
        mode="public"
        formId={FORM_ID}
        uploadEndpoint="/api/public/register/upload"
        onSubmit={handleSubmit}
        onValidityChange={setCanSubmit}
        saving={saving}
      />

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        form={FORM_ID}
        disabled={!canSubmit || saving}
        className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</> : "Gửi đăng ký đề tài"}
      </button>
    </div>
  );
}

export default function PublicRegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
            <Microscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Đăng ký đề tài NCKH</h1>
            <p className="text-sm text-slate-400">ARiHA WorkHub — Không cần đăng nhập</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>}>
            <RegisterForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          ARiHA WorkHub v2.0 · Hệ thống quản lý nghiên cứu khoa học
        </p>
      </div>
    </div>
  );
}
