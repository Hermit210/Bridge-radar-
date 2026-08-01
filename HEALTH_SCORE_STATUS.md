# Health Score Status Report

## Resolved (2026-08-01) — signer/frontend/oracle wired into the actual score

Until this fix, `crates/radar-scorer/src/main.rs` only ever computed
`outflow_severity` and `parity_severity`; `signer_recency`,
`frontend_recency`, and `oracle_staleness` were hardcoded to `0.0` via
`..Default::default()` — even though `radar-watchers` was already running
its signer-set, frontend-hash, and oracle-staleness detectors and
persisting real `signer_change` / `frontend_change` / `oracle_stale` events
(visible on `/v1/events`). A real detected frontend hijack or signer-set
change did not move any bridge's score at all. `weighted_score()` in
`crates/radar-core/src/storage.rs` already implemented the full whitepaper
§4.4 formula (`100 − 40·parity − 25·outflow − 15·signer − 10·frontend −
10·oracle`) — the weights were never the problem, the three components were
just never populated.

**The fix**: `compute_score()` now calls a new `recency_severity()` helper
for each of the three detector kinds, reading the most recent real event of
that kind for the bridge (via the existing `Storage::list_events` /
`EventFilter`, no new storage methods needed) and linearly decaying its
severity from 1.0 at the moment it happened to 0.0 at the window edge:

- `signer_recency` — 24h window (whitepaper §4.4: "decays over 24h")
- `frontend_recency` — 6h window (whitepaper §4.4: "decays over 6h")
- `oracle_staleness` — 5min window. The whitepaper doesn't specify one for
  this component; 5 minutes was chosen because `radar-watchers`' oracle
  loop (`oracle.rs`) is level-triggered — it re-emits `oracle_stale` on
  every 60s poll for as long as a feed stays stale, unlike signer/frontend
  which are edge-triggered (one event per real change) — so a short window
  tracks "is this feed stale right now" rather than "recently had an
  incident."

No new detection was built — this is purely reading already-real,
already-persisted events back into the score.

**Real proof, against the live production DB** (not a synthetic replay):
before the fix, `wormhole` and `portal` both sat at a perfect 100
(`frontend_recency: 0`). After restarting the scorer with the fix, the very
next tick picked up a real `frontend_change` event already recorded for
`portal` (`event_time: 2026-08-01T14:31:49Z`, hash
`993e1f73a7...` → `cfe8cb09ac...`) and scored it 68 seconds later:
`frontend_recency: 0.9969` (`= 1 − 68/21600`, exactly the documented decay),
score `100 → 90`. Same real mechanism fired for `wormhole` off its own real
frontend_change event. Both bridges recovered toward 100 again as those
events aged out of the 6h window on subsequent ticks — this is the decay
working as designed, not a bug.

Also added 5 new unit tests (`crates/radar-scorer/src/main.rs`) proving the
decay boundary in both directions — a 1h-old signer_change/frontend_change
event measurably lowers the score, a 25h-old signer_change or 7h-old
frontend_change has zero effect — plus one for oracle_staleness. Full
`cargo test --workspace` passes (90 tests, 0 failures) with no regressions
to any existing test.

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

## Why Wormhole (and 13 other bridges) work

Wormhole has a real, verified Solana program ID:
```rust
const SOLANA_TOKEN_BRIDGE: &str = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";
```
Real program ID → indexer watches it → real events → real health score. The
same is true for the other 13 enabled bridges — see `BRIDGE_REGISTRY.md` for
the full list and `BRIDGE_DISCOVERY.md` for how each program ID was verified
against live mainnet RPC, and how each was found across 3 discovery passes.

## Bridges Status (updated 2026-08-01 — 14 real adapters, not 11)

Atomiq Exchange, rhino.fi, and Orderly Network were built after this doc's
original 2026-07-23 snapshot (discovery passes 2 and 3) and are added below.

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
| Atomiq Exchange | ✅ Real adapter | Real | Real |
| rhino.fi | ✅ Real adapter | Real | Real |
| Orderly Network | ✅ Real adapter | Real | Real |
| Circle CCTP | ⚠️ Real bridge, no adapter | None | None — shown grey "Not monitored" |
| Hyperlane | ⚠️ Real bridge, no adapter | None | None — shown grey "Not monitored" |
| ~~Stargate~~ | ❌ removed — not on Solana | — | — |
| ~~Lido~~ | ❌ removed — not a bridge | — | — |
| ~~Magic Eden~~ | ❌ removed — not a bridge | — | — |

Of the 14, only Wormhole and Portal currently have a real `frontend_change`
event recorded (both watch the same `portalbridge.com` frontend — see
`radar-watchers/src/frontend.rs` `targets()`); no bridge has a real
`signer_change` event yet (the v0 Wormhole guardian-set fetch is a
synthesized deterministic list — see `signer.rs` — so it structurally never
diffs against itself; a real diffable source is v1 work). No bridge
currently has a real `oracle_stale` event (all watched Pyth feeds are
fresh). All three components are live and will move any bridge's score the
moment a real qualifying event is recorded for it.

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

All 5 whitepaper §4.4 components are real and wired in as of 2026-08-01:
- **Outflow Severity**: z-score over 30-day event distribution (fallback: events/10)
- **Parity Severity**: imbalance between origin-side and Solana-side events
- **Signer Recency**: recency of the most recent real `signer_change` event, decays over 24h
- **Frontend Recency**: recency of the most recent real `frontend_change` event, decays over 6h
- **Oracle Staleness**: recency of the most recent real `oracle_stale` event, decays over 5min
- **Final Score**: 100 - (25 * outflow + 40 * parity + 15 * signer + 10 * frontend + 10 * oracle)

Without events, all severities = 0, so score = 100 — which is exactly why an
*unmonitored* bridge must never be scored at all (this fix) rather than
silently scoring perfect.
