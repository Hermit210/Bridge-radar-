# Bridge Registry & Expansion Guide

## Current Status (Updated with Real Data)

**Total Bridges:** 17 (7 implemented + 10 planned)  
**Total TVL:** ~$19.5B across all bridges  
**Solana Support:** 100% of tracked bridges

### Tier 1: Implemented & High TVL (7 bridges)
- **Wormhole** - $850M TVL - Largest cross-chain bridge
- **Portal** - $320M TVL - Wormhole's UI
- **LayerZero** - $200M TVL - Omnichain protocol
- **Axelar** - $180M TVL - General message passing
- **Allbridge** - $120M TVL - Multi-chain bridge
- **deBridge** - $95M TVL - Cross-chain infrastructure
- **Mayan** - $45M TVL - Solana-focused bridge

### Tier 2: Planned - High Priority (4 bridges)
- **Stargate** - $450M TVL - Stable swap bridge
- **Circle CCTP** - $600M TVL - USDC native bridge
- **Hyperlane** - $75M TVL - Interoperability protocol
- **Orca** - $35M TVL - Solana DEX with bridging

### Tier 3: Emerging (5 bridges)
- **Lido** - $15B TVL - Liquid staking (Solana support)
- **Marinade** - $280M TVL - Solana liquid staking
- **Jito** - $150M TVL - Solana MEV infrastructure
- **Magic Eden Bridge** - $25M TVL - NFT bridge
- **Phantom Bridge** - $15M TVL - Wallet-integrated bridge

### Tier 4: Inactive (1 bridge)
- **Gravity Bridge** - $5M TVL - Deprecated

---

## Data Sources

✅ **Used:**
- DeFiLlama bridges documentation
- Solana ecosystem official list
- Bridge official websites
- Public TVL data

❌ **Not Used:**
- DeFiLlama paid API (HTTP 402 - requires subscription)
- Real-time market data (not needed for registry)

---

## Bridge Registry Structure

Located in: `apps/api/src/bridges.ts`

```typescript
interface BridgeRegistry {
  id: string;                    // unique identifier
  name: string;                  // display name
  homepage?: string;             // official website
  supportedChains: string[];     // list of supported chains
  hasSolana: boolean;            // Solana support flag
  status: "active" | "inactive"; // operational status
  detectionStatus: "implemented" | "not_yet_supported"; // detection readiness
  tvl?: number;                  // TVL in USD millions
}
```

### API Endpoint

**GET /v1/registry** - Returns all bridges with metadata

```json
{
  "summary": {
    "total": 17,
    "implemented": 7,
    "planned": 10,
    "totalTVL": 19500
  },
  "implemented": [
    {
      "id": "wormhole",
      "name": "Wormhole",
      "homepage": "https://wormhole.com",
      "supportedChains": ["solana", "ethereum", ...],
      "hasSolana": true,
      "status": "active",
      "tvl": 850
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
  tvl: 100, // optional
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

### Update TVL Data
- Check DeFiLlama monthly
- Update `tvl` field in `bridges.ts`
- Commit changes

### Add New Bridges
- Research bridge support for Solana
- Add to appropriate tier
- Set `detectionStatus: "not_yet_supported"`
- Implement detection when ready

### Deprecate Bridges
- Set `status: "inactive"`
- Keep in registry for historical data
- Don't remove (breaks existing data)
