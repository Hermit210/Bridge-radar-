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
        <h2 className="text-sm font-semibold gradient-text-vivid">Live event feed</h2>
        <span className="inline-flex items-center gap-2 text-xs">
          {connected ? (
            <span className="badge" style={{ background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.2)" }}>
              <span className="status-dot status-dot-green" style={{ width: 8, height: 8, animation: "pulse-dot 2s ease-in-out infinite" }}></span>
              <span className="text-green font-medium">Live</span>
            </span>
          ) : (
            <>
              <span className="status-dot status-dot-muted"></span>
              <span className="text-muted">Reconnecting...</span>
            </>
          )}
        </span>
      </header>
      <div className="max-h-[32rem] overflow-auto">
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
                <td colSpan={7} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-4">
                    {/* Radar sweep CSS illustration */}
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border border-accent/20" />
                      <div className="absolute inset-2 rounded-full border border-accent/15" />
                      <div className="absolute inset-4 rounded-full border border-accent/10" />
                      <div className="absolute inset-0 rounded-full" style={{
                        background: "conic-gradient(from 0deg, transparent 0deg, rgba(110,168,255,0.15) 60deg, transparent 120deg)",
                        animation: "spin 3s linear infinite",
                      }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-accent/40" />
                      </div>
                    </div>
                    <p className="text-muted text-sm">Waiting for events. Make sure the indexer is running.</p>
                  </div>
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
