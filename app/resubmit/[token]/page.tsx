"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Microscope, Loader2, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { ResearchTopicFormBody } from "@/components/research/ResearchTopicFormBody";
import type { ResearchTopicFormData } from "@/components/research/ResearchTopicFormBody";

const FORM_ID = "resubmit-topic-form";

interface TopicData {
  id: string;
  title: string;
  principalInvestigatorName: string;
  department: string;
  field: string | null;
  memberNames: string | null;
  memberDepartments: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterPhone: string | null;
  proposalFileUrl: string | null;
  completionTimeline: string | null;
  proposedReviewers: string | null;
  excludedReviewers: string | null;
  registrationNotes: string | null;
  intakeNote: string | null;
  intakeRevisionCount: number | null;
  year: number | null;
  code: string | null;
}

export default function PublicResubmitPage() {
  const params = useParams();
  const token = String(params.token ?? "");

  const [loading,   setLoading]   = useState(true);
  const [topic,     setTopic]     = useState<TopicData | null>(null);
  const [notFound,  setNotFound]  = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  useEffect(() => {
    fetch(`/api/public/resubmit/${token}`)
      .then(r => r.json())
      .then((d: { topic?: TopicData; error?: string }) => {
        if (d.topic) setTopic(d.topic);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(data: ResearchTopicFormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/resubmit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:                     data.title,
          principalInvestigatorName: data.principalInvestigatorName,
          department:                data.department,
          field:                     data.field,
          memberNames:               data.memberNames,
          memberDepartments:         data.memberDepartments,
          submitterName:             data.submitterName,
          submitterEmail:            data.submitterEmail,
          submitterPhone:            data.submitterPhone,
          completionTimeline:        data.completionTimeline,
          proposedReviewers:         data.proposedReviewers,
          excludedReviewers:         data.excludedReviewers,
          registrationNotes:         data.registrationNotes,
          proposalFileUrl:           data.proposalFileUrl,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Gửi thất bại");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi thất bại, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Đang tải form...</p>
        </div>
      </div>
    );
  }

  // ── Not found / expired ─────────────────────────────────────────────────────

  if (notFound || !topic) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-800">Link không hợp lệ</h1>
          <p className="text-sm text-slate-500">
            Link chỉnh sửa đề cương không tồn tại hoặc đã hết hạn (30 ngày).
            Vui lòng liên hệ bộ phận NCKH để nhận link mới.
          </p>
        </div>
      </div>
    );
  }

  // ── Success ─────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Đã nộp lại thành công!</h1>
          <p className="text-sm text-slate-500">
            Đề cương <strong>{topic.title}</strong> đã được nộp lại và đang chờ tiếp nhận.
            Bạn sẽ nhận được thông báo khi có kết quả.
          </p>
          <p className="text-xs text-slate-400">Bạn có thể đóng tab này.</p>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
            <Microscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">ARiHA WorkHub · NCKH Cơ sở</p>
            <h1 className="text-base font-bold text-slate-800">Chỉnh sửa & Nộp lại đề cương</h1>
          </div>
        </div>

        {/* Topic strip */}
        <div className="flex items-center gap-3 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-400">
          {topic.code && (
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500">{topic.code}</span>
          )}
          <span>Năm {topic.year} · Nộp lại lần {(topic.intakeRevisionCount ?? 0) + 1}</span>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-6">
            <ResearchTopicFormBody
              mode="resubmit"
              formId={FORM_ID}
              initialData={{
                title:                     topic.title,
                principalInvestigatorName: topic.principalInvestigatorName,
                department:                topic.department,
                field:                     topic.field ?? undefined,
                memberNames:               topic.memberNames ?? undefined,
                memberDepartments:         topic.memberDepartments ?? undefined,
                submitterName:             topic.submitterName ?? undefined,
                submitterEmail:            topic.submitterEmail ?? undefined,
                submitterPhone:            topic.submitterPhone ?? undefined,
                proposalFileUrl:           topic.proposalFileUrl ?? undefined,
                completionTimeline:        topic.completionTimeline ?? undefined,
                proposedReviewers:         topic.proposedReviewers ?? undefined,
                excludedReviewers:         topic.excludedReviewers ?? undefined,
                registrationNotes:         topic.registrationNotes ?? undefined,
                intakeNote:                topic.intakeNote ?? undefined,
                intakeRevisionCount:       topic.intakeRevisionCount ?? undefined,
                code:                      topic.code ?? undefined,
                year:                      topic.year ?? undefined,
              }}
              uploadEndpoint={`/api/public/resubmit/${token}/upload`}
              onSubmit={handleSubmit}
              onValidityChange={setCanSubmit}
              saving={saving}
            />
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Sau khi nộp, đề cương sẽ vào hàng chờ tiếp nhận với loại{" "}
              <strong>Nộp lại / Bổ sung</strong>.
            </p>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </div>
            )}
            <button
              type="submit"
              form={FORM_ID}
              disabled={saving || !canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</>
                : <><Upload className="w-4 h-4" /> Nộp lại đề cương</>
              }
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Link này chỉ dùng một lần và có hiệu lực trong 30 ngày · ARiHA WorkHub
        </p>
      </div>
    </div>
  );
}
