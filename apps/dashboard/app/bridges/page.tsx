"use client";

import { useEffect, useMemo, useState } from "react";
import { HealthCard, type HeartbeatInfo } from "@/components/health-card";
import { LiveFeed } from "@/components/live-feed";
import { apiUrls, listBridges, listEvents } from "@/lib/api";
import { bandFor, type BridgeWithHealth, type BridgeEvent } from "@radar/shared";

// Window for "recent" activity used only to pick a faster heartbeat pulse
// for busier bridges — not a data-freshness cutoff for anything else.
const RECENT_WINDOW_MS = 60_000;

/** Per-bridge last-event-time + recent-activity count, derived entirely
 * from the same polled event feed the live feed table already renders —
 * no separate fetch, no synthetic data. */
function buildHeartbeats(events: BridgeEvent[]): Record<string, HeartbeatInfo> {
  const now = Date.now();
  const map: Record<string, HeartbeatInfo> = {};
  for (const e of events) {
    const t = new Date(e.event_time).getTime();
    if (Number.isNaN(t)) continue;
    const existing = map[e.bridge_id];
    if (!existing || t > new Date(existing.lastEventAt ?? 0).getTime()) {
      map[e.bridge_id] = { lastEventAt: e.event_time, recentCount: existing?.recentCount ?? 0 };
    }
    if (now - t <= RECENT_WINDOW_MS) {
      map[e.bridge_id].recentCount = (map[e.bridge_id]?.recentCount ?? 0) + 1;
    }
  }
  return map;
}

export default function Home() {
  const [bridges, setBridges] = useState<BridgeWithHealth[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [bridgesResult, eventsResult] = await Promise.all([
          listBridges().catch(() => ({ bridges: [] })),
          listEvents({ limit: 50 }).catch(() => ({ events: [] })),
        ]);

        if (!cancelled) {
          setBridges(bridgesResult.bridges);
          setEvents(eventsResult.events);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const bands = bridges.map(bandFor);
  const totals = {
    green: bands.filter((b) => b === "green").length,
    yellow: bands.filter((b) => b === "yellow").length,
    red: bands.filter((b) => b === "red").length,
    unknown: bands.filter((b) => b === "unmonitored").length,
  };

  const heartbeats = useMemo(() => buildHeartbeats(events), [events]);

  return (
    <div className="space-y-10 animate-fade-in">
      <section>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bridges</h1>
            <p className="mt-1.5 text-sm text-text-secondary max-w-2xl leading-relaxed">
              Real-time bridge-health intelligence layer for Solana. Health
              Score composes parity, outflow z-score, signer-set drift,
              frontend hash, and oracle staleness; greater is healthier.
            </p>
          </div>
          <a
            href={`${apiUrls.base}/v1/bridges`}
            target="_blank"
            rel="noreferrer"
            className="badge hover:text-text transition-colors text-xs"
          >
            JSON ↗
          </a>
        </div>
        <div className="mb-5 flex flex-wrap gap-2 text-xs">
          <Pill dotClass="status-dot-green" label="Healthy" count={totals.green} />
          <Pill dotClass="status-dot-yellow" label="Watch" count={totals.yellow} />
          <Pill dotClass="status-dot-red" label="Alert" count={totals.red} />
          {totals.unknown > 0 ? (
            <Pill dotClass="status-dot-muted" label="Not monitored" count={totals.unknown} />
          ) : null}
        </div>

        {loading && bridges.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-5 space-y-4">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="skeleton h-5 w-32"></div>
                    <div className="skeleton h-3 w-20"></div>
                  </div>
                  <div className="skeleton h-8 w-12"></div>
                </div>
                <div className="skeleton h-1.5 w-full rounded-full"></div>
                <div className="flex justify-between">
                  <div className="skeleton h-3 w-16"></div>
                  <div className="skeleton h-3 w-24"></div>
                </div>
              </div>
            ))}
          </div>
        ) : bridges.length === 0 ? (
          <div className="glass-card-elevated p-10 text-center">
            <p className="text-sm text-muted">
              API unreachable. Start it with{" "}
              <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">make dev-api</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
            {bridges.map((b) => (
              <HealthCard key={b.id} bridge={b} heartbeat={heartbeats[b.id]} />
            ))}
          </div>
        )}
      </section>

      <LiveFeed initial={events} />
    </div>
  );
}

function Pill({
  dotClass,
  label,
  count,
}: {
  dotClass: string;
  label: string;
  count: number;
}) {
  return (
    <span className="badge">
      <span className={`status-dot ${dotClass}`}></span>
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold tabular-nums text-text">{count}</span>
    </span>
  );
}
