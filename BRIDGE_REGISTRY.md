# Bridge Registry & Expansion Guide

## Current Status

**Total Bridges:** 13 registered (11 with a real, verified Solana adapter + 2 real bridges pending an adapter) — more added as the discovery/verification pass (see [BRIDGE_DISCOVERY.md](./BRIDGE_DISCOVERY.md)) turns up real, verifiable Solana program IDs.
**Solana Support:** 100% of tracked bridges — every remaining entry is either
a genuine bridge with a real, verified Solana program watching it, or a
genuine bridge honestly marked not yet monitored. Nothing non-genuine remains.

**2026-07-23 data-integrity fix (first pass):** Lido, Magic Eden, and
Stargate were removed from the registry entirely — Lido (liquid staking) and
Magic Eden (NFT marketplace) were never genuine bridges, and Stargate is
confirmed not deployed on Solana. All three had accumulated a false 100
health score because the scorer scores every *enabled* DB row regardless of
whether a real adapter watches it — a quiet/unmonitored bridge and a
genuinely healthy one looked identical. Circle CCTP and Hyperlane are real
bridges but still have no verified Solana program ID, so they're seeded
`enabled = 0` and shown as a distinct grey "Not monitored" status on the
dashboard instead of a green 100. See `HEALTH_SCORE_STATUS.md` for the full
writeup.

**2026-07-23 audit (second pass), full registry sweep:** Orca, Marinade,
Jito, Phantom Bridge, and Gravity Bridge were also removed entirely — none is
a genuine Solana-connected bridge. Orca is a Solana AMM/DEX; Marinade is
Solana liquid staking (mSOL) with no bridge of its own; Jito is Solana MEV
infra + liquid staking (JitoSOL) with no bridge of its own; Phantom Bridge is
a wallet UI aggregator (LI.FI-powered, routing through Celer/Hop/Allbridge/
Stargate/Across/CCTP/Mayan) with no dedicated bridge program of its own — the
same exclusion category as Interport Finance/UniversalX in
`BRIDGE_DISCOVERY.md`; Gravity Bridge is a real bridge (Ethereum ↔ Cosmos via
IBC) that has never had a Solana leg — same treatment as Stargate. None of
these five were ever seeded into the DB, so none had accumulated a false
score; this pass is pure registry hygiene, not a scoring fix. After this
pass, every remaining registry entry is genuine: 11 scored for real, 2
(CCTP, Hyperlane) honestly unmonitored, 0 mislabeled.

The per-bridge TVL figures previously listed here (e.g. "Wormhole - $850M TVL")
were hardcoded placeholder numbers, not live data — they have been removed
from both this doc and the code (`apps/api/src/bridges.ts` no longer has a
`tvl` field). Real, live TVL now comes from DeFiLlama's `/protocols` endpoint
via `crates/radar-defillama` → `GET /v1/defillama/protocols` and
`GET /v1/bridges` (per-bridge `defillama` field). Verified as of 2026-07-22
(see [[project-defillama-paywall]] for the full picture): Wormhole/Portal
~$1.67B (DeFiLlama tracks both under one "Portal" protocol entry), LayerZero
~$6.85B, Axelar ~$134M, Allbridge ~$5.95M, deBridge ~$2.06M, Hyperlane
~$88.5M, Stargate ~$70.3M, Mayan ~$124K. Circle CCTP has no TVL concept in
DeFiLlama's model (burn-and-mint, not locked liquidity) — correctly absent,
not a bug. Check the live endpoint for current numbers; don't hardcode these
back into source.

### Tier 1: Implemented (11 bridges)
Wormhole, Portal, LayerZero, Axelar, Allbridge, deBridge, Mayan, Relay,
Across Protocol, Garden Finance, Coinbase Bridge (Base-Solana).

### Tier 2: Registered, detection not yet implemented (2 bridges)
Circle CCTP, Hyperlane. Both are seeded `enabled = 0` in the DB (no verified
Solana program ID yet) and render as a grey "Not monitored" status on the
dashboard — never a scored 100.

### Removed — not genuine Solana-connected bridges
Stargate (confirmed not deployed on Solana), Lido (liquid staking, not a
bridge), Magic Eden (NFT marketplace, not a bridge), Orca (Solana AMM/DEX,
not a bridge), Marinade (Solana liquid staking, no bridge of its own), Jito
(Solana MEV infra + liquid staking, no bridge of its own), Phantom Bridge
(wallet UI aggregator over third-party bridges, no dedicated bridge program
of its own), Gravity Bridge (real Ethereum↔Cosmos bridge, never had a Solana
leg). See the audit notes above and `HEALTH_SCORE_STATUS.md` for detail on
each.

There is no more Tier 3 ("unverified, pending discovery") or Tier 4
("inactive/deprecated") — every entry that was in either tier turned out to
be a non-bridge or a non-Solana bridge, and has been removed rather than kept
around in a hedge state. Anything discovered in the future goes through
`BRIDGE_DISCOVERY.md`'s verification process before it's added back.

---

## Data Sources

✅ **Used (free, live, verified 2026-07-22):**
- `api.llama.fi/protocols`, `/v2/historicalChainTvl/solana`, `/overview/dexs/solana`, `/overview/fees/solana`
- `stablecoins.llama.fi/stablecoins`
- `coins.llama.fi/prices/current/solana:{mint}`
- Bridge official websites / docs / GitHub / Solscan for program ID verification

❌ **Behind DeFiLlama's Pro API ($300/mo, not purchased):**
- Bridges list (`bridges.llama.fi/bridges`), bridge volume
  (`bridges.llama.fi/bridgevolume/{chain}`), oracles TVS (`api.llama.fi/oracles`)
- These honestly report "unavailable — requires DeFiLlama Pro API key" via
  `GET /v1/defillama/{bridges,bridge-volume,oracles}` — never fake data.

---
( soon gonna use all bridges api to be stay updated with it ) 
## Bridge Registry Structure

Located in: `apps/api/src/bridges.ts`

```typescript
interface BridgeRegistry {
  id: string;                    // unique identifier
  name: string;                  // display name
  homepage?: string;             // official website
  supportedChains: string[];     // list of supported chains
  hasSolana: boolean;            // Solana support flag
  status: "active" | "inactive" | "planned"; // operational status
  detectionStatus: "implemented" | "not_yet_supported"; // detection readiness
}
```

No `tvl` field — a hardcoded one used to live here and was removed (see
"Current Status" above). Real TVL is served separately via
`GET /v1/bridges` (`defillama` field, sourced from `crates/radar-defillama`).

### API Endpoint

**GET /v1/registry** - Returns all bridges with metadata (identity + detection status only)

```json
{
  "summary": {
    "total": 13,
    "implemented": 11,
    "planned": 2
  },
  "implemented": [
    {
      "id": "wormhole",
      "name": "Wormhole",
      "homepage": "https://wormhole.com",
      "supportedChains": ["solana", "ethereum", ...],
      "hasSolana": true,
      "status": "active"
    }
  ],
  "planned": [
    {
      "id": "cctp",
      "name": "Circle CCTP",
      ...
    }
  ]
}
```

---

## How to Add a New Bridge

### Step 1: Add to Registry

Edit `apps/api/src/bridges.ts`:

```typescript
{
  id: "new-bridge",
  name: "New Bridge",
  homepage: "https://newbridge.com",
  supportedChains: ["solana", "ethereum"],
  hasSolana: true,
  status: "active",
  detectionStatus: "not_yet_supported",
}
```

### Step 2: Implement Detection

Once detection logic is ready, update `detectionStatus` to `"implemented"`.

Detection logic lives in:
- **Solana indexer**: `crates/radar-indexer-solana/src/main.rs`
- **EVM indexer**: `crates/radar-indexer-evm/src/main.rs`

### Step 3: Add to Database

The API automatically seeds bridges from the registry on startup. No manual DB changes needed.

---

## Next Steps (In Order)

### Step 1: Implement Detection for Tier 2 Bridges

**Priority Order (by TVL):**
1. **Circle CCTP** ($600M) - USDC native bridge
2. **Hyperlane** ($75M) - Interoperability

**For each bridge:**
1. Identify contract addresses on Solana + EVM chains
2. Add event parsing logic to indexers
3. Map events to standard `BridgeEvent` format
4. Test with real transaction data
5. Update `detectionStatus` to `"implemented"`

**Files to modify:**
- `crates/radar-indexer-solana/src/main.rs` - Solana program detection
- `crates/radar-indexer-evm/src/main.rs` - EVM contract detection

**Example detection pattern:**
```rust
// Solana: Listen for bridge program events
if instruction.program_id == BRIDGE_PROGRAM_ID {
  parse_bridge_event(instruction);
}

// EVM: Listen for bridge contract events
if log.address == BRIDGE_CONTRACT {
  parse_bridge_log(log);
}
```

---

### Step 2: Safely Expand Indexing

**Goal:** Add Solana + EVM indexing without breaking existing bridges

**Process:**
1. **Feature flag new bridges** - Keep them disabled by default
   ```typescript
   // In bridges.ts
   status: "active" // or "inactive" for testing
   ```

2. **Test in isolation** - Run indexer against testnet first
   ```bash
   SOLANA_RPC_URL=https://api.devnet.solana.com npm run dev:indexer
   ```

3. **Gradual rollout** - Enable one bridge at a time
   - Monitor error rates
   - Check event ingestion
   - Verify health scores

4. **Fallback plan** - If issues arise, disable bridge:
   ```typescript
   status: "inactive" // Stops detection
   ```

---

### Step 3: Test Bridge Data Correctness

**Goal:** Ensure detected events match real bridge activity

**Testing checklist:**

1. **Unit tests** - Event parsing
   ```bash
   cargo test -p radar-indexer-solana
   cargo test -p radar-indexer-evm
   ```

2. **Integration tests** - End-to-end flow
   - Send test transaction through bridge
   - Verify event appears in `/v1/events`
   - Check health score calculation

3. **Data validation**
   - Compare with bridge's official API
   - Verify chain/asset/amount fields
   - Check timestamp accuracy

4. **Monitoring**
   - Alert on missing events
   - Track detection latency
   - Monitor error rates per bridge

---

## Quick Reference

### Add Bridge to Registry
```bash
# Edit apps/api/src/bridges.ts
# Add entry with detectionStatus: "not_yet_supported"
```

### Implement Detection
```bash
# Edit indexer source
# crates/radar-indexer-solana/src/main.rs
# crates/radar-indexer-evm/src/main.rs
```

### Enable Bridge
```bash
# Update detectionStatus to "implemented"
# Restart API
```

### Check Registry
```bash
curl http://localhost:3001/v1/registry
```

---

## Architecture

```
Bridge Registry (bridges.ts)
    ↓
API Endpoint (/v1/registry)
    ↓
Database (bridges table)
    ↓
Indexers (Solana + EVM)
    ↓
Events Table
    ↓
Health Scorer
    ↓
Dashboard
```

Each bridge flows through this pipeline. New bridges are added to the registry first, then detection is implemented incrementally.

---

## Maintenance

### TVL Data
- No manual updates needed — `crates/radar-defillama` syncs real TVL from
  DeFiLlama on its own schedule, served via `GET /v1/bridges`/`/v1/defillama/protocols`.

### Add New Bridges
- Research bridge support for Solana
- Add to appropriate tier
- Set `detectionStatus: "not_yet_supported"`
- Implement detection when ready

### Deprecate Bridges
- Set `status: "inactive"`
- Keep in registry for historical data
- Don't remove (breaks existing data)
