"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { FinalityStatusPanel } from "@/components/finality-status-panel";
import { getFinalityHistory, type FinalityObservation } from "@/lib/api";
import { FinalityChart } from "./finality-chart";

const POLL_MS = 10_000;
const WINDOWS = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
] as const;

const linkClass =
  "text-accent hover:text-accent-bright transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent";

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export default function NetworkPage() {
  const [windowMs, setWindowMs] = useState<number>(WINDOWS[0].ms);
  const [observations, setObservations] = useState<FinalityObservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getFinalityHistory({ since: new Date(Date.now() - windowMs).toISOString(), limit: 2000 })
        .then((h) => {
          if (!cancelled) {
            setObservations(h.history);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [windowMs]);

  const anomalies = observations.filter((o) => o.isAnomalous).slice().reverse();
  const baselineMs = medianOf(observations.map((o) => o.elapsedMs));

  return (
    <div className="mx-auto max-w-4xl space-y-14 animate-fade-in">
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
          Network — Finality Watch
        </h1>
        <p className="text-[15px] leading-[1.75] text-text-secondary">
          Real, observed Solana confirmed→finalized latency, tracked continuously during the ongoing
          TowerBFT → Alpenglow consensus transition. Every number on this page is real data from this
          indexer's own RPC polling — never simulated or assumed.
        </p>
      </div>

      <Reveal>
        <FinalityStatusPanel />
      </Reveal>

      <Reveal>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
              Real-time chart
            </h2>
            <div className="flex gap-1.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.label}
                  onClick={() => setWindowMs(w.ms)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    windowMs === w.ms
                      ? "bg-accent text-bg"
                      : "border border-border-subtle text-muted-dark hover:text-text"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="glass-card p-8 text-center text-sm text-muted">Loading real observations…</div>
          ) : (
            <FinalityChart observations={observations} baselineMs={baselineMs} />
          )}
          <p className="text-xs text-muted-dark">
            {observations.length} real observation(s) in the selected window. Red dots mark observations
            flagged anomalous (≥3x that observation's own real trailing-hour baseline at the time it was
            recorded) — real source:{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">
              GET /v1/network/finality/history
            </code>
            .
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
              Anomaly events
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Real observations in the selected window whose elapsed time exceeded the real baseline that
              existed when they were recorded, by 3x or more.
            </p>
          </div>
          {anomalies.length === 0 ? (
            <div className="glass-card p-6 text-center text-sm text-muted">
              None in the selected window — real finality behavior has stayed within {"<"}3x of its own
              trailing baseline the whole time.
            </div>
          ) : (
            <div className="space-y-2">
              {anomalies.map((a) => (
                <div
                  key={a.slot}
                  className="glass-card-interactive flex items-center justify-between gap-3 p-4 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-accent">slot {a.slot}</span>
                    <span className="ml-2 text-muted-dark">{new Date(a.finalizedAt).toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-semibold text-red">{a.elapsedMs.toLocaleString()}ms</span>
                    {a.baselineMsAtTime !== null && (
                      <span className="ml-2 text-xs text-muted-dark">
                        vs {Math.round(a.baselineMsAtTime).toLocaleString()}ms baseline
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-3 border-t border-border-subtle pt-10">
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
            Why this page exists
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            Solana is mid-transition from its current consensus (<span className="text-text">TowerBFT</span> — a
            real, documented ~12.8s finality time) to a new consensus mechanism called{" "}
            <span className="text-text">Alpenglow</span>, built around a new voting protocol called{" "}
            <span className="text-text">Votor</span>, targeting ~150ms finality — roughly an 80-100x
            improvement. Per{" "}
            <Link className={linkClass} href="https://solana.com/upgrades/alpenglow">
              Solana's own official upgrade page
            </Link>
            , Alpenglow is not yet live on mainnet as of this writing — it's being tested on a community
            cluster, with mainnet activation targeted for Q3 2026, not yet confirmed.
          </p>
          <p className="text-sm leading-relaxed text-text-secondary">
            Any bridge with a hardcoded assumption about how long finality takes (e.g. "wait for N
            confirmations before minting on the destination chain") could see that assumption go stale
            once Alpenglow activates — either unnecessarily conservative, or, during a mixed-validator-set
            transition period, genuinely inconsistent. This page polls Solana's own documented{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">getSlot</code> RPC
            method at both <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">confirmed</code>{" "}
            and <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">finalized</code>{" "}
            commitment and records the real elapsed time between them — relative to a real observed
            baseline, never a hardcoded assumption about which consensus version is currently active.
          </p>
          <p className="text-xs leading-relaxed text-muted-dark">
            This is descriptive infrastructure context, not a claim that Bridge Radar detects or prevents
            any specific incident. Full API + SDK docs on{" "}
            <Link className={linkClass} href="/developers">
              /developers
            </Link>
            .
          </p>
        </section>
      </Reveal>
    </div>
  );
}
