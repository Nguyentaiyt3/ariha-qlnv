"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, FileText, Download, MessageSquarePlus, Trash2, Check, X, StickyNote, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { researchFileUrl } from "@/lib/researchFileUrl";
import type { ResearchAnnotation } from "@/types";

// ─── Highlight colors ─────────────────────────────────────────────────────────

const COLOR_HEX: Record<ResearchAnnotation["color"], string> = {
  yellow: "rgba(253, 224, 71,  0.35)",
  green:  "rgba(134, 239, 172, 0.35)",
  pink:   "rgba(249, 168, 212, 0.35)",
  blue:   "rgba(147, 197, 253, 0.35)",
};
const COLOR_LIST = Object.keys(COLOR_HEX) as ResearchAnnotation["color"][];
const CONTEXT_LEN = 40;

// ─── Anchoring helpers (text-quote) ───────────────────────────────────────────

/** Char offset of a (container,offset) boundary relative to root's text content. */
function charOffset(root: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  try { r.setEnd(container, offset); } catch { return -1; }
  return r.toString().length;
}

interface TextEntry { node: Text; start: number; end: number; }

function collectTextNodes(root: HTMLElement): TextEntry[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: TextEntry[] = [];
  let off = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    out.push({ node: t, start: off, end: off + t.data.length });
    off += t.data.length;
  }
  return out;
}

/** Remove all highlight <mark> wrappers, restoring original text. */
function unwrapMarks(root: HTMLElement) {
  root.querySelectorAll("mark[data-aid]").forEach(m => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  });
  root.normalize();
}

/** Locate the char range [start,end) of an annotation within fullText. */
function findRange(fullText: string, ann: ResearchAnnotation): { start: number; end: number } | null {
  if (!ann.quote) return null;
  // 1. prefix + quote + suffix exact context match (most precise)
  if (ann.prefix || ann.suffix) {
    const needle = (ann.prefix ?? "") + ann.quote + (ann.suffix ?? "");
    const idx = fullText.indexOf(needle);
    if (idx >= 0) {
      const s = idx + (ann.prefix?.length ?? 0);
      return { start: s, end: s + ann.quote.length };
    }
  }
  // 2. nth occurrence of the bare quote
  const want = ann.occurrence ?? 0;
  let from = 0, occ = 0;
  for (;;) {
    const idx = fullText.indexOf(ann.quote, from);
    if (idx < 0) break;
    if (occ === want) return { start: idx, end: idx + ann.quote.length };
    occ++; from = idx + 1;
  }
  // 3. first occurrence fallback
  const idx = fullText.indexOf(ann.quote);
  return idx >= 0 ? { start: idx, end: idx + ann.quote.length } : null;
}

/** Wrap [start,end) char range in <mark> elements (may span multiple text nodes). */
function wrapRange(root: HTMLElement, start: number, end: number, aid: string, hex: string) {
  const nodes = collectTextNodes(root);
  for (const e of nodes) {
    if (e.end <= start || e.start >= end) continue;
    const ls = Math.max(0, start - e.start);
    const le = Math.min(e.node.data.length, end - e.start);
    if (le <= ls) continue;
    const range = document.createRange();
    try {
      range.setStart(e.node, ls);
      range.setEnd(e.node, le);
      const mark = document.createElement("mark");
      mark.dataset.aid = aid;
      mark.style.backgroundColor = hex;
      mark.style.borderRadius = "2px";
      mark.style.cursor = "pointer";
      mark.style.padding = "0 1px";
      range.surroundContents(mark);
    } catch { /* skip un-wrappable fragment */ }
  }
}

function countOccurrencesBefore(fullText: string, quote: string, start: number): number {
  let occ = 0, from = 0;
  for (;;) {
    const idx = fullText.indexOf(quote, from);
    if (idx < 0 || idx >= start) break;
    occ++; from = idx + 1;
  }
  return occ;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  fileUrl: string;                 // raw stored url
  annotations: ResearchAnnotation[];
  canAnnotate: boolean;            // can add highlights/notes
  canManageAll?: boolean;          // can edit/delete others' annotations
  currentUserId?: string;
  onAdd?: (a: Omit<ResearchAnnotation, "id" | "authorId" | "authorName" | "createdAt">) => Promise<ResearchAnnotation | null>;
  onUpdate?: (id: string, patch: { note?: string; color?: ResearchAnnotation["color"] }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

interface Toolbar { x: number; y: number; }
interface ActivePopover { aid: string; x: number; y: number; }

// ─── Component ────────────────────────────────────────────────────────────────

export function DocxAnnotator({
  fileUrl, annotations, canAnnotate, canManageAll = false, currentUserId,
  onAdd, onUpdate, onDelete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "not_found" | "error" | "unsupported">("loading");
  const [errorDetail, setErrorDetail] = useState("");
  const [rendered, setRendered] = useState(false);

  const [items, setItems] = useState<ResearchAnnotation[]>(annotations);
  const [showNotes, setShowNotes] = useState(true);
  const [toolbar, setToolbar] = useState<Toolbar | null>(null);
  const [popover, setPopover] = useState<ActivePopover | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const pendingSelection = useRef<{ quote: string; prefix: string; suffix: string; occurrence: number } | null>(null);

  const proxied = researchFileUrl(fileUrl);
  const isDocx = /\.docx(\?|$)/i.test(fileUrl);
  const isPdf  = /\.pdf(\?|$)/i.test(fileUrl);
  const isDoc  = /\.doc(\?|$)/i.test(fileUrl) && !isDocx;

  useEffect(() => setItems(annotations), [annotations]);

  // ── Render docx OR pdf into the same container (both annotatable) ─────────────
  useEffect(() => {
    if (isDoc) { setState("unsupported"); return; }
    if (!isDocx && !isPdf) { setState("unsupported"); return; }
    if (!containerRef.current) return;
    let cancelled = false;
    setState("loading");
    setRendered(false);

    const run = async () => {
      const res = await fetch(proxied);
      if (res.status === 404) throw Object.assign(new Error("not_found"), { code: "not_found" });
      if (!res.ok) throw new Error(`Không tải được file (HTTP ${res.status})`);
      const buf = await res.arrayBuffer();
      const root = containerRef.current;
      if (cancelled || !root) return;
      root.innerHTML = "";

      if (isDocx) {
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current) return;
        await renderAsync(buf, containerRef.current, undefined, {
          className: "docx-preview-body", inWrapper: true, ignoreWidth: true,
        });
      } else {
        // PDF → canvas + selectable text layer per page
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const scale = 1.35;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled || !containerRef.current) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const pageDiv = document.createElement("div");
          pageDiv.className = "pdf-page";
          pageDiv.style.width = `${Math.floor(viewport.width)}px`;
          pageDiv.style.height = `${Math.floor(viewport.height)}px`;
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const textDiv = document.createElement("div");
          textDiv.className = "textLayer";
          textDiv.style.setProperty("--scale-factor", String(scale));
          const textContent = await page.getTextContent();
          const textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textDiv, viewport });
          await textLayer.render();
          pageDiv.appendChild(canvas);
          pageDiv.appendChild(textDiv);
          containerRef.current.appendChild(pageDiv);
        }
      }
      if (!cancelled) { setState("done"); setRendered(true); }
    };

    run().catch((err: unknown) => {
      if (cancelled) return;
      if ((err as { code?: string }).code === "not_found") setState("not_found");
      else { setErrorDetail(err instanceof Error ? err.message : String(err)); setState("error"); }
    });

    return () => { cancelled = true; };
  }, [proxied, isDocx, isPdf, isDoc]);

  // ── Apply highlights whenever items or render changes ────────────────────────
  const applyHighlights = useCallback(() => {
    const root = containerRef.current;
    if (!root || !rendered) return;
    unwrapMarks(root);
    const fullText = root.textContent ?? "";
    for (const ann of items) {
      if (ann.fileUrl !== fileUrl) continue;
      const r = findRange(fullText, ann);
      if (r) wrapRange(root, r.start, r.end, ann.id, COLOR_HEX[ann.color]);
    }
  }, [items, rendered, fileUrl]);

  useEffect(() => { applyHighlights(); }, [applyHighlights]);

  // ── Text selection → floating toolbar ────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (!canAnnotate) return;
    const root = containerRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) { setToolbar(null); return; }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) { setToolbar(null); return; }

    const text = sel.toString().trim();
    if (!text) { setToolbar(null); return; }

    const start = charOffset(root, range.startContainer, range.startOffset);
    const end = charOffset(root, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || start === end) { setToolbar(null); return; }
    const lo = Math.min(start, end), hi = Math.max(start, end);
    const fullText = root.textContent ?? "";
    const quote = fullText.slice(lo, hi);
    if (!quote.trim()) { setToolbar(null); return; }

    pendingSelection.current = {
      quote,
      prefix: fullText.slice(Math.max(0, lo - CONTEXT_LEN), lo),
      suffix: fullText.slice(hi, hi + CONTEXT_LEN),
      occurrence: countOccurrencesBefore(fullText, quote, lo),
    };

    const rect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    setToolbar({
      x: rect.left - rootRect.left + root.scrollLeft + rect.width / 2,
      y: rect.top - rootRect.top + root.scrollTop - 8,
    });
    setPopover(null);
  }, [canAnnotate]);

  // ── Create annotation from current selection ─────────────────────────────────
  async function createAnnotation(color: ResearchAnnotation["color"], withNote: boolean) {
    const sel = pendingSelection.current;
    if (!sel || !onAdd) return;
    setToolbar(null);
    window.getSelection()?.removeAllRanges();

    const payload = {
      fileUrl, color, quote: sel.quote, prefix: sel.prefix, suffix: sel.suffix,
      occurrence: sel.occurrence, note: "",
    };
    const created = await onAdd(payload);
    if (created) {
      setItems(prev => [...prev, created]);
      if (withNote) {
        // open note editor on the new highlight
        setTimeout(() => {
          const root = containerRef.current;
          const mark = root?.querySelector(`mark[data-aid="${created.id}"]`) as HTMLElement | null;
          if (mark && root) {
            const mr = mark.getBoundingClientRect();
            const rr = root.getBoundingClientRect();
            setNoteDraft("");
            setPopover({ aid: created.id, x: mr.left - rr.left + root.scrollLeft, y: mr.bottom - rr.top + root.scrollTop + 4 });
          }
        }, 50);
      }
    }
    pendingSelection.current = null;
  }

  // ── Click a highlight → open its popover ─────────────────────────────────────
  function handleContainerClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const mark = target.closest("mark[data-aid]") as HTMLElement | null;
    if (!mark) { setPopover(null); return; }
    const aid = mark.dataset.aid!;
    const ann = items.find(a => a.id === aid);
    if (!ann) return;
    const root = containerRef.current!;
    const mr = mark.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    setNoteDraft(ann.note ?? "");
    setToolbar(null);
    setPopover({ aid, x: mr.left - rr.left + root.scrollLeft, y: mr.bottom - rr.top + root.scrollTop + 4 });
  }

  async function saveNote(aid: string) {
    if (!onUpdate) return;
    await onUpdate(aid, { note: noteDraft });
    setItems(prev => prev.map(a => a.id === aid ? { ...a, note: noteDraft } : a));
    setPopover(null);
  }
  async function changeColor(aid: string, color: ResearchAnnotation["color"]) {
    if (!onUpdate) return;
    await onUpdate(aid, { color });
    setItems(prev => prev.map(a => a.id === aid ? { ...a, color } : a));
  }
  async function removeAnnotation(aid: string) {
    if (!onDelete) return;
    await onDelete(aid);
    setItems(prev => prev.filter(a => a.id !== aid));
    setPopover(null);
  }

  function scrollToAnnotation(aid: string) {
    const root = containerRef.current;
    const mark = root?.querySelector(`mark[data-aid="${aid}"]`) as HTMLElement | null;
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      mark.animate(
        [{ outline: "2px solid #6366f1" }, { outline: "2px solid transparent" }],
        { duration: 1200 },
      );
    }
  }

  const fileItems = items.filter(a => a.fileUrl === fileUrl);
  const activeAnn = popover ? items.find(a => a.id === popover.aid) : null;
  const canEditActive = !!activeAnn && (canManageAll || activeAnn.authorId === currentUserId);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0">
      {/* ── Viewer ── */}
      <div className="relative flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-100">
        {state === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-slate-400">Đang tải bản xem trước...</p>
          </div>
        )}
        {state === "not_found" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-slate-900 z-10">
            <FileText className="w-12 h-12 text-slate-300" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 text-center">File đề cương không tồn tại trên máy chủ</p>
            <p className="text-[11px] text-slate-400 text-center max-w-xs">File đã bị xóa hoặc đường dẫn không hợp lệ. Yêu cầu tác giả nộp lại file.</p>
          </div>
        )}
        {(state === "error" || state === "unsupported") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-white dark:bg-slate-900 z-10">
            <FileText className="w-12 h-12 text-slate-300" />
            <p className="text-sm text-slate-500 text-center">
              {state === "unsupported" ? "Định dạng .doc không xem trước trực tiếp được." : "Không thể hiển thị bản xem trước."}
            </p>
            {errorDetail && <p className="text-[11px] text-red-400 text-center max-w-xs break-words">{errorDetail}</p>}
            <a href={proxied} target="_blank" rel="noopener noreferrer" download
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
              <Download className="w-4 h-4" /> Tải xuống để xem
            </a>
          </div>
        )}

        {/* Annotatable viewer — docx (HTML) or pdf (canvas + text layer) */}
        <div className="relative flex-1 overflow-auto" onClick={handleContainerClick}>
            <div
              ref={containerRef}
              onMouseUp={handleMouseUp}
              className={cn("select-text", isPdf ? "py-4" : "p-4")}
              style={{ visibility: state === "done" ? "visible" : "hidden" }}
            />

            {/* Floating selection toolbar */}
            {toolbar && canAnnotate && (
              <div
                className="absolute z-30 -translate-x-1/2 -translate-y-full flex items-center gap-1 px-1.5 py-1 rounded-lg bg-slate-900 shadow-lg"
                style={{ left: toolbar.x, top: toolbar.y }}
                onClick={e => e.stopPropagation()}
              >
                {COLOR_LIST.map(c => (
                  <button key={c} type="button" title={`Bôi màu`}
                    onClick={() => createAnnotation(c, false)}
                    className="w-5 h-5 rounded-full border border-white/30 hover:scale-110 transition"
                    style={{ backgroundColor: COLOR_HEX[c] }}
                  />
                ))}
                <div className="w-px h-4 bg-white/20 mx-0.5" />
                <button type="button" title="Bôi vàng + ghi chú"
                  onClick={() => createAnnotation("yellow", true)}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-white hover:bg-white/15 rounded transition">
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Ghi chú
                </button>
              </div>
            )}

            {/* Note popover */}
            {popover && activeAnn && (
              <div
                className="absolute z-30 w-64 rounded-xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"
                style={{ left: Math.max(4, popover.x), top: popover.y }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide truncate">{activeAnn.authorName}</span>
                  <button onClick={() => setPopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-[11px] italic text-slate-500 line-clamp-2 border-l-2 pl-2" style={{ borderColor: COLOR_HEX[activeAnn.color] }}>
                  “{activeAnn.quote}”
                </p>
                {canEditActive ? (
                  <>
                    <textarea
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="Nhập ghi chú..."
                      className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                    <div className="flex items-center gap-1">
                      {COLOR_LIST.map(c => (
                        <button key={c} type="button" onClick={() => changeColor(activeAnn.id, c)}
                          className={cn("w-4 h-4 rounded-full border transition", activeAnn.color === c ? "ring-2 ring-offset-1 ring-slate-400 border-white" : "border-slate-300")}
                          style={{ backgroundColor: COLOR_HEX[c] }}
                        />
                      ))}
                      <div className="flex-1" />
                      <button onClick={() => removeAnnotation(activeAnn.id)} title="Xóa"
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => saveNote(activeAnn.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-medium rounded-lg transition">
                        <Check className="w-3 h-3" /> Lưu
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line">{activeAnn.note || <span className="italic text-slate-400">Không có ghi chú</span>}</p>
                )}
              </div>
            )}
          </div>
      </div>

      {/* ── Notes panel (collapsible) ── */}
      {!showNotes ? (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          title="Hiện ghi chú"
          className="shrink-0 w-9 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col items-center gap-2 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <PanelRightOpen className="w-4 h-4 text-slate-400" />
          <span className="text-[10px] font-semibold text-slate-500 [writing-mode:vertical-rl] rotate-180">Ghi chú ({fileItems.length})</span>
        </button>
      ) : (
      <div className="w-60 shrink-0 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
          <StickyNote className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Ghi chú ({fileItems.length})</span>
          <button type="button" onClick={() => setShowNotes(false)} title="Ẩn ghi chú"
            className="ml-auto p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition">
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {fileItems.length === 0 && (
            <p className="text-[11px] text-slate-400 italic p-2 leading-relaxed">
              {canAnnotate ? "Bôi đen đoạn văn bản trong file để highlight hoặc thêm ghi chú." : "Chưa có ghi chú nào."}
            </p>
          )}
          {fileItems.map(a => (
            <button
              key={a.id}
              onClick={() => scrollToAnnotation(a.id)}
              className="w-full text-left rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-violet-300 p-2 transition"
            >
              <div className="flex items-start gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: COLOR_HEX[a.color] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-2">“{a.quote}”</p>
                  {a.note && <p className="text-[11px] text-slate-700 dark:text-slate-200 mt-1 line-clamp-3 whitespace-pre-line">{a.note}</p>}
                  <p className="text-[9px] text-slate-400 mt-1">{a.authorName}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
