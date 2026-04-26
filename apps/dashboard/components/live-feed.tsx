"use client";

import { useEffect, useState } from "react";
import type { BridgeEvent, WsMessage } from "@radar/shared";
import { EventRow } from "./event-row";

interface Props {
  initial: BridgeEvent[];
  wsUrl: string;
}

export function LiveFeed({ initial, wsUrl }: Props) {
  const [events, setEvents] = useState<BridgeEvent[]>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as WsMessage;
          if (msg.kind === "event") {
            setEvents((cur) => [msg.data, ...cur].slice(0, 50));
          }
        } catch {
          /* ignore */
        }
      };
    }
    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [wsUrl]);

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Live event feed</h2>
        <span className={`text-xs ${connected ? "text-green" : "text-muted"}`}>
          {connected ? "● live" : "○ disconnected"}
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
