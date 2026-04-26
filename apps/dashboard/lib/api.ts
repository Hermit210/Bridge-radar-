// Server-side fetcher. The API URL is read on the server so the dashboard
// can be deployed on a different host than the API.

import type { BridgeEvent, BridgeWithHealth, HealthScore } from "@radar/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`fetch ${path} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function listBridges() {
  return fetchJson<{ bridges: BridgeWithHealth[] }>("/v1/bridges");
}

export async function getBridge(id: string) {
  return fetchJson<{ bridge: BridgeWithHealth; health?: HealthScore }>(
    `/v1/bridges/${encodeURIComponent(id)}`,
  );
}

export async function getBridgeHistory(id: string, since?: string) {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return fetchJson<{ bridge_id: string; since: string; history: HealthScore[] }>(
    `/v1/bridges/${encodeURIComponent(id)}/history${q}`,
  );
}

export async function listEvents(opts: { bridge?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts.bridge) params.set("bridge", opts.bridge);
  if (opts.limit) params.set("limit", String(opts.limit));
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<{ events: BridgeEvent[] }>(`/v1/events${q}`);
}

export const apiUrls = {
  base: API_URL,
  ws: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/v1/ws",
};
