/**
 * Real, full transaction timeline for a connected wallet — every entry is a
 * signature the RPC actually returned for this address, classified via
 * Helius's Enhanced Transactions API (a real classification engine, not a
 * hand-rolled heuristic — verified against this wallet's real history before
 * relying on it; see
 * https://docs.helius.dev/solana-apis/enhanced-transactions-api).
 *
 * Unlike wallet-activity.ts (which only surfaces bridge-matching
 * transactions), this shows the wallet's complete recent history — swaps,
 * transfers, staking, NFT activity, everything.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { withRetry } from "./wallet-activity.js";

export const WALLET_TIMELINE_DEFAULT_LIMIT = 40;
// Helius Enhanced Transactions API accepts at most 100 signatures per
// request — capping here keeps this a single POST, no batching needed.
export const WALLET_TIMELINE_MAX_LIMIT = 100;

export class HeliusKeyMissingError extends Error {
  constructor() {
    super(
      "Full transaction timeline requires a Helius API key. Set HELIUS_API_KEY, or point SOLANA_RPC_URL at " +
        "*.helius-rpc.com with ?api-key=..., to enable this feature.",
    );
    this.name = "HeliusKeyMissingError";
  }
}

/** Reuses the same real key already configured for RPC access (embedded in
 * SOLANA_RPC_URL when it points at Helius) — never a second, separately
 * fabricated credential. HELIUS_API_KEY, if set, takes precedence. */
export function extractHeliusApiKey(rpcUrl: string): string | null {
  if (process.env.HELIUS_API_KEY) return process.env.HELIUS_API_KEY;
  try {
    const u = new URL(rpcUrl);
    if (!u.hostname.endsWith("helius-rpc.com")) return null;
    return u.searchParams.get("api-key");
  } catch {
    return null;
  }
}

export type TimelineCategory = "transfer" | "swap" | "stake" | "nft" | "program" | "unknown";

/** Helius's `type` field is a large, evolving enum (100+ values covering
 * every protocol it recognizes). We collapse it into the 6 generic buckets
 * the UI needs while still surfacing the raw type/description for detail —
 * never inventing a category Helius itself didn't report. */
function genericCategory(heliusType: string): TimelineCategory {
  const t = (heliusType || "").toUpperCase();
  if (!t || t === "UNKNOWN") return "unknown";
  if (t === "TRANSFER") return "transfer";
  if (t === "SWAP") return "swap";
  if (t.includes("STAKE")) return "stake";
  if (t.includes("NFT")) return "nft";
  return "program";
}

export interface WalletTimelineEntry {
  signature: string;
  slot: number;
  blockTime: string | null;
  /** Raw Helius classification, e.g. "SWAP", "COMPRESSED_NFT_MINT" — real, not derived. */
  heliusType: string;
  category: TimelineCategory;
  /** Real protocol/program family Helius attributed this tx to, e.g. "JUPITER", "SYSTEM_PROGRAM". */
  source: string;
  /** Real human-readable description Helius generated, when it provided one. */
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
    /** Signatures the RPC confirmed but Helius couldn't classify (batch call
     * failed, or this specific signature was missing from its response) —
     * excluded from `entries` because we genuinely don't know what they are,
     * not because they don't exist. */
    unreachableCount: number;
    oldestSignature: string | null;
    hasMore: boolean;
  };
  entries: WalletTimelineEntry[];
}

interface HeliusEnhancedTx {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  source: string;
  description: string;
  fee: number;
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
  tokenTransfers?: { fromUserAccount: string; toUserAccount: string; mint: string; tokenAmount: number }[];
}

export async function fetchWalletTransactionTimeline(
  connection: Connection,
  address: string,
  limit: number,
  before: string | undefined,
  heliusApiKey: string | null,
): Promise<WalletTimelineResult> {
  if (!heliusApiKey) throw new HeliusKeyMissingError();

  const capped = Math.min(Math.max(limit, 1), WALLET_TIMELINE_MAX_LIMIT);
  const pubkey = new PublicKey(address);

  const signatures = await withRetry("getSignaturesForAddress", () =>
    connection.getSignaturesForAddress(pubkey, { limit: capped, before }),
  );
  const successful = signatures.filter((s) => s.err === null);

  let enhanced: HeliusEnhancedTx[] = [];
  let unreachableCount = 0;
  if (successful.length > 0) {
    try {
      enhanced = await withRetry("helius-enhanced-transactions", async () => {
        const r = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${heliusApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: successful.map((s) => s.signature) }),
        });
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`Helius enhanced-transactions ${r.status}: ${body.slice(0, 300)}`);
        }
        return (await r.json()) as HeliusEnhancedTx[];
      });
    } catch (err) {
      // One failed batch call shouldn't silently render as "no
      // transactions" — every signature in this page is unreachable, and
      // the caller must say so honestly rather than showing an empty list.
      console.error(`[wallet-timeline] Helius enhanced-transactions batch failed for address=${address}:`, err);
      unreachableCount = successful.length;
    }
  }

  const bySignature = new Map(enhanced.map((e) => [e.signature, e]));
  const entries: WalletTimelineEntry[] = [];
  for (const sigInfo of successful) {
    const e = bySignature.get(sigInfo.signature);
    if (!e) {
      unreachableCount++;
      continue;
    }
    entries.push({
      signature: e.signature,
      slot: e.slot,
      blockTime: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null,
      heliusType: e.type,
      category: genericCategory(e.type),
      source: e.source,
      description: e.description || null,
      feeLamports: e.fee,
      nativeTransfers: (e.nativeTransfers ?? []).map((t) => ({
        fromUserAccount: t.fromUserAccount,
        toUserAccount: t.toUserAccount,
        amountLamports: t.amount,
      })),
      tokenTransfers: (e.tokenTransfers ?? []).map((t) => ({
        fromUserAccount: t.fromUserAccount,
        toUserAccount: t.toUserAccount,
        mint: t.mint,
        tokenAmount: t.tokenAmount,
      })),
    });
  }

  const times = successful.map((s) => s.blockTime).filter((t): t is number => t != null);

  return {
    address,
    scanned: {
      signatureCount: successful.length,
      oldest: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null,
      newest: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null,
      unreachableCount,
      oldestSignature: signatures[signatures.length - 1]?.signature ?? null,
      hasMore: signatures.length === capped,
    },
    entries,
  };
}
