# Bridge Radar — v1 build progress

Snapshot 2026-04-25. Whitepaper v1 scope is structurally complete.

## Shipped

| Layer | Crate / app | What's live |
|---|---|---|
| Shared types | `crates/radar-core` | `BridgeEvent`, `ChainId`, `HealthScore`, `Storage` trait, `BridgeAdapter` trait, Pyth Hermes price client + cache, 7-token registry |
| Storage | `crates/radar-core/storage/{sqlite,postgres}.rs` | SQLite (dev) + Postgres+Timescale (prod), `connect_any()` URL router |
| Solana ingestion | `crates/radar-indexer-solana` | Mainnet `logsSubscribe` + reconnect/backoff + `getSignaturesForAddress` polling fallback |
| EVM ingestion | `crates/radar-indexer-evm` | `eth_getLogs` poller across ETH/Arbitrum/Base/OP/BNB/Polygon, 12-block confirmation buffer |
| Bridge adapters | `crates/radar-core/bridges/*.rs` | All 7 from whitepaper Appendix A: Wormhole, Allbridge, deBridge, LayerZero, Mayan, Portal, Axelar |
| Detectors — events | scorer + watchers | parity (count proxy), outflow z-score (rolling 30-day), signer-set diff, frontend-hash drift, oracle staleness |
| Scorer | `crates/radar-scorer` | Whitepaper §4.4 weights, every 60s, persists components alongside score |
| Watchers | `crates/radar-watchers` | Single binary: signer + frontend + oracle loops |
| Attester | `crates/radar-attester` | Reads scores, derives PDA, auto `init_bridge`, sends `update_health` |
| Alerter | `crates/radar-alerter` | Telegram + Discord + generic webhook fan-out for events + score drops |
| On-chain oracle | `programs/radar-oracle` | Anchor 1.0, builds clean (`anchor build` → 152KB `.so`), full IDL generated |
| API | `apps/api` | Hono + WS, `/v1/bridges`, `/v1/bridges/:id/health`, `/v1/events`, `/v1/ws`, scoring meta |
| Dashboard | `apps/dashboard` | Next.js 15, bridge cards + summary pills, per-bridge detail with Recharts history, /events live feed, /about |
| Infra | `docker-compose.yml`, `migrations/0001_init.sql` | Timescale + Redis stack, full SQL schema with hypertables |
| Tooling | `Makefile`, `.env.example` | One target per crate/app; documented public RPC defaults |

## Tests

- 27 unit tests pass: 16 (radar-core) + 3 (radar-scorer) + 4 (radar-watchers) + 2 (radar-alerter) + 2 (radar-attester)
- `cargo fmt --check`, `cargo clippy -D warnings`, `pnpm -r typecheck` all green
- Live data flow validated end-to-end: real Wormhole `mint`/`burn` from Solana mainnet + real `lock` from Base, scorer composes Health Score 52 (RED) when parity is one-sided

## Anchor program

Built with anchor-cli 1.0.1 / anchor-lang 1.0 against the
`1.89.0-sbpf-solana-v1.52` rust toolchain (pinned via
`programs/radar-oracle/rust-toolchain.toml`). Outputs:

- `programs/radar-oracle/target/deploy/radar_oracle.so` — 152KB
- `programs/radar-oracle/target/idl/radar_oracle.json` — full IDL

Three instructions: `init_bridge`, `update_health`, `rotate_attester`. Two
events: `BridgeRegistered`, `HealthUpdated`. Single-attester model in v1
(per whitepaper §4.5); multi-attester quorum is v2.

## What's deferred to v1.5+

- **Per-bridge ABI decoders for amount + asset.** Right now Solana indexer
  decodes instruction names but emits `amount_usd = 0.0`; EVM indexer matches
  topic-0 but doesn't ABI-decode the payload. The Pyth client + token
  registry are ready; wiring is per-adapter work.
- **Multi-region frontend hash consensus** with a 30-min confirmation window.
- **Multi-attester quorum** — v2 of the on-chain program.
- **Devnet / mainnet deploy of the oracle** — needs `solana-keygen new`
  for the program ID + ~5 SOL for rent. The build is ready.
- **Postgres LISTEN/NOTIFY** alerter path (current is 5s SQLite poll).
- **Verification of placeholder program IDs** for Allbridge / deBridge /
  Mayan / Axelar Solana sides — adapters log warnings if they're wrong but
  emit zero events rather than misclassifying.

## Repo layout (final)

```
crates/
  radar-core/            shared types + storage + Pyth pricing
  radar-indexer-solana/  Solana event tap
  radar-indexer-evm/     EVM event tap
  radar-watchers/        signer + frontend + oracle detectors
  radar-scorer/          Health Score writer
  radar-attester/        on-chain push
  radar-alerter/         TG + Discord + webhook
apps/
  api/                   Hono REST + WS
  dashboard/             Next.js 15
packages/
  shared/                TS mirror of BridgeEvent / HealthScore
programs/
  radar-oracle/          Anchor program
migrations/              Postgres + Timescale DDL
```

## Run it

```bash
cp .env.example .env
cargo build --workspace
pnpm install

# Each in its own terminal — or `make dev-<name>`
cargo run -p radar-indexer-solana
cargo run -p radar-indexer-evm
cargo run -p radar-watchers
cargo run -p radar-scorer
cargo run -p radar-alerter        # optional; dry-runs without sink env vars
cargo run -p radar-attester       # optional; needs deployed program + keypair
pnpm --filter @radar/api dev
pnpm --filter @radar/dashboard dev
```

Open http://localhost:3000.
