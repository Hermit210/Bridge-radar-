"use client";

import { useEffect, useState } from "react";
import { bandFor } from "@radar/shared";
import { listBridges, listEvents } from "@/lib/api";

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

  const segments: { label: string; value: string; tone?: "green" }[] = [
    { label: "Monitored", value: snap ? String(snap.monitored) : "—" },
    {
      label: "Healthy",
      value: snap ? `${snap.healthy}/${snap.monitored}` : "—",
      tone: "green",
    },
    {
      label: "Events (1h)",
      value: snap ? `${snap.eventsLastHour}${snap.eventsCapped ? "+" : ""}` : "—",
    },
    {
      label: "Avg score",
      value: snap && snap.avgScore !== null ? String(snap.avgScore) : "—",
    },
  ];

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-dark">
        <span className="status-dot status-dot-green"></span>
        {snap ? `Live · updated ${ageSec}s ago` : "Connecting…"}
      </div>
      <div className="flex overflow-x-auto divide-x divide-border-subtle rounded-2xl border border-border-subtle bg-surface-0/70 backdrop-blur-sm">
        {segments.map((s) => (
          <div key={s.label} className="min-w-[124px] flex-1 px-5 py-5 text-center sm:px-6">
            <div
              className={`font-mono text-2xl font-semibold tabular-nums sm:text-3xl ${
                s.tone === "green" ? "text-green" : "text-text"
              }`}
            >
              {s.value}
            </div>
            <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
