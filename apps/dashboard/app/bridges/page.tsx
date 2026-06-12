"use client";

import { useEffect, useState } from "react";
import { HealthCard } from "@/components/health-card";
import { LiveFeed } from "@/components/live-feed";
import { apiUrls, listBridges, listEvents } from "@/lib/api";
import type { BridgeWithHealth, BridgeEvent } from "@radar/shared";

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

  const totals = {
    green: bridges.filter((b) => (b.health?.score ?? 0) >= 80).length,
    yellow: bridges.filter(
      (b) => (b.health?.score ?? 0) >= 50 && (b.health?.score ?? 0) < 80,
    ).length,
    red: bridges.filter((b) => b.health && b.health.score < 50).length,
    unknown: bridges.filter((b) => !b.health).length,
  };

  return (
    <div className="space-y-10 animate-fade-in">
      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bridges</h1>
            <p className="mt-2 text-sm text-text-secondary max-w-2xl leading-relaxed">
              Real-time bridge-health intelligence layer for Solana. Health
              Score composes parity, outflow z-score, signer-set drift,
              frontend hash, and oracle staleness; greater is healthier.
            </p>
          </div>
          <a
            href={`${apiUrls.base}/v1/bridges`}
            target="_blank"
            rel="noreferrer"
            className="glass-card inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-accent transition-colors"
          >
            JSON ↗
          </a>
        </div>
        <div className="mb-6 flex flex-wrap gap-3 text-xs">
          <Pill dotClass="status-dot-green" label="Healthy" count={totals.green} />
          <Pill dotClass="status-dot-yellow" label="Watch" count={totals.yellow} />
          <Pill dotClass="status-dot-red" label="Alert" count={totals.red} />
          {totals.unknown > 0 ? (
            <Pill dotClass="status-dot-muted" label="No score yet" count={totals.unknown} />
          ) : null}
        </div>

        {loading && bridges.length === 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-5 space-y-4">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="skeleton h-5 w-32"></div>
                    <div className="skeleton h-3 w-20"></div>
                  </div>
                  <div className="skeleton h-10 w-14 rounded-lg"></div>
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
          <div className="glass-card-elevated col-span-full p-10 text-center space-y-3">
            <p className="text-sm text-muted">
              API unreachable. Start it with{" "}
              <code className="font-mono bg-surface-2 px-2 py-0.5 rounded text-accent text-sm">make dev-api</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
            {bridges.map((b) => <HealthCard key={b.id} bridge={b} />)}
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
    <span className="glass-card inline-flex items-center gap-2.5 px-4 py-1.5 transition-all duration-200 hover:border-accent/20">
      <span className={`status-dot ${dotClass}`}></span>
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{count}</span>
    </span>
  );
}
