import type { ResearchAnnotation } from "@/types";

type NewAnnotation = Omit<ResearchAnnotation, "id" | "authorId" | "authorName" | "createdAt">;

export async function addAnnotation(topicId: string, payload: NewAnnotation): Promise<ResearchAnnotation | null> {
  const res = await fetch(`/api/research/${topicId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const d = await res.json() as { annotation?: ResearchAnnotation };
  return d.annotation ?? null;
}

export async function updateAnnotation(
  topicId: string, annotationId: string,
  patch: { note?: string; color?: ResearchAnnotation["color"] },
): Promise<void> {
  await fetch(`/api/research/${topicId}/annotations`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annotationId, ...patch }),
  });
}

export async function deleteAnnotation(topicId: string, annotationId: string): Promise<void> {
  await fetch(`/api/research/${topicId}/annotations?annotationId=${encodeURIComponent(annotationId)}`, {
    method: "DELETE",
  });
}
