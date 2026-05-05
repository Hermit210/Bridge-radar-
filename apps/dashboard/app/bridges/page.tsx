"use client";

import { useEffect, useState } from "react";
import { HealthCard } from "@/components/health-card";
import { LiveFeed } from "@/components/live-feed";
import { apiUrls, listBridges, listEvents } from "@/lib/api";
import type { BridgeWithHealth, BridgeEvent } from "@radar/shared";

export default function Home() {
  const [bridges, setBridges] = useState<BridgeWithHealth[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);

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
        }
      } catch (error) {
        // Handle error silently, keep existing data
      }
    };

    // Initial fetch
    fetchData();

    // Set up polling
    const interval = setInterval(fetchData, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const totals = {
    green: bridges.filter((b) => (b.health?.score ?? 0) >= 80).length,
    yellow: bridges.filter(
      (b) => (b.health?.score ?? 0) >= 50 && (b.health?.score ?? 0) < 80,
    ).length,
    red: bridges.filter((b) => b.health && b.health.score < 50).length,
    unknown: bridges.filter((b) => !b.health).length,
  };

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bridges</h1>
            <p className="mt-1 text-sm text-muted">
              Real-time bridge-health intelligence layer for Solana. Health
              Score composes parity, outflow z-score, signer-set drift,
              frontend hash, and oracle staleness; greater is healthier.
            </p>
          </div>
          <a
            href={`${apiUrls.base}/v1/bridges`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted hover:text-text"
          >
            JSON ↗
          </a>
        </div>
        <div className="mb-6 flex flex-wrap gap-3 text-xs">
          <Pill className="text-green" label="Healthy" count={totals.green} />
          <Pill className="text-yellow" label="Watch" count={totals.yellow} />
          <Pill className="text-red" label="Alert" count={totals.red} />
          {totals.unknown > 0 ? (
            <Pill className="text-muted" label="No score yet" count={totals.unknown} />
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bridges.length === 0 ? (
            <div className="col-span-full rounded-xl border border-border bg-surface p-6 text-sm text-muted">
              API unreachable. Start it with{" "}
              <code className="text-text">make dev-api</code>.
            </div>
          ) : (
            bridges.map((b) => <HealthCard key={b.id} bridge={b} />)
          )}
        </div>
      </section>

      <LiveFeed initial={events} />
    </div>
  );
}

function Pill({
  className,
  label,
  count,
}: {
  className: string;
  label: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1">
      <span className={`text-base ${className}`}>●</span>
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}