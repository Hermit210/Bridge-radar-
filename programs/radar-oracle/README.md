# radar-oracle

On-chain Health Score oracle for Bridge Radar. Single-attester model in v1
(whitepaper §4.5); multi-attester quorum is v2.

## Layout

- `BridgeHealth` PDA, seeds `[b"health", bridge_id]`. `bridge_id` is the
  `sha256` of the canonical bridge slug (e.g. `sha256("wormhole")`).
- Instructions:
  - `init_bridge(bridge_id, attester)` — permissionless register
  - `update_health(bridge_id, score)` — only the registered attester
  - `rotate_attester(bridge_id, new_attester)` — only the current attester
- Events: `BridgeRegistered`, `HealthUpdated`.

## Consuming from a dApp

```rust
let h = &ctx.accounts.bridge_health;       // read-only Account<BridgeHealth>
require!(
    Clock::get()?.unix_timestamp - h.last_updated < 600,
    MyError::StaleHealth
);
require!(h.score >= 70, MyError::BridgeUnhealthy);
```

## Building

```bash
anchor build              # → target/deploy/radar_oracle.so + target/idl/radar_oracle.json
```

Requires Anchor CLI 1.0+ and a modern SBPF toolchain (`1.89.0-sbpf-solana-v1.52`
or later — `solana-install update` if missing). A `rust-toolchain.toml` in this
crate pins the SBPF rustc so `anchor build` picks the right one even when the
parent workspace defaults to stable.

## Deploy

Not in v0 scope. The placeholder program ID
`944WKQwFt6tuDXZTEwN35mC62V3h2r1ekUtceeAyDiNC` is wired into both
`Anchor.toml` and `declare_id!` in `lib.rs`. Its keypair is at
`target/deploy/radar_oracle-keypair.json` and is gitignored. Replace with a
freshly-generated mainnet keypair before any real deploy.
