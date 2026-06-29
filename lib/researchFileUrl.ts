/**
 * Resolve a stored research file path/URL into a URL the browser can fetch.
 *
 * Storage tiers:
 *  1. Vercel Blob (private store) — https://*.blob.vercel-storage.com/...
 *     → proxied through /api/blob-proxy which adds Bearer token server-side.
 *  2. External links (Google Drive, OneDrive) — other http(s) URLs
 *     → returned unchanged; browser fetches directly.
 *  3. Legacy disk-based uploads (old /uploads/... paths)
 *     → proxied through /api/research-file (only works in local dev).
 */
export function researchFileUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  // Private Vercel Blob → proxy through server so Bearer token is added
  if (/\.blob\.vercel-storage\.com\//i.test(trimmed)) {
    return `/api/blob-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  // External links (Google Drive, OneDrive, etc.) → direct
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Legacy disk path → proxy
  return `/api/research-file?path=${encodeURIComponent(trimmed)}`;
}
