/**
 * Bridge Radar Fetch — a Solana `Connection` with basic sequential RPC
 * failover, plus an optional real bridge-health gate via `@bridge-radar/sdk`.
 *
 * This is intentionally simple: at creation time it tries each RPC URL in
 * order and keeps the first one that actually responds. It does not retry
 * or re-balance per call, does not health-score the RPC endpoints
 * themselves, and is not a replacement for a real load balancer. If you
 * need per-call failover, weighted routing, or endpoint health tracking,
 * use SolRPC (https://github.com/0xRadioAc7iv/solrpc) instead — this
 * package only adds one thing SolRPC doesn't: gating on Bridge Radar's real
 * bridge health score.
 */

import { Connection, type Commitment } from "@solana/web3.js";
import { getBridgeHealth, type HealthScore } from "@bridge-radar/sdk";

export class BridgeRadarFetchError extends Error {}

export interface FailoverConnectionOptions {
  /** Commitment used for every underlying Connection. Defaults to "confirmed". */
  commitment?: Commitment;
  /**
   * Bridge Radar API URL, e.g. `http://localhost:3001` in dev, or your own
   * deployed `apps/api`. Required to call `checkBridgeHealth()` — there is
   * no hosted production API yet (see DEPLOYMENT.md), so this is never
   * defaulted to a fake URL.
   */
  apiUrl?: string;
}

export interface BridgeHealthCheck {
  bridgeId: string;
  /** True only when a real score exists and is >= minScore. */
  healthy: boolean;
  /** undefined if the bridge has never been scored. */
  score: number | undefined;
  minScore: number;
  health: HealthScore | undefined;
}

/**
 * A real `Connection` (not a proxy/imitation — `instanceof Connection` is
 * true) pointed at whichever of the given RPC URLs responded first, plus one
 * extra real method: `checkBridgeHealth`.
 */
export class FailoverConnection extends Connection {
  private readonly apiUrl?: string;
  private readonly rpcUrl: string;

  private constructor(rpcUrl: string, commitment: Commitment, apiUrl: string | undefined) {
    super(rpcUrl, commitment);
    this.rpcUrl = rpcUrl;
    this.apiUrl = apiUrl;
  }

  /** The RPC URL this connection actually settled on, out of everything passed in. */
  get activeRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Tries each `rpcUrls` entry in order — a real `getVersion()` call against
   * each candidate, not just a TCP/DNS check — and keeps the first one that
   * responds. Throws `BridgeRadarFetchError` (listing every real failure) if
   * none of them do.
   */
  static async create(rpcUrls: string[], options: FailoverConnectionOptions = {}): Promise<FailoverConnection> {
    if (rpcUrls.length === 0) {
      throw new BridgeRadarFetchError("createFailoverConnection requires at least one RPC URL");
    }
    const commitment = options.commitment ?? "confirmed";
    const failures: string[] = [];
    for (const url of rpcUrls) {
      try {
        const candidate = new Connection(url, commitment);
        await candidate.getVersion();
        return new FailoverConnection(url, commitment, options.apiUrl);
      } catch (err) {
        failures.push(`${url} — ${(err as Error).message}`);
      }
    }
    throw new BridgeRadarFetchError(
      `All ${rpcUrls.length} RPC endpoint(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
    );
  }

  /**
   * Real check against Bridge Radar's `GET /v1/bridges/:id` (via
   * `@bridge-radar/sdk`'s `getBridgeHealth`) — not a cached or fabricated
   * value. `healthy` is only ever true when a real score exists and clears
   * `minScore`; a bridge that was never scored comes back `healthy: false,
   * score: undefined`, never a false "healthy".
   */
  async checkBridgeHealth(bridgeId: string, minScore = 70): Promise<BridgeHealthCheck> {
    if (!this.apiUrl) {
      throw new BridgeRadarFetchError(
        "checkBridgeHealth() requires apiUrl to be passed to createFailoverConnection()/FailoverConnection.create()",
      );
    }
    const { health } = await getBridgeHealth(bridgeId, this.apiUrl);
    const score = health?.score;
    return {
      bridgeId,
      healthy: score !== undefined && score >= minScore,
      score,
      minScore,
      health,
    };
  }
}

/** Convenience wrapper around `FailoverConnection.create`. */
export async function createFailoverConnection(
  rpcUrls: string[],
  options: FailoverConnectionOptions = {},
): Promise<FailoverConnection> {
  return FailoverConnection.create(rpcUrls, options);
}
