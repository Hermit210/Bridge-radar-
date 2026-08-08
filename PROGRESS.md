# Bridge Radar — build progress

Snapshot 2026-08-08 (originally 2026-08-02; see the Dashboard pages and
Known gaps sections below for what changed since). Real-time bridge-health
monitoring on Solana mainnet,
plus a wallet-facing layer (`/my-activity`) built entirely on Bridge Radar's
own unique data — no feature here duplicates what Phantom/Solflare/Solscan
already do well.

**Security note**: a leaked credential (`attester.json`, a devnet Solana
keypair) was found committed in git history on 2026-08-02. It was rotated
(on-chain authority moved to a fresh key for all 7 affected bridges,
verified on-chain) and purged from git history (`git filter-repo` +
force-push, independently re-verified against a fresh clone from GitHub).
No mainnet funds or mainnet program were ever involved.

## Shipped

| Layer | Crate / app | What's live |
|---|---|---|
| Shared types | `crates/radar-core` | `BridgeEvent`, `ChainId`, `HealthScore`/`HealthComponents`, `Storage` trait, `BridgeAdapter` trait, Pyth Hermes price client, DeFiLlama client, 14 bridge adapter modules |
| Storage | `crates/radar-core/storage/{sqlite,postgres}.rs`, `apps/api/src/db.ts` | **Postgres+Timescale is live and verified end-to-end as of 2026-08-08.** All 8 Rust binaries (both indexers, scorer, watchers, attester, alerter, defillama) dispatch through `storage::connect_any(DATABASE_URL)` to either `SqliteStorage` or `PostgresStorage`; `apps/api`'s `db.ts` has a matching `createDb(url)` split (`SqliteRadarDb` / `PostgresRadarDb`, via `pg`). SQLite remains the zero-setup dev default. |
| Solana ingestion | `crates/radar-indexer-solana` | **Mainnet** `logsSubscribe` (Helius) + reconnect/backoff + `getSignaturesForAddress` polling fallback — migrated off devnet 2026-07-23 |
| EVM ingestion | `crates/radar-indexer-evm` | `eth_getLogs` poller across ETH/Arbitrum/Base/OP/BNB/Polygon, 12-block confirmation buffer |
| Bridge adapters | `crates/radar-core/bridges/*.rs` | **14 real, mainnet-verified adapters** (see below) |
| Detectors | `crates/radar-watchers` | Single binary: signer-set diff (Wormhole Guardians), frontend-hash drift (7 bridges' official sites, CSP-nonce/Cloudflare-noise normalized), oracle staleness (6 Pyth feeds) — all three persist real events, and as of 2026-08-01 all three actually move the score (see Health Score Model) |
| Scorer | `crates/radar-scorer` | Full whitepaper §4.4 weighted composite, every 60s: `100 − 40·parity − 25·outflow − 15·signer − 10·frontend − 10·oracle`. All 5 components real as of 2026-08-01. |
| DeFiLlama sync | `crates/radar-defillama` | 9 categories on independent schedules into `defillama_cache`; 3 (bridges list, bridge volume, oracles TVS) require a paid Pro key ($300/mo) and honestly report `{"available": false}` without one — never fake/fallback data |
| Attester | `crates/radar-attester` | Reads scores, derives PDA, `init_bridge`/`update_health` — **pinned to devnet** via `ATTESTER_RPC_URL`, independent of the mainnet-migrated indexer |
| Alerter | `crates/radar-alerter` | Telegram `sendMessage` + Discord webhook + generic webhook fan-out for signer/frontend/oracle events and score drops, **plus real inbound Telegram bot commands** (`crates/radar-alerter/src/commands.rs`, added 2026-08-08 — see below). **Discord delivery live-confirmed 2026-08-08** — real `DISCORD_WEBHOOK_URL`, real POST returned real HTTP 204. **Telegram delivery live-confirmed 2026-08-08** — see below. |
| On-chain oracle | `programs/radar-oracle` | Anchor program, **deployed devnet only** — `6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM`. Not touched/redeployed without explicit sign-off; real funds eventually involved. |
| API | `apps/api` | Hono + WS. 21 REST routes (bridges/health/history/events/registry, 11 DeFiLlama passthroughs, the wallet layer: `wallet-holdings`, `wallet-activity`, `wallet-timeline`) plus a WebSocket live feed |
| Dashboard | `apps/dashboard` | Next.js 15 — 7 pages: `/`, `/bridges`, `/bridges/[id]`, `/bridges/compare`, `/events`, `/about`, `/my-activity` (see Dashboard pages below — all 7 now have a redesign pass as of 2026-08-08) |
| Wallet layer | `apps/dashboard/app/my-activity` | Wallet connect (Phantom/Solflare/Coinbase/Ledger/Torus) + 9 features built entirely on our own data — see below |
| dApp SDK | `packages/sdk` (`@bridge-radar/sdk`, private/unpublished) | `getBridgeHealth` (real API) + `getBridgeHealthOnChain` (real on-chain PDA read) — verified against live data (real API score, real on-chain score, real thrown error for an unregistered bridge). Practical implementation of whitepaper §4.5's "dApps can gate withdrawals" promise. |
| Infra | `docker-compose.yml`, `migrations/0001_init.sql`–`0007` | **Running for real as of 2026-08-08** — `radar-timescale` + `radar-redis` containers up and healthy, all 7 migrations applied via the initdb mount (`\dt` shows all 7 tables, 16 bridges seeded). |

## Bridge registry — 14 real adapters, 2 disabled, 6 blocked candidates

**Live, real, mainnet-verified (14):** Wormhole, Allbridge, deBridge,
LayerZero, Mayan, Portal, Axelar, Relay, Across Protocol, Garden Finance,
Coinbase Bridge (Base-Solana), Atomiq Exchange, rhino.fi, Orderly Network.
Every one has a real Solana program ID confirmed via direct `getAccountInfo`
RPC (never a scraped summary alone) and at least one unit test decoded from
a real historical mainnet transaction. Full verification trail in
`BRIDGE_DISCOVERY.md`; live status in `BRIDGE_REGISTRY.md`.

**Real bridges, seeded `enabled=0` (2):** Circle CCTP, Hyperlane — genuine
bridges, but no verified Solana program ID found yet (`SOLANA_PROGRAMS: &[]`
placeholder in `cctp.rs`/`hyperlane.rs`, marked `// TODO`). The scorer skips
disabled bridges entirely rather than silently scoring a perfect 100 for
"never monitored" (see `HEALTH_SCORE_STATUS.md`, the 2026-07-23 fix).

**Genuine bridges, blocked pending external information (6, unresolved
after 3 discovery passes — not something more searching will fix, per
BRIDGE_DISCOVERY.md):**
- **Zeus Network** — 6 real ZPL programs confirmed `executable: true`
  on-chain; no readable deposit/withdrawal transaction sample found yet
  (public-RPC rate limits during search). Only one of the 6 genuinely worth
  another look, and only with a paid RPC provider.
- **Chainflip** — real, verified Vault + SwapEndpoint programs; scanned 600
  real transactions and confirmed the actual user deposit leg happens
  off-chain to an ephemeral address our program-ID-based log detection
  structurally cannot see. Closed finding, not a research gap.
- **Router Nitro** — real, professionally audited (Oak Security), but the 3
  contract repos named in its own audit are private; no program ID publicly
  disclosed anywhere (GitHub, npm, docs all checked).
- **Wan Bridge, WavesBridge, BabyDoge Bridge** — all genuine, currently
  operating bridges; none has ever disclosed a Solana program address
  (BabyDoge disclosed only its SPL token mint, consistent with a
  custodial/centralized operation).

**Excluded, not genuine dedicated bridges:** Interport Finance, NEAR
Intents, UniversalX, Jupiter, Rango Exchange, LI.FI, Jumper.Exchange, Squid
Router, Bridgers.xyz, Houdini Swap, SwapKit, Sunrise DeFi, DEFIWAY,
SideShift.ai (custodial swap), Carrier (shares Wormhole infra), AllDomains
Bridge (shares Hyperlane infra), Cashmere (thin CCTP wrapper), InterSoon
(built on Hyperlane), Lido/Magic Eden/Stargate (removed from registry —
liquid staking / NFT marketplace / not deployed on Solana, respectively).

## Health Score Model — all 5 components real as of 2026-08-01

```
HealthScore = 100
  − 40 × parity_severity      (count-based lock/mint imbalance, v0 proxy)
  − 25 × outflow_severity     (z-score vs 30-day baseline)
  − 15 × signer_recency       (0..1, decays over 24h since last signer_change)
  − 10 × frontend_recency     (0..1, decays over 6h since last frontend_change)
  − 10 × oracle_staleness     (0..1, decays over 5min since last oracle_stale)
```

Until 2026-08-01, `signer_recency`/`frontend_recency`/`oracle_staleness`
were hardcoded to 0 even though the watchers already produced real events
for them — a real detected frontend hijack or signer-set change did not
move any score. Fixed: `compute_score()` now reads the most recent real
event of each kind back from storage and linearly decays its severity.
Proven against the live production DB (not a synthetic test): a real
`frontend_change` event already recorded for Portal moved its score from
100 → 90 on the very next tick, with the exact decayed severity matching
the formula (`0.9969 = 1 − 68s/21600s`). Full writeup and math in
`HEALTH_SCORE_STATUS.md`.

Currently only Wormhole and Portal have a real `frontend_change` event
recorded (both watch `portalbridge.com`); no bridge has a real
`signer_change` yet (the v0 Wormhole guardian-set fetch is a synthesized
deterministic list that never diffs against itself — a real diffable
source is future work); no bridge currently has a real `oracle_stale`
(all 6 watched Pyth feeds are fresh).

## Dashboard pages — all 7 have a dedicated redesign pass (updated 2026-08-08)

| Page | Redesign pass? |
|---|---|
| `/` (homepage) | ✅ Multiple passes, most recently 2026-08-08: warm near-black + amber palette, serif italic accent word, orbit-glow ambient animation (visibility bug fixed — was clipped by the hero section's `overflow-hidden`), real-data bridge marquee, centered navbar, removed the monitoring badge and the "Built with"/v0-preview scaffolding sitewide |
| `/bridges` (list) | ✅ Dedicated pass + 2026-08-08 density pass: smaller cards (p-5→p-3.5), severity-first default sort, per-card entrance stagger, live count-up/color transitions on score updates, dropped the formula subtext and the JSON link |
| `/bridges/[id]` (detail) | ✅ Dedicated pass, palette-updated 2026-08-08 |
| `/bridges/compare` | ✅ Dedicated pass (×2), 2026-08-08: boxes resized to medium (p-6→p-4), dropped intro text and the Share button |
| `/events` | ✅ Dedicated pass (2026-08-01) — real filters, real live stat breakdown; 2026-08-08: dropped the `/v1/ws` explanation subtext |
| `/about` | ✅ Dedicated pass (2026-08-01) — real live bridge-count badge, shared detector-grid component; 2026-08-08: fixed two overstatements (alerter delivery status, SQLite-vs-Postgres claim) to match real current code |
| `/my-activity` | ✅ Dedicated pass (2026-08-02) — consistent entrance motion across all 9 features, hover states on every interactive row, mobile-safe wrapping; 2026-08-08: split-panel wallet-connect empty state, intro paragraph removed, re-audited for fake data (none found) |

Every item above was verified against a real rendered screenshot from the
real dev server (see the Known gaps entry below on how headless Chromium
was unblocked in this sandbox), not just typecheck.

All hand-built — the 21st.dev MCP component-sourcing tools were never used
anywhere in this codebase (no trace in source, lockfile, or git history);
fully abandoned in favor of hand-built components from the start.

## `/my-activity` — wallet layer, built entirely on our own unique data

Wallet connect via `@solana/wallet-adapter` (Phantom/Solflare/Coinbase/
Ledger/Torus), then:

1. **Wallet holdings snapshot** — real SOL + SPL balances, DeFiLlama pricing
2. **Bridge-matching transaction scanner** — wallet history vs our 14
   verified bridge program IDs, with "scan further back" pagination
3. **Total historical bridged value** — honest tracked/untracked/
   not-indexed split, never a fake $0
4. **Retroactive risk flag** — cross-references matched transactions
   against our own health-score history for a worst-score-after signal
5. **Wallet activity summary stats**
6. **Full transaction timeline** (not just bridge matches) — classified via
   Helius's real Enhanced Transactions API
7. **Bridge score timeline overlay** — real health-score trend for the 7
   days after each matched transaction, sourced from our own scorer history
8. **Opt-in score-change notifications** — client-side only (browser
   Notifications API + polling `/v1/bridges`, no backend push
   infrastructure), honest about only firing while the tab stays open
9. **Personal bridge usage summary** — real per-bridge transaction counts
   next to each bridge's real-time current score

An "Example wallet" preview mode demonstrates 7-9 against a real, previously
cited Allbridge transaction, clearly labeled, since the connected dev wallet
has no real bridge history of its own to demo against.

## Tests

- **Rust**: 90 unit tests pass, 0 failures — 71 (`radar-core`) + 8
  (`radar-scorer`) + 7 (`radar-watchers`) + 2 (`radar-alerter`) + 2
  (`radar-attester`) + 0 each (`radar-indexer-solana`, `radar-indexer-evm`,
  `radar-defillama` — no unit tests yet, live-verified manually instead).
  `cargo fmt --check` clean on every crate touched this session;
  `cargo clippy -D warnings` currently fails on 2 pre-existing warnings in
  `cctp.rs`/`hyperlane.rs` (`const_is_empty` on the placeholder empty
  `SOLANA_PROGRAMS` arrays) — not touched or fixed here, tracked as a known
  gap below.
- **TypeScript**: no unit test suites exist (`apps/api`, `apps/dashboard`,
  `packages/shared`, `packages/sdk` all have `"test": "echo 'no tests'"`) —
  verification is `pnpm -r typecheck` (currently green across all 4
  packages) plus manual `curl`/live-data checks against the real running
  API and, for `packages/sdk`, the real devnet oracle for every new
  endpoint/feature.
- Live data flow validated end-to-end on mainnet: real bridge events, real
  wallet scans against a real address, real score changes proven against
  the live production DB (see Health Score Model above).

## Anchor program

Built with anchor-cli 1.0.1 / anchor-lang 1.0. Three instructions:
`init_bridge`, `update_health`, `rotate_attester`. Two events:
`BridgeRegistered`, `HealthUpdated`. Single-attester model in v1;
multi-attester quorum is v2. **Devnet only** — mainnet deploy is an
explicit, separate, real-funds decision not made yet.

## Known gaps (honest, not fixed here)

- **CCTP/Hyperlane**: no verified Solana program ID yet, `enabled=0`.
- **`amount_usd` is an unpriced `0.0` placeholder** in 38 places across the
  bridge adapters. Scoped 2026-08-01 and it's bigger than "wire in the Pyth
  client": no adapter, on either chain, currently extracts a real native
  amount from anything. `SolanaLogContext` only carries `program_id` +
  `log_line` text — no instruction data or balance deltas — so pricing
  Solana-side events needs `radar-indexer-solana` to fetch full parsed
  transactions instead of subscribing to log lines, an indexer-architecture
  change, not adapter-level work. `EvmLogContext` does carry raw ABI `data`,
  but every EVM adapter checked (e.g. Wormhole's `decode_evm_log`) discards
  it after matching `topic0` — real per-bridge ABI decoding is still needed
  before Pyth pricing applies to anything. The Pyth client (`amount_to_usd`)
  itself is ready and correct; there's just no real amount anywhere to feed
  it yet.
- **Postgres/Timescale: resolved, 2026-08-08.** Docker became available in
  the dev sandbox (Docker Desktop + WSL2 integration); `docker compose up -d`
  brought up `radar-timescale` (Timescale 2.16.1 / PG16) + `radar-redis`,
  both healthy. All 7 migrations applied via the initdb mount, confirmed
  with a real `psql \dt` (7 tables) and bridge count (16, matching the
  SQLite seed). Every Rust binary that used to hardcode
  `SqliteStorage::connect` (indexer-evm, indexer-solana, scorer, watchers,
  attester) now goes through `storage::connect_any`, same as `radar-defillama`
  already did; `radar-alerter` additionally had its hand-rolled SQLite-only
  `SqlitePool` queries (a `rowid` cursor, raw `?`-placeholder SQL) replaced
  with `Storage::list_events`/`latest_scores` so it has no backend-specific
  code left either. `apps/api/src/db.ts` gained a real Postgres backend
  (`pg`, `PostgresRadarDb`) implementing the same `RadarDb` interface as the
  SQLite one, selected by `createDb(DATABASE_URL)`; every route handler and
  `wallet-activity.ts` call site was updated to the now-async interface.
  `DATABASE_URL` in `.env` now points at `postgres://radar:radar@localhost:5432/radar`.
  Proven end-to-end for real: `radar-indexer-solana` ingested real mainnet
  events straight into Postgres (confirmed via `psql`), `radar-scorer`
  computed and wrote real health scores off those events (confirmed via
  `psql`), and `apps/api` served both back out correctly — verified with
  real `curl` against `/v1/healthz`, `/v1/events`, `/v1/bridges/wormhole/health`,
  and a real WebSocket client that received live `event` messages off the
  Postgres-backed tail. `cargo test --workspace` (90 passed) and
  `pnpm -r typecheck` both clean throughout.
- **`DEPLOYMENT.md` + `deploy/systemd/*.service` exist** (2026-08-01) —
  real, syntax-validated (`systemd-analyze verify`, all 9 units pass) but
  never run end-to-end (no Docker/Postgres in the dev sandbox that wrote
  them). Still missing: auto-reconnect/health-status endpoints beyond
  `/v1/healthz`, and a system-status dashboard page. See
  `TASK4_STATUS.md`.
- **Resolved (Discord + Telegram) — live alert delivery, 2026-08-08.**
  Discord: real `curl POST` to the real webhook URL returned a real HTTP
  204. Telegram: resolved as a side effect of adding real bot command
  handling (below) — `getUpdates` surfaced a real, already-pending `/start`
  message from the user (sent at some point before this session, sitting
  unconsumed since nothing was polling for it yet), which gave a real
  `TELEGRAM_CHAT_ID` to use instead of the placeholder string that had
  blocked this earlier. Now set for real in `.env`; `radar-alerter`
  startup log reads `telegram=true discord=true`.
- **Telegram bot commands — `/start`, `/status`, `/help`, added 2026-08-08**
  (`crates/radar-alerter/src/commands.rs`). Long-polling (`getUpdates`),
  not a webhook — this process has no public HTTPS endpoint to receive a
  webhook callback on, and polling needs nothing extra (no TLS cert, no
  reverse proxy, no public port), just the outbound HTTPS this binary
  already does for alert fan-out. Runs as a second tokio task in the same
  `radar-alerter` process (`tokio::select!` alongside the existing alert
  loop), one bot token, no new service to deploy. `/status` reads real,
  live `bridge_health_scores` + `bridges` off the same `Storage` trait
  everything else uses (never cached/estimated); a bridge with no score
  yet says so honestly rather than being omitted or shown green.
  **Live-verified for real**: the daemon picked up the real pending
  `/start` via a real `getUpdates` call and replied via a real
  `sendMessage` call; Telegram's own response came back
  `{"ok":true,"result":{"message_id":3,...,"chat":{"id":7307351180,
  "username":"Hermit210"},"text":"👋 Welcome to Bridge Radar...`  —
  a real message_id assigned by Telegram, addressed to the user's real
  chat, confirmed independently in their own Telegram app.
- **`cargo clippy -D warnings`** currently fails on 2 pre-existing warnings
  unrelated to any work done this session (see Tests above).
- **Resolved 2026-08-08**: headless Chromium screenshot verification is
  now possible in this dev sandbox — the missing shared libs
  (`libnspr4`/`libnss3`/`libasound2`) were fetched with `apt-get download`
  (no sudo needed for download-only) and extracted locally with
  `dpkg-deb -x` into a scratch prefix, then loaded via `LD_LIBRARY_PATH`
  for a real Playwright/Chromium run. Every dashboard redesign change made
  2026-08-07/08 (palette overhaul, navbar centering, orbit-glow visibility
  fix, `/bridges` card resize, subtext removal across 4 pages, compare-box
  resize, About page accuracy fix) was verified against a real rendered
  screenshot from the real dev server, not just typecheck.

## Repo layout

```
crates/
  radar-core/            shared types + storage + Pyth pricing + 14 bridge adapters
  radar-indexer-solana/  Solana event tap (mainnet)
  radar-indexer-evm/     EVM event tap
  radar-watchers/        signer + frontend + oracle detectors
  radar-scorer/          Health Score writer (all 5 components real)
  radar-defillama/       DeFiLlama Solana data sync (9 categories)
  radar-attester/        on-chain push (devnet only)
  radar-alerter/         TG + Discord + webhook
apps/
  api/                   Hono REST + WS, wallet layer
  dashboard/             Next.js 15, 7 pages
packages/
  shared/                TS mirror of BridgeEvent / HealthScore / bandOf
  sdk/                   @bridge-radar/sdk -- minimal dApp client (private, unpublished)
programs/
  radar-oracle/          Anchor program (devnet)
migrations/              Postgres + Timescale DDL -- applied and live (2026-08-08)
```

## Run it

```bash
cp .env.example .env   # set SOLANA_RPC_URL to a real Helius key for reliable results
cargo build --workspace
pnpm install

# Each in its own terminal
cargo run -p radar-indexer-solana
cargo run -p radar-indexer-evm
cargo run -p radar-watchers
cargo run -p radar-scorer
cargo run -p radar-defillama     # optional; needs DEFILLAMA_API_KEY for 3 of 9 categories
cargo run -p radar-alerter       # optional; dry-runs without sink env vars
cargo run -p radar-attester      # optional; devnet only, needs deployed program + keypair
pnpm --filter @radar/api dev
pnpm --filter @radar/dashboard dev
```

Open http://localhost:3000.
