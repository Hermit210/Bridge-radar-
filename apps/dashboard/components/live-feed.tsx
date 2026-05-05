"use client";

import { useEffect, useState } from "react";
import type { BridgeEvent } from "@radar/shared";
import { EventRow } from "./event-row";
import { listEvents } from "@/lib/api";

interface Props {
  initial: BridgeEvent[];
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
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Live event feed</h2>
        <span className={`text-xs ${connected ? "text-green" : "text-muted"}`}>
          {connected ? "● live" : "○ reconnecting..."}
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2">Time</th>
              <th className="py-2">Bridge</th>
              <th className="py-2">Type</th>
              <th className="py-2">Chain</th>
              <th className="py-2">Asset</th>
              <th className="py-2">USD</th>
              <th className="py-2">Tx</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted text-sm">
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