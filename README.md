# Bridge Radar

**Real-time bridge-health intelligence layer for Solana.** Open source, public good, no token, no equity, no premine.

Bridge Radar watches every cross-chain bridge with a Solana leg, in real time, and answers one question honestly: **is this bridge healthy right now?** Everything on the site — every score, every event, every chart — is computed from data this project's own indexers actually observed on real Solana mainnet (plus real EVM chains for the origin side of each transfer). Nowhere in this codebase is a number invented, mocked, or hardcoded and presented as live. Where real data isn't available yet, the site says so explicitly instead of guessing.

Built by [Saloni Khan](https://github.com/Hermit210). Grant application in progress with Solana Foundation India.

---

## Table of contents

1. [Why this exists](#why-this-exists)
2. [What's real, right now](#whats-real-right-now)
3. [Architecture](#architecture)
4. [Repository map](#repository-map)
5. [The five detectors + Health Score model](#the-five-detectors--health-score-model)
6. [Finality Watch](#finality-watch)
7. [Bridge registry](#bridge-registry)
8. [REST + WebSocket API](#rest--websocket-api)
9. [On-chain oracle](#on-chain-oracle)
10. [SDKs — `@bridge-radar/sdk` and `@bridge-radar/fetch`](#sdks--bridge-radarsdk-and-bridge-radarfetch)
11. [Dashboard](#dashboard)
12. [Wallet layer (`/my-activity`)](#wallet-layer-my-activity)
13. [Bridge Race (mini-game)](#bridge-race-mini-game)
14. [Alerting — Telegram, Discord, webhooks](#alerting--telegram-discord-webhooks)
15. [DeFiLlama data sync](#defillama-data-sync)
16. [Storage](#storage)
17. [Quick start / running it locally](#quick-start--running-it-locally)
18. [Testing](#testing)
19. [Deployment status](#deployment-status)
20. [Security](#security)
21. [Known gaps (honest, not hidden)](#known-gaps-honest-not-hidden)
22. [Contributing](#contributing)
23. [Docs index](#docs-index)
24. [License](#license)

---

## Why this exists

Cross-chain bridges concentrate enormous value behind a small number of trust assumptions — a multisig, an oracle feed, a frontend bundle. When one of those breaks, funds move before anyone notices. Over $2.8B has been lost to bridge exploits industry-wide since 2020 (a historical, industry-wide figure — not something Bridge Radar measured itself). Most of those exploits emitted detectable signals — anomalous outflows, signer rotations, parity breaks, frontend drift — minutes to days before the drain completed. No public, real-time, neutral, Solana-focused service aggregated them. Bridge Radar exists to surface those signals before a hack completes, not after — purely descriptive, never predictive or advisory. It does not claim to detect or prevent any specific incident.

## What's real, right now

- **16 bridges tracked** in the registry (`GET /v1/registry`): **14 with a real, mainnet-verified Solana adapter** (Wormhole, Allbridge, deBridge, LayerZero, Mayan, Portal, Axelar, Relay, Across Protocol, Garden Finance, Coinbase Bridge/Base-Solana, Atomiq Exchange, rhino.fi, Orderly Network), plus **2 genuine bridges honestly marked "not monitored"** (Circle CCTP, Hyperlane — real bridges, no verified Solana program ID disclosed yet). Every implemented adapter's program ID was confirmed via a direct `getAccountInfo` RPC call against mainnet (never a scraped summary alone), with at least one unit test decoded from a real historical mainnet transaction. Full verification trail: [`BRIDGE_DISCOVERY.md`](./BRIDGE_DISCOVERY.md).
- **5 real detectors**, all wired into the live score as of 2026-08-01: lock/mint parity, outflow anomaly (z-score), signer-set change, frontend bundle-hash drift, oracle staleness.
- **Finality Watch** (added 2026-08-11): real-time tracking of Solana's actual observed confirmed→finalized latency, relevant to the ongoing TowerBFT→Alpenglow consensus transition — see its own section below.
- **Postgres + TimescaleDB in production**, live and verified end-to-end as of 2026-08-08 — every Rust binary and the Node API dispatch through the same `Storage`/`RadarDb` abstraction to either Postgres or a zero-setup SQLite dev default.
- **A real on-chain oracle** (Anchor program) on Solana **Devnet** — not mainnet yet, and the site says so everywhere the oracle is mentioned.
- **Two published npm packages**: [`@bridge-radar/sdk`](https://www.npmjs.com/package/@bridge-radar/sdk) and [`@bridge-radar/fetch`](https://www.npmjs.com/package/@bridge-radar/fetch) — both real, public, installable right now.
- **Live alert delivery** confirmed for real on both Discord (real HTTP 204) and Telegram (real `sendMessage` reply with a real `message_id`), including a real Telegram bot (`@bruhalert_bot`) answering `/start`, `/status`, `/help`.
- **A wallet-facing layer** (`/my-activity`) with 9 features built entirely on Bridge Radar's own unique data, plus a single-player mini-game (Bridge Race).

See [`PROGRESS.md`](./PROGRESS.md) for the full, dated, honest build log — what's proven vs. what's still pending, updated as things change.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Solana RPC (mainnet, Helius)  ──┐                                         │
│  EVM RPCs (6 chains)            ─┼─► Indexers (Rust) ──► Storage ──► Scorer│
│                                   │        │                          │    │
│                                   │        ▼                          ▼    │
│                                   │  Watchers (signer/frontend/oracle)│    │
│                                   │        │                               │
│                                   ▼        ▼                               │
│                            API gateway (Hono/TS) ──► Dashboard (Next.js)  │
│                                   │                                        │
│                                   ├──► Alerter ──► Telegram / Discord / WH │
│                                   │                                        │
│                                   └──► Attester ──► Anchor oracle (Devnet) │
└────────────────────────────────────────────────────────────────────────────┘
```

Two independent storage implementations exist for the same schema — a Rust `Storage` trait (`crates/radar-core/src/storage/{sqlite,postgres}.rs`) written to by every Rust binary, and a TypeScript `RadarDb` interface (`apps/api/src/db.ts`) read by the API — kept logically equivalent (same column names, same row shapes) but implemented independently since Node and Rust don't share a storage layer. Both dispatch on `DATABASE_URL`'s scheme (`sqlite://` vs anything else) the same way.

## Repository map

Every real source directory in this monorepo, with what actually lives in it:

```
bridge-radar/
├── crates/                          Rust cargo workspace (8 binaries + 1 shared lib)
│   ├── radar-core/                  Shared types, Storage trait, adapters — everything else depends on this
│   │   └── src/
│   │       ├── lib.rs                 Crate root, re-exports
│   │       ├── event.rs               BridgeEvent enum — the canonical cross-chain event contract
│   │       ├── health.rs              HealthScore / HealthComponents / HealthBand types
│   │       ├── finality.rs            Finality Watch: observation model + rolling-median anomaly logic
│   │       ├── chain.rs               ChainId enum (Solana + 6 EVM chains + more)
│   │       ├── adapter.rs             BridgeAdapter trait every bridge implements
│   │       ├── pricing.rs             Pyth Hermes price client (amount_to_usd)
│   │       ├── defillama/             DeFiLlama client + response types (9 data categories)
│   │       ├── storage.rs             Storage trait definition + connect_any() dispatcher
│   │       ├── storage/sqlite.rs      SQLite impl (zero-setup dev default, inline schema)
│   │       ├── storage/postgres.rs    Postgres + Timescale impl (production)
│   │       └── bridges/               One file per bridge adapter (14 real + 2 disabled)
│   │           ├── wormhole.rs, allbridge.rs, debridge.rs, layerzero.rs, mayan.rs,
│   │           │   portal.rs, axelar.rs, relay.rs, across.rs, garden.rs,
│   │           │   base_solana.rs, atomiq.rs, rhinofi.rs, orderly.rs   (real, enabled)
│   │           ├── cctp.rs, hyperlane.rs                                (real bridges, disabled — no verified program ID yet)
│   │           └── mod.rs                                               registry() — the list indexers iterate
│   ├── radar-indexer-solana/        Solana event tap — mainnet
│   │   └── src/  main.rs (entrypoint, spawns 3 tasks) · ws.rs (logsSubscribe + reconnect/backoff)
│   │             · poll.rs (getSignaturesForAddress reconciliation) · finality.rs (Finality Watch tracker)
│   ├── radar-indexer-evm/           EVM event tap — eth_getLogs poller, 6 chains, 12-block confirmation buffer
│   ├── radar-watchers/              Signer-set diff + frontend-hash drift + oracle-staleness detectors
│   │   └── src/  main.rs · signer.rs · frontend.rs · oracle.rs
│   ├── radar-scorer/                Wakes every 60s, computes the weighted Health Score, writes it
│   ├── radar-defillama/             Syncs 9 DeFiLlama data categories into defillama_cache on independent schedules
│   ├── radar-attester/              Reads scores, pushes update_health to the on-chain oracle (Devnet)
│   └── radar-alerter/               Telegram + Discord + webhook fan-out, plus inbound Telegram bot commands
│       └── src/  main.rs · commands.rs (/start /status /help, long-polling getUpdates)
│
├── apps/
│   ├── api/                         Hono REST + WebSocket gateway (Node)
│   │   └── src/
│   │       ├── index.ts               Every route handler — see API reference below
│   │       ├── db.ts                  RadarDb interface + SqliteRadarDb + PostgresRadarDb impls
│   │       ├── bridges.ts             Bridge registry metadata (identity only — no invented TVL, see history)
│   │       ├── defillama-store.ts     Real-time single-asset price passthrough (Pyth via DeFiLlama)
│   │       ├── wallet-activity.ts     Wallet ↔ bridge-program transaction matching
│   │       ├── wallet-holdings.ts     Real SOL + SPL balance snapshot
│   │       ├── wallet-timeline.ts     Full transaction history via Helius Enhanced Transactions API
│   │       ├── weekly-digest.ts       Shared computation behind /v1/weekly-digest and the Telegram digest
│   │       ├── telegram-digest.ts     Scheduled weekly digest sender (real subscriber fan-out)
│   │       ├── widget.ts              The embeddable health-badge script (served as literal JS, zero deps)
│   │       ├── config.ts / load-env.ts  Env loading (root .env, never per-app)
│   │       └── scripts/send-weekly-digest.ts  Manual trigger for the weekly digest
│   │
│   └── dashboard/                   Next.js 15 (app router) + Tailwind
│       └── app/
│           ├── page.tsx                 Homepage — hero, live status strip, Finality Watch panel, 3D globe, detectors
│           ├── bridges/page.tsx         Bridge list — filterable/sortable cards, Finality Watch widget
│           ├── bridges/[id]/page.tsx    Bridge detail — score history chart, component breakdown, events
│           ├── bridges/compare/page.tsx Side-by-side bridge comparison
│           ├── events/page.tsx          Global searchable event feed
│           ├── network/page.tsx         Finality Watch dedicated page — real-time chart, anomaly list, explainer
│           ├── network/finality-chart.tsx  The real-time recharts area chart (anomalies marked red)
│           ├── my-activity/page.tsx     Wallet layer — 9 features + Bridge Race, see below
│           ├── developers/page.tsx      Full real API/SDK/widget/oracle docs, real curl examples throughout
│           ├── about/page.tsx           What Bridge Radar is, architecture, Finality & Alpenglow explainer
│           └── layout.tsx               Root layout — nav, footer, wallet providers, fonts
│       └── components/                40+ hand-built components (no UI component library) — bridge-globe,
│                                       bridge-marquee, health-card, event-row, finality-status-panel,
│                                       bridge-race/ (Phaser mini-game), wallet-connect-button, and more
│       └── lib/                       api.ts (typed fetch client for every endpoint) · use-count-up.ts
│
├── packages/
│   ├── shared/                      TypeScript mirror of radar-core's types (BridgeEvent, HealthScore, bandOf) —
│   │                                 used internally by apps/api and apps/dashboard, workspace-private, never published
│   ├── sdk/                         @bridge-radar/sdk — published on npm, see SDK section below
│   └── fetch/                       @bridge-radar/fetch — published on npm, see SDK section below
│
├── programs/
│   └── radar-oracle/                Anchor program (Devnet) — src/lib.rs, 3 instructions, see oracle section
│
├── migrations/                      Postgres + Timescale DDL, applied in order (0001–0011)
│                                     0001 init (bridges/events/scores/parity/signer_sets/frontend_hashes)
│                                     0002 defillama_cache · 0003–0007 bridge seeds
│                                     0008 game_scores · 0009 user_streaks · 0010 telegram_subscriptions
│                                     0011 finality_observations
│
├── deploy/systemd/                  9 real, syntax-validated systemd unit files (one per long-running process)
├── docker-compose.yml                Postgres+Timescale + Redis, real and running
│
├── ARCHITECTURE.md                  Engineering view — layers, crate-by-crate, reliability assumptions
├── WHITEPAPER.md                    Motivation, product framing, the full Health Score formula derivation
├── PROGRESS.md                      The definitive, dated, honest build log
├── HEALTH_SCORE_STATUS.md           Full writeup of the score-model fixes and real before/after proof
├── BRIDGE_REGISTRY.md               Full bridge list + how to add more
├── BRIDGE_DISCOVERY.md              Verification trail for every bridge candidate ever evaluated (built or not)
├── BRIDGE_ADAPTER_GUIDE.md          How to write a new adapter
├── DEPLOYMENT.md                    Real deployment guide
├── CONTRIBUTING.md                  Dev loop, adapter contribution guide, commit style
└── TASK4_STATUS.md                  Status of the deployment-infra task specifically
```

## The five detectors + Health Score model

`crates/radar-watchers` produces real events for three of these; `radar-scorer` computes the other two directly from ingested `BridgeEvent`s. Every 60 seconds, `radar-scorer` reads the last window of real events per bridge and writes one `HealthScore` row:

```
HealthScore = 100
  − 40 × parity_severity     (lock-vs-mint imbalance, count proxy in v0)
  − 25 × outflow_severity    (z-score over a rolling 30-day baseline; clamp(events/10) for the first ~4h)
  − 15 × signer_recency      (0..1, decays linearly over 24h since the last real signer_change event)
  − 10 × frontend_recency    (0..1, decays linearly over 6h since the last real frontend_change event)
  − 10 × oracle_staleness    (0..1, decays linearly over 5min since the last real oracle_stale event)
```

All 5 components have been real and live since 2026-08-01 — before that fix, signer/frontend/oracle were hardcoded to `0.0` even though `radar-watchers` was already producing real events for them, so a real detected frontend hijack or signer rotation didn't move any score. Proven against the live production DB, not a synthetic test: a real `frontend_change` event already recorded for Portal moved its score `100 → 90` on the very next tick, with the exact decayed severity matching the formula. Full writeup: [`HEALTH_SCORE_STATUS.md`](./HEALTH_SCORE_STATUS.md).

Every score row stores every component, so any score is fully auditable backwards via `GET /v1/bridges/:id/health`. A bridge that's disabled or has no score row renders as a distinct grey **"unmonitored"** band — never falls through to a colored band that would imply real on-chain data backs it.

## Finality Watch

Added 2026-08-11. Tracks Solana's real, observed finality behavior — relevant during the ongoing **TowerBFT → Alpenglow** consensus transition (TowerBFT: a real, documented ~12.8s finality time; Alpenglow: a new voting protocol called Votor, targeting ~150ms — roughly an 80-100x improvement). Per [Solana's own official upgrade page](https://solana.com/upgrades/alpenglow), Alpenglow is not yet live on mainnet — it's being tested on a community cluster, with mainnet activation targeted for Q3 2026, not yet confirmed.

**How it's measured**: `crates/radar-indexer-solana/src/finality.rs` polls the fully-documented `getSlot(commitment)` RPC method at both `confirmed` and `finalized` every second. When a slot previously seen `confirmed` is later observed `finalized`, the real elapsed wall-clock time between those two observations is written to `finality_observations` (`crates/radar-core/src/finality.rs` for the model, `migrations/0011_finality_observations.sql` for schema). Deliberately does **not** use `getBlockCommitment` — its real response is an undocumented 32-element lockout-depth array with no disclosed confirmed/finalized mapping, and guessing that mapping would violate this project's "verify RPC shapes, don't guess" rule.

**Anomaly detection**: a rolling trailing-hour median baseline (minimum 5 real samples before it's trusted), and an observation is flagged anomalous at **3x** that baseline — chosen as a real order-of-magnitude deviation, not ordinary jitter, and relative to observed data so it works whether the network is on TowerBFT or Alpenglow speed, never a hardcoded assumption about which is active.

**Cross-referenced with real bridge events**: every `GET /v1/events` row carries a real `finality_anomaly_at_time` boolean — true only if a real Finality Watch observation within 5 seconds of that event's own timestamp was itself flagged anomalous. Purely descriptive, never a claim about that specific transaction.

**Where to see it**: a compact status widget on the homepage and `/bridges`; the full real-time chart, anomaly-event list, and explainer at [`/network`](./apps/dashboard/app/network/page.tsx); `GET /v1/network/finality` (current health) and `GET /v1/network/finality/history` (real time series) on the API; `getFinalityHealth()` in `@bridge-radar/sdk` (source-only for now — not yet in the published npm version).

## Bridge registry

16 real, current entries — verified via `GET /v1/registry`. Full per-bridge verification trail (official docs/GitHub source, real `getAccountInfo` RPC confirmation, real historical transaction used for the adapter's unit test) lives in [`BRIDGE_DISCOVERY.md`](./BRIDGE_DISCOVERY.md); the day-to-day status table lives in [`BRIDGE_REGISTRY.md`](./BRIDGE_REGISTRY.md).

**Monitored (14):** Wormhole, Allbridge, deBridge, LayerZero, Mayan, Portal, Axelar, Relay, Across Protocol, Garden Finance, Coinbase Bridge (Base-Solana), Atomiq Exchange, rhino.fi, Orderly Network.

**Not monitored — real bridges, no verified Solana program ID yet (2):** Circle CCTP, Hyperlane. Seeded `enabled = 0`; the scorer skips them entirely rather than silently showing a false 100 for "never monitored." Hidden from `/bridges`' default list (still fully visible via the explicit "Not monitored" filter tab, and unchanged in `/v1/registry`).

**Genuine bridges researched and explicitly blocked or excluded** (not guessed, not fabricated — see `BRIDGE_DISCOVERY.md` for the full reasoning behind each): Zeus Network, Chainflip, Router Nitro, Wan Bridge, WavesBridge, BabyDoge Bridge (blocked — real, but no verifiable program ID or readable event format); Interport Finance, NEAR Intents, UniversalX, Jupiter, and roughly a dozen more aggregators/custodial services/shared-infra wrappers (excluded — not a dedicated bridge in the sense this project tracks); Solflare Bridge (researched 2026-08-10, excluded — a UX layer over Aurora/NEAR Intents' off-chain solver network, structurally the same as the already-excluded NEAR Intents, no canonical Solana-side settlement program exists).

## REST + WebSocket API

No API key, no rate limiting currently enforced in the code (documented as likely to change before a real production deployment). Base URL: wherever you run `apps/api` — there is no hosted production deployment yet, so every example in `/developers` targets a real local instance.

| Method | Path | What it does |
|---|---|---|
| GET | `/v1/bridges` | Every monitored bridge, latest health score, DeFiLlama TVL cross-reference |
| GET | `/v1/bridges/:id` | One bridge's health + DeFiLlama TVL |
| GET | `/v1/bridges/:id/health` | Just the scoring metadata + one bridge's current HealthScore |
| GET | `/v1/bridges/:id/history` | Real score history since a given ISO timestamp (unpaginated) |
| GET | `/v1/events` | Real detected events, filterable by `?bridge=&type=&chain=&since=&limit=`, each carrying `finality_anomaly_at_time` |
| GET | `/v1/registry` | Every tracked bridge (implemented + planned), independent of live health data |
| GET | `/v1/network/finality` | Real current Finality Watch health — latest observation, rolling baseline, anomaly status |
| GET | `/v1/network/finality/history` | Real Finality Watch time series (`?since=&limit=`) |
| GET | `/v1/weekly-digest` | Trailing-7-day anomaly count + healthy/watch/alert tally |
| GET | `/v1/wallet-activity/:address` | Real wallet transaction history matched against the 14 monitored bridge programs |
| GET | `/v1/wallet-holdings/:address` | Real SOL + SPL token balance snapshot |
| GET | `/v1/wallet-timeline/:address` | Full real transaction timeline via Helius Enhanced Transactions API |
| GET | `/v1/defillama/*` (9 routes) | External DeFiLlama reference data (bridges, bridge-volume, tvl, stablecoins, protocols, messaging-protocols, yields, dex-volume, fees) — 3 require a paid DeFiLlama Pro key and honestly report `{"available": false}` without one |
| GET | `/v1/defillama/price/:mint` | Real single-asset price passthrough |
| POST | `/v1/game-scores` / GET `/v1/game-scores/leaderboard` | Bridge Race real client-reported scores + leaderboard |
| POST | `/v1/streak` | Real daily check-in streak, server-computed UTC day |
| GET | `/v1/telegram-subscription/:wallet` | Real Telegram-link subscription status |
| GET | `/v1/ws` | Live WebSocket event + score push |
| GET | `/widget.js` + `/widget/health/:bridgeId` | The embeddable health badge (see Dashboard section) |

Complete request/response shapes, real curl examples against real live data, and a full error-response table live on [`/developers`](./apps/dashboard/app/developers/page.tsx) — every example on that page was captured from the actual running API, not written from memory.

## On-chain oracle

`programs/radar-oracle` — an Anchor program, deployed on **Solana Devnet only** (`6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM`), single-attester model in v1 (multi-attester quorum is v2). Not redeployed to mainnet — that's a separate, deliberate, real-funds decision not made yet.

**Account** (`BridgeHealth`, 82 bytes including the 8-byte Anchor discriminator): `bridge_id: [u8; 32]` (sha256 of the bridge slug), `score: u8` (0 = no score yet), `last_updated: i64`, `attester: Pubkey`, `bump: u8`.

**Instructions:**
- `init_bridge(bridge_id, attester)` — permissionless; anyone can register a bridge by funding its PDA.
- `update_health(bridge_id, score)` — attester-only; bumps `last_updated`, emits `HealthUpdated`.
- `rotate_attester(bridge_id, new_attester)` — current-attester-only; hands off to a new signing key.

dApps consume via a direct PDA read (seeds `["health", sha256(bridge_id)]`) — no CPI or API dependency required. Full byte-layout example and a real, verified-live-against-Devnet reading are on [`/developers`](./apps/dashboard/app/developers/page.tsx).

## SDKs — `@bridge-radar/sdk` and `@bridge-radar/fetch`

Both real, public, and installable today:

```bash
npm install @bridge-radar/sdk
npm install @bridge-radar/fetch
```

**[`@bridge-radar/sdk`](https://www.npmjs.com/package/@bridge-radar/sdk)** (source: `packages/sdk/src/index.ts`) — minimal client, its only real dependency is `@solana/web3.js`:
- `getBridgeHealth(bridgeId, apiUrl)` — real `GET /v1/bridges/:id`.
- `getBridgeHealthOnChain(connection, bridgeId, programId?)` — reads the real on-chain PDA directly, no API involved; throws rather than returning a fabricated 0 for an unregistered bridge.
- `bandOf(score)`, `RADAR_ORACLE_PROGRAM_ID`, `BridgeRadarError`, plus the full re-exported type surface (`BridgeHealth`, `HealthScore`, `HealthComponents`, `HealthBand`, `BridgeRow`, `DefiLlamaProtocolTvl`).
- `getFinalityHealth(apiUrl)` — real `GET /v1/network/finality` (in source now; not yet in the published npm version — a version bump is a separate step).

**[`@bridge-radar/fetch`](https://www.npmjs.com/package/@bridge-radar/fetch)** (source: `packages/fetch/src/index.ts`) — a Solana `Connection` subclass with basic sequential RPC failover (tries each URL in order at creation time, keeps the first that responds to a real `getVersion()` call — explicitly not a load balancer; see [SolRPC](https://github.com/0xRadioAc7iv/solrpc) for that), plus one real extra method: `checkBridgeHealth(bridgeId, minScore)`, which wraps `@bridge-radar/sdk`'s `getBridgeHealth` as a real npm dependency rather than duplicating the logic.

Both packages were verified with a genuinely fresh `npm install` in a clean scratch directory before publishing, exercising every exported function against real data.

## Dashboard

Next.js 15, app router, hand-built components throughout (no UI component library) — `apps/dashboard`. Pages: `/` (homepage — hero, live status strip, Finality Watch panel, 3D globe with one arc per real (bridge, chain) pair colored by real live health band, real bridge marquee), `/bridges` (filterable/sortable card grid + Finality Watch widget), `/bridges/[id]` (score history chart, component breakdown, recent events), `/bridges/compare`, `/events` (global searchable feed), `/network` (Finality Watch — real-time chart, anomaly list, Alpenglow explainer), `/my-activity` (wallet layer, see below), `/developers` (full real API/SDK/widget/oracle reference docs), `/about` (what this is, architecture, Finality & Alpenglow context — no outbound GitHub links on this specific page, by design).

**Embeddable health badge**: one `<script>` tag, vanilla JS, zero dependencies, served from `apps/api/src/widget.ts` as a literal string (no build step on either side). Two real attributes — `data-bridge` (required) and `data-api` (optional) — polls the real live score every 30s, shows a real color-coded dot + label, falls back to "unavailable" (identically) for both an invalid bridge id and an unreachable API.

## Wallet layer (`/my-activity`)

Wallet connect via `@solana/wallet-adapter` (Phantom, Solflare, Coinbase, Ledger, Torus), then 9 features built entirely on Bridge Radar's own unique data — nothing here duplicates what Phantom/Solflare/Solscan already do well:

1. Real SOL + SPL wallet holdings snapshot (DeFiLlama pricing)
2. Bridge-matching transaction scanner against the 14 verified bridge program IDs, with pagination
3. Total historical bridged value — honest tracked/untracked/not-indexed split, never a fake $0
4. Retroactive risk flag — cross-references matched transactions against this project's own score history
5. Wallet activity summary stats
6. Full transaction timeline (every tx type, not just bridge matches) via Helius's Enhanced Transactions API
7. Bridge score timeline overlay for the 7 days following each matched transaction
8. Opt-in score-change notifications (client-side only, browser Notifications API — honest that it only fires while the tab stays open)
9. Personal per-bridge usage summary next to each bridge's real-time score

## Bridge Race (mini-game)

Single-player mini-game on `/my-activity` (10th feature, behind the existing wallet gate): run, collect real blocks, bridge 4 real gaps, real score, real wallet-gated leaderboard. Built with Phaser 4.2.1 (`apps/dashboard/components/bridge-race/`), `POST /v1/game-scores` / `GET /v1/game-scores/leaderboard`, schema in `migrations/0008_game_scores.sql`. No server-side replay verification — real client-reported data under a real connected wallet, honestly not tamper-proof.

## Alerting — Telegram, Discord, webhooks

`crates/radar-alerter` fans real signer/frontend/oracle events and score drops out to Telegram (`sendMessage`), Discord (webhook), and a generic webhook — both Discord and Telegram delivery are live-confirmed for real (real HTTP 204 from Discord; a real Telegram `message_id` from a real chat). The same process also runs a real inbound Telegram bot (`@bruhalert_bot`, long-polling `getUpdates` — no public HTTPS endpoint needed for a webhook) answering `/start`, `/status` (reads real, live scores off the same `Storage` trait everything else uses — never cached or estimated), and `/help`. A separate scheduled job (`apps/api/src/telegram-digest.ts`) sends a real weekly digest to every real subscriber linked via a real `/start <wallet>` deep link.

## DeFiLlama data sync

`crates/radar-defillama` syncs 9 categories of external reference data on independent schedules into `defillama_cache`, exposed read-only via `/v1/defillama/*`. Every response carries `source: "defillama"` and `fetched_at` so it's never confused with this project's own on-chain-derived detection data. 3 of the 9 categories (bridges, bridge-volume, oracles TVS) require a paid DeFiLlama Pro key ($300/mo); without one, those routes honestly report `{"available": false}` — never fake or fallback numbers.

## Storage

v0 dev default: SQLite at `./data/radar.db`, zero setup, schema created inline on connect. Production: **Postgres + TimescaleDB**, live and verified end-to-end as of 2026-08-08 (`bridge_events` and `bridge_health_scores` are hypertables). Both are implemented twice — once as a Rust `Storage` trait impl (`crates/radar-core/src/storage/`) used by every Rust binary, and once as a TypeScript `RadarDb` interface (`apps/api/src/db.ts`) used by the API — kept logically equivalent so `DATABASE_URL`'s scheme alone decides which backend either side uses. Migration files in `migrations/` (0001 through 0011) target Postgres and are applied via `docker-compose.yml`'s initdb mount for a fresh database, or manually via `psql -f` for an already-running one.

## Quick start / running it locally

```bash
cp .env.example .env      # set SOLANA_RPC_URL to a real Helius/mainnet key for reliable results
cargo build --workspace
pnpm install

# Each of these is a long-running process — one per terminal
cargo run -p radar-indexer-solana   # Solana mainnet ingestion + Finality Watch
cargo run -p radar-indexer-evm      # EVM ingestion (6 chains)
cargo run -p radar-watchers         # signer + frontend + oracle detectors
cargo run -p radar-scorer           # writes Health Scores every 60s
cargo run -p radar-defillama        # optional — needs DEFILLAMA_API_KEY for 3 of 9 categories
cargo run -p radar-alerter          # optional — dry-runs without TELEGRAM_BOT_TOKEN/DISCORD_WEBHOOK_URL
cargo run -p radar-attester         # optional — Devnet only, needs a deployed program + keypair
pnpm --filter @radar/api dev        # REST + WS on :3001
pnpm --filter @radar/dashboard dev  # Next.js on :3000
```

Open `http://localhost:3000`. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full dev loop, the public-RPC-throttling caveat, and how to add a new bridge adapter.

## Testing

- **Rust**: `cargo test --workspace` — 79+ tests in `radar-core` alone (adapters, storage, finality, health-score weighting), plus `radar-scorer` and `radar-watchers` suites. Zero failures across the whole workspace as of the latest run.
- **TypeScript**: no unit test suites yet (`apps/api`, `apps/dashboard`, and every `packages/*` currently ship `"test": "echo 'no tests'"`); verification is `pnpm -r typecheck` (clean across all 5 packages) plus manual `curl`/live-data checks against the real running API for every new endpoint or feature.
- Every real feature added to this project — from the 14 bridge adapters to Finality Watch — was verified against real, live, currently-running data before being called done, not just typechecked. See `PROGRESS.md` and this session's commit history for the specific real proof behind each.

## Deployment status

No hosted production deployment exists yet. `DEPLOYMENT.md` and `deploy/systemd/*.service` (9 real, syntax-validated unit files) exist but have never been run end-to-end outside this dev environment. Indexing runs against real Solana **mainnet-beta** today; the on-chain oracle + attester are pinned to **Devnet** and have not been redeployed to mainnet — that remains a separate, explicit, real-funds decision.

## Security

A leaked credential (a Devnet-only Solana keypair used by the attester service) was found committed in git history on 2026-08-02. It was rotated (on-chain authority moved to a fresh key for every affected bridge, verified on-chain) and purged from git history the same day. No mainnet funds or mainnet program were ever involved. Full factual summary in [`PROGRESS.md`](./PROGRESS.md).

## Known gaps (honest, not hidden)

- **CCTP / Hyperlane**: real bridges, no verified Solana program ID yet — see the Bridge registry section.
- **`amount_usd` is an unpriced `0.0` placeholder** across most adapters — pricing needs an indexer-architecture change (fetching full parsed transactions instead of subscribing to log lines), not adapter-level work. The Pyth pricing client itself is ready; there's no real amount anywhere to feed it yet. The dashboard and API both honestly distinguish "never indexed" (null) from "indexed but untracked" (0) from a real dollar amount — never collapsed into a misleading `$0`.
- **`@bridge-radar/sdk`'s published npm version doesn't yet include `getFinalityHealth()`** — it's real, working source, just not republished under a new version yet.
- **No hosted production deployment** — see Deployment status above.
- Full, current, dated list: [`PROGRESS.md`](./PROGRESS.md).

## Contributing

PRs welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the dev loop, the `BridgeAdapter` trait new bridges implement, and commit style (conventional commits, scoped to the crate/app). Adapter PRs are the highest-priority merges; please include a fixture event from a real historical transaction.

## Docs index

- [`WHITEPAPER.md`](./WHITEPAPER.md) — motivation, product framing, full Health Score derivation
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — engineering view: layers, crate-by-crate, reliability assumptions
- [`PROGRESS.md`](./PROGRESS.md) — the definitive, dated, honest build log
- [`HEALTH_SCORE_STATUS.md`](./HEALTH_SCORE_STATUS.md) — the score-model fix, with real before/after proof
- [`BRIDGE_REGISTRY.md`](./BRIDGE_REGISTRY.md) — full bridge list + how to add more
- [`BRIDGE_DISCOVERY.md`](./BRIDGE_DISCOVERY.md) — verification trail for every bridge candidate ever evaluated
- [`BRIDGE_ADAPTER_GUIDE.md`](./BRIDGE_ADAPTER_GUIDE.md) — how to write a new adapter
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — real deployment guide
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — dev loop, contribution guide, commit style
- [`/developers`](./apps/dashboard/app/developers/page.tsx) (live at `/developers` when running) — the complete, real, example-driven API/SDK/widget/oracle reference

## License

MIT (code), CC-BY 4.0 (docs). No token, no equity, no premine.
Built by [Saloni Khan](https://github.com/Hermit210).
