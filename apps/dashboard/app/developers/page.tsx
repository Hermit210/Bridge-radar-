import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { CodeBlock } from "@/components/code-block";
import { WidgetEmbedDemo } from "@/components/widget-embed-demo";
import { listRegistry } from "@/lib/api";

export const metadata = { title: "Developers — Bridge Radar" };

const REPO = "https://github.com/Hermit210/Bridge-radar-";
// Real, current API base. Live in production on Render's free tier as of
// 2026-08-13 (see PROGRESS.md) — every example on this page targets that
// real, running URL. `.trim()` guards against whitespace accidentally
// baked into NEXT_PUBLIC_API_URL at the hosting layer (e.g. a stray tab
// pasted into a dashboard env var field) leaking into every code example
// on the page and making them non-copy-pasteable.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").trim();

const linkClass =
  "text-accent hover:text-accent-bright transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent";

export default async function DevelopersPage() {
  const registry = await listRegistry().catch(() => null);

  return (
    <article className="mx-auto max-w-3xl space-y-16 animate-fade-in">
      <div className="space-y-5">
        {registry && (
          <span className="badge inline-flex items-center gap-2">
            <span className="status-dot status-dot-green"></span>
            {registry.summary.implemented} bridges monitored right now — every example below is real
          </span>
        )}
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
          Developer Tools
        </h1>
        <p className="text-[15px] leading-[1.75] text-text-secondary">
          Four real ways to pull Bridge Radar's data into your own app: the TypeScript SDK, the
          REST/WebSocket API directly, a drop-in embeddable badge, or reading the on-chain oracle
          yourself. Every URL below points at the real, live API
          (<code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">{API_BASE}</code>),
          not a placeholder domain — deployed on Render's free tier, so expect an occasional
          cold-start delay after a period of inactivity.
        </p>
      </div>

      {/* ── SDK ─────────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
              SDK — <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-base text-accent">@bridge-radar/sdk</code>
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Minimal TypeScript client — real REST fetch or read the on-chain oracle directly.
              Its only real dependency is <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">@solana/web3.js</code>.
            </p>
          </div>

          <div className="rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-xs text-green">
            Published on npm — <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">@bridge-radar/sdk@0.2.0</code>,
            public, zero unresolvable dependencies. Verify yourself:{" "}
            <Link className={linkClass} href="https://www.npmjs.com/package/@bridge-radar/sdk">npmjs.com/package/@bridge-radar/sdk</Link>.
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">Install</p>
            <CodeBlock language="bash" code={`npm install @bridge-radar/sdk`} />
            <p className="text-xs text-muted-dark">
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">getBridgeHealth()</code> takes
              the API URL as an explicit argument rather than baking in a default — every example below points at{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">{API_BASE}</code>,
              our real live instance. Point it at your own instance instead if you're self-hosting.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              getBridgeHealth() — real GET /v1/bridges/:id under the hood
            </p>
            <CodeBlock
              language="typescript"
              code={`import { getBridgeHealth } from "@bridge-radar/sdk";

const { bridge, health, defillama } = await getBridgeHealth("wormhole", "${API_BASE}");

console.log(health?.score);              // 0-100, or undefined if never scored
console.log(health?.components);         // { parity_severity, outflow_severity, signer_recency, frontend_recency, oracle_staleness }
console.log(defillama?.tvl_usd);         // real cross-referenced TVL, if DeFiLlama has it`}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              getBridgeHealthOnChain() — reads the real Anchor PDA directly, no API involved
            </p>
            <CodeBlock
              language="typescript"
              code={`import { Connection } from "@solana/web3.js";
import { getBridgeHealthOnChain } from "@bridge-radar/sdk";

const connection = new Connection("https://api.devnet.solana.com");
const score = await getBridgeHealthOnChain(connection, "wormhole");
// throws BridgeRadarError if "wormhole" was never registered on-chain --
// never silently returns 0 for "doesn't exist"`}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              getFinalityHealth() — real GET /v1/network/finality under the hood
            </p>
            <div className="rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-xs text-green">
              Published — real, live in <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">@bridge-radar/sdk@0.2.0</code> on
              npm. No source-only caveat anymore: <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">npm install @bridge-radar/sdk</code> gets
              you this export directly.
            </div>
            <CodeBlock
              language="typescript"
              code={`import { getFinalityHealth } from "@bridge-radar/sdk";

const health = await getFinalityHealth("${API_BASE}");

console.log(health.latest?.elapsedMs);   // real ms between this slot's confirmed and finalized observation
console.log(health.rollingBaselineMs);   // real trailing-hour median, or null if under 5 real samples
console.log(health.isAnomalous);         // true only when latest exceeds the real baseline by 3x`}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Every other real export
            </p>
            <p className="text-sm text-text-secondary">
              Every remaining export — 3 values plus 7 types, nothing hidden beyond what's already shown above:
            </p>
            <CodeBlock
              language="typescript"
              code={`bandOf(score: number): HealthBand
// "green" if score >= 80, "yellow" if score >= 50, else "red".
// (Note: this is the raw threshold function -- it doesn't know about
// "unmonitored". A disabled/unscored bridge is a band your own code
// derives from health being undefined, same as bandFor() does server-side.)

RADAR_ORACLE_PROGRAM_ID: PublicKey
// = 6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM (Devnet). The default
// programId getBridgeHealthOnChain() uses if you don't pass your own.

class BridgeRadarError extends Error {}
// Thrown by both getBridgeHealth() (non-2xx response) and
// getBridgeHealthOnChain() (account missing, or shorter than the real
// 82-byte layout) -- catch this specifically to distinguish "Bridge Radar
// told us something's wrong" from a generic network/RPC failure.

// Types (all plain data, re-exported for your own function signatures):
interface BridgeHealth { bridge: BridgeRow; health?: HealthScore; defillama?: DefiLlamaProtocolTvl }
interface HealthScore { bridge_id: string; computed_at: string; score: number; components: HealthComponents }
interface HealthComponents { parity_severity: number; outflow_severity: number; signer_recency: number; frontend_recency: number; oracle_staleness: number }
type HealthBand = "green" | "yellow" | "red" | "unmonitored";
interface BridgeRow { id: string; display_name: string; homepage?: string; enabled: boolean }
interface DefiLlamaProtocolTvl { source: "defillama"; fetched_at: string; defillama_slug: string; defillama_name: string; category: string | null; tvl_usd: number }
interface FinalityHealth { latest: { slot: number; confirmedAt: string; finalizedAt: string; elapsedMs: number } | null; rollingBaselineMs: number | null; sampleCount: number; windowStart: string; isAnomalous: boolean; anomalousBridgeEventsLastHour: number; note: string }`}
            />
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface/50 p-4 text-xs text-muted-dark">
            Need retry/failover across multiple RPC endpoints too, plus a one-line health gate before a
            withdrawal? See{" "}
            <Link className={linkClass} href="https://www.npmjs.com/package/@bridge-radar/fetch">
              @bridge-radar/fetch
            </Link>{" "}
            — a real <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">Connection</code> subclass
            that wraps this SDK's <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">getBridgeHealth</code>,
            published separately since it's a different concern (RPC reliability, not bridge data).
          </div>

          <p className="text-xs text-muted-dark">
            Real source: <Link className={linkClass} href={`${REPO}/blob/master/packages/sdk/src/index.ts`}>packages/sdk/src/index.ts</Link>
          </p>
        </section>
      </Reveal>

      {/* ── REST / WebSocket API ───────────────────────────────────────── */}
      <Reveal>
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">REST + WebSocket API</h2>
            <p className="mt-1.5 text-sm text-muted">
              No API key, no rate limiting currently enforced in the code — every route below is a real,
              public GET. (That will very likely change as this deployment matures; this page
              reflects the code as it stands.)
            </p>
          </div>

          <ApiEndpoint
            method="GET"
            path="/v1/bridges"
            description="Every monitored bridge with its latest real health score and DeFiLlama TVL cross-reference. No query parameters -- always returns all 16 real bridges (14 implemented + 2 planned), no pagination. Planned bridges (no adapter yet) come back with enabled:false and no health key at all -- that's how to tell them apart from a real 0/unscored implemented bridge."
            curl={`curl -s ${API_BASE}/v1/bridges`}
            response={`{
  "scoring": { "algorithm": "v1-mixed", "weights": { "parity": 40, "outflow": 25, "signer": 15, "frontend": 10, "oracle": 10 }, "description": "outflow_severity = z-score over a rolling 30-day distribution ... (full text in /v1/bridges/:id/health)" },
  "bridges": [
    { "id": "wormhole", "display_name": "Wormhole", "homepage": "https://wormhole.com", "enabled": true,
      "health": { "bridge_id": "wormhole", "computed_at": "2026-08-08T19:30:05.176Z", "score": 90, "components": { "parity_severity": 0, "outflow_severity": 0, "signer_recency": 0, "frontend_recency": 0.989213, "oracle_staleness": 0 } } },
    { "id": "axelar", "display_name": "Axelar", "homepage": "https://axelar.network", "enabled": true,
      "health": { "bridge_id": "axelar", "computed_at": "2026-08-08T19:30:05.176Z", "score": 60, "components": { "...": "..." } } },
    { "id": "hyperlane", "display_name": "Hyperlane", "homepage": "https://hyperlane.xyz", "enabled": false }
    /* real, live, all 16: across, allbridge, atomiq, axelar, base-solana-bridge, cctp*, debridge,
       garden, hyperlane*, layerzero, mayan, orderly, portal, relay, rhinofi, wormhole
       (* = planned, no health key). Current real scores: 100 (across, allbridge, atomiq,
       base-solana-bridge, garden, orderly, relay, rhinofi), 90 (portal, wormhole),
       60 (axelar, debridge, layerzero, mayan) -- verify live, these change. */
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/bridges/:id"
            description={`One bridge's real health score plus its real DeFiLlama TVL. No query parameters. 404 with {"error":"bridge not found"} for an id not in the registry at all -- distinct from a real, registered bridge that just has no health/defillama key yet (200, those fields simply absent).`}
            curl={`curl -s ${API_BASE}/v1/bridges/wormhole`}
            response={`{
  "bridge": { "id": "wormhole", "display_name": "Wormhole", "homepage": "https://wormhole.com", "enabled": true },
  "health": {
    "bridge_id": "wormhole",
    "computed_at": "2026-08-08T19:30:05.176Z",
    "score": 90,
    "components": { "parity_severity": 0, "outflow_severity": 0, "signer_recency": 0, "frontend_recency": 0.989213, "oracle_staleness": 0 }
  },
  "defillama": { "source": "defillama", "fetched_at": "2026-08-08T19:31:21.883Z", "defillama_slug": "portal", "defillama_name": "Portal", "category": "Bridge", "tvl_usd": 1448828504.72 }
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/bridges/:id/health"
            description={`Just the scoring metadata + one bridge's HealthScore, flattened (not nested under a "health" key like /v1/bridges/:id -- a real, easy-to-miss shape difference). 404 with {"error":"no score yet"} for both an unscored bridge AND an id that doesn't exist at all -- unlike /v1/bridges/:id, this route can't tell those two cases apart, since it only ever looks in the scores table, never the bridge registry.`}
            curl={`curl -s ${API_BASE}/v1/bridges/wormhole/health`}
            response={`{
  "scoring": { "algorithm": "v1-mixed", "description": "outflow_severity = z-score over a rolling 30-day distribution of 5-min bucket counts (z=4 -> severity 1.0); falls back to clamp(events_per_5min / 10, 0, 1) for the first ~4 hours of observations. parity_severity = 1 - min(origin, solana) / max(origin, solana) over a 5-min window (count proxy; USD-weighted parity per Appendix B follows once per-bridge ABI decoders populate amount_usd). signer / frontend / oracle stream live once their detectors are deployed.", "weights": { "parity": 40, "outflow": 25, "signer": 15, "frontend": 10, "oracle": 10 } },
  "bridge_id": "wormhole",
  "computed_at": "2026-08-08T19:30:05.176Z",
  "score": 90,
  "components": { "parity_severity": 0, "outflow_severity": 0, "signer_recency": 0, "frontend_recency": 0.989213, "oracle_staleness": 0 }
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/bridges/:id/history"
            description="Real score history for one bridge, from ?since= (ISO timestamp; optional, defaults to 24h ago) onward. That's the only query parameter -- there is no ?limit= on this route and no pagination. Real example: since=2026-08-08T00:00:00Z on wormhole returns 364 real entries (this bridge gets scored roughly every ~1min), not 2 -- expect and handle a large array."
            curl={`curl -s "${API_BASE}/v1/bridges/wormhole/history?since=2026-08-08T00:00:00Z"`}
            response={`{
  "bridge_id": "wormhole",
  "since": "2026-08-08T00:00:00Z",
  "history": [
    { "bridge_id": "wormhole", "computed_at": "2026-08-08T14:22:14.762Z", "score": 100, "components": { "parity_severity": 0, "outflow_severity": 0, "signer_recency": 0, "frontend_recency": 0, "oracle_staleness": 0 } },
    { "bridge_id": "wormhole", "computed_at": "2026-08-08T14:23:11.876Z", "score": 100, "components": { "parity_severity": 0, "outflow_severity": 0, "signer_recency": 0, "frontend_recency": 0, "oracle_staleness": 0 } }
    /* ... all 364 real entries for this real window, unpaginated. Full array, no truncation --
       this is genuinely everything scoreHistory() returns for the given since. */
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/events"
            description="Real detected anomaly + transfer events (signer_change, frontend_change, oracle_stale, lock/mint/burn/unlock), newest first. Complete real query parameter list, confirmed against the route handler: ?bridge= (exact bridge_id), ?type= (exact BridgeEventKind), ?chain= (exact chain id), ?since= (ISO timestamp), ?limit= (integer). All optional; no others exist. Every event also carries a real finality_anomaly_at_time (see /v1/network/finality below) -- true only if a real Finality Watch observation within 5s of this event's own event_time was itself flagged anomalous; purely descriptive, not a claim about this specific transaction."
            curl={`curl -s "${API_BASE}/v1/events?limit=1"`}
            response={`{
  "events": [
    { "id": "90a9ee82-dd2e-4688-a810-aeb52e0ac253", "bridge_id": "across", "event_time": "2026-08-10T20:01:20.956Z", "type": "lock", "chain": "solana", "asset": "unknown", "amount_usd": 0, "tx": "5PGc8soBEVnu4BXvT2PFg3yrrVcdFVWvEcCxuoG5ZeceMv8oXFDKZ3JmBJAy1iqY54QXLJ9uJkfZ2NVEXnWhLd64", "finality_anomaly_at_time": false }
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/registry"
            description="Every bridge we track (implemented and planned), independent of live health data -- chains supported, homepage, adapter status. No query parameters, no pagination -- this is genuinely the complete, real, current list, exactly 16 entries."
            curl={`curl -s ${API_BASE}/v1/registry`}
            response={`{
  "summary": { "total": 16, "implemented": 14, "planned": 2 },
  "implemented": [
    { "id": "wormhole", "name": "Wormhole", "homepage": "https://wormhole.com", "supportedChains": ["solana","ethereum","polygon","avalanche","arbitrum","optimism","bsc","base","sui","aptos"], "hasSolana": true, "status": "active" }
    /* ... all 14 real implemented ids, in this real order: wormhole, allbridge, debridge,
       layerzero, mayan, portal, axelar, relay, across, garden, base-solana-bridge, atomiq,
       rhinofi, orderly -- same shape as above for every one. */
  ],
  "planned": [
    { "id": "hyperlane", "name": "Hyperlane", "homepage": "https://hyperlane.xyz", "supportedChains": ["solana","ethereum","polygon","arbitrum","optimism","base"], "hasSolana": true, "status": "active" },
    { "id": "cctp", "name": "Circle CCTP", "homepage": "https://www.circle.com/en/usdc/bridge", "supportedChains": ["solana","ethereum","polygon","arbitrum","optimism","base","avalanche"], "hasSolana": true, "status": "active" }
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/weekly-digest"
            description="Trailing-7-day anomaly-event count and healthy/watch/alert tally across every monitored bridge — the same computation the Telegram weekly digest sends."
            curl={`curl -s ${API_BASE}/v1/weekly-digest`}
            response={`{
  "windowStart": "2026-08-03T10:03:35.927Z",
  "windowEnd": "2026-08-10T10:03:35.927Z",
  "anomalyEventCount": 128,
  "monitoredBridgeCount": 14,
  "bridgeHealthTally": { "healthy": 10, "watch": 4, "alert": 0, "unmonitored": 2 }
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/network/finality"
            description="Real observed Solana finality health -- 'Finality Watch' (see the on-page explainer above). latest is the most recent real confirmed->finalized observation; rollingBaselineMs is the real trailing-hour median (null under 5 real samples); isAnomalous is true only when latest exceeds that baseline by 3x. No query parameters."
            curl={`curl -s ${API_BASE}/v1/network/finality`}
            response={`{
  "latest": { "slot": 438465853, "confirmedAt": "2026-08-10T20:01:07.707Z", "finalizedAt": "2026-08-10T20:01:20.948Z", "elapsedMs": 13241 },
  "rollingBaselineMs": 12221.5,
  "sampleCount": 122,
  "windowStart": "2026-08-10T19:08:34.915Z",
  "isAnomalous": false,
  "anomalousBridgeEventsLastHour": 0,
  "note": "rollingBaselineMs and isAnomalous are computed from real observed data only"
}`}
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              WebSocket — GET /v1/ws
            </p>
            <p className="text-sm text-text-secondary">
              Live event stream. Sends a real <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">hello</code>{" "}
              on connect, then pushes every new <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">bridge_event</code> row
              as it's indexed (the API polls its own store every 1s, no separate notify mechanism).
            </p>
            <CodeBlock
              language="javascript"
              code={`const ws = new WebSocket("${API_BASE.replace("http", "ws")}/v1/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
// real first message: {"kind":"hello","data":{"server_time":"2026-08-09T20:17:14.013Z"}}`}
            />
          </div>

          <div className="space-y-3 border-t border-border-subtle pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Real error responses
            </p>
            <p className="text-sm text-text-secondary">
              Every error is a real JSON body shaped <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">{"{ error: string }"}</code>,
              sometimes with a <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">detail</code> field
              — read from the actual route handlers, not guessed:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-muted-dark">
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Where</th>
                    <th className="py-2 font-medium">Real body</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {[
                    ["404", "/v1/bridges/:id", `{"error":"bridge not found"}`],
                    ["404", "/v1/bridges/:id/health", `{"error":"no score yet"} -- for an unscored bridge or an unknown id alike`],
                    ["404", "/widget/health/:bridgeId", `{"error":"unknown bridge \\"<id>\\""}`],
                    ["404", "any unmatched route", `{"error":"not found"}`],
                    ["400", "wallet-activity / wallet-holdings / wallet-timeline / streak / game-scores", `{"error":"invalid Solana address"}` + " / " + `"wallet_address must be a real, valid Solana address"`],
                    ["400", "/v1/defillama/price/:mint", `{"error":"invalid mint address"}`],
                    ["400", "wallet-activity / wallet-timeline", `{"error":"limit must be a number"}`],
                    ["400", "/v1/game-scores", `{"error":"score must be an integer between 0 and 100000"}` + " (and matching messages for blocks_used / distance)"],
                    ["501", "/v1/wallet-timeline/:address", `{"error":"not configured","detail":"..."} -- no HELIUS_API_KEY / non-Helius SOLANA_RPC_URL. Never a degraded fake classification.`],
                    ["502", "wallet-activity / wallet-holdings / wallet-timeline", `{"error":"failed to fetch wallet ...","detail":"<real underlying error message>"}`],
                    ["503", "wallet-activity / wallet-holdings / wallet-timeline", `{"error":"...rate-limited...","detail":"real guidance to set a paid SOLANA_RPC_URL"}`],
                  ].map(([status, where, body], i) => (
                    <tr key={i} className="border-b border-border-subtle/50 align-top">
                      <td className="py-2 pr-4 font-mono text-xs text-accent">{status}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{where}</td>
                      <td className="py-2 font-mono text-[11px] text-muted-dark">{body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-dark">
              No API key and no rate limiting enforced by Bridge Radar itself on any route today (noted at the
              top of this section) — the 503s above come from the upstream Solana RPC being rate-limited, not
              from us.
            </p>
          </div>
        </section>
      </Reveal>

      {/* ── Embeddable widget ───────────────────────────────────────────── */}
      <Reveal>
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">Embeddable health badge</h2>
            <p className="mt-1.5 text-sm text-muted">
              One script tag, vanilla JS, no framework or build step required on your site. Polls the
              real live score every 30s.
            </p>
          </div>

          <CodeBlock
            language="html"
            code={`<script src="${API_BASE}/widget.js" data-bridge="wormhole"></script>`}
          />

          <div className="glass-card-elevated space-y-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">Live, on this actual page</p>
            <p className="text-sm text-text-secondary">
              The badge below is the real widget script, embedded on this real page right now — not a
              screenshot or a mockup:
            </p>
            <div className="pt-1">
              <WidgetEmbedDemo apiBase={API_BASE} bridgeIds={["wormhole", "allbridge"]} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Every real data-* attribute — two, no more
            </p>
            <p className="text-sm text-text-secondary">
              Read straight from <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">apps/api/src/widget.ts</code>:{" "}
              the whole script reads exactly two attributes off its own <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">&lt;script&gt;</code> tag.
              There is no color/size/theme override, no custom label text, no other data attribute — the badge's
              inline styles are fixed in the script itself.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-muted-dark">
                    <th className="py-2 pr-4 font-medium">Attribute</th>
                    <th className="py-2 pr-4 font-medium">Required</th>
                    <th className="py-2 font-medium">Real behavior</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  <tr className="border-b border-border-subtle/50 align-top">
                    <td className="py-2 pr-4 font-mono text-xs text-accent">data-bridge</td>
                    <td className="py-2 pr-4 text-xs">Yes</td>
                    <td className="py-2 text-xs">
                      Bridge id to query. If missing, the script silently returns and renders nothing at all —
                      no badge, no error in the DOM.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="py-2 pr-4 font-mono text-xs text-accent">data-api</td>
                    <td className="py-2 pr-4 text-xs">No</td>
                    <td className="py-2 text-xs">
                      Defaults to the script tag's own origin (<code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">new URL(script.src).origin</code>).
                      Set this when the widget script is served from a different host than the API.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Real states — exactly what renders, from the actual source
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-secondary">
              <li>
                <strong className="text-text">On load:</strong> a grey dot and "Bridge Radar: loading…", immediately, before the
                first fetch resolves.
              </li>
              <li>
                <strong className="text-text">On a successful response:</strong> the dot becomes green/yellow/red per the real{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">band</code> field (grey for any
                unrecognized band, e.g. <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">"unmonitored"</code>),
                and the label becomes exactly <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">{"{displayName}: {score} · {Healthy|Watch|Alert}"}</code> —
                or an em dash instead of the score when <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">score</code> is null.
              </li>
              <li>
                <strong className="text-text">Invalid bridge id, unreachable API, or any other fetch failure — identical fallback:</strong> grey
                dot, "Bridge Radar: unavailable". The script's single <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">.catch()</code> doesn't
                distinguish a real 404 (bad bridge id) from a network error (API down) — both render exactly the same text. If you need to
                tell those apart, call <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">GET /widget/health/:bridgeId</code> yourself
                instead of embedding the script.
              </li>
              <li>
                <strong className="text-text">Every 30s after that,</strong> forever, via <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">setInterval</code> — no
                backoff, no max-retry cutoff.
              </li>
            </ul>
          </div>

          <p className="text-xs text-muted-dark">
            Data comes from a real, openly-CORS'd <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">GET /widget/health/:bridgeId</code>,
            separate from the restricted-origin <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">/v1/*</code> routes
            above. Real source: <Link className={linkClass} href={`${REPO}/blob/master/apps/api/src/widget.ts`}>apps/api/src/widget.ts</Link>.
          </p>
        </section>
      </Reveal>

      {/* ── On-chain oracle ─────────────────────────────────────────────── */}
      <Reveal>
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">On-chain oracle</h2>
            <p className="mt-1.5 text-sm text-muted">
              A real deployed Anchor program on <span className="text-yellow">Solana Devnet</span> —
              not mainnet. Single-attester model (v1); dApps read the PDA directly, no API dependency.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="glass-card-elevated p-4">
              <dt className="text-[11px] uppercase tracking-wide text-muted-dark">Program ID</dt>
              <dd className="mt-1 break-all font-mono text-xs text-accent">6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM</dd>
            </div>
            <div className="glass-card-elevated p-4">
              <dt className="text-[11px] uppercase tracking-wide text-muted-dark">Network</dt>
              <dd className="mt-1 text-sm text-text">Solana Devnet</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Read a bridge's real on-chain score
            </p>
            <CodeBlock
              language="typescript"
              code={`import { Connection, PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

const PROGRAM_ID = new PublicKey("6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM");
const connection = new Connection("https://api.devnet.solana.com");

const bridgeIdHash = sha256(new TextEncoder().encode("wormhole"));
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("health"), Buffer.from(bridgeIdHash)],
  PROGRAM_ID,
);

const info = await connection.getAccountInfo(pda);
// Account layout (BridgeHealth, after the 8-byte Anchor discriminator):
//   bridge_id: [u8; 32]  (offset 8)
//   score: u8            (offset 40)
//   last_updated: i64    (offset 41)
//   attester: Pubkey     (offset 49)
//   bump: u8             (offset 81)
const score = info.data[40];
const lastUpdated = info.data.readBigInt64LE(41);`}
            />
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface/50 p-4 text-xs text-muted-dark">
            Real reading, verified live against Devnet while writing this page: <span className="font-mono text-text-secondary">wormhole</span> score 55,{" "}
            <span className="font-mono text-text-secondary">allbridge</span> score 97,{" "}
            <span className="font-mono text-text-secondary">portal</span> score 97 — all last updated 2026-04-26, so honestly stale
            by the program's own &gt;10-minute freshness rule (the attester isn't continuously running against
            Devnet in this environment). The PDA read above is real; treat the specific numbers as a point-in-time
            snapshot, not a live feed.
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Complete account structure — BridgeHealth (82 bytes incl. discriminator)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-muted-dark">
                    <th className="py-2 pr-4 font-medium">Field</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 font-medium">Real meaning</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {[
                    ["bridge_id", "[u8; 32]", "sha256(bridge slug) — the PDA seed, not a display name."],
                    ["score", "u8", "0..=100. 0 means \"no score yet,\" not \"perfectly unhealthy.\""],
                    ["last_updated", "i64", "Unix timestamp of the last update_health call. The program's own doc comment says treat scores older than ~10 minutes as stale."],
                    ["attester", "Pubkey", "The only key allowed to call update_health / rotate_attester for this bridge."],
                    ["bump", "u8", "PDA bump seed."],
                  ].map(([field, type, meaning], i) => (
                    <tr key={i} className="border-b border-border-subtle/50 align-top">
                      <td className="py-2 pr-4 font-mono text-xs text-accent">{field}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{type}</td>
                      <td className="py-2 text-xs">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Every real instruction — three, all attester-gated except registration
            </p>
            <CodeBlock
              language="rust"
              code={`init_bridge(bridge_id: [u8; 32], attester: Pubkey)
// Permissionless -- anyone can register a bridge by funding its PDA
// (init, payer = whoever calls it). Sets score = 0, last_updated = 0,
// bump = ctx.bumps.health. Emits BridgeRegistered { bridge_id, attester }.
// Accounts: health (PDA, init), payer (mut signer), system_program.

update_health(bridge_id: [u8; 32], score: u8)
// Attester-only: requires attester.key() == health.attester exactly,
// else RadarError::Unauthorized. Requires score <= 100, else
// RadarError::InvalidScore. Sets score + last_updated = Clock::get()?
// .unix_timestamp. Emits HealthUpdated { bridge_id, prev_score, score,
// timestamp }. Accounts: health (mut, PDA re-derived from seeds+bump),
// attester (signer).

rotate_attester(bridge_id: [u8; 32], new_attester: Pubkey)
// Attester-only (same Unauthorized check as update_health) -- the
// *current* attester must sign to hand off to a new one. Overwrites
// health.attester. Real detail: unlike the other two, this emits no
// event at all. Accounts: health (mut), attester (signer).`}
            />
            <p className="text-xs text-muted-dark">
              Two real error codes: <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">Unauthorized</code> ("only the
              registered attester can perform this action") and{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">InvalidScore</code> ("score must be between 0
              and 100 inclusive"). Two real events: <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">BridgeRegistered</code>{" "}
              and <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">HealthUpdated</code> (fields shown above) —
              those are the only two; <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">rotate_attester</code> emits
              nothing.
            </p>
          </div>

          <p className="text-xs text-muted-dark">
            Real source: <Link className={linkClass} href={`${REPO}/blob/master/programs/radar-oracle/src/lib.rs`}>programs/radar-oracle/src/lib.rs</Link>
          </p>
        </section>
      </Reveal>
    </article>
  );
}

function ApiEndpoint({
  method,
  path,
  description,
  curl,
  response,
}: {
  method: string;
  path: string;
  description: string;
  curl: string;
  response: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="badge text-[11px] text-accent">{method}</span>
        <code className="font-mono text-sm text-text">{path}</code>
      </div>
      <p className="text-sm text-text-secondary">{description}</p>
      <CodeBlock language="bash" code={curl} />
      <CodeBlock language="json" code={response} />
    </div>
  );
}
