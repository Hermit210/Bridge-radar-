"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScoreChart } from "./score-chart";
import { EventRow } from "@/components/event-row";
import { StatBar, type StatBarSegment } from "@/components/stat-bar";
import { bandFor, formatUsd, type BridgeWithHealth, type BridgeEvent, type HealthScore } from "@radar/shared";
import { getBridge, getBridgeHistory, listEvents, listRegistry, type RegistryEntry } from "@/lib/api";

const bandClass = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  unmonitored: "text-muted-dark",
} as const;

// Brighter chart-only variants of the semantic band colors — same hex the
// score ring has always used, kept separate from the muted badge/dot tones
// so the centerpiece chart reads clearly against the dark background.
const bandChartColor = {
  green: "#3ec99d",
  yellow: "#e5b94e",
  red: "#e5697b",
  unmonitored: "#5a6478",
} as const;

const bandDot = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
  unmonitored: "status-dot-muted",
} as const;

const bandLabel = {
  green: "Healthy",
  yellow: "Watch",
  red: "Alert",
  unmonitored: "Not monitored",
} as const;

const bandStatusMessage = {
  green: "No anomalies detected",
  yellow: "Monitor for potential issues",
  red: "Anomalies detected — review components",
  unmonitored: "No adapter is watching this bridge on Solana yet",
} as const;

const SINCE_24H = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

export default function BridgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string>("");
  const [detail, setDetail] = useState<BridgeWithHealth | null>(null);
  const [history, setHistory] = useState<HealthScore[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [registryEntry, setRegistryEntry] = useState<RegistryEntry | null>(null);
  const [count24h, setCount24h] = useState<{ count: number; capped: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [bridgeData, historyData, eventsData, registryData, count24hData] = await Promise.all([
          getBridge(id).catch(() => null),
          getBridgeHistory(id, since).catch(() => ({ bridge_id: id, since, history: [] })),
          listEvents({ bridge: id, limit: 50 }).catch(() => ({ events: [] })),
          listRegistry().catch(() => ({ summary: { total: 0, implemented: 0, planned: 0 }, implemented: [], planned: [] })),
          listEvents({ bridge: id, since: SINCE_24H(), limit: 1000 }).catch(() => ({ events: [] })),
        ]);

        if (!cancelled) {
          setDetail(bridgeData?.bridge ?? null);
          setHistory(historyData.history);
          setEvents(eventsData.events);
          setRegistryEntry(
            [...registryData.implemented, ...registryData.planned].find((r) => r.id === id) ?? null,
          );
          setCount24h({ count: count24hData.events.length, capped: count24hData.events.length >= 1000 });
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching bridge data:", error);
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  if (loading || !detail) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="skeleton h-4 w-24"></div>
        <div className="space-y-2">
          <div className="skeleton h-7 w-64"></div>
          <div className="skeleton h-4 w-32"></div>
        </div>
        <div className="glass-card-elevated space-y-4 p-6">
          <div className="skeleton h-4 w-48"></div>
          <div className="skeleton h-64 w-full"></div>
        </div>
        <div className="skeleton h-20 w-full rounded-2xl"></div>
      </div>
    );
  }

  const band = bandFor(detail);
  const score = band === "unmonitored" ? undefined : detail.health?.score;
  const c = band === "unmonitored" ? undefined : detail.health?.components;
  const defillama = detail.defillama;

  const statSegments: StatBarSegment[] = [
    {
      key: "tvl",
      label: "Protocol TVL",
      value: defillama ? formatUsd(defillama.tvl_usd) : "no data",
    },
    {
      key: "chains",
      label: "Chains",
      value: registryEntry ? registryEntry.supportedChains.length : "—",
    },
    {
      key: "events24h",
      label: "Events (24h)",
      value: count24h ? `${count24h.count}${count24h.capped ? "+" : ""}` : "…",
    },
    {
      key: "adapter",
      label: "Adapter",
      value: detail.enabled ? "live" : "none",
      tone: detail.enabled ? "green" : "neutral",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-3 border-b border-border/40 pb-5">
        <Link href="/bridges" className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-text">
          ← All bridges
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">{detail.display_name}</h1>
          <span className="font-mono text-xs text-muted-dark">{detail.id}</span>
          {detail.homepage ? (
            <a
              href={detail.homepage}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted transition-colors hover:text-accent"
            >
              homepage ↗
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`status-dot ${bandDot[band]}`}></span>
          <span className={`font-medium ${bandClass[band]}`}>{bandLabel[band]}</span>
          <span className="text-muted-dark">·</span>
          <span className="text-text-secondary">{bandStatusMessage[band]}</span>
          {detail.health?.computed_at ? (
            <span className="ml-auto font-mono text-[11px] text-muted-dark">
              as of {new Date(detail.health.computed_at).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </div>

      {/* Score history — the centerpiece */}
      <section className="glass-card-elevated p-6">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-text">Score history (last 24h)</h2>
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-3xl font-bold tabular-nums ${bandClass[band]}`}>{score ?? "—"}</span>
            <span className="text-xs text-muted-dark">/ 100</span>
          </div>
        </div>
        <ScoreChart history={history} color={bandChartColor[band]} height="h-72" />
      </section>

      {/* Stat row */}
      <StatBar segments={statSegments} />

      {/* Detector components */}
      <section className="glass-card p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">Detector components</p>
        {band === "unmonitored" ? (
          <p className="mt-4 text-sm text-muted">
            This bridge has no adapter watching a verified Solana program yet, so there
            is no real on-chain data to break down into components. Showing zeros here
            would look identical to a genuinely quiet, healthy bridge — so we show
            nothing instead.
          </p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            <Component label="Parity break" value={c?.parity_severity} weight={40} />
            <Component label="Outflow anomaly" value={c?.outflow_severity} weight={25} />
            <Component label="Signer change" value={c?.signer_recency} weight={15} />
            <Component label="Frontend drift" value={c?.frontend_recency} weight={10} />
            <Component label="Oracle staleness" value={c?.oracle_staleness} weight={10} />
          </ul>
        )}
      </section>

      {/* Event log */}
      <section className="glass-card-elevated overflow-hidden">
        <header className="border-b border-border/40 px-6 py-3.5">
          <h2 className="text-sm font-semibold text-text">Event log</h2>
        </header>
        <div className="max-h-[28rem] overflow-auto">
          <table className="premium-table w-full text-left">
            <thead className="text-xs font-medium uppercase tracking-widest text-muted-dark">
              <tr>
                <th className="px-5 py-2.5">Time</th>
                <th className="px-2 py-2.5">Bridge</th>
                <th className="px-2 py-2.5">Type</th>
                <th className="px-2 py-2.5">Chain</th>
                <th className="px-2 py-2.5">Asset</th>
                <th className="px-2 py-2.5">USD</th>
                <th className="px-2 py-2.5">Tx</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted">
                    No events yet.
                  </td>
                </tr>
              ) : (
                events.map((e) => <EventRow key={e.id} event={e} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Component({
  label,
  value,
  weight,
}: {
  label: string;
  value?: number;
  weight: number;
}) {
  const v = value ?? 0;
  const barColor =
    v < 0.3 ? "health-bar-green" : v < 0.7 ? "health-bar-yellow" : "health-bar-red";

  return (
    <li className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className="flex items-center gap-3">
        <span className="h-1.5 w-36 overflow-hidden rounded-full bg-surface-2">
          <span
            className={`block h-full health-bar-fill ${barColor}`}
            style={{ width: `${Math.min(100, v * 100)}%` }}
          />
        </span>
        <span className="w-10 text-right font-mono tabular-nums text-sm">{v.toFixed(2)}</span>
        <span className="w-12 text-right font-mono text-xs text-muted-dark tabular-nums">&minus;{weight}</span>
      </span>
    </li>
  );
}
