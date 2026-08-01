"use client";

/**
 * Honest, factual summary of which of our 14 monitored bridges this wallet
 * has real transaction history with, how many times each, and each
 * bridge's real-time current health score — nothing about the wallet
 * itself is scored or judged, only real usage counts next to real bridge
 * status from our existing GET /v1/bridges.
 */

import { useEffect, useState } from "react";
import { listBridges } from "@/lib/api";
import { bandFor, type BridgeWithHealth } from "@radar/shared";

const bandColor = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  unmonitored: "text-muted-dark",
} as const;

export function BridgeUsageSummary({ usageCounts }: { usageCounts: Record<string, number> }) {
  const [bridges, setBridges] = useState<BridgeWithHealth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBridges()
      .then((r) => {
        if (!cancelled) setBridges(r.bridges.filter((b) => b.enabled));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="glass-card-elevated p-6 text-center">
        <p className="text-sm text-muted">Couldn't load current bridge status. {error}</p>
      </section>
    );
  }
  if (!bridges) {
    return <div className="skeleton h-64 w-full rounded-2xl" />;
  }

  const rows = [...bridges].sort((a, b) => {
    const ca = usageCounts[a.id] ?? 0;
    const cb = usageCounts[b.id] ?? 0;
    if (ca !== cb) return cb - ca;
    return a.display_name.localeCompare(b.display_name);
  });
  const usedCount = rows.filter((b) => (usageCounts[b.id] ?? 0) > 0).length;

  return (
    <section className="glass-card-elevated space-y-4 p-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-text">Your bridge usage, across our 14 monitored bridges</h2>
        <p className="text-xs text-muted">
          {usedCount === 0
            ? "No real transaction history found for this wallet against any of our 14 monitored bridges, in the window scanned above."
            : `Real transaction history found with ${usedCount} of our 14 monitored bridges, in the window scanned above.`}
        </p>
      </div>
      <div className="divide-y divide-border/30">
        {rows.map((b) => {
          const count = usageCounts[b.id] ?? 0;
          const band = bandFor(b);
          return (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className={count > 0 ? "text-text" : "text-muted"}>{b.display_name}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-muted-dark">
                  {count > 0 ? `${count} transaction${count === 1 ? "" : "s"} found` : "no activity found"}
                </span>
                <span className={`font-mono text-xs font-medium ${bandColor[band]}`}>
                  {b.health ? `${b.health.score}` : "no score data"} ({band})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
