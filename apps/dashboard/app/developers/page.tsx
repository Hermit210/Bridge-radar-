import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { CodeBlock } from "@/components/code-block";
import { WidgetEmbedDemo } from "@/components/widget-embed-demo";
import { listRegistry } from "@/lib/api";

export const metadata = { title: "Developers — Bridge Radar" };

const REPO = "https://github.com/Hermit210/Bridge-radar-";
// Real, current dev API base — there is no live production deployment yet
// (no vercel.json/CI deploy workflow in this repo, and DEPLOYMENT.md is
// explicit that nothing here has been run against a live server). Every
// example on this page targets this real, running-right-now URL rather
// than inventing a domain that doesn't exist. Swap this once one does.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
          yourself. No live production deployment exists yet — every URL below points at a real
          API running locally right now (<code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">{API_BASE}</code>),
          not a placeholder domain.
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
            Published on npm — <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">@bridge-radar/sdk@0.1.0</code>,
            public, zero unresolvable dependencies. Verify yourself:{" "}
            <Link className={linkClass} href="https://www.npmjs.com/package/@bridge-radar/sdk">npmjs.com/package/@bridge-radar/sdk</Link>.
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">Install</p>
            <CodeBlock language="bash" code={`npm install @bridge-radar/sdk`} />
            <p className="text-xs text-muted-dark">
              No hosted production API exists yet (see DEPLOYMENT.md), so <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">getBridgeHealth()</code> takes
              the API URL as an explicit argument rather than baking in a default that doesn't exist —
              every example below points at <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">{API_BASE}</code>,
              a real API running locally right now. Point it at your own instance, or at our production URL once one is deployed.
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
              public GET. (That will very likely change before a real production deployment; this page
              reflects the code as it stands.)
            </p>
          </div>

          <ApiEndpoint
            method="GET"
            path="/v1/bridges"
            description="Every monitored bridge with its latest real health score and DeFiLlama TVL cross-reference."
            curl={`curl -s ${API_BASE}/v1/bridges`}
            response={`{
  "scoring": { "algorithm": "v1-mixed", "weights": { "parity": 40, "outflow": 25, "signer": 15, "frontend": 10, "oracle": 10 }, ... },
  "bridges": [
    {
      "id": "wormhole",
      "display_name": "Wormhole",
      "homepage": "https://wormhole.com",
      "enabled": true,
      "health": {
        "bridge_id": "wormhole",
        "computed_at": "2026-08-08T19:30:05.176Z",
        "score": 90,
        "components": { "parity_severity": 0, "outflow_severity": 0, "signer_recency": 0, "frontend_recency": 0.989213, "oracle_staleness": 0 }
      }
    },
    // ... 15 more real bridges
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/bridges/:id"
            description="One bridge's real health score plus its real DeFiLlama TVL."
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
            path="/v1/bridges/:id/history"
            description="Real score history for one bridge since a given ISO timestamp."
            curl={`curl -s "${API_BASE}/v1/bridges/wormhole/history?since=2026-08-08T00:00:00Z"`}
            response={`{
  "bridge_id": "wormhole",
  "since": "2026-08-08T00:00:00Z",
  "history": [
    { "bridge_id": "wormhole", "computed_at": "2026-08-08T14:22:14.762Z", "score": 100, "components": { ... } },
    { "bridge_id": "wormhole", "computed_at": "2026-08-08T14:23:11.876Z", "score": 100, "components": { ... } }
    // ... every real score computed since the given timestamp
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/events"
            description="Real detected anomaly + transfer events (signer_change, frontend_change, oracle_stale, lock/mint/burn/unlock), newest first. Filter with ?bridge=, ?type=, ?chain=, ?since=, ?limit=."
            curl={`curl -s "${API_BASE}/v1/events?limit=2"`}
            response={`{
  "events": [
    { "id": "9866bde5-...", "bridge_id": "portal", "event_time": "2026-08-08T19:50:10.419Z", "type": "frontend_change", "region": "default", "new_hash": "125377...", "old_hash": "201508..." },
    { "id": "23f83f96-...", "bridge_id": "wormhole", "event_time": "2026-08-08T19:50:10.127Z", "type": "frontend_change", "region": "default", "new_hash": "8d9970...", "old_hash": "d4c0f5..." }
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/registry"
            description="Every bridge we track (implemented and planned), independent of live health data — chains supported, homepage, adapter status."
            curl={`curl -s ${API_BASE}/v1/registry`}
            response={`{
  "summary": { "total": 16, "implemented": 14, "planned": 2 },
  "implemented": [
    { "id": "wormhole", "name": "Wormhole", "homepage": "https://wormhole.com", "supportedChains": ["solana","ethereum","polygon", ...], "hasSolana": true, "status": "active" },
    // ... 13 more
  ],
  "planned": [ /* real bridges without a live adapter yet */ ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/v1/weekly-digest"
            description="Trailing-7-day anomaly-event count and healthy/watch/alert tally across every monitored bridge — the same computation the Telegram weekly digest sends."
            curl={`curl -s ${API_BASE}/v1/weekly-digest`}
            response={`{
  "windowStart": "2026-08-02T18:46:49.699Z",
  "windowEnd": "2026-08-09T18:46:49.699Z",
  "anomalyEventCount": 128,
  "monitoredBridgeCount": 14,
  "bridgeHealthTally": { "healthy": 10, "watch": 4, "alert": 0, "unmonitored": 2 }
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

          <p className="text-xs text-muted-dark">
            Add <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">data-api="https://your-api-host"</code> if
            you're serving the script from a different host than the API. Data comes from a real,
            openly-CORS'd <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent">GET /widget/health/:bridgeId</code>,
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
