// TypeScript mirror of radar-core types. Kept hand-written rather than
// generated so the API surface is independently reviewable; if it ever
// drifts from the Rust side, the integration tests catch it.

export type ChainId =
  | "solana"
  | "ethereum"
  | "arbitrum"
  | "base"
  | "optimism"
  | "bnb"
  | "polygon"
  | "sui"
  | "aptos"
  | "cosmos"
  | (string & {});

export type BridgeId = string;

export type BridgeEventKind =
  | "lock"
  | "mint"
  | "burn"
  | "unlock"
  | "signer_change"
  | "frontend_change"
  | "oracle_stale";

export type BridgeEventPayload =
  | { type: "lock"; chain: ChainId; asset: string; amount_usd: number; tx: string }
  | { type: "mint"; chain: ChainId; asset: string; amount_usd: number; tx: string }
  | { type: "burn"; chain: ChainId; asset: string; amount_usd: number; tx: string }
  | { type: "unlock"; chain: ChainId; asset: string; amount_usd: number; tx: string }
  | { type: "signer_change"; before: string[]; after: string[]; tx: string }
  | { type: "frontend_change"; region: string; old_hash: string; new_hash: string }
  | { type: "oracle_stale"; feed: string; last_update: string };

export interface BridgeEvent {
  id: string;
  bridge_id: BridgeId;
  event_time: string;
  type: BridgeEventKind;
  chain?: ChainId;
  asset?: string;
  amount_usd?: number;
  tx?: string;
  // Plus the kind-specific fields listed in BridgeEventPayload — we keep
  // BridgeEvent flat and let consumers narrow on `type`.
  [k: string]: unknown;
}

export interface HealthComponents {
  parity_severity: number;
  outflow_severity: number;
  signer_recency: number;
  frontend_recency: number;
  oracle_staleness: number;
}

export interface HealthScore {
  bridge_id: BridgeId;
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

/**
 * Band for a bridge row, honoring `enabled` and score presence — not just
 * the score. A disabled bridge (real bridge, no adapter watching it yet) or
 * one with no health row at all must render as "unmonitored", never fall
 * through to a colored band that implies real on-chain data backs it.
 */
export function bandFor(bridge: { enabled: boolean; health?: HealthScore }): HealthBand {
  if (!bridge.enabled || !bridge.health) return "unmonitored";
  return bandOf(bridge.health.score);
}

/** Compact USD formatting for real dollar figures (TVL, volume). */
export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export interface BridgeRow {
  id: BridgeId;
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

export interface BridgeWithHealth extends BridgeRow {
  defillama?: DefiLlamaProtocolTvl;
  health?: HealthScore;
}

// ── Solana program IDs, per bridge ──────────────────────────────────────────
//
// Mirrors the `solana_programs()` constants in crates/radar-core/src/bridges/*.rs
// (the same 14 implemented adapters seeded in apps/api/src/db.ts). Used by the
// wallet-activity endpoint to recognize which bridge a wallet's transaction
// touched — never a separate/duplicate source of truth for detection itself,
// which stays owned by the Rust indexer.
//
// wormhole and portal intentionally share one program ID: Portal *is* the
// Wormhole token bridge program from the chain's perspective (see the doc
// comment on PortalAdapter in portal.rs) — the two can't be told apart by
// program ID alone, only by which wrapped-asset mints are involved, which we
// don't yet decode. Any match on that program is genuinely ambiguous between
// the two and must be presented as such, not guessed.
export const BRIDGE_SOLANA_PROGRAMS: Record<string, string[]> = {
  wormhole: ["wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb"],
  portal: ["wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb"],
  debridge: ["src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4", "dst5MGcFPoBeREFAA5E3tU5ij8m5uVYwkzkSAbsLbNo"],
  layerzero: ["76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6"],
  mayan: ["MAyANxBRcqRXaPfWoZyURiE9PyuYDxoR1dbW2hkfjxR"],
  axelar: ["gtwqvLL93XK7pC2eMvfGamqokvs19AytzaVhrL2iKiz"],
  allbridge: ["BrdgEoYCMWgRNKFt9Dx6JmAZAvWmu6oW3aZ4HGwjeoP"],
  relay: ["99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2"],
  across: ["DLv3NggMiSaef97YCkew5xKUHDh13tVGZ7tydt3ZeAru"],
  garden: ["2bag6xpshpvPe7SJ9nSDLHpxqhEAoHPGpEkjNSv7gxoF"],
  "base-solana-bridge": ["HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM"],
  atomiq: ["4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM"],
  rhinofi: ["FCW1uBM3pZ7fQWvEL9sxTe4fNiH41bu9DWX4ErTZ6aMq"],
  orderly: ["ErBmAD61mGFKvrFNaTJuxoPwqrS8GgtwtqJTJVjFWx9Q"],
};

/** Reverse index: program ID -> every bridge_id that shares it (usually one;
 * wormhole/portal is the one genuine exception — see doc comment above). */
export const PROGRAM_TO_BRIDGE_IDS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [bridgeId, programs] of Object.entries(BRIDGE_SOLANA_PROGRAMS)) {
    for (const p of programs) {
      (out[p] ??= []).push(bridgeId);
    }
  }
  return out;
})();

// Outbound websocket envelope. Server pushes one of:
//   { kind: "event",   data: BridgeEvent }
//   { kind: "score",   data: HealthScore }
//   { kind: "hello",   data: { server_time: string } }
export type WsMessage =
  | { kind: "hello"; data: { server_time: string } }
  | { kind: "event"; data: BridgeEvent }
  | { kind: "score"; data: HealthScore };
