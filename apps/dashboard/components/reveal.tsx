"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Lightweight scroll-triggered fade/slide-in — a single IntersectionObserver
 * per instance, no animation library. Fires once (disconnects after the
 * first intersection) and respects prefers-reduced-motion by skipping the
 * hidden state entirely rather than leaving content stuck invisible. */
export function Reveal({
  children,
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    // threshold is a fraction of the TARGET's own height, not the
    // viewport's -- for content taller than roughly viewport-height / 0.15
    // (e.g. a long API reference section), that fraction can never be
    // reached even with the viewport fully filled by the element, so it
    // would never reveal. threshold: 0 fires on any intersection at all,
    // independent of the target's height; rootMargin still keeps it from
    // firing the instant a single pixel peeks in from the very bottom edge.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
