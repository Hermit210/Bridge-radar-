import "./load-env.js"; // must run before any process.env read below

import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Connection } from "@solana/web3.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { BridgeEventKind, BridgeWithHealth, WsMessage } from "@radar/shared";
import { RadarDb } from "./db.js";
import { getImplementedBridges, getPlannedBridges, BRIDGE_REGISTRY } from "./bridges.js";
import { DefiLlamaStore, fetchDefiLlamaPrice } from "./defillama-store.js";
import {
  fetchWalletBridgeActivity,
  isRateLimitError,
  isValidSolanaAddress,
  WALLET_ACTIVITY_DEFAULT_LIMIT,
} from "./wallet-activity.js";
import { fetchWalletHoldings } from "./wallet-holdings.js";
import {
  extractHeliusApiKey,
  fetchWalletTransactionTimeline,
  HeliusKeyMissingError,
  WALLET_TIMELINE_DEFAULT_LIMIT,
} from "./wallet-timeline.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";
// Hono's cors({ origin }) only does exact-string (or exact-string-in-array)
// matching — it never splits a comma-separated value itself. Passing the
// raw env string straight through (as this used to) meant a
// "http://localhost:3000,http://localhost:3002" config never matched
// EITHER real Origin header the browser sends, so every cross-origin
// request from the dashboard silently failed CORS: server logs a clean
// 200 (the request did complete), but the browser's fetch() throws
// "Failed to fetch" because it refuses to hand the response to JS.
const corsOrigins = (process.env.API_CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const dbUrl = process.env.DATABASE_URL ?? "sqlite://./data/radar.db";
const solanaRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

// Log which RPC host is actually in use at boot — host only, never the
// query string, so an API key embedded in the URL (Helius et al.) never
// lands in logs. This is the direct answer to "which endpoint is this
// process really hitting": read it once here instead of guessing from
// .env content, which this process doesn't necessarily see the same way.
function redactedRpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "<invalid SOLANA_RPC_URL>";
  }
}
console.log(
  `[radar-api] Solana RPC endpoint: ${redactedRpcHost(solanaRpcUrl)} ` +
    `(${process.env.SOLANA_RPC_URL ? "from SOLANA_RPC_URL" : "default fallback — SOLANA_RPC_URL not set"})`,
);
console.log(`[radar-api] CORS allowed origins: ${corsOrigins.join(", ")}`);

// Reuses the RPC key when it's a Helius one — never a second, separately
// configured credential. Logged as enabled/disabled only, key itself never
// touches the logs.
const heliusApiKey = extractHeliusApiKey(solanaRpcUrl);
console.log(
  `[radar-api] Helius Enhanced Transactions API (full wallet timeline): ${
    heliusApiKey ? "enabled" : "disabled — set HELIUS_API_KEY or point SOLANA_RPC_URL at Helius"
  }`,
);

const db = new RadarDb(dbUrl);
const defillama = new DefiLlamaStore(db.raw());
const solanaConnection = new Connection(solanaRpcUrl, "confirmed");
const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("*", logger());
app.use("/v1/*", cors({ origin: corsOrigins }));

app.get("/", (c) =>
  c.json({
    name: "bridge-radar",
    version: "0.1.0",
    docs: "https://github.com/Hermit210/Bridge-radar-/blob/main/ARCHITECTURE.md",
    endpoints: [
      "GET /v1/bridges",
      "GET /v1/bridges/:id",
      "GET /v1/bridges/:id/health",
      "GET /v1/bridges/:id/history",
      "GET /v1/events",
      "GET /v1/wallet-activity/:address",
      "GET /v1/wallet-holdings/:address",
      "GET /v1/wallet-timeline/:address",
      "GET /v1/registry",
      "GET /v1/defillama/bridges",
      "GET /v1/defillama/bridge-volume",
      "GET /v1/defillama/tvl",
      "GET /v1/defillama/stablecoins",
      "GET /v1/defillama/protocols",
      "GET /v1/defillama/messaging-protocols",
      "GET /v1/defillama/yields",
      "GET /v1/defillama/oracles",
      "GET /v1/defillama/dex-volume",
      "GET /v1/defillama/fees",
      "GET /v1/defillama/price/:mint",
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

// Bridge registry endpoint - returns all bridges with metadata (identity +
// detection status only; no TVL — see BRIDGE_REGISTRY doc comment).
app.get("/v1/registry", (c) => {
  const implemented = getImplementedBridges();
  const planned = getPlannedBridges();
  return c.json({
    summary: {
      total: BRIDGE_REGISTRY.length,
      implemented: implemented.length,
      planned: planned.length,
    },
    implemented: implemented.map((b) => ({
      id: b.id,
      name: b.name,
      homepage: b.homepage,
      supportedChains: b.supportedChains,
      hasSolana: b.hasSolana,
      status: b.status,
    })),
    planned: planned.map((b) => ({
      id: b.id,
      name: b.name,
      homepage: b.homepage,
      supportedChains: b.supportedChains,
      hasSolana: b.hasSolana,
      status: b.status,
    })),
  });
});

// Real protocol TVL for a bridge, from the DeFiLlama-backed cache (see
// crates/radar-defillama). Returns undefined if the bridge has no verified
// DeFiLlama protocol slug or no sync has run yet — never a fabricated number.
function protocolTvlFor(bridgeId: string) {
  const row = defillama.get("protocols", bridgeId);
  if (!row) return undefined;
  const payload = JSON.parse(row.payload) as {
    defillama_slug: string;
    defillama_name: string;
    category: string | null;
    tvl_usd: number;
  };
  return {
    source: "defillama" as const,
    fetched_at: row.fetched_at,
    defillama_slug: payload.defillama_slug,
    defillama_name: payload.defillama_name,
    category: payload.category,
    tvl_usd: payload.tvl_usd,
  };
}

app.get("/v1/bridges", async (c) => {
  const bridges = db.listBridges();
  const scores = new Map(db.latestScores().map((s) => [s.bridge_id, s]));

  const out: BridgeWithHealth[] = bridges.map((b) => ({
    ...b,
    health: scores.get(b.id),
    defillama: protocolTvlFor(b.id),
  }));
  return c.json({ scoring: SCORING_META, bridges: out });
});

app.get("/v1/bridges/:id", async (c) => {
  const id = c.req.param("id");
  const bridge = db.listBridges().find((b) => b.id === id);
  if (!bridge) return c.json({ error: "bridge not found" }, 404);

  const score = db.latestScores().find((s) => s.bridge_id === id);
  return c.json({ bridge, health: score, defillama: protocolTvlFor(id) });
});

// ── DeFiLlama Solana data layer (external reference data — see
// crates/radar-core/src/defillama and crates/radar-defillama) ──────────────
//
// Every response carries source:"defillama" and fetched_at so it's never
// confused with our own primary on-chain-derived detection data. Categories
// synced by the Rust service are read straight from defillama_cache; if that
// service hasn't run yet, callers get an honest empty/unavailable state, not
// fabricated numbers.

function proOnly(c: Context, category: string) {
  const row = defillama.get(category, "solana");
  if (!row) {
    return c.json({
      source: "defillama",
      category,
      available: false,
      reason: "not synced yet — start the radar-defillama service",
    });
  }
  const payload = JSON.parse(row.payload) as {
    available: boolean;
    reason?: string;
    bridges?: unknown;
    points?: unknown;
    data?: unknown;
  };
  if (!payload.available) {
    return c.json({ source: "defillama", category, available: false, reason: payload.reason, fetched_at: row.fetched_at });
  }
  const { available: _available, ...rest } = payload;
  return c.json({ source: "defillama", category, available: true, fetched_at: row.fetched_at, ...rest });
}

app.get("/v1/defillama/bridges", (c) => proOnly(c, "bridges"));
app.get("/v1/defillama/bridge-volume", (c) => proOnly(c, "bridge_volume"));
app.get("/v1/defillama/oracles", (c) => proOnly(c, "oracles"));

app.get("/v1/defillama/tvl", (c) => {
  const row = defillama.get("chain_tvl", "solana");
  if (!row) {
    return c.json({ source: "defillama", category: "chain_tvl", available: false, reason: "not synced yet" });
  }
  const payload = JSON.parse(row.payload) as { points: { date: number; tvl: number }[] };
  return c.json({
    source: "defillama",
    category: "chain_tvl",
    available: true,
    fetched_at: row.fetched_at,
    points: payload.points,
  });
});

app.get("/v1/defillama/stablecoins", (c) => {
  const rows = defillama.list("stablecoins");
  return c.json({
    source: "defillama",
    category: "stablecoins",
    available: rows.length > 0,
    count: rows.length,
    stablecoins: rows.map((r) => ({ ...JSON.parse(r.payload), fetched_at: r.fetched_at })),
  });
});

app.get("/v1/defillama/protocols", (c) => {
  const rows = defillama.list("protocols");
  return c.json({
    source: "defillama",
    category: "protocols",
    available: rows.length > 0,
    count: rows.length,
    protocols: rows.map((r) => ({ ...JSON.parse(r.payload), fetched_at: r.fetched_at })),
  });
});

app.get("/v1/defillama/messaging-protocols", (c) => {
  const rows = defillama.list("messaging_protocols");
  return c.json({
    source: "defillama",
    category: "messaging_protocols",
    note: "shared cross-chain messaging infrastructure (CCIP, LayerZero) — not dedicated bridges themselves; several tracked bridges are built on top of one of these",
    available: rows.length > 0,
    count: rows.length,
    protocols: rows.map((r) => ({ ...JSON.parse(r.payload), fetched_at: r.fetched_at })),
  });
});

app.get("/v1/defillama/yields", (c) => {
  const row = defillama.get("yields", "solana");
  if (!row) {
    return c.json({
      source: "defillama",
      category: "yields",
      note: "dashboard context only — never used in scoring",
      available: false,
      reason: "not synced yet",
    });
  }
  return c.json({
    source: "defillama",
    category: "yields",
    note: "dashboard context only — never used in scoring",
    available: true,
    fetched_at: row.fetched_at,
    ...JSON.parse(row.payload),
  });
});

app.get("/v1/defillama/dex-volume", (c) => {
  const row = defillama.get("dex_volume", "solana");
  if (!row) return c.json({ source: "defillama", category: "dex_volume", available: false, reason: "not synced yet" });
  return c.json({ source: "defillama", category: "dex_volume", available: true, fetched_at: row.fetched_at, ...JSON.parse(row.payload) });
});

app.get("/v1/defillama/fees", (c) => {
  const row = defillama.get("fees", "solana");
  if (!row) return c.json({ source: "defillama", category: "fees", available: false, reason: "not synced yet" });
  return c.json({ source: "defillama", category: "fees", available: true, fetched_at: row.fetched_at, ...JSON.parse(row.payload) });
});

app.get("/v1/defillama/price/:mint", async (c) => {
  const mint = c.req.param("mint");
  if (!mint || mint.length < 32 || mint.length > 44) {
    return c.json({ error: "invalid mint address" }, 400);
  }
  const result = await fetchDefiLlamaPrice(mint);
  if ("error" in result) {
    return c.json({ source: "defillama", available: false, reason: result.error }, 502);
  }
  return c.json({ source: "defillama", available: true, ...result });
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

// ── Wallet activity — real on-chain history for a connected wallet ────────
//
// Read-only: queries Solana mainnet via SOLANA_RPC_URL for the address's own
// recent signatures, keeps only ones that touch one of our 14 monitored
// bridge programs, and cross-references each match against our own
// bridge_health_scores history. Never fabricates a score for a moment we
// didn't actually record.
app.get("/v1/wallet-activity/:address", async (c) => {
  const address = c.req.param("address");
  if (!isValidSolanaAddress(address)) {
    return c.json({ error: "invalid Solana address" }, 400);
  }
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Number(limitParam) : WALLET_ACTIVITY_DEFAULT_LIMIT;
  if (Number.isNaN(limit)) {
    return c.json({ error: "limit must be a number" }, 400);
  }
  // Real signature to page further back from — the client passes back
  // scanned.oldestSignature from the previous page's response.
  const before = c.req.query("before") || undefined;

  try {
    const result = await fetchWalletBridgeActivity(solanaConnection, db, address, limit, before);
    return c.json(result);
  } catch (err) {
    // Full error object, not just .message — a bare 502 with nothing in the
    // server log is exactly how a silently-swallowed RPC failure (rate
    // limit, bad response, etc.) went undiagnosed last time.
    console.error(`[wallet-activity] request failed for address=${address} limit=${limit} before=${before}:`, err);
    if (isRateLimitError(err)) {
      return c.json(
        {
          error: "Solana RPC rate-limited this request",
          detail:
            "getSignaturesForAddress was rate-limited even after retries. If SOLANA_RPC_URL is still the " +
            "default public endpoint (https://api.mainnet-beta.solana.com), that's expected under load — " +
            "set SOLANA_RPC_URL to a paid provider (e.g. https://helius.dev) in .env for reliable results.",
        },
        503,
      );
    }
    return c.json(
      { error: "failed to fetch wallet activity", detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

// Real, read-only SOL + SPL token balance snapshot for a connected wallet.
// See wallet-holdings.ts for what "real" means here — USD values are null,
// not zero, when DeFiLlama has no price for a mint.
app.get("/v1/wallet-holdings/:address", async (c) => {
  const address = c.req.param("address");
  if (!isValidSolanaAddress(address)) {
    return c.json({ error: "invalid Solana address" }, 400);
  }
  try {
    const result = await fetchWalletHoldings(solanaConnection, address);
    return c.json(result);
  } catch (err) {
    console.error(`[wallet-holdings] request failed for address=${address}:`, err);
    if (isRateLimitError(err)) {
      return c.json(
        {
          error: "Solana RPC rate-limited this request",
          detail: "getBalance/getTokenAccountsByOwner were rate-limited. Set SOLANA_RPC_URL to a paid provider for reliable results.",
        },
        503,
      );
    }
    return c.json(
      { error: "failed to fetch wallet holdings", detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

// Real, full transaction timeline for a connected wallet — every transaction
// type (transfers, swaps, staking, NFT activity, everything), not just
// bridge-matching ones. Classified by Helius's Enhanced Transactions API;
// honestly reports "not configured" (501) rather than falling back to a
// fake or degraded classification when no Helius key is available.
app.get("/v1/wallet-timeline/:address", async (c) => {
  const address = c.req.param("address");
  if (!isValidSolanaAddress(address)) {
    return c.json({ error: "invalid Solana address" }, 400);
  }
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Number(limitParam) : WALLET_TIMELINE_DEFAULT_LIMIT;
  if (Number.isNaN(limit)) {
    return c.json({ error: "limit must be a number" }, 400);
  }
  const before = c.req.query("before") || undefined;

  try {
    const result = await fetchWalletTransactionTimeline(solanaConnection, address, limit, before, heliusApiKey);
    return c.json(result);
  } catch (err) {
    if (err instanceof HeliusKeyMissingError) {
      return c.json({ error: "not configured", detail: err.message }, 501);
    }
    console.error(`[wallet-timeline] request failed for address=${address} limit=${limit} before=${before}:`, err);
    if (isRateLimitError(err)) {
      return c.json(
        {
          error: "rate-limited",
          detail:
            "Solana RPC or the Helius Enhanced Transactions API was rate-limited even after retries. Try again shortly.",
        },
        503,
      );
    }
    return c.json(
      { error: "failed to fetch wallet timeline", detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
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
