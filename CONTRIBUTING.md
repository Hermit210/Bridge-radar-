# Contributing to Bridge Radar

Thanks for your interest. Bridge Radar is open-source public infrastructure — pull requests welcome.

## Quick start

```bash
# 1. Install toolchain
#    Rust 1.89+, Node 20+, pnpm 10+, Anchor CLI 1.0+, Solana CLI 2.0+
# 2. Clone
git clone <repo-url> bridge-radar && cd bridge-radar

# 3. Copy env and adjust
cp .env.example .env

# 4. Build everything
cargo build --workspace
pnpm install && pnpm -r build

# 5. Run the dev loop (each is a long-running process)
cargo run -p radar-indexer-solana   # Solana mainnet ingestion
cargo run -p radar-indexer-evm      # ETH/Arbitrum/Base/OP/BNB/Polygon ingestion
cargo run -p radar-watchers         # signer-set + frontend-hash + oracle-staleness
cargo run -p radar-scorer           # writes Health Scores every 60s
cargo run -p radar-alerter          # Telegram/Discord/webhook fan-out (optional)
cargo run -p radar-attester         # on-chain Health Score push (optional)
pnpm --filter @radar/api dev        # REST + WS on :3001
pnpm --filter @radar/dashboard dev  # Next.js on :3000
```

Open `http://localhost:3000` and you should see live bridge events flowing in.

> **Public RPC caveat.** `.env.example` ships public defaults for every chain.
> They throttle: Polygon and BNB return 401/429 within seconds, ETH llama
> returns 429 under load. The EVM indexer logs WARN and keeps going — the
> data is partial but real. Drop a Helius / Alchemy / QuickNode key into
> `.env` (matching the slots in `.env.example`) for clean logs and full
> coverage.

## Repository layout

```
crates/
  radar-core/            shared types + Storage trait + Pyth pricing
  radar-indexer-solana/  Solana event tap (logsSubscribe + poll fallback)
  radar-indexer-evm/     EVM event tap (eth_getLogs poller, 6 chains)
  radar-watchers/        signer-set + frontend-hash + oracle-staleness
  radar-scorer/          Health Score writer (parity + outflow z-score)
  radar-attester/        pushes scores to on-chain oracle
  radar-alerter/         Telegram + Discord + webhook fan-out

apps/
  api/                   Hono REST + WS gateway
  dashboard/             Next.js 15 dashboard

packages/
  shared/                TS types mirroring radar-core

programs/
  radar-oracle/          Anchor program

migrations/              sqlx migrations (Postgres + Timescale)
```

## Adding a new bridge

Each bridge implements the `BridgeAdapter` trait in `crates/radar-core/src/adapter.rs`:

```rust
pub trait BridgeAdapter: Send + Sync {
    fn id(&self) -> BridgeId;
    fn solana_programs(&self) -> &[Pubkey];
    fn evm_contracts(&self) -> &[(ChainId, Address)];
    fn decode_solana_log(&self, log: &str) -> Option<BridgeEvent>;
    fn decode_evm_log(&self, log: &EvmLog) -> Option<BridgeEvent>;
}
```

Register the adapter in `crates/radar-indexer-solana/src/registry.rs` and `crates/radar-indexer-evm/src/registry.rs`. Add a row to `migrations/0001_init.sql::bridges`.

PRs adding bridges are highest-priority merges. Please include a fixture event from each chain in `crates/radar-core/tests/fixtures/`.

## Commit style

Conventional commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `ci:`. Scope is the crate or app: `feat(indexer-solana): handle redeem instruction`. Atomic commits are preferred over big bundles.

## Testing

- Rust: `cargo test --workspace`
- TS: `pnpm -r test`
- Anchor: `anchor test` (requires local validator)

## Code of conduct

Be kind, be technical, focus on the data. We do not editorialize about specific bridges' reputations — Bridge Radar reports observable signals, full stop.

## License

By contributing you agree that your contributions are licensed under MIT (code) and CC-BY 4.0 (docs).
