# Bridge Registry & Expansion Guide

## Current Status

**Implemented Bridges (7):**
- Wormhole
- Allbridge
- deBridge
- LayerZero
- Mayan
- Portal
- Axelar

**Planned Bridges (4):**
- Stargate
- Hyperlane
- Circle CCTP
- Orca

All bridges support Solana + multiple EVM chains.

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
}
```

### API Endpoint

**GET /v1/registry** - Returns all implemented bridges with metadata

```json
{
  "total": 7,
  "bridges": [
    {
      "id": "wormhole",
      "name": "Wormhole",
      "homepage": "https://wormhole.com",
      "supportedChains": ["solana", "ethereum", ...],
      "hasSolana": true,
      "status": "active"
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
  detectionStatus: "not_yet_supported", // Mark as planned
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

### Step 1: Implement Detection for New Bridges

**Goal:** Add detection logic for Stargate, Hyperlane, CCTP, Orca

**For each bridge:**
1. Identify contract addresses on Solana + EVM chains
2. Add event parsing logic to indexers
3. Map events to standard `BridgeEvent` format
4. Test with real transaction data
5. Update `detectionStatus` to `"implemented"`

**Files to modify:**
- `crates/radar-indexer-solana/src/main.rs` - Solana program detection
- `crates/radar-indexer-evm/src/main.rs` - EVM contract detection

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
