"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { BridgeEvent, BridgeWithHealth } from "@radar/shared";
import { listBridges, listEvents, listRegistry, type RegistryEntry } from "@/lib/api";

const POLL_MS = 10_000;
const SINCE_1H = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const EVENTS_LIMIT = 1000;

interface HomepageLiveData {
  bridges: BridgeWithHealth[] | null;
  registry: RegistryEntry[] | null;
  events: BridgeEvent[] | null;
  eventsCapped: boolean;
  updatedAt: number | null;
}

const EMPTY: HomepageLiveData = { bridges: null, registry: null, events: null, eventsCapped: false, updatedAt: null };

const HomepageLiveDataContext = createContext<HomepageLiveData>(EMPTY);

/** One real, shared poll for every homepage component that needs live
 * bridge/registry/event data. LiveStatusStrip, BridgeMarquee, BridgeGlobe,
 * and RecentActivityStrip each used to run their own independent
 * useEffect + setInterval, fetching largely the same data 7 times every
 * 5s -- 84 requests/min from a single idle tab. This runs the same 3 real
 * requests (listBridges + listRegistry + listEvents) once every 10s, and
 * every consumer reads from here instead of fetching its own copy.
 * radar-scorer only recomputes Health Scores every 60s server-side, so
 * moving from 5s to 10s loses zero real freshness.
 *
 * A failed individual call keeps the previous real value rather than
 * clearing it to null -- a transient event-fetch failure shouldn't blank
 * out bridge data that loaded fine, or vice versa. */
export function HomepageLiveDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<HomepageLiveData>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      Promise.all([
        listBridges().catch(() => null),
        listRegistry().catch(() => null),
        listEvents({ since: SINCE_1H(), limit: EVENTS_LIMIT }).catch(() => null),
      ]).then(([b, r, e]) => {
        if (cancelled) return;
        setData((prev) => ({
          bridges: b ? b.bridges : prev.bridges,
          registry: r ? r.implemented : prev.registry,
          events: e ? e.events : prev.events,
          eventsCapped: e ? e.events.length >= EVENTS_LIMIT : prev.eventsCapped,
          updatedAt: Date.now(),
        }));
      });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return <HomepageLiveDataContext.Provider value={data}>{children}</HomepageLiveDataContext.Provider>;
}

export function useHomepageLiveData(): HomepageLiveData {
  return useContext(HomepageLiveDataContext);
}
