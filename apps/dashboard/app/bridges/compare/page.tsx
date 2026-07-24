"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bandFor, formatUsd, type BridgeWithHealth } from "@radar/shared";
import { listBridges, listEvents, listRegistry, type RegistryEntry } from "@/lib/api";

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
  const [copied, setCopied] = useState(false);

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

  // Keep the URL in sync so the "Share" link always reflects the current pick.
  useEffect(() => {
    if (!idA || !idB) return;
    const params = new URLSearchParams();
    params.set("a", idA);
    params.set("b", idB);
    window.history.replaceState(null, "", `/bridges/compare?${params.toString()}`);
  }, [idA, idB]);

  const bridgeA = bridges.find((b) => b.id === idA);
  const bridgeB = bridges.find((b) => b.id === idB);

  async function handleShare() {
    const url = `${window.location.origin}/bridges/compare?a=${idA}&b=${idB}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="skeleton h-7 w-64"></div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bridge Battle</h1>
            <p className="mt-1.5 text-sm text-text-secondary max-w-2xl leading-relaxed">
              Head-to-head comparison of two bridges, all fields sourced live from the
              registry, scorer, and DeFiLlama cache. The health score reflects current
              detector state, not a permanent quality ranking.
            </p>
          </div>
          <button onClick={handleShare} className="badge hover:text-text transition-colors text-xs shrink-0">
            {copied ? "Copied ✓" : "Share ↗"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <BridgeSlot
          bridges={bridges}
          selected={idA}
          onSelect={setIdA}
          bridge={bridgeA}
          registryEntry={bridgeA ? registry[bridgeA.id] : undefined}
          opponent={bridgeB}
        />
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

  return (
    <div className={`glass-card-elevated p-6 space-y-5 ${isHigher ? "ring-1 ring-accent/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full bg-surface-2 border border-border/60 rounded-md px-3 py-2 text-sm text-text font-medium focus:outline-none focus:border-accent/50"
        >
          {bridges.map((b) => (
            <option key={b.id} value={b.id}>
              {b.display_name}
            </option>
          ))}
        </select>
      </div>

      {isHigher && (
        <div className="flex items-center gap-1.5 text-[11px] text-accent-bright">
          <span className="status-dot status-dot-green"></span>
          Currently higher health score
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted font-medium">Health Score</span>
        <span className={`text-2xl font-bold font-mono tabular-nums ${bandColor[band]}`}>{score ?? "—"}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`status-dot ${bandDot[band]}`}></span>
        <span className={bandColor[band]}>{bandLabel[band]}</span>
      </div>

      <Row label="24h events">
        {count24h === null ? "…" : `${count24h.count}${count24h.capped ? "+" : ""}`}
      </Row>

      <Row label="Protocol TVL">
        {bridge.defillama ? (
          <span className="font-mono">{formatUsd(bridge.defillama.tvl_usd)}</span>
        ) : (
          <span className="text-muted-dark">no TVL data</span>
        )}
      </Row>

      <Row label="Chains supported">
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
        className="block text-center text-xs text-muted hover:text-accent transition-colors pt-2 border-t border-border/40"
      >
        View full detail →
      </Link>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm border-t border-border/30 pt-3">
      <span className="text-muted">{label}</span>
      <span className="text-text-secondary font-medium">{children}</span>
    </div>
  );
}
