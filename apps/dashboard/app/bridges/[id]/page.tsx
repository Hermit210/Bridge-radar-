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
      <div className="space-y-8">
        <div className="text-center text-muted">Loading bridge data...</div>
      </div>
    );
  }

  const score = detail.health?.score;
  const band = score !== undefined ? bandOf(score) : "yellow";
  const c = detail.health?.components;
  const defilama = detail.defilama;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link href="/bridges" className="text-xs text-muted hover:text-text">
          ← All bridges
        </Link>
        <div className="mt-2 flex items-baseline gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            {detail.display_name}
          </h1>
          <span className="text-xs text-muted">{detail.id}</span>
          {detail.homepage ? (
            <a
              href={detail.homepage}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted hover:text-text"
            >
              homepage ↗
            </a>
          ) : null}
        </div>
      </div>

      {/* Health Score & Components */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-xs uppercase tracking-wide text-muted">Health Score</p>
          <p className={`mt-2 text-5xl font-semibold ${bandClass[band]}`}>
            {score ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {detail.health?.computed_at
              ? `as of ${new Date(detail.health.computed_at).toLocaleString()}`
              : "no score yet — start the scorer"}
          </p>
        </div>
        <div className="md:col-span-2 rounded-xl border border-border bg-surface p-6">
          <p className="text-xs uppercase tracking-wide text-muted">Components</p>
          <ul className="mt-3 space-y-2 text-sm">
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
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold">Bridge Context</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Total Value Locked</p>
              <p className="mt-1 text-2xl font-semibold text-text">{defilama.tvlFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">24h Volume</p>
              <p className="mt-1 text-2xl font-semibold text-text">{defilama.volumeFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Supported Chains</p>
              <p className="mt-1 text-sm text-text">
                {defilama.chains.map((c) => c.toUpperCase()).join(", ")}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Anomaly Detection Insight */}
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-sm font-semibold">Status</h2>
        <div className="flex items-center gap-2">
          {score !== undefined && score >= 80 ? (
            <>
              <span className="text-green">✓</span>
              <span className="text-sm text-text">No anomalies detected</span>
            </>
          ) : score !== undefined && score >= 50 ? (
            <>
              <span className="text-yellow">⚠</span>
              <span className="text-sm text-text">Monitor for potential issues</span>
            </>
          ) : (
            <>
              <span className="text-red">✕</span>
              <span className="text-sm text-text">Anomalies detected - review components</span>
            </>
          )}
        </div>
      </section>

      {/* Score History Chart */}
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold">Score history (last 24h)</h2>
        <ScoreChart history={history} />
      </section>

      {/* Recent Events */}
      <section className="rounded-xl border border-border bg-surface">
        <header className="border-b border-border px-6 py-3">
          <h2 className="text-sm font-semibold">Recent events</h2>
        </header>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2">Time</th>
                <th className="py-2">Bridge</th>
                <th className="py-2">Type</th>
                <th className="py-2">Chain</th>
                <th className="py-2">Asset</th>
                <th className="py-2">USD</th>
                <th className="py-2">Tx</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-sm text-muted">
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
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-3">
        <span className="h-1.5 w-32 overflow-hidden rounded bg-border">
          <span
            className="block h-full bg-red"
            style={{ width: `${Math.min(100, v * 100)}%` }}
          />
        </span>
        <span className="w-10 text-right tabular-nums">{v.toFixed(2)}</span>
        <span className="w-12 text-right text-xs text-muted">−{weight}</span>
      </span>
    </li>
  );
}
