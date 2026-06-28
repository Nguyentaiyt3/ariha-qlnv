import React from "react";

const URL_RE = /https?:\/\/[^\s]+/g;

export function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline break-all hover:text-blue-700"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts.length > 0 ? parts : text;
}
