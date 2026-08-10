"use client";

import { useEffect, useState } from "react";

export interface DocsSection {
  id: string;
  label: string;
}

/** Real docs-site sidebar nav: sticky, and the active link tracks whichever
 * section is actually scrolled into view via a real IntersectionObserver —
 * not just a static list of anchor links. Same "one observer, no animation
 * library" approach as Reveal. */
export function DocsSidebar({ sections }: { sections: DocsSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);

  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // IntersectionObserver callbacks only report entries whose state
    // *changed* since the last firing, not every currently-observed
    // element — so picking "whichever entry is in this batch" can pick a
    // section that just stopped intersecting while the real topmost
    // visible section (whose state didn't change this tick) is ignored.
    // Tracking every section's latest known state here and recomputing
    // the topmost-currently-intersecting one on every callback avoids
    // that — a real bug caught by actually scrolling the page in a
    // browser, not by inspection.
    const state = new Map<string, { top: number; intersecting: boolean }>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          state.set(entry.target.id, { top: entry.boundingClientRect.top, intersecting: entry.isIntersecting });
        }
        const visible = [...state.entries()].filter(([, v]) => v.intersecting);
        if (visible.length > 0) {
          visible.sort((a, b) => a[1].top - b[1].top);
          setActiveId(visible[0]![0]);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-24 space-y-1 text-sm">
      <p className="mb-3 text-[11px] font-display font-semibold uppercase tracking-[0.1em] text-muted">
        On this page
      </p>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`block border-l-2 py-1 pl-3 transition-colors ${
            activeId === s.id
              ? "border-accent text-text font-medium"
              : "border-border/40 text-muted-dark hover:border-border hover:text-text-secondary"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
