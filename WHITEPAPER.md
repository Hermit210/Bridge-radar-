# Bridge Radar

**A real-time bridge-health intelligence layer for Solana.**

Version 0.1 — April 2026
Author: Pratik Kale

---

## 1. Abstract

Cross-chain bridges remain the single largest source of value loss in crypto. Over $2.8B has been drained from bridges since 2022 — Wormhole, Ronin, Nomad, Multichain, Orbit, Radiant, and a long tail of smaller incidents. Most exploits did not happen silently: they emitted detectable signals — anomalous outflows, signer-set rotations, mint-vs-lock divergence, frontend bundle changes, oracle staleness — minutes to days before the drain completed. No public, real-time, free service today aggregates these signals across the bridges that touch Solana.

**Bridge Radar** is an open-source, real-time intelligence layer that monitors every bridge with a Solana leg. It answers a single question for users, dApps, and Foundation grant reviewers: *is this bridge healthy right now?* It exposes the answer through a public dashboard, a JSON/WebSocket API, an on-chain oracle program, and a webhook alerting system.

Bridge Radar is positioned as **public-goods infrastructure** — free at the point of use, open source from day one, governance-minimal, and built to be donatable to the Solana Foundation or another neutral steward at maturity.

---

## 2. The Problem

### 2.1 Bridges are the weakest link in Solana's interop story

Solana is the highest-throughput L1 in production, but its connection to other ecosystems still depends on trust assumptions that range from "small multisig" to "single off-chain relayer." The dominant Solana bridges and their core trust roots:

| Bridge        | Trust root                              | Solana-side authority           |
|---------------|------------------------------------------|---------------------------------|
| Wormhole      | 19 Guardian validators (13/19 quorum)    | Mint authority on wrapped SPL   |
| LayerZero     | DVN set + Executor (configurable)        | OApp-controlled minting         |
| Allbridge     | Validator set (small)                    | Wrapped SPL mint                |
| deBridge      | Validator set with slashing              | Wrapped SPL mint                |
| Mayan Swift   | Auctioneer-relayer with refund window    | Solver settlement               |
| Portal (WH)   | Inherits Wormhole guardians              | Wrapped SPL mint                |
| Axelar        | Validator set with stake-weighted voting | Squid-routed wrapped assets     |

Every one of these can be modeled as: **a quorum of off-chain signers controls minting on Solana.** When that quorum is compromised — or when its frontend, relayer, or oracle dependency is — Solana users lose money.

### 2.2 Exploits emit signals before drain completes

Post-mortems of every major 2022–2025 bridge exploit reveal **observable lead indicators**:

- **Multichain (July 2023, $126M)** — admin keys had moved to a single individual months before; on-chain ops had become opaque, deposits stopped being processed normally hours before drain.
- **Orbit Chain (Jan 2024, $82M)** — signer-set anomaly precipitated drain.
- **Ronin (Mar 2022, $625M)** — drain happened, was not detected for **6 days**.
- **Radiant (Oct 2024, $50M)** — drained over multiple transactions across hours; lock-vs-mint parity broke immediately.
- **Curve / Galxe / Balancer (multiple)** — frontend DNS / IPFS hijacks; bundle hash diverged from known-good for hours.

The pattern is consistent: **anomalies are visible on-chain, and frontend changes are visible at the edge.** The missing piece is a watcher that sees them all in one place, in real time, in public.

### 2.3 Existing tools don't fill this gap

- **L2Beat / Bridge analytics** — TVL snapshots, daily granularity, no alerting, no Solana focus.
- **Etherscan / Solscan** — raw chain data, no cross-bridge aggregation, no semantic alerts.
- **Forta / Hexagate / internal SOC tooling** — closed, paid, enterprise-only.
- **Each bridge's own status page** — when the bridge itself is the attacker or compromised, its status page is unreliable by definition.

There is no public, real-time, neutral, Solana-focused equivalent. **Bridge Radar fills exactly that gap.**

---

## 3. What Bridge Radar Is

A 24/7 monitoring system that, for every supported bridge:

1. Tracks **lock-vs-mint parity** per asset across origin and Solana.
2. Detects **signer-set / Guardian-set / DVN-set changes** within minutes of inclusion.
3. Detects **anomalous outflows** (rolling z-score over historical baseline).
4. Watches **frontend bundle hashes** for the bridge's official URL and warns on drift.
5. Tracks **oracle / price-feed staleness** for assets the bridge depends on.
6. Surfaces a single per-bridge **Health Score (0–100)** with component breakdown.

It exposes this through:

- A **public dashboard** (`bridgeradar.xyz` — placeholder).
- A **JSON REST API** + **WebSocket** stream — free, rate-limited, open to dApps.
- An **on-chain oracle program** on Solana — dApps can read a bridge's current health score in their own programs and gate withdrawals/mints accordingly.
- **Webhook + Telegram + Discord alerts** for anomaly events.

---

## 4. System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │              Data Ingestion Layer            │
                  │                                              │
   Solana RPC ─►  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
                  │  │ SOL      │  │ EVM      │  │ Cosmos /   │  │
   EVM RPCs   ─►  │  │ indexer  │  │ indexer  │  │ Sui /      │  │
                  │  │          │  │          │  │ Aptos i.   │  │
   Cosmos     ─►  │  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
                  │       │             │              │         │
                  │       └─────────────┼──────────────┘         │
                  │                     ▼                        │
                  │          ┌────────────────────┐              │
                  │          │   Event Normalizer │              │
                  │          └─────────┬──────────┘              │
                  └────────────────────┼─────────────────────────┘
                                       ▼
                  ┌──────────────────────────────────────────────┐
                  │            Detection Engine                  │
                  │   ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
                  │   │ Parity   │ │ Outflow  │ │ Signer-set   │ │
                  │   │ checker  │ │ z-score  │ │ diff watcher │ │
                  │   └──────────┘ └──────────┘ └──────────────┘ │
                  │   ┌──────────────┐ ┌─────────────────────┐   │
                  │   │ Frontend     │ │ Oracle staleness    │   │
                  │   │ hash watcher │ │ checker             │   │
                  │   └──────────────┘ └─────────────────────┘   │
                  └────────────────────┬─────────────────────────┘
                                       ▼
                  ┌──────────────────────────────────────────────┐
                  │            Scoring & Storage                 │
                  │   Health Score model + TimescaleDB           │
                  └────────────────────┬─────────────────────────┘
                                       ▼
        ┌───────────────┬──────────────┼──────────────┬───────────────┐
        ▼               ▼              ▼              ▼               ▼
    Dashboard     REST / WS API   Webhooks /    On-chain Oracle    Public
    (Next.js)                     Telegram      (Anchor program)   datasets
```

### 4.1 Data Ingestion

- **Solana indexer** — Geyser plugin or Helius webhooks for low-latency event capture; backfill via standard RPC for historical baseline.
- **EVM indexer** — `viem` + a redundant pool of public + private RPCs (Alchemy, QuickNode, Ankr). Reorg-safe via N-block confirmation buffer.
- **Cosmos / Sui / Aptos** — chain-specific clients, only for bridges that touch those chains.
- **Frontend watcher** — headless browser job (Playwright) that fetches each bridge's official frontend every 5 minutes from multiple geographies, hashes the served bundle, and stores the hash chain.

### 4.2 Event Normalizer

Raw events from each chain are normalized into a uniform event model:

```ts
type BridgeEvent =
  | { type: 'lock';     bridge: string; asset: string; amountUSD: number; chain: ChainId; tx: string; ts: number }
  | { type: 'mint';     bridge: string; asset: string; amountUSD: number; chain: ChainId; tx: string; ts: number }
  | { type: 'burn';     bridge: string; asset: string; amountUSD: number; chain: ChainId; tx: string; ts: number }
  | { type: 'unlock';   bridge: string; asset: string; amountUSD: number; chain: ChainId; tx: string; ts: number }
  | { type: 'signer_change'; bridge: string; before: string[]; after: string[]; tx: string; ts: number }
  | { type: 'frontend_change'; bridge: string; oldHash: string; newHash: string; ts: number }
  | { type: 'oracle_stale';  bridge: string; feed: string; lastUpdate: number; ts: number };
```

This is the schema that powers everything downstream and the schema we expose publicly.

### 4.3 Detection Engine

**Lock-vs-Mint Parity.** For each (bridge, asset), maintain rolling totals: `locked_origin`, `minted_solana`, `burned_solana`, `unlocked_origin`. The invariant is `minted_solana - burned_solana ≤ locked_origin - unlocked_origin + tolerance`. When violated by more than `ε`, fire `parity_break` alert. Tolerance accounts for in-flight messages (per-bridge configurable).

**Outflow Anomaly.** Rolling z-score of 5-minute outflow against trailing 30-day distribution per (bridge, asset). `z > 4` → `anomaly_outflow` alert. Accounts for exchange-driven legitimate spikes via a known-address allowlist.

**Signer-set Diff.** For each bridge with an enumerable signer set (Wormhole Guardians, LayerZero DVNs, Axelar validators), poll the canonical registry every block / epoch. Any addition, removal, or rotation fires `signer_change`.

**Frontend Hash Watcher.** Compute `sha256(served_bundle)` per geography. Drift fires `frontend_change`. False positives from legitimate releases are reduced by a 30-minute confirmation window + cross-region consensus + matching against the bridge's GitHub release artifacts where published.

**Oracle Staleness.** For bridges that depend on price feeds (Pyth, Switchboard, Chainlink) for fee or solvency checks, alert if `now - last_update > threshold`.

### 4.4 Health Score Model

A weighted composite per bridge, recomputed every minute:

```
HealthScore = 100
  - 40 * parity_break_severity      (0..1)
  - 25 * outflow_anomaly_severity   (0..1)
  - 15 * signer_change_recency      (0..1, decays over 24h)
  - 10 * frontend_drift_recency     (0..1, decays over 6h)
  - 10 * oracle_staleness           (0..1)
```

Clamped to `[0, 100]`. Bands: **Green ≥ 80 / Yellow 50–79 / Red < 50**. Weights are public, versioned, and adjustable through governance once the project is donated.

### 4.5 On-chain Oracle Program

An Anchor program on Solana that stores `(bridge_id, health_score, last_updated, signer_pubkey)` in PDA accounts. Updates are pushed by an off-chain attester (Bridge Radar's signing key initially; multi-attester quorum at v2). dApps read this via CPI:

```rust
pub fn check_bridge_health(ctx: Context<CheckBridge>, bridge_id: [u8; 32]) -> Result<u8> {
    let health = &ctx.accounts.health_account;
    require!(Clock::get()?.unix_timestamp - health.last_updated < 600, BridgeError::StaleHealth);
    require_keys_eq!(health.bridge_id, bridge_id);
    Ok(health.score)
}
```

A lending protocol could refuse to accept wrapped USDC as collateral when the issuing bridge's score drops below 70. A DEX could pause a cross-chain pool. This is the long-term value-capture path: **infrastructure that other Solana programs depend on.**

---

## 5. Scope

### 5.1 In scope (v1)

- Bridges: **Wormhole, LayerZero, Allbridge, deBridge, Mayan, Portal, Axelar (Squid)**.
- Chains observed: **Solana, Ethereum, Arbitrum, Base, Optimism, Polygon, BNB, Sui, Cosmos hub**.
- Detectors: parity, outflow, signer-set, frontend, oracle staleness.
- Public dashboard, REST + WS API, on-chain oracle (single attester), Telegram + Discord + webhook alerts.

### 5.2 Out of scope (v1, may be v2+)

- Slashable attester network (DePIN-style).
- ML-based anomaly detection beyond z-scores.
- Insurance / payout layer.
- Bridges with no Solana leg.
- Mobile-native app (web is responsive).

### 5.3 Explicit non-goals

- We do not operate any bridge.
- We do not custody user funds.
- We do not provide trading or yield.
- We do not give financial advice — Health Score is signal, not recommendation.

---

## 6. Roadmap & Milestones

**Total budget request: $5,000 (Solana Foundation India grant).**
**Timeline: 12 weeks from grant approval.**

| Phase | Weeks | Deliverables                                                                 | Budget |
|-------|-------|------------------------------------------------------------------------------|--------|
| 0     | 1     | Repo, CI, infra (TimescaleDB on Hetzner, Redis, Helius account)              | $300   |
| 1     | 2–4   | Solana + EVM indexers, normalized event store, parity detector for Wormhole + Allbridge | $1,200 |
| 2     | 5–6   | Outflow + signer-set + frontend + oracle detectors; Health Score v1          | $1,000 |
| 3     | 7–8   | Public dashboard (Next.js + shadcn), REST + WS API                           | $1,000 |
| 4     | 9–10  | On-chain oracle program (Anchor), devnet + mainnet deploy, audit-light review| $1,000 |
| 5     | 11    | Telegram/Discord/webhook alerting, docs, public launch                       | $300   |
| 6     | 12    | Stretch: add LayerZero, deBridge, Mayan; community handoff doc               | $200   |

Self-funded buffer for RPC overage and domain registration.

---

## 7. Tech Stack

- **Backend:** Rust (indexers, detectors), TypeScript (API gateway).
- **Database:** TimescaleDB (event store + time-series), Redis (real-time cache).
- **Solana:** Anchor 0.31, Helius RPC + Geyser, Pyth for cross-checks.
- **EVM:** `viem`, redundant RPCs.
- **Frontend:** Next.js 15 + Tailwind + shadcn/ui + Recharts.
- **Infra:** Hetzner (€20/mo), Cloudflare (free tier), GitHub Actions CI.
- **Observability:** Grafana + self-hosted Loki for our own pipeline (we monitor the monitor).

---

## 8. Why Now

1. **Fresh, public demand.** The two Reddit threads that prompted this proposal (Nolus IBC-Solana announcement; retail bridge-fragility post on hedging SOL yield) demonstrate that both sides of the market — protocol builders and end users — are actively asking for trust-minimized cross-chain visibility.
2. **The data is reachable.** Helius geyser + cheap RPCs make sub-second Solana indexing trivial in 2026 in a way it wasn't in 2023.
3. **The bridges aren't going away.** Solray-style IBC light clients are years from covering every bridge. Until then, multisig bridges remain the primary interop layer — and they will keep getting exploited. Watching them is a job that pays off every week.
4. **Public-goods grant fit.** The India Solana Foundation grant program explicitly funds open infrastructure. Bridge Radar is open from commit one, has no token, and is donatable to the Foundation at maturity.

---

## 9. Comparison

| Property               | L2Beat       | Forta / Hexagate | Bridge status pages | **Bridge Radar** |
|------------------------|--------------|------------------|---------------------|------------------|
| Real-time              | No           | Yes              | Sometimes           | **Yes**          |
| Solana-focused         | No           | Partial          | N/A                 | **Yes**          |
| Free / public API      | Partial      | No               | N/A                 | **Yes**          |
| On-chain oracle        | No           | No               | No                  | **Yes**          |
| Frontend integrity     | No           | No               | No                  | **Yes**          |
| Open source            | Partial      | No               | No                  | **Yes**          |
| Multi-bridge aggregate | Yes (TVL)    | Per-customer     | No                  | **Yes**          |

---

## 10. Risks & Mitigations

| Risk                                              | Mitigation                                                                  |
|---------------------------------------------------|-----------------------------------------------------------------------------|
| False-positive alert fatigue                      | 30-min confirmation windows, cross-region consensus, public weight tuning   |
| Bridges change schemas / APIs                     | Adapter pattern per bridge; community contributions via PR                  |
| Single attester is itself a trust assumption      | v2 multi-attester quorum; v1 attester key publicly disclosed and rotatable  |
| Legal / takedown threat from a flagged bridge     | Stick to factual on-chain observations; no editorial claims                 |
| RPC cost overrun                                  | Hetzner-hosted full Solana RPC for high-volume reads; Helius for tail       |
| Maintainer single-point-of-failure (just me)      | Public docs + repo + handoff plan in milestone 6; aim to recruit one co-maintainer post-launch |

---

## 11. Funding & Sustainability

- **Grant:** $5,000 India Solana Foundation grant covers initial 12-week build.
- **Year 1 ops:** ~$60/mo (Hetzner + RPC overage + domain). Self-funded.
- **Year 2+:** Application to broader Foundation grants, optional dApp-tier paid API for high-volume webhook customers (free tier remains permanent), or donation to a neutral steward.
- **No token. No equity round. No premine.** This is unambiguously a public good.

---

## 12. Team

**Pratik Kale** — 3 years full-stack blockchain. Turbin3 graduate. CTO at an IIT Madras–incubated startup. 1× hackathon winner, 3× grant recipient. Background in DePIN and infrastructure tooling. Sole maintainer at v1; will recruit one co-maintainer post-launch.

---

## 13. Open Questions

- Should Health Score include a **subjective** governance dimension (e.g., "how decentralized is the signer set") or stay purely empirical? v1 says empirical only.
- Do we add **Squads / multisig watching** for Solana-native treasuries that bridges hold? Probably v1.5.
- Do we eventually issue a slashing-backed attester role, or stay single-attester forever and donate to Foundation? Defer to community.

---

## 14. Conclusion

Bridges are how value moves between Solana and the rest of crypto, and they will remain the highest-risk surface for years. Bridge Radar is not another bridge, not a wrapped asset, not a new trust assumption. It is a free, neutral, real-time intelligence layer that makes existing bridges legible — to users, to dApps, to the Solana Foundation. The data is reachable, the demand is public, the cost is small, and the public-good framing is tight. That is what this proposal asks the Solana Foundation India grant program to fund.

---

## Appendix A — Initial Bridge Coverage Matrix

| Bridge      | Solana side                          | Origin chains tracked       | Detectors enabled (v1)              |
|-------------|--------------------------------------|-----------------------------|--------------------------------------|
| Wormhole    | Token Bridge program + Portal mints  | ETH, ARB, BASE, OP, BNB, SUI| parity, outflow, signer, frontend    |
| Allbridge   | Allbridge SPL programs               | ETH, BNB, POLYGON           | parity, outflow, frontend            |
| deBridge    | DLN program                          | ETH, ARB, BNB               | parity, outflow, signer, frontend    |
| LayerZero   | OApp deployments per asset           | ETH, ARB, BASE              | DVN-set diff, outflow, frontend      |
| Mayan       | Swift solver settlement              | ETH, ARB, BASE              | outflow, frontend                    |
| Axelar      | Squid + Axelar gateway on Solana     | ETH, COSMOS                 | validator-set diff, outflow          |

## Appendix B — Health Score: Worked Example

Hypothetical Wormhole snapshot:

- Parity: locked $1.42B, minted $1.43B → break of $10M = severity 0.05.
- Outflow z-score: 1.2 over baseline → severity 0.0.
- Signer change: none in 24h → severity 0.0.
- Frontend drift: hash matched in all regions → 0.0.
- Oracle staleness: Pyth SOL/USD updated 2s ago → 0.0.

`Health = 100 - 40*0.05 - 25*0.0 - 15*0.0 - 10*0.0 - 10*0.0 = 98 (Green)`

Now insert a hypothetical $50M parity break + outflow z-score of 5 + frontend drift in two of three regions:

`Health = 100 - 40*0.6 - 25*1.0 - 15*0.0 - 10*0.5 - 10*0.0 = 46 (Red)`

A lending protocol with `min_health=70` for accepting bridge-issued wUSDC would automatically pause new collateral acceptance from this bridge until the score recovers.

## Appendix C — License

All code MIT. Documentation CC-BY 4.0. No tokens. No equity.
