/**
 * Resolve a stored research file path into a URL the browser can actually fetch.
 *
 * Files are uploaded to `public/uploads/proposals/` at runtime. Next.js does NOT
 * serve files added to `public/` after the production build, so linking the raw
 * `/uploads/...` path 404s in production. Every view must go through the
 * `/api/research-file` proxy, which reads the file from disk with `fs.readFile`
 * (and is tolerant of Unicode NFC/NFD filename differences).
 *
 * External links (Google Drive / OneDrive — stored as absolute http URLs) are
 * returned unchanged.
 */
export function researchFileUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `/api/research-file?path=${encodeURIComponent(trimmed)}`;
}
