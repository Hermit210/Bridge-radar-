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

export type HealthBand = "green" | "yellow" | "red";

export function bandOf(score: number): HealthBand {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

export interface BridgeRow {
  id: BridgeId;
  display_name: string;
  homepage?: string;
  enabled: boolean;
}

export interface BridgeWithHealth extends BridgeRow {
  health?: HealthScore;
}

// Outbound websocket envelope. Server pushes one of:
//   { kind: "event",   data: BridgeEvent }
//   { kind: "score",   data: HealthScore }
//   { kind: "hello",   data: { server_time: string } }
export type WsMessage =
  | { kind: "hello"; data: { server_time: string } }
  | { kind: "event"; data: BridgeEvent }
  | { kind: "score"; data: HealthScore };
