"use client";

import { useEffect, useState } from "react";
import { bandFor } from "@radar/shared";
import { listBridges, listEvents } from "@/lib/api";
import { useCountUp } from "@/lib/use-count-up";

const ONE_HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const POLL_MS = 5000;

interface Snapshot {
  monitored: number;
  healthy: number;
  eventsLastHour: number;
  eventsCapped: boolean;
  avgScore: number | null;
  updatedAt: number;
}

/** One consistent read of the same live endpoints the rest of the app
 * polls (/v1/bridges, /v1/events) — no separate "homepage stats" source,
 * so this strip can never drift from what /bridges itself shows. */
async function takeSnapshot(): Promise<Snapshot | null> {
  const [bridgesRes, eventsRes] = await Promise.all([
    listBridges().catch(() => null),
    listEvents({ since: ONE_HOUR_AGO(), limit: 1000 }).catch(() => null),
  ]);
  if (!bridgesRes) return null;

  const monitored = bridgesRes.bridges.filter((b) => b.enabled);
  const healthy = monitored.filter((b) => bandFor(b) === "green").length;
  const scored = monitored.filter((b) => b.health);
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, b) => sum + (b.health?.score ?? 0), 0) / scored.length)
    : null;
  const eventCount = eventsRes?.events.length ?? 0;

  return {
    monitored: monitored.length,
    healthy,
    eventsLastHour: eventCount,
    eventsCapped: eventCount >= 1000,
    avgScore,
    updatedAt: Date.now(),
  };
}

export function LiveStatusStrip() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [ageSec, setAgeSec] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      takeSnapshot().then((s) => {
        if (!cancelled && s) setSnap(s);
      });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!snap) return;
    setAgeSec(0);
    const tick = setInterval(() => setAgeSec(Math.round((Date.now() - snap.updatedAt) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [snap?.updatedAt]);

  // Hooks run unconditionally (real value or 0) so the count-up still works
  // once `snap` arrives; the "—" placeholder is what actually renders until then.
  const monitored = useCountUp(snap?.monitored ?? 0);
  const healthy = useCountUp(snap?.healthy ?? 0);
  const eventsLastHour = useCountUp(snap?.eventsLastHour ?? 0);
  const avgScore = useCountUp(snap?.avgScore ?? 0);

  const segments: { label: string; value: string; tone?: "green"; barClass: string }[] = [
    { label: "Monitored", value: snap ? String(monitored) : "—", barClass: "bg-accent/50" },
    {
      label: "Healthy",
      value: snap ? `${healthy}/${monitored}` : "—",
      tone: "green",
      barClass: "bg-green/60",
    },
    {
      label: "Events (1h)",
      value: snap ? `${eventsLastHour}${snap.eventsCapped ? "+" : ""}` : "—",
      barClass: "bg-yellow/50",
    },
    {
      label: "Avg score",
      value: snap && snap.avgScore !== null ? String(avgScore) : "—",
      barClass: "bg-accent-bright/50",
    },
  ];

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-center gap-1.5 rounded-full border border-border-subtle bg-surface-0/60 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-dark mx-auto w-fit">
        <span className="status-dot status-dot-green"></span>
        {snap ? `Live · updated ${ageSec}s ago` : "Connecting…"}
      </div>
      <div className="flex overflow-x-auto divide-x divide-border-subtle rounded-3xl border border-border-subtle bg-surface-0/70 shadow-card backdrop-blur-sm">
        {segments.map((s) => (
          <div
            key={s.label}
            className="group relative min-w-[128px] flex-1 px-6 py-6 text-center transition-colors hover:bg-surface-2/40 sm:px-8"
          >
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-[2px] rounded-t-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${s.barClass}`}
            />
            <div
              className={`font-mono text-3xl font-semibold tabular-nums transition-colors duration-300 sm:text-4xl ${
                s.tone === "green" ? "text-green" : "text-text"
              }`}
            >
              {s.value}
            </div>
            <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
