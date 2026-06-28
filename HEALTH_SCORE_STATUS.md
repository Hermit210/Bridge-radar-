# Health Score Status Report

## Current State

Health scores are **not displaying real data** because the bridge adapters for CCTP and Hyperlane are missing their Solana program IDs.

## Root Cause Analysis

## Why Scores Aren't Showing

1. **Adapters have empty Solana program arrays**
   - `crates/radar-core/src/bridges/cctp.rs`: `const SOLANA_PROGRAMS: &[&str] = &[];`
   - `crates/radar-core/src/bridges/hyperlane.rs`: `const SOLANA_PROGRAMS: &[&str] = &[];`
   - `crates/radar-core/src/bridges/stargate.rs`: `const SOLANA_PROGRAMS: &[&str] = &[];` (intentional - not on Solana)

2. **Indexer only watches registered programs**
   - `crates/radar-indexer-solana/src/main.rs` collects programs from adapters
   - If adapters return empty arrays, nothing gets watched
   - No programs watched = no logs subscribed = no events captured

3. **Scorer depends on events**
   - `crates/radar-scorer/src/main.rs` reads events from database
   - If no events exist, it computes default scores (100 for quiet bridges)
   - No events = no meaningful health data

4. **Dashboard shows default/empty scores**
   - API returns scores from database
   - If no scores exist, bridges show `null` or default values

## Why Wormhole Works

Wormhole has a real Solana program ID:
```rust
const SOLANA_TOKEN_BRIDGE: &str = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";
```

This enables:
1. Real event indexing
2. Real health score computation
3. Real data on dashboard

## Architecture Chain

```
Solana Indexer
    ↓ (watches programs from adapters)
Bridge Adapters (CCTP, Hyperlane need program IDs)
    ↓ (if programs registered)
Captures Logs
    ↓
Stores Events in Database
    ↓
Scorer (reads events)
    ↓
Computes Health Scores
    ↓
API (returns scores)
    ↓
Dashboard (displays scores)
```

## Next Steps to Enable Real Scores

1. **Find official Solana program IDs:**
   - Circle CCTP: https://developers.circle.com/cctp/solana-programs
   - Hyperlane: https://docs.hyperlane.xyz/docs/reference/contract-addresses

2. **Update adapters with program IDs:**
   - `crates/radar-core/src/bridges/cctp.rs`
   - `crates/radar-core/src/bridges/hyperlane.rs`

3. **Rebuild and restart indexer:**
   - Indexer will start capturing real events
   - Scorer will compute real health scores
   - Dashboard will show real data

## Current Implementation Status

- ✅ 12 real bridges configured
- ✅ Bridge adapters created and registered
- ✅ Decoder logic implemented
- ✅ Scorer running (computing default scores)
- ✅ API endpoints working
- ✅ Dashboard displaying bridges
- ❌ CCTP/Hyperlane Solana program IDs missing
- ❌ No real events being indexed for CCTP/Hyperlane
- ❌ No real health scores for CCTP/Hyperlane

## Bridges Status

| Bridge | Status | Events | Health Scores |
|--------|--------|--------|---------------|
| Wormhole | ✅ Full | Real | Real |
| Allbridge | ✅ Full | Real | Real |
| deBridge | ✅ Full | Real | Real |
| LayerZero | ✅ Full | Real | Real |
| Mayan | ✅ Full | Real | Real |
| Portal | ✅ Full | Real | Real |
| Axelar | ✅ Full | Real | Real |
| Stargate | ⚠️ EVM Only | EVM Only | Default |
| CCTP | ⚠️ Partial | None | Default |
| Hyperlane | ⚠️ Partial | None | Default |
| Lido | ⚠️ Partial | None | Default |
| Magic Eden | ⚠️ Partial | None | Default |

## Files Involved

- `crates/radar-core/src/bridges/cctp.rs` - CCTP adapter (needs program IDs)
- `crates/radar-core/src/bridges/hyperlane.rs` - Hyperlane adapter (needs program IDs)
- `crates/radar-core/src/bridges/stargate.rs` - Stargate adapter (EVM only)
- `crates/radar-indexer-solana/src/main.rs` - Solana indexer
- `crates/radar-scorer/src/main.rs` - Health score scorer
- `apps/api/src/index.ts` - API endpoints
- `apps/api/src/db.ts` - Database layer

## Scoring Algorithm

The v0-naive scorer computes:
- **Outflow Severity**: z-score over 30-day event distribution (fallback: events/10)
- **Parity Severity**: imbalance between origin-side and Solana-side events
- **Final Score**: 100 - (25 * outflow + 40 * parity + 15 * signer + 10 * frontend + 10 * oracle)

Without events, all severities = 0, so score = 100 (perfect).

## Verification

To verify real events are being indexed:
```bash
curl http://localhost:3001/v1/events?bridge=wormhole
# Should return real events

curl http://localhost:3001/v1/events?bridge=hyperlane
# Currently returns empty (no events indexed)


To verify health scores:
```bash
curl http://localhost:3001/v1/bridges
# Shows scores for all bridges
```
