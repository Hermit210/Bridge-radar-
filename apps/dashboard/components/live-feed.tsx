"use client";

import { useEffect, useState } from "react";
import type { BridgeEvent } from "@radar/shared";
import { EventRow } from "./event-row";
import { listEvents } from "@/lib/api";

interface Props {
  initial: BridgeEvent[];
  wsUrl?: string;
}

export function LiveFeed({ initial }: Props) {
  const [events, setEvents] = useState<BridgeEvent[]>(initial);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchEvents = async () => {
      try {
        const { events: newEvents } = await listEvents({ limit: 50 });
        if (!cancelled) {
          setEvents(newEvents);
          setConnected(true);
        }
      } catch (error) {
        if (!cancelled) {
          setConnected(false);
        }
      }
    };

    const interval = setInterval(fetchEvents, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <section className="glass-card-elevated overflow-hidden">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
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
      </header>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-left premium-table">
          <thead className="text-xs uppercase tracking-widest text-muted-dark font-medium">
            <tr>
              <th className="px-5 py-3">Time</th>
              <th className="px-2 py-3">Bridge</th>
              <th className="px-2 py-3">Type</th>
              <th className="px-2 py-3">Chain</th>
              <th className="px-2 py-3">Asset</th>
              <th className="px-2 py-3">USD</th>
              <th className="px-2 py-3">Tx</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-muted text-sm">
                  Waiting for events. Make sure the indexer is running.
                </td>
              </tr>
            ) : (
              events.map((e) => <EventRow key={e.id} event={e} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
