"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bandFor, formatUsd, type BridgeWithHealth } from "@radar/shared";
import { listBridges, listEvents, listRegistry, type RegistryEntry } from "@/lib/api";
import { useCountUp } from "@/lib/use-count-up";

const bandColor = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  unmonitored: "text-muted-dark",
} as const;

const bandLabel = {
  green: "Healthy",
  yellow: "Watch",
  red: "Alert",
  unmonitored: "Not monitored",
} as const;

const bandDot = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
  unmonitored: "status-dot-muted",
} as const;

const SINCE_24H = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/** Real event count in the last 24h for one bridge, from /v1/events.
 * The API caps a single response at 1000 rows, so a count that hits the
 * cap is reported as "1000+" rather than implied to be an exact total. */
async function fetch24hCount(bridgeId: string): Promise<{ count: number; capped: boolean }> {
  const { events } = await listEvents({ bridge: bridgeId, since: SINCE_24H(), limit: 1000 }).catch(() => ({ events: [] }));
  return { count: events.length, capped: events.length >= 1000 };
}

export default function ComparePage() {
  const [bridges, setBridges] = useState<BridgeWithHealth[]>([]);
  const [registry, setRegistry] = useState<Record<string, RegistryEntry>>({});
  const [loading, setLoading] = useState(true);
  const [idA, setIdA] = useState<string>("");
  const [idB, setIdB] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [bridgesResult, registryResult] = await Promise.all([
        listBridges().catch(() => ({ bridges: [] })),
        listRegistry().catch(() => ({ summary: { total: 0, implemented: 0, planned: 0 }, implemented: [], planned: [] })),
      ]);
      if (cancelled) return;

      const byId: Record<string, RegistryEntry> = {};
      for (const r of [...registryResult.implemented, ...registryResult.planned]) byId[r.id] = r;

      setBridges(bridgesResult.bridges);
      setRegistry(byId);

      const params = new URLSearchParams(window.location.search);
      const a = params.get("a");
      const b = params.get("b");
      const ids = bridgesResult.bridges.map((x) => x.id);
      setIdA(a && ids.includes(a) ? a : (ids[0] ?? ""));
      setIdB(b && ids.includes(b) ? b : (ids[1] ?? ids[0] ?? ""));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the URL in sync so the current pick is bookmarkable/shareable directly
  // from the browser's address bar.
  useEffect(() => {
    if (!idA || !idB) return;
    const params = new URLSearchParams();
    params.set("a", idA);
    params.set("b", idB);
    window.history.replaceState(null, "", `/bridges/compare?${params.toString()}`);
  }, [idA, idB]);

  const bridgeA = bridges.find((b) => b.id === idA);
  const bridgeB = bridges.find((b) => b.id === idB);

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="skeleton h-7 w-64"></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="glass-card p-6 space-y-4">
            <div className="skeleton h-5 w-32"></div>
            <div className="skeleton h-24 w-full"></div>
          </div>
          <div className="glass-card p-6 space-y-4">
            <div className="skeleton h-5 w-32"></div>
            <div className="skeleton h-24 w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (bridges.length === 0) {
    return (
      <div className="glass-card-elevated p-10 text-center">
        <p className="text-sm text-muted">
          API unreachable. Start it with{" "}
          <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">make dev-api</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="pb-5 border-b border-border/40">
        <Link href="/bridges" className="text-xs text-muted hover:text-text transition-colors inline-flex items-center gap-1">
          ← All bridges
        </Link>
        <div className="mt-3">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Bridge Battle</h1>
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2">
        <BridgeSlot
          bridges={bridges}
          selected={idA}
          onSelect={setIdA}
          bridge={bridgeA}
          registryEntry={bridgeA ? registry[bridgeA.id] : undefined}
          opponent={bridgeB}
        />

        {/* Mobile: an inline divider since the two cards stack vertically
            and the absolutely-positioned circle below is desktop-only. */}
        <div className="flex items-center gap-3 md:hidden">
          <span className="h-px flex-1 bg-border/40" />
          <span className="font-display text-xs font-bold text-muted-dark">VS</span>
          <span className="h-px flex-1 bg-border/40" />
        </div>

        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-surface-3 font-display text-[11px] font-bold text-muted-dark shadow-glow-sm">
            VS
          </span>
        </div>
        <BridgeSlot
          bridges={bridges}
          selected={idB}
          onSelect={setIdB}
          bridge={bridgeB}
          registryEntry={bridgeB ? registry[bridgeB.id] : undefined}
          opponent={bridgeA}
        />
      </div>
    </div>
  );
}

function BridgeSlot({
  bridges,
  selected,
  onSelect,
  bridge,
  registryEntry,
  opponent,
}: {
  bridges: BridgeWithHealth[];
  selected: string;
  onSelect: (id: string) => void;
  bridge?: BridgeWithHealth;
  registryEntry?: RegistryEntry;
  opponent?: BridgeWithHealth;
}) {
  const [count24h, setCount24h] = useState<{ count: number; capped: boolean } | null>(null);
  const preHookBand = bridge ? bandFor(bridge) : "unmonitored";
  const animatedScore = useCountUp((preHookBand === "unmonitored" ? undefined : bridge?.health?.score) ?? 0);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    fetch24hCount(bridge.id).then((r) => {
      if (!cancelled) setCount24h(r);
    });
    const interval = setInterval(() => {
      fetch24hCount(bridge.id).then((r) => {
        if (!cancelled) setCount24h(r);
      });
    }, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bridge?.id]);

  if (!bridge) {
    return <div className="glass-card p-6 text-sm text-muted">No bridge selected.</div>;
  }

  const band = bandFor(bridge);
  const score = band === "unmonitored" ? undefined : bridge.health?.score;
  const oppBand = opponent ? bandFor(opponent) : "unmonitored";
  const oppScore = oppBand === "unmonitored" ? undefined : opponent?.health?.score;
  const isHigher = score !== undefined && oppScore !== undefined && score > oppScore;

  const tvl = bridge.defillama?.tvl_usd;
  const oppTvl = opponent?.defillama?.tvl_usd;
  const tvlHigher = tvl !== undefined && oppTvl !== undefined && tvl > oppTvl;

  return (
    <div className={`glass-card-elevated p-4 space-y-3.5 ${isHigher ? "ring-1 ring-green/40" : ""}`}>
      <div className="relative">
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none rounded-md border border-border/60 bg-surface-2 px-2.5 py-1.5 pr-8 text-sm font-medium text-text focus:border-accent/50 focus:outline-none"
        >
          {bridges.map((b) => (
            <option key={b.id} value={b.id}>
              {b.display_name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-dark">▾</span>
      </div>

      {isHigher && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className="status-dot status-dot-green"></span>
          Currently higher health score
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-muted font-medium">Health Score</span>
        <span className={`text-xl font-bold font-mono tabular-nums ${bandColor[band]}`}>
          {score !== undefined ? animatedScore : "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`status-dot ${bandDot[band]}`}></span>
        <span className={bandColor[band]}>{bandLabel[band]}</span>
      </div>

      <Row label="24h events">
        {count24h === null ? "…" : `${count24h.count}${count24h.capped ? "+" : ""}`}
      </Row>

      <Row label="Protocol TVL" winning={tvlHigher}>
        {bridge.defillama ? (
          <span className="font-mono">{formatUsd(bridge.defillama.tvl_usd)}</span>
        ) : (
          <span className="text-muted-dark">no TVL data</span>
        )}
      </Row>

      <Row label="Chains supported" stack>
        {registryEntry ? registryEntry.supportedChains.join(", ") : <span className="text-muted-dark">unknown</span>}
      </Row>

      <Row label="Adapter status">
        {bridge.enabled ? (
          <span className="text-green">live-monitored</span>
        ) : (
          <span className="text-muted-dark">not monitored</span>
        )}
      </Row>

      <Link
        href={`/bridges/${bridge.id}`}
        className="block text-center text-xs text-muted hover:text-accent transition-colors pt-1.5 border-t border-border/40"
      >
        View full detail →
      </Link>
    </div>
  );
}

function Row({
  label,
  winning,
  stack,
  children,
}: {
  label: string;
  winning?: boolean;
  /** Stack label above value on narrow screens instead of squeezing both
   * onto one row -- for values that can run long (e.g. a comma-separated
   * chain list), side-by-side leaves each side too little room to wrap. */
  stack?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex text-sm border-t border-border/30 pt-2.5 gap-2 ${
        stack ? "flex-col sm:flex-row sm:items-center sm:justify-between" : "items-center justify-between"
      }`}
    >
      <span className="text-muted">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 font-medium ${stack ? "sm:justify-end sm:text-right" : ""} ${
          winning ? "text-green" : "text-text-secondary"
        }`}
      >
        {winning && <span className="text-[10px]">▲</span>}
        {children}
      </span>
    </div>
  );
}
