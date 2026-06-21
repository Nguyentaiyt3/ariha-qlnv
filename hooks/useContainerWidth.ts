"use client";

import { useRef, useState, useEffect } from "react";

/**
 * Tracks the pixel width of a container element via ResizeObserver.
 * Returns a ref to attach + reactive width + named breakpoints.
 *
 * Breakpoints are widget-local (not viewport), so they work regardless
 * of how many grid columns the widget spans.
 */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(999); // start wide to avoid layout flash

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return {
    ref,
    width,
    /** ≥ 360 px */
    xs: width >= 360,
    /** ≥ 480 px */
    sm: width >= 480,
    /** ≥ 600 px */
    md: width >= 600,
    /** ≥ 760 px */
    lg: width >= 760,
  };
}
