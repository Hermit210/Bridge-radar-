"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Reveal } from "@/components/reveal";
import { getWalletActivity, type WalletActivityMatch, type WalletActivityResult } from "@/lib/api";
import { bandOf } from "@radar/shared";

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

export default function MyActivityPage() {
  const { publicKey, connected } = useWallet();
  const [result, setResult] = useState<WalletActivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWalletActivity(publicKey.toBase58())
      .then((r) => {
        if (!cancelled) setResult(r);
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
      ) : !result ? null : (
        <div className="space-y-6">
          <p className="text-xs text-muted-dark">
            Scanned {result.scanned.signatureCount} recent transaction
            {result.scanned.signatureCount === 1 ? "" : "s"} for this wallet
            {result.scanned.oldest && result.scanned.newest ? (
              <>
                {" "}
                ({new Date(result.scanned.oldest).toLocaleDateString()} –{" "}
                {new Date(result.scanned.newest).toLocaleDateString()})
              </>
            ) : null}
            .
          </p>

          {result.scanned.unreachableCount > 0 && (
            <div className="rounded-xl border border-yellow/30 bg-yellow-glow/40 px-4 py-3 text-xs text-yellow">
              Couldn't fetch {result.scanned.unreachableCount} of {result.scanned.signatureCount} scanned
              transactions (the Solana RPC rate-limited those requests even after retries) — results below may
              be incomplete, not necessarily a clean history.
            </div>
          )}

          {!result.hasActivity ? (
            <div className="glass-card-elevated p-10 text-center">
              <p className="text-sm text-muted">
                {result.scanned.unreachableCount > 0
                  ? "No bridge activity found among the transactions we could check — but the scan above was incomplete, so this isn't a confirmed clean history."
                  : "No bridge activity found for this wallet among the transactions scanned."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {result.matches.map((m, i) => (
                <Reveal key={m.signature} delayMs={i * 60}>
                  <ActivityRow match={m} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
