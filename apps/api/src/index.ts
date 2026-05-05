import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { BridgeEventKind, BridgeWithHealth, WsMessage } from "@radar/shared";
import { RadarDb } from "./db.js";
import { getImplementedBridges, getPlannedBridges, getTotalTVL, BRIDGE_REGISTRY } from "./bridges.js";
import { fetchDeFiLlamaBridges, filterSolanaBridges, getBridgeData, formatTVL, formatVolume } from "./defilama.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";
const corsOrigin = process.env.API_CORS_ORIGIN ?? "http://localhost:3000";
const dbUrl = process.env.DATABASE_URL ?? "sqlite://./data/radar.db";

const db = new RadarDb(dbUrl);
const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("*", logger());
app.use("/v1/*", cors({ origin: corsOrigin }));

app.get("/", (c) =>
  c.json({
    name: "bridge-radar",
    version: "0.1.0",
    docs: "https://github.com/Pratikkale26/bridge-radar/blob/main/ARCHITECTURE.md",
    endpoints: [
      "GET /v1/bridges",
      "GET /v1/bridges/:id",
      "GET /v1/bridges/:id/health",
      "GET /v1/bridges/:id/history",
      "GET /v1/events",
      "GET /v1/registry",
      "GET /v1/defilama",
      "GET /v1/ws",
    ],
  }),
);

app.get("/v1/healthz", (c) =>
  c.json({ ok: true, events: db.countEvents(), now: new Date().toISOString() }),
);

// Surface the v0-naive scoring algorithm + weights on every health-bearing
// response so consumers (and grant reviewers reading the JSON) can see exactly
// how the score is computed today.
const SCORING_META = {
  algorithm: "v1-mixed",
  description:
    "outflow_severity = z-score over a rolling 30-day distribution of 5-min bucket counts (z=4 → severity 1.0); falls back to clamp(events_per_5min / 10, 0, 1) for the first ~4 hours of observations. parity_severity = 1 - min(origin, solana) / max(origin, solana) over a 5-min window (count proxy; USD-weighted parity per Appendix B follows once per-bridge ABI decoders populate amount_usd). signer / frontend / oracle stream live once their detectors are deployed.",
  weights: { parity: 40, outflow: 25, signer: 15, frontend: 10, oracle: 10 },
};

// DeFiLlama data endpoint - returns Solana-compatible bridges with TVL/volume
app.get("/v1/defilama", async (c) => {
  try {
    const allBridges = await fetchDeFiLlamaBridges();
    const solanaBridges = filterSolanaBridges(allBridges);
    
    return c.json({
      source: "DeFiLlama",
      timestamp: new Date().toISOString(),
      count: solanaBridges.length,
      bridges: solanaBridges.map((b) => ({
        id: b.id,
        name: b.name,
        chains: b.chains,
        tvl: b.tvl,
        tvlFormatted: formatTVL(b.tvl),
        volume24h: b.volume24h,
        volumeFormatted: formatVolume(b.volume24h),
      })),
    });
  } catch (error) {
    console.error("DeFiLlama endpoint error:", error);
    return c.json({ error: "Failed to fetch DeFiLlama data" }, 500);
  }
});

// Bridge registry endpoint - returns all bridges with metadata
app.get("/v1/registry", (c) => {
  const implemented = getImplementedBridges();
  const planned = getPlannedBridges();
  return c.json({
    summary: {
      total: BRIDGE_REGISTRY.length,
      implemented: implemented.length,
      planned: planned.length,
      totalTVL: getTotalTVL(),
    },
    implemented: implemented.map((b) => ({
      id: b.id,
      name: b.name,
      homepage: b.homepage,
      supportedChains: b.supportedChains,
      hasSolana: b.hasSolana,
      status: b.status,
      tvl: b.tvl,
    })),
    planned: planned.map((b) => ({
      id: b.id,
      name: b.name,
      homepage: b.homepage,
      supportedChains: b.supportedChains,
      hasSolana: b.hasSolana,
      status: b.status,
      tvl: b.tvl,
    })),
  });
});

app.get("/v1/bridges", async (c) => {
  const bridges = db.listBridges();
  const scores = new Map(db.latestScores().map((s) => [s.bridge_id, s]));
  
  // Fetch DeFiLlama data for context
  let defilamaData: Map<string, any> = new Map();
  try {
    const allBridges = await fetchDeFiLlamaBridges();
    const solanaBridges = filterSolanaBridges(allBridges);
    solanaBridges.forEach((b) => {
      defilamaData.set(b.id, {
        tvl: b.tvl,
        tvlFormatted: formatTVL(b.tvl),
        volume24h: b.volume24h,
        volumeFormatted: formatVolume(b.volume24h),
        chains: b.chains,
      });
    });
  } catch (error) {
    console.warn("Could not fetch DeFiLlama data:", error);
  }

  const out: BridgeWithHealth[] = bridges.map((b) => ({
    ...b,
    health: scores.get(b.id),
    defilama: defilamaData.get(b.id),
  }));
  return c.json({ scoring: SCORING_META, bridges: out });
});

app.get("/v1/bridges/:id", async (c) => {
  const id = c.req.param("id");
  const bridge = db.listBridges().find((b) => b.id === id);
  if (!bridge) return c.json({ error: "bridge not found" }, 404);
  
  const score = db.latestScores().find((s) => s.bridge_id === id);
  
  // Fetch DeFiLlama data for this bridge
  let defilamaData = null;
  try {
    const allBridges = await fetchDeFiLlamaBridges();
    const bridgeData = getBridgeData(id, allBridges);
    if (bridgeData) {
      defilamaData = {
        tvl: bridgeData.tvl,
        tvlFormatted: formatTVL(bridgeData.tvl),
        volume24h: bridgeData.volume24h,
        volumeFormatted: formatVolume(bridgeData.volume24h),
        chains: bridgeData.chains,
      };
    }
  } catch (error) {
    console.warn("Could not fetch DeFiLlama data for bridge:", error);
  }

  return c.json({ bridge, health: score, defilama: defilamaData });
});

app.get("/v1/bridges/:id/health", (c) => {
  const id = c.req.param("id");
  const score = db.latestScores().find((s) => s.bridge_id === id);
  if (!score) return c.json({ error: "no score yet" }, 404);
  return c.json({ scoring: SCORING_META, ...score });
});

app.get("/v1/bridges/:id/history", (c) => {
  const id = c.req.param("id");
  const sinceParam = c.req.query("since");
  const since = sinceParam ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return c.json({ bridge_id: id, since, history: db.scoreHistory(id, since) });
});

app.get("/v1/events", (c) => {
  const events = db.listEvents({
    bridgeId: c.req.query("bridge"),
    kind: c.req.query("type") as BridgeEventKind | undefined,
    chain: c.req.query("chain"),
    since: c.req.query("since"),
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });
  return c.json({ events });
});

// ── WebSocket live stream ────────────────────────────────────────────────────
//
// We don't have a notify mechanism from the Rust indexer back into the API,
// so the API tails the SQLite `bridge_events` table by polling every 1s and
// pushes new rows out to every connected WS client. Cheap and works.

interface ClientCtx {
  send: (msg: WsMessage) => void;
}
const clients = new Set<ClientCtx>();
let lastRowid = db.maxEventRowid();

function broadcast(msg: WsMessage) {
  for (const c of clients) {
    try {
      c.send(msg);
    } catch {
      // best-effort; closed sockets get dropped on the next tick
    }
  }
}

setInterval(() => {
  if (clients.size === 0) return;
  const fresh = db.eventsSince(lastRowid, 200);
  for (const { rowid, event } of fresh) {
    lastRowid = Math.max(lastRowid, rowid);
    broadcast({ kind: "event", data: event });
  }
}, 1000);

app.get(
  "/v1/ws",
  upgradeWebSocket(() => {
    let ctx: ClientCtx | null = null;
    return {
      onOpen(_evt, ws) {
        const send = (msg: WsMessage) => ws.send(JSON.stringify(msg));
        ctx = { send };
        clients.add(ctx);
        send({ kind: "hello", data: { server_time: new Date().toISOString() } });
      },
      onClose() {
        if (ctx) clients.delete(ctx);
      },
      onError() {
        if (ctx) clients.delete(ctx);
      },
    };
  }),
);

// 404 fallback
app.notFound((c) => c.json({ error: "not found" }, 404));

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`[radar-api] listening on http://${info.address}:${info.port}`);
});
injectWebSocket(server);
