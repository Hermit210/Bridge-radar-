"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { HealthCard, type HeartbeatInfo } from "@/components/health-card";
import { HeartbeatDot } from "@/components/heartbeat-dot";
import { StatBar, type StatBarSegment } from "@/components/stat-bar";
import { FinalityStatusPanel } from "@/components/finality-status-panel";
import { listBridges, listEvents } from "@/lib/api";
import { bandFor, formatUsd, type BridgeWithHealth, type BridgeEvent, type HealthBand } from "@radar/shared";

// Window for "recent" activity used only to pick a faster heartbeat pulse
// for busier bridges — not a data-freshness cutoff for anything else.
const RECENT_WINDOW_MS = 60_000;

// Default card-grid ordering: surfaces alert/watch bridges before healthy
// ones, since that's what a security-monitoring dashboard's default view
// should prioritize. Lower rank sorts first.
const bandRank: Record<HealthBand, number> = { red: 0, yellow: 1, green: 2, unmonitored: 3 };

/** Per-bridge last-event-time + recent-activity count, derived entirely
 * from the same polled event feed the live feed table already renders —
 * no separate fetch, no synthetic data. */
function buildHeartbeats(events: BridgeEvent[]): Record<string, HeartbeatInfo> {
  const now = Date.now();
  const map: Record<string, HeartbeatInfo> = {};
  for (const e of events) {
    const t = new Date(e.event_time).getTime();
    if (Number.isNaN(t)) continue;
    const existing = map[e.bridge_id];
    if (!existing || t > new Date(existing.lastEventAt ?? 0).getTime()) {
      map[e.bridge_id] = { lastEventAt: e.event_time, recentCount: existing?.recentCount ?? 0 };
    }
    if (now - t <= RECENT_WINDOW_MS) {
      map[e.bridge_id].recentCount = (map[e.bridge_id]?.recentCount ?? 0) + 1;
    }
  }
  return map;
}

export default function Home() {
  const [bridges, setBridges] = useState<BridgeWithHealth[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [bandFilter, setBandFilter] = useState<HealthBand | "all">("all");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [gridRef] = useAutoAnimate<HTMLDivElement>({ duration: 250 });

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

  const bands = bridges.map(bandFor);
  const totals = {
    green: bands.filter((b) => b === "green").length,
    yellow: bands.filter((b) => b === "yellow").length,
    red: bands.filter((b) => b === "red").length,
    unknown: bands.filter((b) => b === "unmonitored").length,
  };

  const heartbeats = useMemo(() => buildHeartbeats(events), [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = bridges.filter((b) => {
      if (bandFilter !== "all" && bandFor(b) !== bandFilter) return false;
      if (!q) return true;
      return b.display_name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
    });
    // Default ordering: most actionable first (alert, then watch, then
    // healthy, then not-monitored), alphabetical within each band so the
    // order stays stable and predictable rather than following raw API order.
    return matches.sort((a, b) => {
      const rank = bandRank[bandFor(a)] - bandRank[bandFor(b)];
      return rank !== 0 ? rank : a.display_name.localeCompare(b.display_name);
    });
  }, [bridges, bandFilter, query]);

  function toggleFilter(band: HealthBand) {
    setBandFilter((f) => (f === band ? "all" : band));
  }

  const segments: StatBarSegment[] = [
    { key: "all", label: "All", value: bridges.length, active: bandFilter === "all", onClick: () => setBandFilter("all") },
    {
      key: "green",
      label: "Healthy",
      value: totals.green,
      tone: "green",
      dotClass: "status-dot-green",
      active: bandFilter === "green",
      onClick: () => toggleFilter("green"),
    },
    {
      key: "yellow",
      label: "Watch",
      value: totals.yellow,
      tone: "yellow",
      dotClass: "status-dot-yellow",
      active: bandFilter === "yellow",
      onClick: () => toggleFilter("yellow"),
    },
    {
      key: "red",
      label: "Alert",
      value: totals.red,
      tone: "red",
      dotClass: "status-dot-red",
      active: bandFilter === "red",
      onClick: () => toggleFilter("red"),
    },
  ];
  if (totals.unknown > 0) {
    segments.push({
      key: "unmonitored",
      label: "Not monitored",
      value: totals.unknown,
      dotClass: "status-dot-muted",
      active: bandFilter === "unmonitored",
      onClick: () => toggleFilter("unmonitored"),
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Bridges</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bridges/compare" className="badge text-xs transition-colors hover:text-text">
            Compare bridges ⇄
          </Link>
        </div>
      </div>

      <StatBar segments={segments} />

      <FinalityStatusPanel compact />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bridges…"
          className="w-full max-w-xs rounded-md border border-border/60 bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted-dark focus:border-accent/50 focus:outline-none"
        />
        <div className="ml-auto inline-flex rounded-md border border-border/60 bg-surface-2 p-0.5 text-xs">
          <ViewButton active={view === "cards"} onClick={() => setView("cards")}>
            Cards
          </ViewButton>
          <ViewButton active={view === "list"} onClick={() => setView("list")}>
            List
          </ViewButton>
        </div>
      </div>

      {loading && bridges.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card space-y-3 p-3.5">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <div className="skeleton h-4 w-28"></div>
                  <div className="skeleton h-2.5 w-16"></div>
                </div>
                <div className="skeleton h-6 w-10"></div>
              </div>
              <div className="skeleton h-1.5 w-full rounded-full"></div>
              <div className="flex justify-between">
                <div className="skeleton h-2.5 w-14"></div>
                <div className="skeleton h-2.5 w-20"></div>
              </div>
            </div>
          ))}
        </div>
      ) : bridges.length === 0 ? (
        <div className="glass-card-elevated p-10 text-center">
          <p className="text-sm text-muted">
            API unreachable. Start it with{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">make dev-api</code>.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">No bridges match “{query}”.</p>
        </div>
      ) : view === "cards" ? (
        <div ref={gridRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((b, i) => (
            <div
              key={b.id}
              className="h-full opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]"
              style={{ animationDelay: `${Math.min(i, 11) * 40}ms` }}
            >
              <HealthCard bridge={b} heartbeat={heartbeats[b.id]} />
            </div>
          ))}
        </div>
      ) : (
        <BridgeTable bridges={filtered} heartbeats={heartbeats} />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-surface-4 text-text" : "text-muted hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

const bandColor = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  unmonitored: "text-muted-dark",
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

const bandBarClass = {
  green: "health-bar-green",
  yellow: "health-bar-yellow",
  red: "health-bar-red",
  unmonitored: "health-bar-muted",
} as const;

type SortKey = "score" | "tvl";
type SortDir = "desc" | "asc";

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  return (
    <th className="px-2 py-2.5">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-text-secondary ${
          active ? "text-text-secondary" : ""
        }`}
      >
        {label}
        <span className={`font-mono text-[9px] ${active ? "text-accent" : "text-muted-dark/50"}`}>
          {active ? (dir === "desc" ? "▼" : "▲") : "▼"}
        </span>
      </button>
    </th>
  );
}

function BridgeTable({
  bridges,
  heartbeats,
}: {
  bridges: BridgeWithHealth[];
  heartbeats: Record<string, HeartbeatInfo>;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tbodyRef] = useAutoAnimate<HTMLTableSectionElement>({ duration: 250 });

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortKey(null);
    }
  }

  const rows = useMemo(() => {
    if (!sortKey) return bridges;
    const withValue = bridges.map((b) => {
      const band = bandFor(b);
      const value =
        sortKey === "score"
          ? (band === "unmonitored" ? undefined : b.health?.score) ?? -1
          : b.defillama?.tvl_usd ?? -1;
      return { b, value };
    });
    withValue.sort((x, y) => (sortDir === "desc" ? y.value - x.value : x.value - y.value));
    return withValue.map((w) => w.b);
  }, [bridges, sortKey, sortDir]);

  return (
    <section className="glass-card-elevated overflow-hidden">
      <div className="max-h-[36rem] overflow-auto">
        <table className="premium-table w-full text-left">
          <thead className="text-xs font-medium uppercase tracking-widest text-muted-dark">
            <tr>
              <th className="px-5 py-2.5">Bridge</th>
              <th className="px-2 py-2.5">Status</th>
              <SortHeader label="Score" sortKey="score" active={sortKey === "score"} dir={sortDir} onClick={toggleSort} />
              <th className="px-2 py-2.5">Activity</th>
              <SortHeader label="TVL" sortKey="tvl" active={sortKey === "tvl"} dir={sortDir} onClick={toggleSort} />
              <th className="px-2 py-2.5">Adapter</th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {rows.map((b) => {
              const band = bandFor(b);
              const score = band === "unmonitored" ? undefined : b.health?.score;
              const hb = heartbeats[b.id];
              return (
                <tr
                  key={b.id}
                  onClick={() => router.push(`/bridges/${b.id}`)}
                  className="cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-text">{b.display_name}</div>
                    <div className="font-mono text-[11px] text-muted-dark">{b.id}</div>
                  </td>
                  <td className="px-2 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`status-dot ${bandDot[band]}`}></span>
                      <span className={bandColor[band]}>{bandLabel[band]}</span>
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-semibold tabular-nums ${bandColor[band]}`}>
                        {score ?? "—"}
                      </span>
                      <div className="health-bar w-12">
                        <div className={`health-bar-fill ${bandBarClass[band]}`} style={{ width: `${score ?? 0}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <HeartbeatDot
                      lastEventAt={hb?.lastEventAt}
                      recentCount={hb?.recentCount ?? 0}
                      monitored={b.enabled}
                    />
                  </td>
                  <td className="px-2 py-3 font-mono text-xs text-text-secondary">
                    {b.defillama ? formatUsd(b.defillama.tvl_usd) : <span className="text-muted-dark">—</span>}
                  </td>
                  <td className="px-2 py-3 text-xs">
                    {b.enabled ? (
                      <span className="text-green">live-monitored</span>
                    ) : (
                      <span className="text-muted-dark">not monitored</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
