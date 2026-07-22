# Health Score Status Report

## Resolved (2026-07-23)

This doc originally diagnosed a data-integrity bug: bridges with no real
adapter watching a verified Solana program still got scored every tick
(`crates/radar-scorer` scores every *enabled* row in the `bridges` table,
adapter or not). With zero events, all severities default to 0, so the score
computes to a perfect 100 — indistinguishable on the dashboard from a
genuinely healthy, actively-monitored bridge. Five registry entries were
affected. The fix:

- **Lido, Magic Eden — removed from the registry entirely.** Neither is a
  bridge (liquid staking, NFT marketplace respectively); they should never
  have been seeded into the `bridges` table in the first place.
- **Stargate — removed from the registry entirely.** Confirmed not deployed
  on Solana (see `BRIDGE_DISCOVERY.md`); the adapter module documented this
  itself (`SOLANA_PROGRAMS: &[&str] = &[]` with a "not on Solana" comment)
  but was still being seeded into the DB by `apps/api/src/db.ts`, which is
  what let it accumulate a false 100 score.
- **CCTP, Hyperlane — kept as real bridges, seeded `enabled = 0`.** The
  scorer's `if !bridge.enabled { continue }` guard now skips them entirely,
  so no score row is ever written. Both were also pulled out of
  `crates/radar-core/src/bridges::registry()` (the list indexers iterate) —
  leaving them wired in would make the EVM indexer keep emitting a generic
  "any log → Lock event" placeholder for a bridge with zero real Solana-side
  detection, which is its own flavor of fake data. The `cctp.rs`/`hyperlane.rs`
  modules stay in the codebase as the real starting point for whoever builds
  the verified adapter next.
- **Dashboard** (`apps/dashboard`): a bridge that's disabled or has no health
  row now renders as a distinct grey "Not monitored" band (`bandFor()` in
  `packages/shared/src/index.ts`), never falling through to a colored band
  that implies real on-chain data backs it. This also fixed a second instance
  of the same bug class: the bridge detail page previously treated *any*
  missing score as "Anomalies detected — review components" (the `red`
  fallback), a false alarm rather than an honest "not measured" state.

## Why Wormhole (and 10 other bridges) work

Wormhole has a real, verified Solana program ID:
```rust
const SOLANA_TOKEN_BRIDGE: &str = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";
```
Real program ID → indexer watches it → real events → real health score. The
same is true for Allbridge, deBridge, LayerZero, Mayan, Portal, Axelar, Relay,
Across Protocol, Garden Finance, and Coinbase Bridge (Base-Solana) — see
`BRIDGE_REGISTRY.md` for the full list and `BRIDGE_DISCOVERY.md` for how each
program ID was verified against live mainnet RPC.

## Bridges Status (as of this fix)

| Bridge | Status | Events | Health Score |
|--------|--------|--------|---------------|
| Wormhole | ✅ Real adapter | Real | Real |
| Allbridge | ✅ Real adapter | Real | Real |
| deBridge | ✅ Real adapter | Real | Real |
| LayerZero | ✅ Real adapter | Real | Real |
| Mayan | ✅ Real adapter | Real | Real |
| Portal | ✅ Real adapter | Real | Real |
| Axelar | ✅ Real adapter | Real | Real |
| Relay | ✅ Real adapter | Real | Real |
| Across Protocol | ✅ Real adapter | Real | Real |
| Garden Finance | ✅ Real adapter | Real | Real |
| Coinbase Bridge (Base-Solana) | ✅ Real adapter | Real | Real |
| Circle CCTP | ⚠️ Real bridge, no adapter | None | None — shown grey "Not monitored" |
| Hyperlane | ⚠️ Real bridge, no adapter | None | None — shown grey "Not monitored" |
| ~~Stargate~~ | ❌ removed — not on Solana | — | — |
| ~~Lido~~ | ❌ removed — not a bridge | — | — |
| ~~Magic Eden~~ | ❌ removed — not a bridge | — | — |

## Next Steps to Get CCTP/Hyperlane Real Scores

1. **Find and verify official Solana mainnet program IDs** the same way
   `BRIDGE_DISCOVERY.md` did for the other bridges — official docs/GitHub,
   then confirm each is a real, executable program via direct
   `getAccountInfo` RPC (never trust a scraped summary alone):
   - Circle CCTP: https://developers.circle.com/cctp/solana-programs
   - Hyperlane: https://docs.hyperlane.xyz/docs/reference/contract-addresses
2. **Fill in `SOLANA_PROGRAMS` in `cctp.rs`/`hyperlane.rs`** with the verified
   address(es), and review `decode_solana_log`/`decode_evm_log` for real
   instruction/event semantics rather than the current generic placeholder
   decode logic.
3. **Add each back to `crates/radar-core/src/bridges::registry()`**, flip
   `enabled` back to `1` in the DB seed (both `sqlite.rs` and `db.ts`), and
   give it a real unit test from a real historical transaction before
   trusting the score it produces.

## Scoring Algorithm

The v0-naive scorer computes:
- **Outflow Severity**: z-score over 30-day event distribution (fallback: events/10)
- **Parity Severity**: imbalance between origin-side and Solana-side events
- **Final Score**: 100 - (25 * outflow + 40 * parity + 15 * signer + 10 * frontend + 10 * oracle)

Without events, all severities = 0, so score = 100 — which is exactly why an
*unmonitored* bridge must never be scored at all (this fix) rather than
silently scoring perfect.
