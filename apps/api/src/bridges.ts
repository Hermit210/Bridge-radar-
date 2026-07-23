/**
 * Bridge Registry
 *
 * Centralized registry of Solana-compatible bridges with metadata — identity
 * and detection status only. This is NOT a data source for TVL/volume: those
 * numbers must come from a live source (see defillama-store.ts, backed by
 * the real DeFiLlama /protocols response) or be omitted entirely. A prior
 * version of this file hardcoded a `tvl` field per bridge; those were
 * invented numbers served as if live, which violated the project's
 * no-fake-data rule and has been removed.
 *
 * Each bridge includes:
 * - id: unique identifier
 * - name: display name
 * - homepage: official website
 * - supportedChains: list of supported chains
 * - hasSolana: whether bridge supports Solana
 * - status: "active" | "inactive" | "planned"
 * - detectionStatus: "implemented" | "not_yet_supported"
 */

export interface BridgeRegistry {
  id: string;
  name: string;
  homepage?: string;
  supportedChains: string[];
  hasSolana: boolean;
  status: "active" | "inactive" | "planned";
  detectionStatus: "implemented" | "not_yet_supported";
}

export const BRIDGE_REGISTRY: BridgeRegistry[] = [
  // ─── TIER 1: Implemented ───────────────────────────────────────────────────

  {
    id: "wormhole",
    name: "Wormhole",
    homepage: "https://wormhole.com",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc", "base", "sui", "aptos"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "allbridge",
    name: "Allbridge",
    homepage: "https://allbridge.io",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "debridge",
    name: "deBridge",
    homepage: "https://debridge.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "layerzero",
    name: "LayerZero",
    homepage: "https://layerzero.network",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "mayan",
    name: "Mayan",
    homepage: "https://mayan.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "portal",
    name: "Portal (Wormhole)",
    homepage: "https://portalbridge.com",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "axelar",
    name: "Axelar",
    homepage: "https://axelar.network",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "relay",
    name: "Relay",
    homepage: "https://relay.link",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "across",
    name: "Across Protocol",
    homepage: "https://across.to",
    supportedChains: ["solana", "ethereum", "arbitrum", "optimism", "base", "polygon"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "garden",
    name: "Garden Finance",
    homepage: "https://garden.finance",
    supportedChains: ["solana", "bitcoin", "ethereum", "arbitrum", "base", "starknet", "sui", "tron"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "base-solana-bridge",
    name: "Coinbase Bridge (Base-Solana)",
    homepage: "https://docs.base.org/base-chain/quickstart/base-solana-bridge",
    supportedChains: ["solana", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "atomiq",
    name: "Atomiq Exchange",
    homepage: "https://atomiq.exchange",
    supportedChains: ["solana", "bitcoin", "starknet"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "rhinofi",
    name: "rhino.fi",
    homepage: "https://rhino.fi",
    supportedChains: ["solana", "ethereum", "arbitrum", "base", "polygon", "optimism", "avalanche", "bnb"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },

  // ─── TIER 2: Registered, detection not yet verified/implemented ──────────
  // (stargate removed — confirmed not deployed on Solana, see BRIDGE_DISCOVERY.md.
  // orca removed 2026-07-23 — Orca is a Solana AMM/DEX, not a bridge; see the
  // 2026-07-23 audit note below.)

  {
    id: "hyperlane",
    name: "Hyperlane",
    homepage: "https://hyperlane.xyz",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "cctp",
    name: "Circle CCTP",
    homepage: "https://www.circle.com/en/usdc/bridge",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },

  // ─── 2026-07-23 audit: Orca, Marinade, Jito, Phantom Bridge, Gravity
  // Bridge all removed — none is a genuine Solana-connected bridge:
  //   - Orca: a Solana AMM/DEX (Whirlpools CLAMM). No cross-chain product.
  //   - Marinade: Solana liquid staking (mSOL). No bridge of its own — mSOL
  //     travels cross-chain via third-party bridges (e.g. Wormhole), not a
  //     Marinade-operated one.
  //   - Jito: Solana MEV infra + liquid staking (JitoSOL) + JTX trading.
  //     No dedicated bridge product; cross-chain JitoSOL liquidity is via
  //     partner bridges (e.g. Coinbase Bridge), not Jito's own contract.
  //   - Phantom Bridge: Phantom's in-wallet "Cross-Chain Swapper" is a UI
  //     aggregator powered by LI.FI, routing through Celer/Hop/Allbridge/
  //     Stargate/Across/CCTP/Mayan — no dedicated Phantom bridge program of
  //     its own. Same exclusion category as Interport Finance and
  //     UniversalX in BRIDGE_DISCOVERY.md.
  //   - Gravity Bridge: the real Gravity Bridge (cosmos/gravity-bridge,
  //     gravitybridge.net) only ever bridged Ethereum <-> Cosmos via IBC —
  //     it has never had a Solana leg. The homepage this registry had on
  //     file ("https://gravity.zone") doesn't even resolve to that project;
  //     it isn't a Solana bridge under any name. Same treatment as Stargate:
  //     a real bridge elsewhere, just not one connected to Solana.
  // See BRIDGE_REGISTRY.md for the full writeup.
];

/**
 * Get all active bridges that support Solana
 */
export function getSolanaBridges(): BridgeRegistry[] {
  return BRIDGE_REGISTRY.filter((b) => b.hasSolana && b.status === "active");
}

/**
 * Get bridges with implemented detection
 */
export function getImplementedBridges(): BridgeRegistry[] {
  return BRIDGE_REGISTRY.filter((b) => b.detectionStatus === "implemented");
}

/**
 * Get a bridge by ID
 */
export function getBridgeById(id: string): BridgeRegistry | undefined {
  return BRIDGE_REGISTRY.find((b) => b.id === id);
}

/**
 * Get bridges that need detection implementation, registry order.
 */
export function getPlannedBridges(): BridgeRegistry[] {
  return BRIDGE_REGISTRY.filter((b) => b.detectionStatus === "not_yet_supported" && b.status === "active");
}
