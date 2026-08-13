"use client";

import Link from "next/link";
import { useMemo } from "react";
import { kindBg } from "./event-row";
import { useHomepageLiveData } from "./homepage-live-data";

const LIMIT = 5;

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Last 5 real events, derived from the shared HomepageLiveDataProvider
 * poll (same /v1/events data every other page on the site reads) — no
 * fetch of its own. Each row links to that bridge's own page.
 *
 * One real behavior change from when this had its own unbounded fetch:
 * the shared poll scopes events to the last 1h (see homepage-live-data.tsx),
 * so on a bridge with zero real activity in the last hour this would show
 * "no events" even if an older real event exists. Given real continuous
 * ingestion, that's the honest state to show, not a bug — an actually
 * quiet last hour is worth reflecting, not papering over with a stale event. */
export function RecentActivityStrip() {
  const { events } = useHomepageLiveData();
  const recent = useMemo(() => (events ?? []).slice(0, LIMIT), [events]);

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
        ) : recent.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted">No events in the last hour.</div>
        ) : (
          recent.map((e) => (
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
