"use client";

import { useCountUp } from "@/lib/use-count-up";

export interface StatBarSegment {
  key: string;
  label: string;
  value: string | number;
  dotClass?: string;
  tone?: "green" | "yellow" | "red" | "neutral";
  active?: boolean;
  onClick?: () => void;
}

const toneText = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  neutral: "text-text",
} as const;

/** Renders a segment's value; numbers count up/down toward real updates
 * (e.g. a filter total changing after a poll) instead of just snapping —
 * strings (formatted USD, "no data", "live"/"none", …) render as-is. */
function SegmentValue({ value }: { value: string | number }) {
  const isNumber = typeof value === "number";
  const animated = useCountUp(isNumber ? value : 0);
  return <>{isNumber ? animated : value}</>;
}

/** Bordered, divided instrument-panel readout — the same visual language
 * as the homepage's live status strip. Purely presentational; segments can
 * optionally be clickable (used as filter toggles on /bridges) or purely
 * a static display (bridge detail stat row, etc). */
export function StatBar({ segments }: { segments: StatBarSegment[] }) {
  return (
    <div className="flex overflow-x-auto divide-x divide-border-subtle rounded-2xl border border-border-subtle bg-surface-0/70 backdrop-blur-sm">
      {segments.map((s) => {
        const className = `group relative min-w-[110px] flex-1 px-5 py-4 text-center transition-all duration-200 sm:px-6 ${
          s.onClick ? "cursor-pointer hover:-translate-y-[1px] hover:bg-surface-2/60" : ""
        } ${s.active ? "bg-surface-2/80" : ""} ${
          s.active
            ? "after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:rounded-full after:bg-accent after:content-['']"
            : ""
        }`;
        const content = (
          <>
            <div
              className={`flex items-center justify-center gap-1.5 font-mono text-xl font-semibold tabular-nums transition-colors sm:text-2xl ${
                toneText[s.tone ?? "neutral"]
              }`}
            >
              {s.dotClass ? <span className={`status-dot ${s.dotClass}`}></span> : null}
              <SegmentValue value={s.value} />
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
              {s.label}
            </div>
          </>
        );
        return s.onClick ? (
          <button key={s.key} type="button" onClick={s.onClick} className={className}>
            {content}
          </button>
        ) : (
          <div key={s.key} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
