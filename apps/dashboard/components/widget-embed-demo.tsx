"use client";

import { useEffect, useRef } from "react";

/** Injects the real widget.js script tags client-side after mount, rather
 * than rendering `<script>` directly in server-rendered JSX. The widget
 * mutates the DOM itself (inserts a badge `<span>` right after its own
 * script tag) the moment it executes, which raced Next's SSR hydration
 * when the tags were server-rendered — a real hydration-mismatch error,
 * not a hypothetical one. This also matches how the widget is actually
 * meant to be used: as a plain script tag on a plain page, not inside a
 * framework's server-rendered tree. */
export function WidgetEmbedDemo({ apiBase, bridgeIds }: { apiBase: string; bridgeIds: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scripts = bridgeIds.map((id) => {
      const script = document.createElement("script");
      script.src = `${apiBase}/widget.js`;
      script.setAttribute("data-bridge", id);
      container.appendChild(script);
      return script;
    });
    return () => {
      for (const s of scripts) s.remove();
    };
  }, [apiBase, bridgeIds]);

  return <div ref={containerRef} className="flex flex-wrap items-center gap-3" />;
}
