"use client";

import { useEffect, useRef, useState } from "react";

interface HeartbeatDotProps {
  /** ISO timestamp of the most recent real event for this bridge, if any. */
  lastEventAt?: string;
  /** How many real events for this bridge landed in the recent window the
   * caller defines (see RECENT_WINDOW_MS in bridges/page.tsx) — used only
   * to pick a faster pulse for genuinely busier bridges, never randomized. */
  recentCount: number;
  /** Whether a real adapter is watching this bridge at all. Unmonitored
   * bridges get a static dot — pulsing would imply activity we don't
   * actually observe. */
  monitored: boolean;
}

// Pulse cadence tiers driven entirely by real event recency/frequency.
const FAST_MS = 700;
const MEDIUM_MS = 1400;
const SLOW_MS = 3000;
const CALM_MS = 4600;

function pulseDurationMs(ageMs: number | null, recentCount: number): number {
  if (ageMs === null) return CALM_MS;
  if (ageMs <= 15_000 && recentCount >= 3) return FAST_MS;
  if (ageMs <= 60_000) return MEDIUM_MS;
  if (ageMs <= 10 * 60_000) return SLOW_MS;
  return CALM_MS;
}

/**
 * Small live-activity indicator for a bridge card. Pulse speed and the
 * brief "flash" on a new event are both derived from real event timestamps
 * polled from our own API (see bridges/page.tsx) — there is no timer-driven
 * fake animation cycle here independent of that data.
 */
export function HeartbeatDot({ lastEventAt, recentCount, monitored }: HeartbeatDotProps) {
  const [flash, setFlash] = useState(false);
  const prevRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = lastEventAt;
    // Only flash when a *later* poll observes a newer event than the last
    // poll did — skip the initial mount (prev === undefined) so loading the
    // page doesn't itself look like a burst of fake activity.
    if (lastEventAt && prev !== undefined && lastEventAt !== prev) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 650);
      return () => clearTimeout(t);
    }
  }, [lastEventAt]);

  if (!monitored) {
    return (
      <span
        className="heartbeat-dot heartbeat-dot-static"
        title="Not monitored — no adapter watching this bridge"
        aria-hidden
      />
    );
  }

  const ageMs = lastEventAt ? Date.now() - new Date(lastEventAt).getTime() : null;
  const duration = pulseDurationMs(ageMs, recentCount);
  const title =
    ageMs === null
      ? "No recent events observed"
      : `Last event ${Math.round(ageMs / 1000)}s ago`;

  return (
    <span
      className={`heartbeat-dot${flash ? " heartbeat-dot-flash" : ""}`}
      style={{ animationDuration: `${duration}ms` }}
      title={title}
      aria-hidden
    />
  );
}
