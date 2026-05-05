/**
 * Bridge Registry
 * 
 * Centralized registry of supported bridges with metadata.
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
  // Currently implemented bridges (detection working)
  {
    id: "wormhole",
    name: "Wormhole",
    homepage: "https://wormhole.com",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "bsc"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "allbridge",
    name: "Allbridge",
    homepage: "https://allbridge.io",
    supportedChains: ["solana", "ethereum", "polygon", "avalanche", "arbitrum", "optimism"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "debridge",
    name: "deBridge",
    homepage: "https://debridge.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "implemented",
  },
  {
    id: "layerzero",
    name: "LayerZero",
    homepage: "https://layerzero.network",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc"],
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
    name: "Portal",
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

  // Planned bridges (Solana support, detection not yet implemented)
  {
    id: "stargate",
    name: "Stargate",
    homepage: "https://stargate.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    homepage: "https://hyperlane.xyz",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "cctp",
    name: "Circle CCTP",
    homepage: "https://www.circle.com/en/usdc/bridge",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "base"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "orca",
    name: "Orca",
    homepage: "https://orca.so",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
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
 * Get bridges that need detection implementation
 */
export function getPlannedBridges(): BridgeRegistry[] {
  return BRIDGE_REGISTRY.filter((b) => b.detectionStatus === "not_yet_supported" && b.status === "active");
}
