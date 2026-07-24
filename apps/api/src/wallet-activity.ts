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
const CONCURRENCY = 5;

function displayNameFor(bridgeId: string): string {
  return BRIDGE_REGISTRY.find((b) => b.id === bridgeId)?.name ?? bridgeId;
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

  const signatures = await connection.getSignaturesForAddress(pubkey, { limit: capped });
  const successful = signatures.filter((s) => s.err === null);

  const pairs = await mapWithConcurrency(successful, CONCURRENCY, async (sigInfo) => {
    const tx = await connection
      .getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 })
      .catch(() => null);
    return { sigInfo, tx };
  });

  const matches: WalletActivityMatch[] = [];
  for (const { sigInfo, tx } of pairs) {
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
  return {
    address,
    scanned: {
      signatureCount: successful.length,
      oldest: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null,
      newest: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null,
    },
    matches,
    hasActivity: matches.length > 0,
  };
}
