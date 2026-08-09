// Real trailing-7-real-day summary — the exact computation both
// GET /v1/weekly-digest and the Telegram weekly-digest sender use. Extracted
// here so there is exactly one implementation, never two copies that could
// drift apart.

import { bandFor, type BridgeEventKind } from "@radar/shared";
import type { RadarDb } from "./db.js";

export interface WeeklyDigest {
  windowStart: string;
  windowEnd: string;
  anomalyEventCount: number;
  monitoredBridgeCount: number;
  bridgeHealthTally: { healthy: number; watch: number; alert: number; unmonitored: number };
}

// Real detector-flagged event kinds, not routine lock/mint/burn/unlock
// transfer events -- see /v1/weekly-digest's original doc comment.
export const ANOMALY_EVENT_KINDS: BridgeEventKind[] = ["signer_change", "frontend_change", "oracle_stale"];
export const DIGEST_WINDOW_DAYS = 7;

export async function computeWeeklyDigest(db: RadarDb): Promise<WeeklyDigest> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [anomalyEventCount, bridges, allScores] = await Promise.all([
    db.countEventsSince(windowStart.toISOString(), ANOMALY_EVENT_KINDS),
    db.listBridges(),
    db.latestScores(),
  ]);
  const scores = new Map(allScores.map((s) => [s.bridge_id, s]));

  const tally = { healthy: 0, watch: 0, alert: 0, unmonitored: 0 };
  for (const b of bridges) {
    const band = bandFor({ enabled: b.enabled, health: scores.get(b.id) });
    if (band === "green") tally.healthy += 1;
    else if (band === "yellow") tally.watch += 1;
    else if (band === "red") tally.alert += 1;
    else tally.unmonitored += 1;
  }

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    anomalyEventCount,
    monitoredBridgeCount: bridges.filter((b) => b.enabled).length,
    bridgeHealthTally: tally,
  };
}

/** Plain-text rendering for Telegram — same facts as the on-page card, same
 * no-advisory-language rule, just formatted for a chat message instead of a
 * React component. */
export function formatWeeklyDigestMessage(digest: WeeklyDigest): string {
  const start = new Date(digest.windowStart).toLocaleDateString();
  const end = new Date(digest.windowEnd).toLocaleDateString();
  const { healthy, watch, alert } = digest.bridgeHealthTally;
  return (
    `📊 Bridge Radar — This Week (${start} – ${end})\n\n` +
    `${digest.anomalyEventCount} anomaly event${digest.anomalyEventCount === 1 ? "" : "s"} across ${digest.monitoredBridgeCount} monitored bridges\n` +
    `${healthy} healthy / ${watch} watch / ${alert} alert right now\n\n` +
    `See /my-activity for your personal report card. /status here any time for a live snapshot.`
  );
}
