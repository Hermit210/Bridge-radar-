"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScoreChart } from "./score-chart";
import { EventRow } from "@/components/event-row";
import { bandOf, type BridgeWithHealth, type BridgeEvent, type HealthScore } from "@radar/shared";
import { getBridge, getBridgeHistory, listEvents } from "@/lib/api";

const bandClass = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
} as const;

const bandStroke = {
  green: "#2dd4bf",
  yellow: "#facc15",
  red: "#fb7185",
} as const;

const bandGlow = {
  green: "shadow-glow-green",
  yellow: "shadow-glow-yellow",
  red: "shadow-glow-red",
} as const;

const bandDot = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
} as const;

export default function BridgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string>("");
  const [detail, setDetail] = useState<BridgeWithHealth | null>(null);
  const [history, setHistory] = useState<HealthScore[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
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
        const [bridgeData, historyData, eventsData] = await Promise.all([
          getBridge(id).catch(() => null),
          getBridgeHistory(id, since).catch(() => ({ bridge_id: id, since, history: [] })),
          listEvents({ bridge: id, limit: 50 }).catch(() => ({ events: [] })),
        ]);

        if (!cancelled) {
          setDetail(bridgeData);
          setHistory(historyData.history);
          setEvents(eventsData.events);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching bridge data:", error);
        setLoading(false);
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
          <div className="skeleton h-8 w-64"></div>
          <div className="skeleton h-4 w-32"></div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="glass-card p-6 space-y-4">
            <div className="skeleton h-4 w-24"></div>
            <div className="skeleton h-16 w-20 mx-auto"></div>
            <div className="skeleton h-3 w-40 mx-auto"></div>
          </div>
          <div className="md:col-span-2 glass-card p-6 space-y-3">
            <div className="skeleton h-4 w-24"></div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="skeleton h-3 w-28"></div>
                <div className="skeleton h-2 w-32 rounded-full"></div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card p-6 space-y-4">
          <div className="skeleton h-4 w-48"></div>
          <div className="skeleton h-48 w-full"></div>
        </div>
      </div>
    );
  }

  const score = detail.health?.score;
  const band = score !== undefined ? bandOf(score) : "yellow";
  const c = detail.health?.components;
  const defilama = detail.defilama;
  const circumference = 2 * Math.PI * 52;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="pb-6 border-b border-border-subtle">
        <Link href="/bridges" className="text-xs text-muted hover:text-accent transition-colors inline-flex items-center gap-1">
          ← All bridges
        </Link>
        <div className="mt-3 flex items-baseline gap-4">
          <h1 className="text-3xl font-bold tracking-tight">
            {detail.display_name}
          </h1>
          <span className="text-xs text-muted-dark font-mono">{detail.id}</span>
          {detail.homepage ? (
            <a
              href={detail.homepage}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted hover:text-accent transition-colors"
            >
              homepage ↗
            </a>
          ) : null}
        </div>
      </div>

      {/* Health Score & Components */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className={`glass-card-elevated p-8 flex flex-col items-center justify-center text-center ${bandGlow[band]}`}>
          <p className="text-xs uppercase tracking-widest text-muted font-semibold mb-4">Health Score</p>
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className="score-ring-track" strokeWidth="6" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="score-ring-fill"
                strokeWidth="6"
                stroke={bandStroke[band]}
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${circumference * (1 - (score ?? 0) / 100)}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-bold font-mono tabular-nums ${bandClass[band]}`}>
                {score ?? "—"}
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">
            {detail.health?.computed_at
              ? `as of ${new Date(detail.health.computed_at).toLocaleString()}`
              : "no score yet — start the scorer"}
          </p>
        </div>
        <div className="md:col-span-2 glass-card p-6">
          <p className="text-xs uppercase tracking-widest text-muted font-semibold">Components</p>
          <ul className="mt-4 space-y-3 text-sm">
            <Component label="Parity break" value={c?.parity_severity} weight={40} />
            <Component label="Outflow anomaly" value={c?.outflow_severity} weight={25} />
            <Component label="Signer change" value={c?.signer_recency} weight={15} />
            <Component label="Frontend drift" value={c?.frontend_recency} weight={10} />
            <Component label="Oracle staleness" value={c?.oracle_staleness} weight={10} />
          </ul>
        </div>
      </section>

      {/* Bridge Context - DeFiLlama Data */}
      {defilama && (
        <section className="glass-card p-6">
          <h2 className="mb-1 text-sm font-semibold">Bridge Context</h2>
          <div className="h-0.5 w-8 rounded-full bg-accent/50 mb-5" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Total Value Locked</p>
              <p className="mt-1 text-2xl font-bold font-mono text-text tabular-nums">{defilama.tvlFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">24h Volume</p>
              <p className="mt-1 text-2xl font-bold font-mono text-text tabular-nums">{defilama.volumeFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Supported Chains</p>
              <p className="mt-1 text-sm font-mono text-text-secondary">
                {defilama.chains.map((c) => c.toUpperCase()).join(", ")}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Status */}
      <section className={`glass-card p-6 ${
        score !== undefined && score >= 80
          ? "border-green/10"
          : score !== undefined && score >= 50
          ? "border-yellow/10"
          : "border-red/10"
      }`}>
        <h2 className="mb-3 text-sm font-semibold">Status</h2>
        <div className="flex items-center gap-2.5">
          {score !== undefined && score >= 80 ? (
            <>
              <span className="status-dot status-dot-green"></span>
              <span className="text-sm text-text-secondary">No anomalies detected</span>
            </>
          ) : score !== undefined && score >= 50 ? (
            <>
              <span className="status-dot status-dot-yellow"></span>
              <span className="text-sm text-text-secondary">Monitor for potential issues</span>
            </>
          ) : (
            <>
              <span className="status-dot status-dot-red"></span>
              <span className="text-sm text-text-secondary">Anomalies detected - review components</span>
            </>
          )}
        </div>
      </section>

      {/* Score History Chart */}
      <section className="glass-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Score history (last 24h)</h2>
        <ScoreChart history={history} />
      </section>

      {/* Recent Events */}
      <section className="glass-card overflow-hidden">
        <header className="border-b border-border-subtle px-6 py-4">
          <h2 className="text-sm font-semibold">Recent events</h2>
        </header>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left premium-table">
            <thead className="text-xs uppercase tracking-widest text-muted-dark font-medium">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-2 py-3">Bridge</th>
                <th className="px-2 py-3">Type</th>
                <th className="px-2 py-3">Chain</th>
                <th className="px-2 py-3">Asset</th>
                <th className="px-2 py-3">USD</th>
                <th className="px-2 py-3">Tx</th>
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
        <span className="h-2 w-36 overflow-hidden rounded-full bg-surface-2">
          <span
            className={`block h-full health-bar-fill ${barColor}`}
            style={{ width: `${Math.min(100, v * 100)}%` }}
          />
        </span>
        <span className="w-10 text-right font-mono tabular-nums font-medium">{v.toFixed(2)}</span>
        <span className="w-12 text-right font-mono text-xs text-muted-dark tabular-nums">−{weight}</span>
      </span>
    </li>
  );
}
