"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BridgeEvent } from "@radar/shared";
import { EventRow } from "./event-row";
import { listEvents } from "@/lib/api";

const KIND_OPTIONS: { value: BridgeEvent["type"]; label: string }[] = [
  { value: "lock", label: "Lock" },
  { value: "mint", label: "Mint" },
  { value: "burn", label: "Burn" },
  { value: "unlock", label: "Unlock" },
  { value: "signer_change", label: "Signer change" },
  { value: "frontend_change", label: "Frontend change" },
  { value: "oracle_stale", label: "Oracle stale" },
];

interface Props {
  initial: BridgeEvent[];
  bridgeOptions: { id: string; displayName: string }[];
}

const selectClass =
  "rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/30 focus:border-accent/40 focus:outline-none";

export function LiveFeed({ initial, bridgeOptions }: Props) {
  const [events, setEvents] = useState<BridgeEvent[]>(initial);
  const [connected, setConnected] = useState(true);
  const [bridgeFilter, setBridgeFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set(initial.map((e) => e.id)));
  const isFirstRun = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents(markNew: boolean) {
      try {
        const { events: newEvents } = await listEvents({
          limit: 50,
          bridge: bridgeFilter || undefined,
          type: (typeFilter || undefined) as BridgeEvent["type"] | undefined,
        });
        if (cancelled) return;
        const freshlyArrived = markNew
          ? new Set(newEvents.filter((e) => !seenIds.current.has(e.id)).map((e) => e.id))
          : new Set<string>();
        seenIds.current = new Set(newEvents.map((e) => e.id));
        setEvents(newEvents);
        setConnected(true);
        if (freshlyArrived.size > 0) {
          setNewIds(freshlyArrived);
          setTimeout(() => {
            if (!cancelled) setNewIds(new Set());
          }, 1200);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    // `initial` (server-fetched) already covers the very first render — only
    // force an immediate refetch when the filters actually changed, so
    // switching filters doesn't wait for the next 5s poll tick.
    if (isFirstRun.current) {
      isFirstRun.current = false;
    } else {
      fetchEvents(false);
    }

    const interval = setInterval(() => fetchEvents(true), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bridgeFilter, typeFilter]);

  /** Real breakdown of the events currently on screen, by kind — computed
   * from the same data already fetched, never a separate estimate. */
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return counts;
  }, [events]);

  return (
    <section className="glass-card-elevated overflow-hidden">
      <header className="space-y-3 border-b border-border/40 px-6 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text">Live event feed</h2>
          <span className="inline-flex items-center gap-2 text-xs">
            {connected ? (
              <>
                <span className="status-dot status-dot-green"></span>
                <span className="text-green font-medium">Live</span>
              </>
            ) : (
              <>
                <span className="status-dot status-dot-muted"></span>
                <span className="text-muted">Reconnecting...</span>
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bridgeFilter}
            onChange={(e) => setBridgeFilter(e.target.value)}
            className={selectClass}
            aria-label="Filter by bridge"
          >
            <option value="">All bridges</option>
            {bridgeOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={selectClass}
            aria-label="Filter by event type"
          >
            <option value="">All types</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {(bridgeFilter || typeFilter) && (
            <button
              type="button"
              onClick={() => {
                setBridgeFilter("");
                setTypeFilter("");
              }}
              className="text-xs text-muted-dark underline transition-colors hover:text-text"
            >
              Clear filters
            </button>
          )}

          {kindCounts.size > 0 && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-dark">
              {[...kindCounts.entries()].map(([kind, count]) => (
                <span key={kind} className="rounded bg-surface-2 px-1.5 py-0.5">
                  {kind}: {count}
                </span>
              ))}
            </span>
          )}
        </div>
      </header>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-left premium-table">
          <thead className="text-xs uppercase tracking-widest text-muted-dark font-medium">
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
                <td colSpan={7} className="px-6 py-14 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full border border-border" />
                      <div className="absolute inset-2 rounded-full border border-border/60" />
                      <div className="absolute inset-0 rounded-full" style={{
                        background: "conic-gradient(from 0deg, transparent 0deg, rgba(212,165,116,0.14) 60deg, transparent 120deg)",
                        animation: "spin 4s linear infinite",
                      }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent/30" />
                      </div>
                    </div>
                    <p className="text-muted text-sm">
                      {bridgeFilter || typeFilter
                        ? "No events match these filters yet."
                        : "Waiting for events. Make sure the indexer is running."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <EventRow key={e.id} event={e} isNew={newIds.has(e.id)} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
