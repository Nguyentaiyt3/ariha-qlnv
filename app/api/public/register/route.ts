import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";

function genId() {
  return `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const title = str(body.title);
  if (!title)
    return NextResponse.json({ error: "Tên đề tài không được để trống" }, { status: 400 });

  const submitterEmail = str(body.submitterEmail);
  const piName = str(body.principalInvestigatorName);
  if (!piName)
    return NextResponse.json({ error: "Tên chủ nhiệm không được để trống" }, { status: 400 });

  await connectDB();

  const now = new Date().toISOString();
  const id = genId();

  await ResearchTopicModel.create({
    _id: id,
    title,
    // No real userId — public submission; identified by submitterEmail
    principalInvestigatorId: "public",
    principalInvestigatorName: piName,
    department:         str(body.department),
    year:               new Date().getFullYear(),
    field:              str(body.field),
    abstract:           str(body.abstract),
    memberNames:        str(body.memberNames),
    memberDepartments:  str(body.memberDepartments),
    submitterName:      str(body.submitterName),
    submitterEmail,
    submitterPhone:     str(body.submitterPhone),
    proposalFileUrl:    str(body.proposalFileUrl),
    completionTimeline: str(body.completionTimeline),
    proposedReviewers:  str(body.proposedReviewers),
    excludedReviewers:  str(body.excludedReviewers),
    registrationNotes:  str(body.registrationNotes),
    source:             "public",
    submissionType:     "new",
    taskId:             str(body.taskId),
    stage:              "init",
    currentStep:        "approve_task",
    steps:              [],
    intakeStatus:       "awaiting",
    createdBy:          "public",
    createdByName:      str(body.submitterName) ?? piName,
    createdAt:          now,
    updatedAt:          now,
  });

  return NextResponse.json({ ok: true, id });
}
