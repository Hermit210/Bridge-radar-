"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Reveal } from "@/components/reveal";
import { getGameLeaderboard, submitGameScore, type GameScoreEntry } from "@/lib/api";
import type { RunResult } from "./scene";

// Phaser/the game canvas has no meaningful server-rendered output and is a
// heavy dependency — load it client-only, same pattern as BridgeGlobe.
const GameCanvas = dynamic(() => import("./game-canvas").then((m) => m.GameCanvas), { ssr: false });

type Phase = "idle" | "playing" | "saving" | "result";

const LEADERBOARD_DISPLAY_LIMIT = 10;
// Fetched once per submission so a real rank can be reported even when it
// falls outside the displayed top 10 — never a guessed/estimated position.
const LEADERBOARD_RANK_LOOKUP_LIMIT = 100;

const outcomeLabel: Record<RunResult["outcome"], string> = {
  finished: "🏁 Finished!",
  fell: "💥 Fell short",
  hit: "⚠️ Hit too many hazards",
};

export function BridgeRaceSection() {
  const { publicKey } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<GameScoreEntry[] | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [listRef] = useAutoAnimate<HTMLOListElement>({ duration: 220 });

  const loadLeaderboard = useCallback(() => {
    return getGameLeaderboard(LEADERBOARD_DISPLAY_LIMIT)
      .then((r) => {
        setLeaderboard(r.entries);
        setLeaderboardError(null);
      })
      .catch((e) => setLeaderboardError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const handleGameOver = useCallback(
    async (r: RunResult) => {
      setResult(r);
      setRank(null);
      if (!publicKey) {
        setSaveError("Wallet disconnected before the score could be saved.");
        setPhase("result");
        return;
      }
      setPhase("saving");
      setSaveError(null);
      try {
        const submitted = await submitGameScore({
          wallet_address: publicKey.toBase58(),
          score: r.score,
          blocks_used: r.blocksUsed,
          distance: r.distance,
        });
        // Real rank: search a real, larger fetch for the exact row just
        // inserted (matched by wallet + completedAt, which insertGameScore
        // returns) rather than estimating a position.
        const wide = await getGameLeaderboard(LEADERBOARD_RANK_LOOKUP_LIMIT).catch(() => null);
        if (wide) {
          const idx = wide.entries.findIndex(
            (e) => e.walletAddress === submitted.entry.walletAddress && e.completedAt === submitted.entry.completedAt,
          );
          setRank(idx >= 0 ? idx + 1 : null);
        }
        await loadLeaderboard();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setPhase("result");
      }
    },
    [publicKey, loadLeaderboard],
  );

  function startRun() {
    setResult(null);
    setSaveError(null);
    setRank(null);
    setRunKey((k) => k + 1);
    setPhase("playing");
  }

  return (
    <div className="space-y-6 border-t border-border/40 pt-8">
      <Reveal>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-text">Bridge Race</h2>
          <p className="text-sm text-text-secondary">
            Run, dodge real detector-themed hazards, collect real blocks, and bridge every gap
            before you run out. Real scores save to a real leaderboard under your connected wallet.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={60}>
        <section className="glass-card-elevated space-y-4 p-6">
          {phase === "idle" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="max-w-md text-sm text-muted">
                You run automatically — press <span className="text-text-secondary">↑</span> or{" "}
                <span className="text-text-secondary">Space</span> to jump. Dodge the red{" "}
                <span className="text-red">signer-change</span> and amber{" "}
                <span className="text-yellow">frontend-hijack</span> hazards, and collect enough
                real blocks before each gap — come up short and you fall.
              </p>
              <button
                type="button"
                onClick={startRun}
                className="badge text-sm transition-colors hover:text-text"
              >
                ▶ Play Bridge Race
              </button>
            </div>
          )}

          {phase !== "idle" && (
            <div className="flex justify-center">
              <GameCanvas key={runKey} onGameOver={handleGameOver} />
            </div>
          )}

          {phase === "saving" && (
            <p className="text-center text-xs text-muted-dark">Saving your real score…</p>
          )}

          {phase === "result" && result && (
            <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border-subtle bg-surface/60 p-5 text-center">
              <p className="font-display text-lg font-semibold text-text">{outcomeLabel[result.outcome]}</p>
              <p className="text-sm text-text-secondary">
                Score <span className="font-mono font-semibold text-accent">{result.score}</span> ·{" "}
                {result.distance}m run · {result.blocksUsed} blocks used
              </p>
              {saveError ? (
                <p className="text-xs text-yellow">Score not saved: {saveError}</p>
              ) : (
                <>
                  <p className="text-xs text-green">Saved to the real leaderboard below.</p>
                  {rank !== null ? (
                    <p className="text-sm font-medium text-accent">
                      You&apos;re #{rank} on the leaderboard!
                    </p>
                  ) : (
                    <p className="text-xs text-muted-dark">
                      Outside the top {LEADERBOARD_RANK_LOOKUP_LIMIT} — keep practicing.
                    </p>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={startRun}
                className="badge text-xs transition-colors hover:text-text"
              >
                Play again →
              </button>
            </div>
          )}
        </section>
      </Reveal>

      <Reveal delayMs={100}>
        <section className="glass-card-elevated space-y-3 p-6">
          <h3 className="text-sm font-semibold text-text">Leaderboard</h3>
          {leaderboardError ? (
            <p className="text-xs text-muted">Couldn't load the leaderboard. {leaderboardError}</p>
          ) : !leaderboard ? (
            <div className="skeleton h-24 w-full rounded-xl" />
          ) : leaderboard.length === 0 ? (
            <p className="text-xs text-muted-dark">No runs yet — be the first.</p>
          ) : (
            <ol ref={listRef} className="space-y-1.5">
              {leaderboard.map((e, i) => (
                <li
                  key={`${e.walletAddress}-${e.completedAt}`}
                  className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface/50 px-3 py-2 text-sm transition-colors hover:border-accent/25"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-5 font-mono text-xs text-muted-dark">#{i + 1}</span>
                    <span className="font-mono text-xs text-text-secondary">
                      {e.walletAddress.slice(0, 4)}…{e.walletAddress.slice(-4)}
                    </span>
                  </span>
                  <span className="font-mono font-semibold text-accent">{e.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </Reveal>
    </div>
  );
}
