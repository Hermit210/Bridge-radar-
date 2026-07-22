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

  // ─── TIER 2: Registered, detection not yet verified/implemented ──────────

  {
    id: "stargate",
    name: "Stargate",
    homepage: "https://stargate.finance",
    supportedChains: ["solana", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", "bsc"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
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
  {
    id: "orca",
    name: "Orca",
    homepage: "https://orca.so",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },

  // ─── TIER 3: Unverified — DeFiLlama may mislabel these as bridges; pending
  // the Task 2 discovery/verification pass before any adapter is written ────

  {
    id: "marinade",
    name: "Marinade",
    homepage: "https://marinade.finance",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "lido",
    name: "Lido",
    homepage: "https://lido.fi",
    supportedChains: ["solana", "ethereum"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "jito",
    name: "Jito",
    homepage: "https://jito.co",
    supportedChains: ["solana"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "magic-eden",
    name: "Magic Eden Bridge",
    homepage: "https://magiceden.io",
    supportedChains: ["solana", "ethereum"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },
  {
    id: "phantom",
    name: "Phantom Bridge",
    homepage: "https://phantom.app",
    supportedChains: ["solana", "ethereum", "polygon"],
    hasSolana: true,
    status: "active",
    detectionStatus: "not_yet_supported",
  },

  // ─── TIER 4: Inactive / deprecated ────────────────────────────────────────

  {
    id: "gravity",
    name: "Gravity Bridge",
    homepage: "https://gravity.zone",
    supportedChains: ["solana", "ethereum"],
    hasSolana: true,
    status: "inactive",
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
 * Get bridges that need detection implementation, registry order.
 */
export function getPlannedBridges(): BridgeRegistry[] {
  return BRIDGE_REGISTRY.filter((b) => b.detectionStatus === "not_yet_supported" && b.status === "active");
}
