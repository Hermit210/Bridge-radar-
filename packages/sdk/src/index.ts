/**
 * Bridge Radar SDK — minimal client for real-time Solana bridge health
 * scores, via the public REST API or directly on-chain.
 *
 * There is no hosted production API yet (nothing in this project has been
 * deployed publicly — see DEPLOYMENT.md), so `getBridgeHealth` takes the API
 * URL explicitly rather than baking in a fake default that doesn't exist.
 */

import { PublicKey, type Connection } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

// The types and bandOf() below mirror packages/shared/src/index.ts (which is
// workspace-private, never published) — inlined here so this package has no
// unresolvable dependency once installed standalone via npm.

export interface HealthComponents {
  parity_severity: number;
  outflow_severity: number;
  signer_recency: number;
  frontend_recency: number;
  oracle_staleness: number;
}

export interface HealthScore {
  bridge_id: string;
  computed_at: string;
  score: number; // 0..100
  components: HealthComponents;
}

export type HealthBand = "green" | "yellow" | "red" | "unmonitored";

export function bandOf(score: number): HealthBand {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

export interface BridgeRow {
  id: string;
  display_name: string;
  homepage?: string;
  enabled: boolean;
}

// Real DeFiLlama protocol TVL for a bridge (crates/radar-defillama →
// defillama_cache → GET /v1/bridges). Absent when the bridge has no verified
// DeFiLlama protocol slug or no sync has run yet — never a fabricated number.
export interface DefiLlamaProtocolTvl {
  source: "defillama";
  fetched_at: string;
  defillama_slug: string;
  defillama_name: string;
  category: string | null;
  tvl_usd: number;
}

/** Real shape of `GET /v1/bridges/:id` — see apps/api/src/index.ts. */
export interface BridgeHealth {
  bridge: BridgeRow;
  health?: HealthScore;
  defillama?: DefiLlamaProtocolTvl;
}

/** The on-chain oracle program, currently deployed on Solana **devnet only**
 * — see programs/radar-oracle/src/lib.rs `declare_id!`. Not deployed to
 * mainnet; verify this is still current before relying on it. */
export const RADAR_ORACLE_PROGRAM_ID = new PublicKey("6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM");

export class BridgeRadarError extends Error {}

/**
 * Fetches a bridge's current health score from a real Bridge Radar API
 * instance. `apiUrl` must point at wherever you (or Bridge Radar) have
 * `apps/api` running — e.g. `http://localhost:3001` in dev.
 *
 * Real endpoint: `GET {apiUrl}/v1/bridges/:id` — see
 * apps/api/src/index.ts and BRIDGE_REGISTRY.md for the list of valid
 * `bridgeId` values (e.g. "wormhole", "allbridge", "portal", ...).
 */
export async function getBridgeHealth(bridgeId: string, apiUrl: string): Promise<BridgeHealth> {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/bridges/${encodeURIComponent(bridgeId)}`);
  if (!res.ok) {
    throw new BridgeRadarError(`GET /v1/bridges/${bridgeId} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as BridgeHealth;
}

/**
 * Reads a bridge's health score **directly from the on-chain oracle**, no
 * API involved — the same PDA `radar-attester` pushes to
 * (`init_bridge`/`update_health` in programs/radar-oracle/src/lib.rs).
 *
 * PDA seeds: `["health", sha256(bridgeId)]`. Account layout (82 bytes after
 * the 8-byte Anchor discriminator): `bridge_id: [u8; 32]`, `score: u8`,
 * `last_updated: i64`, `attester: Pubkey`, `bump: u8` — decoded by raw byte
 * offset here rather than pulling in the full Anchor client, to keep this
 * package's only real dependency `@solana/web3.js`.
 *
 * Throws if the bridge was never registered on-chain (`init_bridge` never
 * called for it) — never returns a fabricated score for an account that
 * doesn't exist.
 */
export async function getBridgeHealthOnChain(
  connection: Connection,
  bridgeId: string,
  programId: PublicKey = RADAR_ORACLE_PROGRAM_ID,
): Promise<number> {
  const bridgeIdHash = sha256(new TextEncoder().encode(bridgeId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("health"), Buffer.from(bridgeIdHash)], programId);

  const info = await connection.getAccountInfo(pda);
  if (!info) {
    throw new BridgeRadarError(
      `No on-chain health account for bridge "${bridgeId}" at ${pda.toBase58()} — it was never registered ` +
        `(init_bridge not called), not that its score is 0.`,
    );
  }
  if (info.data.length < 82) {
    throw new BridgeRadarError(`Unexpected account data length ${info.data.length} for ${pda.toBase58()} (expected >= 82)`);
  }
  return info.data[40]!; // 8 (discriminator) + 32 (bridge_id) = offset 40, 1-byte score
}
