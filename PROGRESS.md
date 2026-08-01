# Bridge Radar — build progress

Snapshot 2026-08-01. Real-time bridge-health monitoring on Solana mainnet,
plus a wallet-facing layer (`/my-activity`) built entirely on Bridge Radar's
own unique data — no feature here duplicates what Phantom/Solflare/Solscan
already do well.

## Shipped

| Layer | Crate / app | What's live |
|---|---|---|
| Shared types | `crates/radar-core` | `BridgeEvent`, `ChainId`, `HealthScore`/`HealthComponents`, `Storage` trait, `BridgeAdapter` trait, Pyth Hermes price client, DeFiLlama client, 14 bridge adapter modules |
| Storage | `crates/radar-core/storage/{sqlite,postgres}.rs` | SQLite (the only backend actually running — `apps/api` reads it directly via `better-sqlite3`), Postgres+Timescale impl fully written but never wired to the API layer or run end-to-end (see Known gaps) |
| Solana ingestion | `crates/radar-indexer-solana` | **Mainnet** `logsSubscribe` (Helius) + reconnect/backoff + `getSignaturesForAddress` polling fallback — migrated off devnet 2026-07-23 |
| EVM ingestion | `crates/radar-indexer-evm` | `eth_getLogs` poller across ETH/Arbitrum/Base/OP/BNB/Polygon, 12-block confirmation buffer |
| Bridge adapters | `crates/radar-core/bridges/*.rs` | **14 real, mainnet-verified adapters** (see below) |
| Detectors | `crates/radar-watchers` | Single binary: signer-set diff (Wormhole Guardians), frontend-hash drift (7 bridges' official sites, CSP-nonce/Cloudflare-noise normalized), oracle staleness (6 Pyth feeds) — all three persist real events, and as of 2026-08-01 all three actually move the score (see Health Score Model) |
| Scorer | `crates/radar-scorer` | Full whitepaper §4.4 weighted composite, every 60s: `100 − 40·parity − 25·outflow − 15·signer − 10·frontend − 10·oracle`. All 5 components real as of 2026-08-01. |
| DeFiLlama sync | `crates/radar-defillama` | 9 categories on independent schedules into `defillama_cache`; 3 (bridges list, bridge volume, oracles TVS) require a paid Pro key ($300/mo) and honestly report `{"available": false}` without one — never fake/fallback data |
| Attester | `crates/radar-attester` | Reads scores, derives PDA, `init_bridge`/`update_health` — **pinned to devnet** via `ATTESTER_RPC_URL`, independent of the mainnet-migrated indexer |
| Alerter | `crates/radar-alerter` | Telegram + Discord + generic webhook fan-out |
| On-chain oracle | `programs/radar-oracle` | Anchor program, **deployed devnet only** — `6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM`. Not touched/redeployed without explicit sign-off; real funds eventually involved. |
| API | `apps/api` | Hono + WS. 21 REST routes (bridges/health/history/events/registry, 11 DeFiLlama passthroughs, the wallet layer: `wallet-holdings`, `wallet-activity`, `wallet-timeline`) plus a WebSocket live feed |
| Dashboard | `apps/dashboard` | Next.js 15 — 7 pages: `/`, `/bridges`, `/bridges/[id]`, `/bridges/compare`, `/events`, `/about`, `/my-activity` (see Dashboard pages below for redesign coverage, which is uneven) |
| Wallet layer | `apps/dashboard/app/my-activity` | Wallet connect (Phantom/Solflare/Coinbase/Ledger/Torus) + 8 features built entirely on our own data — see below |
| Infra | `docker-compose.yml`, `migrations/0001_init.sql` | Timescale + Redis stack scaffolded, schema written, never actually run |

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

## Dashboard pages — redesign coverage is uneven

| Page | Redesign pass? |
|---|---|
| `/` (homepage) | ✅ Multiple dedicated passes |
| `/bridges` (list) | ✅ Dedicated pass |
| `/bridges/[id]` (detail) | ✅ Dedicated pass |
| `/bridges/compare` | ✅ Dedicated pass (×2) |
| `/events` | ❌ Never redesigned — bare fade-in only |
| `/about` | ❌ Never redesigned — bare fade-in only |
| `/my-activity` | ⚠️ Built feature-by-feature with incidental `Reveal`/skeleton use, never a dedicated polish pass matching the other four |

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
  `packages/shared` all have `"test": "echo 'no tests'"`) — verification is
  `pnpm -r typecheck` (currently green) plus manual `curl` against the live
  API with real data for every new endpoint/feature.
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
- **Postgres/Timescale**: the Rust `Storage` trait impl is fully written,
  but `apps/api` (Node/Hono) reads SQLite directly via `better-sqlite3`,
  not through the Rust storage abstraction — pointing `DATABASE_URL` at
  Postgres today would not work for the API layer. Never run end-to-end.
- **No `DEPLOYMENT.md`, no systemd units, no auto-reconnect/health-status
  dashboard page** — none of this exists yet.
- **`/events` and `/about`** never got a redesign pass; `/my-activity`
  never got a dedicated polish pass (only incidental motion from building
  features one at a time).
- **`cargo clippy -D warnings`** currently fails on 2 pre-existing warnings
  unrelated to any work done this session (see Tests above).
- **No visual/screenshot verification of recent frontend work** — every
  `/my-activity` change this cycle was verified via typecheck + live API
  proof only; headless Chromium cannot launch in this dev sandbox (missing
  system libs, no passwordless `sudo` to install them). Needs a human
  visual check.

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
programs/
  radar-oracle/          Anchor program (devnet)
migrations/              Postgres + Timescale DDL (unused so far)
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
