import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb/config";
import { ResearchTopicModel } from "@/lib/mongodb/models";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const SAFE_FIELDS = [
  "title", "field", "principalInvestigatorName", "department",
  "memberNames", "memberDepartments", "submitterName", "submitterEmail", "submitterPhone",
  "proposalFileUrl", "completionTimeline", "proposedReviewers", "excludedReviewers",
  "registrationNotes", "submissionType", "intakeNote", "intakeRevisionCount", "year",
  "code", "abstract",
];

async function findByToken(token: string) {
  await connectDB();
  const doc = await ResearchTopicModel.findOne({ resubmitToken: token }).lean();
  if (!doc) return null;
  const expiry = (doc as Record<string, unknown>).resubmitTokenExpiry as string | undefined;
  if (expiry && new Date(expiry) < new Date()) return null; // expired
  return doc as Record<string, unknown>;
}

// ─── GET — return safe topic fields for prefill ───────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const doc = await findByToken(token);
  if (!doc) return NextResponse.json({ error: "Link không hợp lệ hoặc đã hết hạn" }, { status: 404 });

  const safe: Record<string, unknown> = { id: doc._id };
  for (const f of SAFE_FIELDS) safe[f] = doc[f] ?? null;
  return NextResponse.json({ topic: safe });
}

// ─── POST — accept updated form data and resubmit ────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const doc = await findByToken(token);
  if (!doc) return NextResponse.json({ error: "Link không hợp lệ hoặc đã hết hạn" }, { status: 404 });

  const topicId = doc._id as string;
  let fileUrl: string | undefined;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    // Handle file upload + form fields together
    const form = await req.formData();

    const file = form.get("file") as File | null;
    if (file && file.size > 0) {
      const MAX_MB = 20;
      if (file.size > MAX_MB * 1024 * 1024) {
        return NextResponse.json({ error: `File quá lớn — tối đa ${MAX_MB}MB` }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const dir = path.join(process.cwd(), "public", "uploads", "proposals");
      await mkdir(dir, { recursive: true });
      const ext = file.name.split(".").pop() ?? "bin";
      const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await writeFile(path.join(dir, filename), buffer);
      fileUrl = `/uploads/proposals/${filename}`;
    }

    const updates: Record<string, unknown> = {
      title:             form.get("title")?.toString()?.trim() || doc.title,
      principalInvestigatorName: form.get("principalInvestigatorName")?.toString()?.trim() || doc.principalInvestigatorName,
      department:        form.get("department")?.toString()?.trim() || doc.department,
      memberNames:       form.get("memberNames")?.toString()?.trim() || undefined,
      memberDepartments: form.get("memberDepartments")?.toString()?.trim() || undefined,
      submitterName:     form.get("submitterName")?.toString()?.trim() || undefined,
      submitterEmail:    form.get("submitterEmail")?.toString()?.trim() || undefined,
      submitterPhone:    form.get("submitterPhone")?.toString()?.trim() || undefined,
      completionTimeline: form.get("completionTimeline")?.toString()?.trim() || doc.completionTimeline,
      proposedReviewers: form.get("proposedReviewers")?.toString()?.trim() || undefined,
      excludedReviewers: form.get("excludedReviewers")?.toString()?.trim() || undefined,
      registrationNotes: form.get("registrationNotes")?.toString()?.trim() || undefined,
      submissionType:    "resubmit",
      intakeStatus:      "awaiting",
      intakeNote:        undefined,
      resubmitToken:     undefined,
      resubmitTokenExpiry: undefined,
      updatedAt:         new Date().toISOString(),
    };
    if (fileUrl) updates.proposalFileUrl = fileUrl;

    await ResearchTopicModel.updateOne({ _id: topicId }, { $set: updates, $unset: { resubmitToken: "", resubmitTokenExpiry: "", intakeNote: "" } });
    return NextResponse.json({ ok: true });

  } else {
    // JSON body
    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {
      title:             String(body.title ?? doc.title).trim(),
      principalInvestigatorName: String(body.principalInvestigatorName ?? doc.principalInvestigatorName ?? "").trim() || doc.principalInvestigatorName,
      department:        String(body.department ?? doc.department ?? "").trim() || doc.department,
      memberNames:       body.memberNames ? String(body.memberNames).trim() : undefined,
      memberDepartments: body.memberDepartments ? String(body.memberDepartments).trim() : undefined,
      submitterName:     body.submitterName ? String(body.submitterName).trim() : undefined,
      submitterEmail:    body.submitterEmail ? String(body.submitterEmail).trim() : undefined,
      submitterPhone:    body.submitterPhone ? String(body.submitterPhone).trim() : undefined,
      completionTimeline: body.completionTimeline ? String(body.completionTimeline).trim() : doc.completionTimeline,
      proposedReviewers: body.proposedReviewers ? String(body.proposedReviewers).trim() : undefined,
      excludedReviewers: body.excludedReviewers ? String(body.excludedReviewers).trim() : undefined,
      registrationNotes: body.registrationNotes ? String(body.registrationNotes).trim() : undefined,
      submissionType:    "resubmit",
      intakeStatus:      "awaiting",
      updatedAt:         new Date().toISOString(),
    };
    if (body.proposalFileUrl) updates.proposalFileUrl = String(body.proposalFileUrl).trim();

    await ResearchTopicModel.updateOne({ _id: topicId }, { $set: updates, $unset: { resubmitToken: "", resubmitTokenExpiry: "", intakeNote: "" } });
    return NextResponse.json({ ok: true });
  }
}
