"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BridgeEvent } from "@radar/shared";
import { listEvents } from "@/lib/api";
import { kindBg } from "./event-row";

const POLL_MS = 5000;
const LIMIT = 5;

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Last 5 real events, same /v1/events data every other page on the site
 * reads — no separate "homepage feed" source. Each row links to that
 * bridge's own page; the whole homepage previously had zero real event
 * data despite the entire product being about real-time events. */
export function RecentActivityStrip() {
  const [events, setEvents] = useState<BridgeEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      listEvents({ limit: LIMIT })
        .then((r) => {
          if (!cancelled) setEvents(r.events);
        })
        .catch(() => {
          /* honest no-op — strip just stays on its last real data / loading state */
        });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-dark">
          Recent activity
        </span>
        <Link href="/events" className="text-xs text-accent transition-colors hover:text-accent-bright">
          View all →
        </Link>
      </div>
      <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-0/70 backdrop-blur-sm">
        {events === null ? (
          <div className="px-5 py-6 text-center text-sm text-muted">Loading real events…</div>
        ) : events.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted">No events yet.</div>
        ) : (
          events.map((e) => (
            <Link
              key={e.id}
              href={`/bridges/${e.bridge_id}`}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-surface-2/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] ${
                    kindBg[e.type] ?? "bg-surface-2 text-muted"
                  }`}
                >
                  {e.type}
                </span>
                <span className="truncate font-medium text-text-secondary">{e.bridge_id}</span>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-dark">{timeAgo(e.event_time)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
