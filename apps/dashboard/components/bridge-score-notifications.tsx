"use client";

/**
 * Opt-in, client-side-only notifications when a bridge's real health-score
 * band changes (green/yellow/red), for bridges this wallet has real
 * transaction history with. No new backend or accounts infrastructure —
 * everything here is browser state (React + localStorage) plus polling our
 * own existing GET /v1/bridges endpoint.
 *
 * Real, standard browser API: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API
 *
 * Honest limitation: the Notifications API can only fire while this tab's
 * JS is running. That covers an open tab, including backgrounded/minimized
 * — it does NOT cover a closed tab or a closed browser. True closed-tab
 * notifications would need a service worker + push server + a place to
 * store per-user subscriptions, none of which this project has. This
 * component never claims otherwise — the UI says so directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { listBridges } from "@/lib/api";
import { bandFor, type HealthBand } from "@radar/shared";

const STORAGE_KEY = "bridge-radar:notify-bridges:v1";
const POLL_INTERVAL_MS = 60_000;

interface NotifyEntry {
  bridgeId: string;
  displayName: string;
  lastScore: number;
  lastBand: HealthBand;
  lastCheckedAt: string;
}

interface ChangeEvent {
  bridgeId: string;
  displayName: string;
  fromScore: number;
  fromBand: HealthBand;
  toScore: number;
  toBand: HealthBand;
  at: string;
}

export interface BridgeUsage {
  bridgeId: string;
  displayName: string;
}

function loadStored(): Record<string, NotifyEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, NotifyEntry>) : {};
  } catch {
    return {};
  }
}

export function BridgeScoreNotifications({ bridgesUsed }: { bridgesUsed: BridgeUsage[] }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [opted, setOpted] = useState<Record<string, NotifyEntry>>({});
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [changesRef] = useAutoAnimate<HTMLDivElement>({ duration: 250 });
  const optedRef = useRef(opted);
  optedRef.current = opted;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
    setOpted(loadStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opted));
    } catch {
      // localStorage unavailable (private mode, quota) — opt-in state just
      // won't survive a reload; nothing to fake here.
    }
  }, [opted, hydrated]);

  const poll = useCallback(async () => {
    const ids = Object.keys(optedRef.current);
    if (ids.length === 0) return;
    let bridges;
    try {
      ({ bridges } = await listBridges());
    } catch (e) {
      console.error("[bridge-score-notifications] poll failed:", e);
      return;
    }
    const nowIso = new Date().toISOString();
    const newEvents: ChangeEvent[] = [];
    setOpted((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const entry = prev[id];
        const row = bridges.find((b) => b.id === id);
        if (!entry || !row) continue;
        const newBand = bandFor(row);
        const newScore = row.health?.score ?? entry.lastScore;
        if (newBand !== entry.lastBand && row.health) {
          const evt: ChangeEvent = {
            bridgeId: id,
            displayName: entry.displayName,
            fromScore: entry.lastScore,
            fromBand: entry.lastBand,
            toScore: newScore,
            toBand: newBand,
            at: nowIso,
          };
          newEvents.push(evt);
          if (permission === "granted") {
            new Notification(`${entry.displayName} health-score band changed`, {
              body: `${entry.displayName}'s health score changed from ${entry.lastScore} (${entry.lastBand}) to ${newScore} (${newBand}) as of ${new Date(nowIso).toLocaleString()}.`,
            });
          }
        }
        next[id] = { ...entry, lastScore: newScore, lastBand: newBand, lastCheckedAt: nowIso };
      }
      return next;
    });
    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 20));
    }
  }, [permission]);

  useEffect(() => {
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  async function toggle(b: BridgeUsage) {
    if (opted[b.bridgeId]) {
      setOpted((prev) => {
        const next = { ...prev };
        delete next[b.bridgeId];
        return next;
      });
      return;
    }
    if (permission !== "granted" && permission !== "unsupported") {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return; // honest: don't fake an opt-in that can't deliver anything
    }
    let bridges;
    try {
      ({ bridges } = await listBridges());
    } catch (e) {
      console.error("[bridge-score-notifications] couldn't fetch current score to opt in:", e);
      return;
    }
    const row = bridges.find((x) => x.id === b.bridgeId);
    if (!row?.health) return; // no real current score to use as a baseline — don't fake one
    setOpted((prev) => ({
      ...prev,
      [b.bridgeId]: {
        bridgeId: b.bridgeId,
        displayName: b.displayName,
        lastScore: row.health!.score,
        lastBand: bandFor(row),
        lastCheckedAt: new Date().toISOString(),
      },
    }));
  }

  if (bridgesUsed.length === 0) return null;

  return (
    <section className="glass-card-elevated space-y-4 p-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-text">Health-score change notifications</h2>
        <p className="text-xs leading-relaxed text-muted">
          Opt in per bridge below to get notified when its real health-score band (green/yellow/red)
          changes, checked every minute against our live <code className="text-[11px]">/v1/bridges</code>{" "}
          data while this tab stays open — including backgrounded or minimized, but not after the tab is
          closed. We have no backend push service, so we can't deliver a notification after you close this
          page or browser.
        </p>
      </div>

      {permission === "denied" && (
        <p className="rounded-lg border border-yellow/30 bg-yellow-glow/40 px-3 py-2 text-xs text-yellow">
          Browser notifications are blocked for this site. Enable them in your browser's site settings to
          use this feature — the toggles below won't do anything until you do.
        </p>
      )}
      {permission === "unsupported" && (
        <p className="rounded-lg border border-yellow/30 bg-yellow-glow/40 px-3 py-2 text-xs text-yellow">
          This browser doesn't support the Notifications API, so this feature isn't available here.
        </p>
      )}

      <div className="space-y-2">
        {bridgesUsed.map((b) => {
          const entry = opted[b.bridgeId];
          return (
            <div
              key={b.bridgeId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 px-3 py-2 text-sm transition-colors hover:border-accent/25 hover:bg-surface/80"
            >
              <div>
                <span className="text-text-secondary">{b.displayName}</span>
                {entry && (
                  <span className="ml-2 font-mono text-[11px] text-muted-dark">
                    last checked score {entry.lastScore} ({entry.lastBand}) at{" "}
                    {new Date(entry.lastCheckedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggle(b)}
                disabled={permission === "unsupported"}
                className={`badge text-xs transition-colors disabled:opacity-50 ${
                  entry ? "border-accent/30 bg-accent/10 text-accent" : "hover:text-text"
                }`}
              >
                {entry ? "Notifying — tap to stop" : "Notify me if this changes"}
              </button>
            </div>
          );
        })}
      </div>

      {events.length > 0 && (
        <div ref={changesRef} className="space-y-2 border-t border-border/30 pt-3">
          <p className="text-xs font-medium text-text-secondary">Detected changes, this session</p>
          {events.map((e, i) => (
            <p key={`${e.bridgeId}-${e.at}-${i}`} className="text-xs leading-relaxed text-text-secondary">
              {e.displayName}'s health score changed from {e.fromScore} ({e.fromBand}) to {e.toScore} (
              {e.toBand}) on {new Date(e.at).toLocaleString()}.
            </p>
          ))}
        </div>
      )}

      <p className="border-t border-border/30 pt-3 text-[11px] leading-relaxed text-muted-dark">
        This shows real-time and historical data only. Bridge Radar does not predict future events, assess
        your personal risk, or provide financial advice.
      </p>
    </section>
  );
}
