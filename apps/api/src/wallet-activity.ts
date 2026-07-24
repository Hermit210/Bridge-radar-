/**
 * Real, read-only lookup of a connected wallet's on-chain history against
 * our 14 monitored Solana bridge programs (BRIDGE_SOLANA_PROGRAMS in
 * @radar/shared), cross-referenced with our own bridge_health_scores
 * history. Everything here is either a real signature the RPC returned for
 * this address, or a real score row we actually recorded — no estimation,
 * no fabricated "as of that moment" numbers. When we don't have a score for
 * a bridge, historicalScore is null; callers must present that honestly.
 */

import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { PROGRAM_TO_BRIDGE_IDS } from "@radar/shared";
import type { RadarDb } from "./db.js";
import { BRIDGE_REGISTRY } from "./bridges.js";

export const WALLET_ACTIVITY_DEFAULT_LIMIT = 50;
export const WALLET_ACTIVITY_MAX_LIMIT = 200;
// Public RPC endpoints (the SOLANA_RPC_URL default, and what most people run
// with locally) rate-limit hard — 5 concurrent getParsedTransaction calls
// against api.mainnet-beta.solana.com reliably 429s about half of them in
// testing. 3 is gentler; withRetry below is what actually keeps this
// working, concurrency is just how often we need to lean on it.
const CONCURRENCY = 3;

function displayNameFor(bridgeId: string): string {
  return BRIDGE_REGISTRY.find((b) => b.id === bridgeId)?.name ?? bridgeId;
}

export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /429|too many requests|rate.?limit/i.test(message);
}

/** Retries only on rate-limit errors (429), with exponential backoff + jitter.
 * Every attempt — success or failure — is logged with the full error object
 * (not just `.message`) so a failure is never silent in server logs, even
 * when the caller ultimately swallows it (e.g. one bad transaction in a
 * larger batch). Non-rate-limit errors are logged once and rethrown
 * immediately — no point retrying a genuine bad-request or network error. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const rateLimited = isRateLimitError(err);
      console.error(
        `[wallet-activity] ${label} failed (attempt ${attempt}/${attempts}, rateLimited=${rateLimited}):`,
        err,
      );
      if (!rateLimited || attempt === attempts) break;
      const backoffMs = 400 * 2 ** (attempt - 1) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
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
  scanned: {
    signatureCount: number;
    oldest: string | null;
    newest: string | null;
    /** Signatures the RPC confirmed for this wallet but whose transaction
     * details we could not fetch (rate-limited even after retries, or a
     * transient RPC error) — NOT included in `matches` one way or the
     * other, because we genuinely don't know. When this is nonzero, an
     * empty `matches` does NOT mean "no bridge activity"; it means the
     * scan was incomplete, and callers must say so. */
    unreachableCount: number;
  };
  matches: WalletActivityMatch[];
  /** `matches.length > 0` — real activity was found. When this is false,
   * check `scanned.unreachableCount` before treating it as "no activity":
   * a nonzero count means the scan didn't fully complete, not that we
   * confirmed a clean history. */
  hasActivity: boolean;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/** Small bounded-concurrency map — plain sequential `getParsedTransaction`
 * calls would be too slow against a public RPC; unbounded `Promise.all`
 * would trip rate limits. */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function programIdsInTransaction(tx: ParsedTransactionWithMeta): Set<string> {
  const ids = new Set<string>();
  for (const ix of tx.transaction.message.instructions) {
    ids.add(ix.programId.toBase58());
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      ids.add(ix.programId.toBase58());
    }
  }
  return ids;
}

export async function fetchWalletBridgeActivity(
  connection: Connection,
  db: RadarDb,
  address: string,
  limit: number,
): Promise<WalletActivityResult> {
  const capped = Math.min(Math.max(limit, 1), WALLET_ACTIVITY_MAX_LIMIT);
  const pubkey = new PublicKey(address);

  const signatures = await withRetry("getSignaturesForAddress", () =>
    connection.getSignaturesForAddress(pubkey, { limit: capped }),
  );
  const successful = signatures.filter((s) => s.err === null);

  const pairs = await mapWithConcurrency(successful, CONCURRENCY, async (sigInfo) => {
    let unreachable = false;
    const tx = await withRetry(`getParsedTransaction(${sigInfo.signature})`, () =>
      connection.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 }),
    ).catch(() => {
      unreachable = true; // one bad transaction shouldn't fail the whole wallet scan — already logged by withRetry
      return null;
    });
    return { sigInfo, tx, unreachable };
  });

  const matches: WalletActivityMatch[] = [];
  let unreachableCount = 0;
  for (const { sigInfo, tx, unreachable } of pairs) {
    if (unreachable) unreachableCount++;
    if (!tx) continue;
    const programIds = programIdsInTransaction(tx);

    const bridgeIds = new Set<string>();
    const programByBridge = new Map<string, string>();
    for (const pid of programIds) {
      const owners = PROGRAM_TO_BRIDGE_IDS[pid];
      if (!owners) continue;
      for (const bridgeId of owners) {
        bridgeIds.add(bridgeId);
        programByBridge.set(bridgeId, pid);
      }
    }
    if (bridgeIds.size === 0) continue;

    const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;

    matches.push({
      signature: sigInfo.signature,
      slot: tx.slot,
      blockTime,
      bridges: [...bridgeIds].map((bridgeId) => {
        const programId = programByBridge.get(bridgeId) ?? "";
        let historicalScore: WalletActivityMatch["bridges"][number]["historicalScore"] = null;
        if (blockTime) {
          const nearest = db.nearestScore(bridgeId, blockTime);
          if (nearest) {
            const minutesFromTx = Math.round(
              (new Date(nearest.computed_at).getTime() - new Date(blockTime).getTime()) / 60000,
            );
            historicalScore = { score: nearest.score, computed_at: nearest.computed_at, minutesFromTx };
          }
        }
        return { bridge_id: bridgeId, display_name: displayNameFor(bridgeId), program_id: programId, historicalScore };
      }),
    });
  }

  const times = successful.map((s) => s.blockTime).filter((t): t is number => t != null);
  if (unreachableCount > 0) {
    console.error(
      `[wallet-activity] ${unreachableCount}/${successful.length} transactions unreachable for address=${address} ` +
        `after retries — scan is incomplete. If SOLANA_RPC_URL is still the default public endpoint, this is` +
        ` expected under load; configure a paid RPC (e.g. Helius) for reliable results.`,
    );
  }

  return {
    address,
    scanned: {
      signatureCount: successful.length,
      oldest: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null,
      newest: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null,
      unreachableCount,
    },
    matches,
    hasActivity: matches.length > 0,
  };
}
