# Bridge Registry & Expansion Guide

## Current Status

**Total Bridges:** 18 registered (8 implemented + 10 planned/unverified) — more added as the discovery/verification pass (see [BRIDGE_DISCOVERY.md](./BRIDGE_DISCOVERY.md)) turns up real, verifiable Solana program IDs.
**Solana Support:** 100% of tracked bridges

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

### Tier 1: Implemented (7 bridges)
Wormhole, Portal, LayerZero, Axelar, Allbridge, deBridge, Mayan.

### Tier 2: Registered, detection not yet implemented (4 bridges)
Stargate, Circle CCTP, Hyperlane, Orca.

### Tier 3: Unverified — pending discovery/verification pass (5 bridges)
Lido, Marinade, Jito, Magic Eden Bridge, Phantom Bridge. These may be
DeFiLlama-mislabeled non-bridges (LSTs, wallets, MEV infra) rather than
genuine cross-chain bridges — do not write adapters for these without
verifying a real Solana program ID from an authoritative source first.

### Tier 4: Inactive (1 bridge)
Gravity Bridge — deprecated.

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
    "total": 18,
    "implemented": 8,
    "planned": 9
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
      "id": "stargate",
      "name": "Stargate",
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
2. **Stargate** ($450M) - Stable swap bridge
3. **Hyperlane** ($75M) - Interoperability
4. **Orca** ($35M) - Solana DEX bridge

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
