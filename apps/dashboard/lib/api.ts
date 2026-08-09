// Server-side fetcher. The API URL is read on the server so the dashboard
// can be deployed on a different host than the API.

import type { BridgeEvent, BridgeRow, BridgeWithHealth, DefiLlamaProtocolTvl, HealthScore } from "@radar/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!r.ok) {
    // The API returns a real `detail` string on most error responses
    // (rate-limit explanations, "not configured" reasons, etc.) — surface
    // it instead of a bare status code so the UI can show an honest reason.
    const body = await r.json().catch(() => null);
    const detail = body && typeof body === "object" && "detail" in body ? ` — ${(body as { detail: unknown }).detail}` : "";
    throw new Error(`fetch ${path} failed: ${r.status}${detail}`);
  }
  return r.json() as Promise<T>;
}

export async function listBridges() {
  return fetchJson<{ bridges: BridgeWithHealth[] }>("/v1/bridges");
}

/** GET /v1/bridges/:id returns `bridge`, `health`, and `defillama` as three
 * sibling top-level fields — `bridge` itself is just the flat row (id,
 * display_name, homepage, enabled), never nested health/defillama. Callers
 * that need a single merged BridgeWithHealth must combine all three (see
 * bridges/[id]/page.tsx). */
export async function getBridge(id: string) {
  return fetchJson<{ bridge: BridgeRow; health?: HealthScore; defillama?: DefiLlamaProtocolTvl }>(
    `/v1/bridges/${encodeURIComponent(id)}`,
  );
}

export async function getBridgeHistory(id: string, since?: string) {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return fetchJson<{ bridge_id: string; since: string; history: HealthScore[] }>(
    `/v1/bridges/${encodeURIComponent(id)}/history${q}`,
  );
}

export async function listEvents(opts: { bridge?: string; type?: BridgeEvent["type"]; limit?: number; since?: string }) {
  const params = new URLSearchParams();
  if (opts.bridge) params.set("bridge", opts.bridge);
  if (opts.type) params.set("type", opts.type);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.since) params.set("since", opts.since);
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<{ events: BridgeEvent[] }>(`/v1/events${q}`);
}

export interface RegistryEntry {
  id: string;
  name: string;
  homepage?: string;
  supportedChains: string[];
  hasSolana: boolean;
  status: "active" | "inactive" | "planned";
}

export async function listRegistry() {
  return fetchJson<{
    summary: { total: number; implemented: number; planned: number };
    implemented: RegistryEntry[];
    planned: RegistryEntry[];
  }>("/v1/registry");
}

/** Real, bounded look at a bridge's recorded health score in the 7 days
 * after a transaction — see apps/api/src/wallet-activity.ts ScoreTrend. */
export interface ScoreTrend {
  windowDays: number;
  coveredDays: number;
  partial: boolean;
  pointsRecorded: number;
  minScore: number | null;
  minScoreAt: string | null;
}

export interface WalletActivityMatch {
  signature: string;
  slot: number;
  blockTime: string | null;
  bridges: {
    bridge_id: string;
    display_name: string;
    program_id: string;
    historicalScore: { score: number; computed_at: string; minutesFromTx: number } | null;
    /** Real amount_usd from our own indexed event for this exact tx, if any.
     * null = we never indexed this transaction (predates/missed our
     * monitoring) — distinct from a real indexed $0 (amount not tracked). */
    amountUsd: number | null;
    /** A real, later health-score row that dropped into watch/alert
     * territory — retrospective context only, never a claim that this
     * specific transaction was affected. */
    retroactiveRisk: { score: number; band: "yellow" | "red"; computed_at: string } | null;
    scoreTrend: ScoreTrend | null;
  }[];
}

export interface WalletActivityResult {
  address: string;
  scanned: {
    signatureCount: number;
    oldest: string | null;
    newest: string | null;
    unreachableCount: number;
    /** Real signature of the oldest tx in this page — pass as `before` to
     * scan further back into the same wallet's history. */
    oldestSignature: string | null;
    /** True when this page came back full — there may be older history
     * beyond it. False means the wallet's real history genuinely ends here. */
    hasMore: boolean;
  };
  matches: WalletActivityMatch[];
  hasActivity: boolean;
}

/** Real, read-only on-chain lookup for the connected wallet — see
 * apps/api/src/wallet-activity.ts for what "real" means here (no
 * fabricated scores, no estimated matches). Pass `before` (a real
 * signature from a previous response's `scanned.oldestSignature`) to
 * page further back in the wallet's history instead of re-scanning the
 * same recent window. */
export async function getWalletActivity(address: string, opts?: { limit?: number; before?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.before) params.set("before", opts.before);
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<WalletActivityResult>(`/v1/wallet-activity/${encodeURIComponent(address)}${q}`);
}

export interface WalletHoldingsToken {
  mint: string;
  uiAmount: number;
  decimals: number;
  symbol: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface WalletHoldingsResult {
  address: string;
  solBalance: number;
  solPriceUsd: number | null;
  solValueUsd: number | null;
  tokens: WalletHoldingsToken[];
  fetchedAt: string;
}

/** Real, read-only SOL + SPL token balance snapshot — see
 * apps/api/src/wallet-holdings.ts. valueUsd/priceUsd are null (never 0)
 * when DeFiLlama has no live price for that mint. */
export async function getWalletHoldings(address: string) {
  return fetchJson<WalletHoldingsResult>(`/v1/wallet-holdings/${encodeURIComponent(address)}`);
}

export type TimelineCategory = "transfer" | "swap" | "stake" | "nft" | "program" | "unknown";

export interface WalletTimelineEntry {
  signature: string;
  slot: number;
  blockTime: string | null;
  /** Raw Helius classification, e.g. "SWAP", "COMPRESSED_NFT_MINT". */
  heliusType: string;
  category: TimelineCategory;
  source: string;
  description: string | null;
  feeLamports: number;
  nativeTransfers: { fromUserAccount: string; toUserAccount: string; amountLamports: number }[];
  tokenTransfers: { fromUserAccount: string; toUserAccount: string; mint: string; tokenAmount: number }[];
}

export interface WalletTimelineResult {
  address: string;
  scanned: {
    signatureCount: number;
    oldest: string | null;
    newest: string | null;
    unreachableCount: number;
    oldestSignature: string | null;
    hasMore: boolean;
  };
  entries: WalletTimelineEntry[];
}

/** Real, full transaction timeline (not just bridge-matching transactions) —
 * see apps/api/src/wallet-timeline.ts. Classified by Helius's Enhanced
 * Transactions API; throws with an honest "not configured" detail message
 * (surfaced via fetchJson) when no Helius key is available server-side,
 * rather than silently degrading to guessed data. */
export async function getWalletTimeline(address: string, opts?: { limit?: number; before?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.before) params.set("before", opts.before);
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<WalletTimelineResult>(`/v1/wallet-timeline/${encodeURIComponent(address)}${q}`);
}

/** One real "Bridge Race" mini-game run — see apps/api/src/db.ts's
 * GameScoreEntry doc comment: real client-reported data under a real
 * connected wallet, no server-side replay verification in v0. */
export interface GameScoreEntry {
  walletAddress: string;
  score: number;
  blocksUsed: number;
  distance: number;
  completedAt: string;
}

export async function submitGameScore(payload: {
  wallet_address: string;
  score: number;
  blocks_used: number;
  distance: number;
}) {
  const r = await fetch(`${API_URL}/v1/game-scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    const detail = body && typeof body === "object" && "error" in body ? ` — ${(body as { error: unknown }).error}` : "";
    throw new Error(`submit game score failed: ${r.status}${detail}`);
  }
  return r.json() as Promise<{ saved: boolean; entry: GameScoreEntry }>;
}

export async function getGameLeaderboard(limit = 10) {
  return fetchJson<{ entries: GameScoreEntry[] }>(`/v1/game-scores/leaderboard?limit=${limit}`);
}

/** Real daily check-in streak for a wallet — see apps/api/src/db.ts's
 * recordActivity doc comment for the real increment/reset rule. `today` is
 * computed server-side from the real UTC clock, never trusted from here. */
export interface StreakEntry {
  walletAddress: string;
  lastActiveDate: string;
  currentStreak: number;
  longestStreak: number;
}

export async function recordStreakActivity(walletAddress: string) {
  const r = await fetch(`${API_URL}/v1/streak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    const detail = body && typeof body === "object" && "error" in body ? ` — ${(body as { error: unknown }).error}` : "";
    throw new Error(`record streak failed: ${r.status}${detail}`);
  }
  return r.json() as Promise<{ streak: StreakEntry }>;
}

export const apiUrls = {
  base: API_URL,
  ws: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/v1/ws",
};
