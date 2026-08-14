"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFinalityHealth, type FinalityHealth } from "@/lib/api";

const POLL_MS = 10_000;

// Real historical reference point, not a guess: TowerBFT's real finality
// characteristic is well-documented as ~12.8s (32 slots at Solana's ~400ms
// slot time). Used only to *describe* where a real observed baseline falls
// relative to that — never to assume which consensus version is active.
const LEGACY_TOWERBFT_MS = 12_800;
// Alpenglow's stated target is ~100-150ms finality (an 80-100x improvement)
// per Solana Foundation materials. A real observed baseline dropping below
// this order of magnitude is genuine, verifiable evidence of materially
// faster finality -- not proof it's specifically Alpenglow causing it.
const ALPENGLOW_RANGE_MS = 1_000;

type Status = "loading" | "no-data" | "degraded" | "fast" | "normal";

function statusOf(health: FinalityHealth | null): Status {
  if (!health) return "loading";
  if (!health.latest || health.rollingBaselineMs === null) return "no-data";
  if (health.isAnomalous) return "degraded";
  if (health.rollingBaselineMs < ALPENGLOW_RANGE_MS) return "fast";
  return "normal";
}

const STATUS_META: Record<Status, { label: string; dotClass: string; textClass: string }> = {
  loading: { label: "Connecting…", dotClass: "status-dot-muted", textClass: "text-muted-dark" },
  "no-data": { label: "Warming up — not enough real data yet", dotClass: "status-dot-muted", textClass: "text-muted-dark" },
  degraded: { label: "Degraded — real observed latency is anomalous", dotClass: "status-dot-red", textClass: "text-red" },
  fast: { label: "Transitioning — real baseline is in Alpenglow's target range", dotClass: "status-dot-green", textClass: "text-green" },
  normal: { label: "Normal — consistent with TowerBFT's known finality range", dotClass: "status-dot-green", textClass: "text-green" },
};

interface Props {
  compact?: boolean;
  /** Pass real health/errored data down when a parent page already polls
   * getFinalityHealth() itself (e.g. as part of its own shared poll) — this
   * skips the panel's own fetch entirely rather than duplicating the same
   * request from two independent timers. Omit both for standalone usage
   * (e.g. the homepage), where the panel keeps polling on its own. */
  health?: FinalityHealth | null;
  errored?: boolean;
}

export function FinalityStatusPanel({ compact = false, health: healthProp, errored: erroredProp }: Props) {
  const standalone = healthProp === undefined;
  const [healthState, setHealthState] = useState<FinalityHealth | null>(null);
  const [erroredState, setErroredState] = useState(false);

  useEffect(() => {
    if (!standalone) return;
    let cancelled = false;
    const poll = () => {
      getFinalityHealth()
        .then((h) => {
          if (!cancelled) {
            setHealthState(h);
            setErroredState(false);
          }
        })
        .catch(() => {
          if (!cancelled) setErroredState(true);
        });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [standalone]);

  const health = standalone ? healthState : (healthProp ?? null);
  const errored = standalone ? erroredState : (erroredProp ?? false);
  const status = statusOf(health);
  const meta = STATUS_META[status];

  return (
    <div
      className={`rounded-3xl border border-border-subtle bg-surface-0/70 shadow-card backdrop-blur-sm ${
        compact ? "p-4 sm:p-5" : "p-6 sm:p-8"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-dark">
            <span className={`status-dot ${meta.dotClass}`}></span>
            Network finality status
            {compact && (
              <Link href="/network" className="text-accent normal-case tracking-normal hover:text-accent-bright">
                — full history →
              </Link>
            )}
          </div>
          <p className={`mt-2 text-sm font-medium ${meta.textClass}`}>{meta.label}</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className={`font-mono font-semibold tabular-nums text-text ${compact ? "text-xl" : "text-2xl"}`}>
              {health?.latest ? `${health.latest.elapsedMs.toLocaleString()}ms` : "—"}
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              Latest observed
            </div>
          </div>
          <div>
            <div className={`font-mono font-semibold tabular-nums text-text ${compact ? "text-xl" : "text-2xl"}`}>
              {health?.rollingBaselineMs !== null && health?.rollingBaselineMs !== undefined
                ? `${Math.round(health.rollingBaselineMs).toLocaleString()}ms`
                : "—"}
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              1h rolling baseline
            </div>
          </div>
        </div>
      </div>
      {!compact && (
        <p className="mt-4 text-xs leading-relaxed text-muted-dark">
          Real, observed time between when this indexer's own RPC connection saw a Solana slot reach{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">confirmed</code> vs{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">finalized</code> commitment
          — not a canonical on-chain timestamp. Solana is mid-transition from TowerBFT consensus (~
          {(LEGACY_TOWERBFT_MS / 1000).toFixed(1)}s finality) to Alpenglow (~100-150ms target); this baseline is measured
          relative to real observed data, never a hardcoded assumption about which one is currently active.
          {health && health.anomalousBridgeEventsLastHour > 0
            ? ` ${health.anomalousBridgeEventsLastHour} real bridge event(s) in the last hour occurred during a window flagged anomalous.`
            : ""}
          {errored ? " (Currently unable to reach the API for a fresh reading — showing the last real value received.)" : ""}
          {" "}See <Link href="/network" className="text-accent hover:text-accent-bright">/network</Link> for the real-time chart and anomaly history.
        </p>
      )}
    </div>
  );
}
