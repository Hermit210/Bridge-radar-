# Architecture

> Engineering view of the system. For motivation and product framing, see [WHITEPAPER.md](./WHITEPAPER.md).

## Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│ Solana RPC ──┐                                                        │
│ EVM RPCs   ──┼─► Indexers (Rust) ──► Storage ──► Detectors ──► Scorer │
│ Cosmos     ──┘                          │                       │     │
│                                         ▼                       ▼     │
│                                    API gateway (TS) ──► Dashboard     │
│                                         │                             │
│                                         ▼                             │
│                                  Webhook / TG / Discord               │
│                                         │                             │
│                                         ▼                             │
│                                  Attester ──► Anchor oracle on Solana │
└───────────────────────────────────────────────────────────────────────┘
```

## Crate-by-crate

### `radar-core`

Shared types, the `Storage` trait, and per-bridge adapters. Every other crate depends on this. The `BridgeEvent` enum is the central contract — once an event is normalized into `BridgeEvent`, no downstream consumer cares which chain or bridge it came from.

### `radar-indexer-solana`

Subscribes to Solana logs via WebSocket `logsSubscribe` for each registered bridge program. On disconnect: exponential backoff + reconnect; in steady state also polls `getSignaturesForAddress` as a redundancy check (public RPC drops events). Each decoded event is normalized to `BridgeEvent` and pushed to `Storage`.

### `radar-indexer-evm`

Same shape as Solana side, against EVM JSON-RPC + log filters. Reorg-safe via N-block confirmation buffer (default 12 on mainnet, configurable per chain).

### `radar-scorer`

Single binary that wakes every 60s, reads the last 5 minutes of events per
bridge, computes the v0-naive severities inline, and persists a row to
`bridge_health_scores` (whitepaper §4.4 weighting).

v0 detector status:
- **Parity** — count proxy: `1 - min(origin, solana) / max(origin, solana)`
  over the 5-minute window. v1 swaps in USD-weighted parity per appendix B
  once Pyth pricing is wired into the indexer's amount field.
- **Outflow** — `clamp(events_in_5min / baseline, 0, 1)` with `baseline=10`.
  v1 swaps in the rolling-30-day z-score from §4.3.
- **Signer / Frontend / Oracle** — stay at 0.0 in v0. The Detector trait
  surface (`crates/radar-core/src/adapter.rs`-adjacent) is reserved for v1
  when the detector list is large enough to factor out of the scorer.

The score row stores every component, so any score is fully auditable
backwards from the API.

### v1 crates (not yet implemented)

- `radar-detectors` — once the detector list grows, factor out of scorer.
- `radar-attester` — reads scores, signs `update_health` to the oracle.
  Single attester in v1 of the deployed system; v2 is multi-attester quorum.
- `radar-cli` — operator commands: backfill, replay, vacuum, signer-set seed.

## Storage

v0 dev: SQLite at `./data/radar.db` — zero-setup local loop.
v1 prod: Postgres + Timescale (hypertable on `bridge_events`, retention policies).

Both implement the same `Storage` trait. Migration files in `migrations/` target Postgres; SQLite uses an inline schema baked into the SQLite impl. They are kept logically equivalent — column names match — so the same `Storage` impl signatures work.

## API gateway (`apps/api`)

Hono on Bun/Node. Endpoints:

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| GET    | `/v1/bridges`                 | List of bridges + current health         |
| GET    | `/v1/bridges/:id`             | Bridge detail (config + signer set)      |
| GET    | `/v1/bridges/:id/health`      | Current Health Score + components        |
| GET    | `/v1/bridges/:id/history`     | Score history (paginated)                |
| GET    | `/v1/events`                  | Event stream (filterable, paginated)     |
| GET    | `/v1/ws`                      | WebSocket — live event + score push      |

Free, rate-limited (60 req/min anonymous; higher with API key). API keys are not implemented in v0.

## Dashboard (`apps/dashboard`)

Next.js 15 (app router) + Tailwind + shadcn/ui + Recharts. Pages:

- `/` — bridge cards (color-coded health), 24h event count, live ticker
- `/bridges/[id]` — detail: score history chart, component breakdown, recent events table
- `/events` — searchable global event feed
- `/about` — link to whitepaper

## On-chain oracle (`programs/radar-oracle`)

Anchor program. PDA seeds: `[b"health", bridge_id]`. Account layout:

```rust
#[account]
pub struct BridgeHealth {
    pub bridge_id: [u8; 32],
    pub score: u8,
    pub last_updated: i64,
    pub attester: Pubkey,
}
```

Instructions:

- `init_bridge(bridge_id, attester)` — creates the PDA. Permissionless (anyone can register a bridge).
- `update_health(bridge_id, score)` — only callable by the registered attester. Bumps `last_updated`.

dApps consume via CPI:

```rust
let health = bridge_radar::read_health(ctx, bridge_id)?;
require!(health.score >= 70, MyError::BridgeUnhealthy);
require!(Clock::get()?.unix_timestamp - health.last_updated < 600, MyError::StaleHealth);
```

Trust model: single attester in v1, key disclosed and rotatable. v2 is multi-attester quorum.

## Reliability assumptions

- **Public RPC drops events.** Indexer must reconcile with `getSignaturesForAddress` periodically.
- **Bridges may rename programs / migrate.** Adapter trait isolates each bridge's IDs — swap in one place.
- **Detector windows are causal.** A detector at time T sees events with `block_time <= T - confirmations`. No future leakage.
- **Score decays.** Old anomalies stop hurting the score after 24h (signer) / 6h (frontend). See `radar-scorer/src/decay.rs`.

## Out of scope (v1)

Slashable attester network, ML detectors, insurance, mobile-native app, bridges with no Solana leg. See whitepaper §5.2.
