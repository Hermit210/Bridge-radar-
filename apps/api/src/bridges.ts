/**
 * Bridge Registry
 * 
 * Centralized registry of Solana-compatible bridges with metadata.
 * Data sources:
 * - DeFiLlama bridges (https://defillama.com/bridges)
 * - Solana ecosystem (https://solana.com/ecosystem)
 * - Bridge official websites
 * 
 * Each bridge includes:
 * - id: unique identifier
 * - name: display name
 * - homepage: official website
 * - supportedChains: list of supported chains
 * - hasSolana: whether bridge supports Solana
 * - status: "active" | "inactive" | "planned"
 * - detectionStatus: "implemented" | "not_yet_supported"
 * - tvl: approximate TVL (USD) when available
 */

export interface BridgeRegistry {
  id: string;
  name: string;
  homepage?: string;
  supportedChains: string[];
  hasSolana: boolean;
  status: "active" | "inactive" | "planned";
  detectionStatus: "implemented" | "not_yet_supported";
  tvl?: number; // in USD millions
}

export const BRIDGE_REGISTRY: BridgeRegistry[] = [
  // ─── TIER 1: Implemented & High TVL ───────────────────────────────────────
  
  {
    id: "wormhole",
    name: "Wormhole",
    homepage: "https://wormhole.com",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc", "base", "sui", "aptos"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 850,
  },
  {
    id: "allbridge",
    name: "Allbridge",
    homepage: "https://allbridge.io",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 120,
  },
  {
    id: "debridge",
    name: "deBridge",
    homepage: "https://debridge.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 95,
  },
  {
    id: "layerzero",
    name: "LayerZero",
    homepage: "https://layerzero.network",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 200,
  },
  {
    id: "mayan",
    name: "Mayan",
    homepage: "https://mayan.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 45,
  },
  {
    id: "portal",
    name: "Portal (Wormhole)",
    homepage: "https://portalbridge.com",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 320,
  },
  {
    id: "axelar",
    name: "Axelar",
    homepage: "https://axelar.network",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
    tvl: 180,
  },

  // ─── TIER 2: Planned - High Priority ──────────────────────────────────────
  
  {
    id: "stargate",
    name: "Stargate",
    homepage: "https://stargate.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 450,
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    homepage: "https://hyperlane.xyz",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 75,
  },
  {
    id: "cctp",
    name: "Circle CCTP",
    homepage: "https://www.circle.com/en/usdc/bridge",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 600,
  },
  {
    id: "orca",
    name: "Orca",
    homepage: "https://orca.so",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 35,
  },

  // ─── TIER 3: Emerging Bridges ─────────────────────────────────────────────
  
  {
    id: "marinade",
    name: "Marinade",
    homepage: "https://marinade.finance",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 280,
  },
  {
    id: "lido",
    name: "Lido",
    homepage: "https://lido.fi",
    supportedChains: ["solana", "ethereum"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 15000,
  },
  {
    id: "jito",
    name: "Jito",
    homepage: "https://jito.co",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 150,
  },
  {
    id: "magic-eden",
    name: "Magic Eden Bridge",
    homepage: "https://magiceden.io",
    supportedChains: ["solana", "ethereum"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 25,
  },
  {
    id: "phantom",
    name: "Phantom Bridge",
    homepage: "https://phantom.app",
    supportedChains: ["solana", "ethereum", "polygon"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
    tvl: 15,
  },

  // ─── TIER 4: Inactive / Deprecated ────────────────────────────────────────
  
  {
    id: "gravity",
    name: "Gravity Bridge",
    homepage: "https://gravity.zone",
    supportedChains: ["solana", "ethereum"],
    hasSolana: true,
    status: "inactive",
    detectionStatus: "not_yet_supported",
    tvl: 5,
  },
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
 * Get bridges that need detection implementation (sorted by TVL)
 */
export function getPlannedBridges(): BridgeRegistry[] {
  return BRIDGE_REGISTRY.filter((b) => b.detectionStatus === "not_yet_supported" && b.status === "active")
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
}

/**
 * Get bridges by tier
 */
export function getBridgesByTier(tier: 1 | 2 | 3 | 4): BridgeRegistry[] {
  const tierMap = {
    1: ["wormhole", "allbridge", "debridge", "layerzero", "mayan", "portal", "axelar"],
    2: ["stargate", "hyperlane", "cctp", "orca"],
    3: ["marinade", "lido", "jito", "magic-eden", "phantom"],
    4: ["gravity"],
  };
  return BRIDGE_REGISTRY.filter((b) => tierMap[tier].includes(b.id));
}

/**
 * Get total TVL across all bridges
 */
export function getTotalTVL(): number {
  return BRIDGE_REGISTRY.reduce((sum, b) => sum + (b.tvl ?? 0), 0);
}
