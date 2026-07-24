// Server-side fetcher. The API URL is read on the server so the dashboard
// can be deployed on a different host than the API.

import type { BridgeEvent, BridgeRow, BridgeWithHealth, DefiLlamaProtocolTvl, HealthScore } from "@radar/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`fetch ${path} failed: ${r.status}`);
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

export async function listEvents(opts: { bridge?: string; limit?: number; since?: string }) {
  const params = new URLSearchParams();
  if (opts.bridge) params.set("bridge", opts.bridge);
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

export interface WalletActivityMatch {
  signature: string;
  slot: number;
  blockTime: string | null;
  bridges: {
    bridge_id: string;
    display_name: string;
    program_id: string;
    historicalScore: { score: number; computed_at: string; minutesFromTx: number } | null;
  }[];
}

export interface WalletActivityResult {
  address: string;
  scanned: { signatureCount: number; oldest: string | null; newest: string | null };
  matches: WalletActivityMatch[];
  hasActivity: boolean;
}

/** Real, read-only on-chain lookup for the connected wallet — see
 * apps/api/src/wallet-activity.ts for what "real" means here (no
 * fabricated scores, no estimated matches). */
export async function getWalletActivity(address: string, limit?: number) {
  const q = limit ? `?limit=${limit}` : "";
  return fetchJson<WalletActivityResult>(`/v1/wallet-activity/${encodeURIComponent(address)}${q}`);
}

export const apiUrls = {
  base: API_URL,
  ws: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/v1/ws",
};
