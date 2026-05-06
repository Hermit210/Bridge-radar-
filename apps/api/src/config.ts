/**
 * Bridge Configuration
 * 
 * Centralized configuration for all Solana-compatible bridges.
 * Combines:
 * - Our detection status (implemented/not_yet_supported)
 * - DeFiLlama data (TVL, volume)
 * - Bridge metadata (chains, homepage)
 */

export interface BridgeConfig {
  id: string;
  name: string;
  homepage?: string;
  chains: string[];
  status: "full" | "partial"; // full = implemented, partial = planned
  detectionStatus: "implemented" | "not_yet_supported";
}

/**
 * All Solana-compatible bridges
 * Tier 1: Fully implemented (7 bridges)
 * Tier 2: Planned - high priority (5 bridges)
 */
export const BRIDGE_CONFIG: BridgeConfig[] = [
  // ─── TIER 1: Fully Implemented ────────────────────────────────────────────
  {
    id: "wormhole",
    name: "Wormhole",
    homepage: "https://wormhole.com",
    chains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc", "base"],
    status: "full",
    detectionStatus: "implemented",
  },
  {
    id: "allbridge",
    name: "Allbridge",
    homepage: "https://allbridge.io",
    chains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc"],
    status: "full",
    detectionStatus: "implemented",
  },
  {
    id: "debridge",
    name: "deBridge",
    homepage: "https://debridge.finance",
    chains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"],
    status: "full",
    detectionStatus: "implemented",
  },
  {
    id: "layerzero",
    name: "LayerZero",
    homepage: "https://layerzero.network",
    chains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc", "base"],
    status: "full",
    detectionStatus: "implemented",
  },
  {
    id: "mayan",
    name: "Mayan",
    homepage: "https://mayan.finance",
    chains: ["solana", "ethereum", "polygon", "arbitrum"],
    status: "full",
    detectionStatus: "implemented",
  },
  {
    id: "portal",
    name: "Portal",
    homepage: "https://portalbridge.com",
    chains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism"],
    status: "full",
    detectionStatus: "implemented",
  },
  {
    id: "axelar",
    name: "Axelar",
    homepage: "https://axelar.network",
    chains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche"],
    status: "full",
    detectionStatus: "implemented",
  },

  // ─── TIER 2: Planned - High Priority ──────────────────────────────────────
  {
    id: "stargate",
    name: "Stargate",
    homepage: "https://stargate.finance",
    chains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc"],
    status: "partial",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "cctp",
    name: "Circle CCTP",
    homepage: "https://www.circle.com/en/usdc/bridge",
    chains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"],
    status: "partial",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    homepage: "https://hyperlane.xyz",
    chains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base"],
    status: "partial",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "lido",
    name: "Lido",
    homepage: "https://lido.fi",
    chains: ["solana", "ethereum"],
    status: "partial",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "magic-eden",
    name: "Magic Eden Bridge",
    homepage: "https://magiceden.io",
    chains: ["solana", "ethereum"],
    status: "partial",
    detectionStatus: "not_yet_supported",
  },
];

/**
 * Get all bridges
 */
export function getAllBridges(): BridgeConfig[] {
  return BRIDGE_CONFIG;
}

/**
 * Get fully implemented bridges
 */
export function getFullBridges(): BridgeConfig[] {
  return BRIDGE_CONFIG.filter((b) => b.status === "full");
}

/**
 * Get partial/planned bridges
 */
export function getPartialBridges(): BridgeConfig[] {
  return BRIDGE_CONFIG.filter((b) => b.status === "partial");
}

/**
 * Get bridge by ID
 */
export function getBridgeConfig(id: string): BridgeConfig | undefined {
  return BRIDGE_CONFIG.find((b) => b.id === id);
}

/**
 * Get bridges by chain
 */
export function getBridgesByChain(chain: string): BridgeConfig[] {
  return BRIDGE_CONFIG.filter((b) => b.chains.includes(chain.toLowerCase()));
}

/**
 * Get chain pairs for a bridge (e.g., "ETH → SOL")
 */
export function getChainPairs(bridgeId: string): string {
  const bridge = getBridgeConfig(bridgeId);
  if (!bridge) return "";
  
  const chains = bridge.chains;
  if (chains.includes("solana")) {
    const others = chains.filter((c) => c !== "solana");
    if (others.length === 0) return "Solana only";
    return `${others.slice(0, 2).map((c) => c.toUpperCase()).join(", ")} ↔ SOL`;
  }
  return chains.slice(0, 2).map((c) => c.toUpperCase()).join(" ↔ ");
}
