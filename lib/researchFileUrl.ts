/**
 * Resolve a stored research file path/URL into a URL the browser can fetch.
 *
 * Storage tiers:
 *  1. Vercel Blob (new) — stored as absolute https://xxx.public.blob.vercel-storage.com/...
 *     → returned unchanged; browser fetches directly from CDN.
 *  2. External links (Google Drive, OneDrive) — stored as absolute http(s) URL
 *     → returned unchanged.
 *  3. Legacy disk-based uploads (old /uploads/... paths)
 *     → proxied through /api/research-file which reads from public/uploads/ on disk.
 *     On Vercel these files no longer exist; affected topics need re-upload.
 */
export function researchFileUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  // Blob URLs and external links → direct
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Legacy disk path → proxy
  return `/api/research-file?path=${encodeURIComponent(trimmed)}`;
}
