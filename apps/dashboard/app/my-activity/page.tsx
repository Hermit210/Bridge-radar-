"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Reveal } from "@/components/reveal";
import { getWalletActivity, getWalletHoldings, type WalletActivityMatch, type WalletHoldingsResult } from "@/lib/api";
import { bandOf, formatUsd } from "@radar/shared";

const bandColor = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  unmonitored: "text-muted-dark",
} as const;

function scoreBandColor(score: number) {
  return bandColor[bandOf(score)];
}

function formatRelativeMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const unit = abs < 120 ? `${abs} min` : `${Math.round(abs / 60)}h`;
  return minutes < 0 ? `${unit} before this tx` : `${unit} after this tx`;
}

function ActivityRow({ match }: { match: WalletActivityMatch }) {
  const when = match.blockTime ? new Date(match.blockTime).toLocaleString() : "time unknown";
  const names = match.bridges.map((b) => b.display_name);
  const ambiguous = match.bridges.length > 1;

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-display text-sm font-semibold text-text">
            {names.join(" / ")}
          </span>
          {ambiguous && (
            <span className="ml-2 text-[10px] text-muted-dark">
              (shared on-chain program — can't be told apart)
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-muted-dark">{when}</span>
      </div>

      <a
        href={`https://solscan.io/tx/${match.signature}`}
        target="_blank"
        rel="noreferrer"
        className="block truncate font-mono text-xs text-muted transition-colors hover:text-accent"
      >
        {match.signature} ↗
      </a>

      <div className="space-y-2 border-t border-border/30 pt-3">
        {match.bridges.map((b) => (
          <div key={b.bridge_id} className="flex items-center justify-between text-sm">
            <span className="text-muted">{b.display_name} health score</span>
            {b.historicalScore ? (
              <span className={`font-mono font-medium ${scoreBandColor(b.historicalScore.score)}`}>
                {b.historicalScore.score}{" "}
                <span className="text-[11px] font-normal text-muted-dark">
                  ({formatRelativeMinutes(b.historicalScore.minutesFromTx)})
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-dark">no health-score data recorded for this bridge</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Real SOL + SPL token balance snapshot — every number here is either a
 * live RPC balance or a live DeFiLlama price; "price unavailable" (not
 * $0.00) is shown whenever DeFiLlama has no quote for a mint. */
function WalletHoldingsCard({ holdings }: { holdings: WalletHoldingsResult }) {
  return (
    <section className="glass-card-elevated space-y-4 p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text">Wallet Holdings</h2>
        <span className="font-mono text-[11px] text-muted-dark">
          as of {new Date(holdings.fetchedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">SOL balance</span>
        <span className="font-mono text-text">
          {holdings.solBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL
          {holdings.solValueUsd !== null ? (
            <span className="ml-2 text-muted-dark">({formatUsd(holdings.solValueUsd)})</span>
          ) : (
            <span className="ml-2 text-muted-dark">(price unavailable)</span>
          )}
        </span>
      </div>

      {holdings.tokens.length > 0 && (
        <div className="space-y-2 border-t border-border/30 pt-3">
          {holdings.tokens.map((t) => (
            <div key={t.mint} className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-muted" title={t.mint}>
                {t.symbol ?? `${t.mint.slice(0, 4)}…${t.mint.slice(-4)}`}
              </span>
              <span className="font-mono text-text-secondary">
                {t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                {t.valueUsd !== null ? (
                  <span className="ml-2 text-muted-dark">({formatUsd(t.valueUsd)})</span>
                ) : (
                  <span className="ml-2 text-muted-dark">(price unavailable)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {holdings.tokens.length === 0 && (
        <p className="border-t border-border/30 pt-3 text-xs text-muted-dark">
          No SPL token balances found for this wallet.
        </p>
      )}
    </section>
  );
}

/** Accumulated scan state across one or more "scan further back" pages —
 * each page covers an older slice of the wallet's real history than the
 * last, never re-scanning the same window. */
interface ScanState {
  matches: WalletActivityMatch[];
  signatureCount: number;
  unreachableCount: number;
  /** Oldest transaction time reached so far across all pages scanned. */
  oldest: string | null;
  /** Newest transaction time — always from the first page, since every
   * later page is strictly older. */
  newest: string | null;
  /** Real signature to pass as `before` for the next "scan further back" — null once exhausted. */
  nextBefore: string | null;
  /** True if the most recent page came back full — there may be more history beyond it. */
  hasMore: boolean;
}

export default function MyActivityPage() {
  const { publicKey, connected } = useWallet();
  const [scan, setScan] = useState<ScanState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<WalletHoldingsResult | null>(null);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setHoldings(null);
      setHoldingsError(null);
      return;
    }
    let cancelled = false;
    setHoldings(null);
    setHoldingsError(null);
    getWalletHoldings(publicKey.toBase58())
      .then((r) => {
        if (!cancelled) setHoldings(r);
      })
      .catch((e) => {
        if (!cancelled) setHoldingsError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) {
      setScan(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScan(null);
    getWalletActivity(publicKey.toBase58())
      .then((r) => {
        if (cancelled) return;
        setScan({
          matches: r.matches,
          signatureCount: r.scanned.signatureCount,
          unreachableCount: r.scanned.unreachableCount,
          oldest: r.scanned.oldest,
          newest: r.scanned.newest,
          nextBefore: r.scanned.oldestSignature,
          hasMore: r.scanned.hasMore,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function scanFurtherBack() {
    if (!publicKey || !scan?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await getWalletActivity(publicKey.toBase58(), { before: scan.nextBefore });
      setScan((prev) => {
        if (!prev) return prev;
        // New page's matches are strictly older — append after what we have.
        const seen = new Set(prev.matches.map((m) => m.signature));
        const newMatches = r.matches.filter((m) => !seen.has(m.signature));
        return {
          matches: [...prev.matches, ...newMatches],
          signatureCount: prev.signatureCount + r.scanned.signatureCount,
          unreachableCount: prev.unreachableCount + r.scanned.unreachableCount,
          oldest: r.scanned.oldest ?? prev.oldest,
          newest: prev.newest,
          nextBefore: r.scanned.oldestSignature,
          hasMore: r.scanned.hasMore,
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <div className="space-y-3 border-b border-border/40 pb-5">
        <Link href="/bridges" className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-text">
          ← All bridges
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">My Activity</h1>
        <p className="max-w-xl text-sm leading-relaxed text-text-secondary">
          Your connected wallet's real on-chain history against our 14 monitored Solana bridge
          programs, cross-referenced with our own health-score history. Read-only — nothing is
          signed or stored.
        </p>
      </div>

      {connected && (
        <>
          {holdingsError ? (
            <div className="glass-card-elevated p-6 text-center">
              <p className="text-sm text-muted">Couldn't fetch wallet holdings. {holdingsError}</p>
            </div>
          ) : holdings ? (
            <WalletHoldingsCard holdings={holdings} />
          ) : (
            <div className="skeleton h-32 w-full rounded-2xl"></div>
          )}
        </>
      )}

      {!connected ? (
        <div className="glass-card-elevated flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-muted">Connect your wallet to see your bridge activity.</p>
          <WalletConnectButton />
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="skeleton h-20 w-full rounded-2xl"></div>
          <div className="skeleton h-20 w-full rounded-2xl"></div>
        </div>
      ) : error ? (
        <div className="glass-card-elevated p-10 text-center">
          <p className="text-sm text-muted">
            Couldn't reach the API to scan this wallet. {error}
          </p>
        </div>
      ) : !scan ? null : (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs text-muted-dark">
              Scanned {scan.signatureCount} transaction
              {scan.signatureCount === 1 ? "" : "s"} for this wallet
              {scan.oldest && scan.newest ? (
                <>
                  {" "}
                  ({new Date(scan.oldest).toLocaleDateString()} –{" "}
                  {new Date(scan.newest).toLocaleDateString()})
                </>
              ) : null}
              .
            </p>
            <p className="text-xs text-muted-dark">
              {scan.hasMore
                ? "This only covers the window scanned above — older bridge activity may exist beyond it. Scan further back to check."
                : "This reaches the full available on-chain history for this wallet — there is nothing older to scan."}
            </p>
          </div>

          {scan.unreachableCount > 0 && (
            <div className="rounded-xl border border-yellow/30 bg-yellow-glow/40 px-4 py-3 text-xs text-yellow">
              Couldn't fetch {scan.unreachableCount} of {scan.signatureCount} scanned
              transactions (the Solana RPC rate-limited those requests even after retries) — results below may
              be incomplete, not necessarily a clean history.
            </div>
          )}

          {scan.matches.length === 0 ? (
            <div className="glass-card-elevated space-y-4 p-10 text-center">
              <p className="text-sm text-muted">
                {scan.unreachableCount > 0
                  ? "No bridge activity found among the transactions we could check — but the scan above was incomplete, so this isn't a confirmed clean history."
                  : "No bridge activity found in the scanned window above."}
              </p>
              {scan.hasMore && (
                <button
                  type="button"
                  onClick={scanFurtherBack}
                  disabled={loadingMore}
                  className="badge text-xs transition-colors hover:text-text disabled:opacity-50"
                >
                  {loadingMore ? "Scanning…" : "Scan further back →"}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {scan.matches.map((m, i) => (
                <Reveal key={m.signature} delayMs={i * 60}>
                  <ActivityRow match={m} />
                </Reveal>
              ))}
            </div>
          )}

          {scan.matches.length > 0 && scan.hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={scanFurtherBack}
                disabled={loadingMore}
                className="badge text-xs transition-colors hover:text-text disabled:opacity-50"
              >
                {loadingMore ? "Scanning…" : "Scan further back →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
