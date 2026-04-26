# Bridge Radar

Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.

## What it does

Monitors every bridge with a Solana leg (Wormhole, LayerZero, Allbridge, deBridge, Mayan, Portal, Axelar) and exposes a single answer: **is this bridge healthy right now?**

Detectors:
- Lock-vs-mint parity per asset across origin and Solana
- Outflow anomaly (z-score over rolling 30-day baseline)
- Signer-set / Guardian-set / DVN-set change watcher
- Frontend bundle-hash watcher (Curve / Galxe / Balancer-style hijack class)
- Oracle staleness on price feeds the bridge depends on

Outputs:
- Public dashboard
- REST + WebSocket API (free, rate-limited)
- On-chain oracle program on Solana — dApps can gate withdrawals on bridge health
- Webhook + Telegram + Discord alerts

## Status

v1 shipped. 7 cargo crates + 2 Node apps + 1 Anchor program — full ingestion → detection → scoring → attestation → alerting → dashboard pipeline. Grant application in progress with Solana Foundation India ($5,000, 12-week build).

## Quick start

```bash
cp .env.example .env
cargo build --workspace
pnpm install

# In separate terminals (or `make dev-*` per target):
cargo run -p radar-indexer-solana
cargo run -p radar-indexer-evm
cargo run -p radar-watchers
cargo run -p radar-scorer
pnpm --filter @radar/api dev
pnpm --filter @radar/dashboard dev
```

Open `http://localhost:3000`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full dev loop and [ARCHITECTURE.md](./ARCHITECTURE.md) for the engineering view.

## Why

Over $2.8B drained from bridges since 2022. Most exploits emitted detectable signals — anomalous outflows, signer rotations, parity breaks, frontend drift — minutes to days before drain completed. No public, real-time, neutral, Solana-focused service aggregates them today.

## Docs

- [Whitepaper](./WHITEPAPER.md)

## License

MIT (code), CC-BY 4.0 (docs). No token, no equity, no premine.
