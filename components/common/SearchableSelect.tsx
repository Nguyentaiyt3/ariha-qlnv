"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  id: string;
  label: string;
  sub?: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyText?: string;
  /** Height of the dropdown list (default: max-h-48) */
  listHeight?: string;
  /** Use smaller padding/text for compact contexts like table rows */
  compact?: boolean;
}

export function SearchableSelect({
  value, onChange, options,
  placeholder = "Chọn...",
  className, disabled,
  emptyText = "Không tìm thấy",
  listHeight = "max-h-48",
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sub?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-2 border rounded-xl text-left transition",
          "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
          "focus:outline-none",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2.5 text-sm",
          open
            ? "ring-2 ring-blue-400 border-blue-300 dark:border-blue-600"
            : "hover:border-slate-300 dark:hover:border-slate-600",
        )}
      >
        <span className={cn("flex-1 truncate", !selected && "text-slate-400 dark:text-slate-500")}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleSelect(""); }}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown
          className={cn("w-4 h-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm kiếm..."
                className="flex-1 bg-transparent text-sm outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400"
              />
            </div>
          </div>

          <div className={cn("overflow-y-auto", listHeight)}>
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">{emptyText}</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  className={cn(
                    "w-full flex items-start gap-2 px-3 py-2 text-left transition",
                    opt.id === value
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50",
                  )}
                >
                  <span className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "block text-sm truncate",
                        opt.id === value
                          ? "text-blue-700 dark:text-blue-300 font-medium"
                          : "text-slate-700 dark:text-slate-200",
                      )}
                    >
                      {opt.label}
                    </span>
                    {opt.sub && (
                      <span className="block text-xs text-slate-400 truncate">{opt.sub}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
