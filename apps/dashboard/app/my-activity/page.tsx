"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Reveal } from "@/components/reveal";
import { OrbitGlow } from "@/components/orbit-glow";
import { StatBar, type StatBarSegment } from "@/components/stat-bar";
import { BridgeScoreNotifications } from "@/components/bridge-score-notifications";
import { BridgeUsageSummary } from "@/components/bridge-usage-summary";
// Bridge Race is intentionally not rendered here -- see the removal note
// near the bottom of this file where it used to mount. The game code,
// its API routes, and the game_scores table are all left in place.
import {
  getTelegramSubscriptionStatus,
  getWalletActivity,
  getWalletHoldings,
  getWalletTimeline,
  getWeeklyDigest,
  recordStreakActivity,
  type ScoreTrend,
  type StreakEntry,
  type TelegramSubscription,
  type TimelineCategory,
  type WalletActivityMatch,
  type WalletHoldingsResult,
  type WalletTimelineEntry,
  type WeeklyDigest,
} from "@/lib/api";
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

/** A real, verified transaction cited in BRIDGE_DISCOVERY.md — used only to
 * demonstrate the bridge-health features against real data when the
 * connected wallet has no bridge transaction history of its own. Real
 * on-chain data from a real wallet, just not the person using this page. */
const EXAMPLE_WALLET_ADDRESS = "9DSkvHgHVYJxZYvVKW4L36ibhpT1UD6geqJdz6VUhpdL";

function formatDays(days: number): string {
  if (days < 1) return "less than a day";
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

/** Purely factual description of a real ScoreTrend — no advisory or
 * predictive language, only what our own bridge_health_scores table
 * actually recorded. */
function describeScoreTrend(displayName: string, txBlockTime: string, trend: ScoreTrend): string {
  if (trend.pointsRecorded === 0) {
    return `No health-score data was recorded for ${displayName} in the ${formatDays(trend.coveredDays)} after this transaction${
      trend.partial ? " so far" : ""
    }.`;
  }
  const suffix = trend.partial ? `, ${formatDays(trend.coveredDays)} so far` : ` (${formatDays(trend.coveredDays)})`;
  if (trend.minScore !== null && trend.minScore < 80) {
    const daysAfter = trend.minScoreAt
      ? (new Date(trend.minScoreAt).getTime() - new Date(txBlockTime).getTime()) / (24 * 60 * 60 * 1000)
      : 0;
    return `${displayName}'s health score dropped to ${trend.minScore} on ${new Date(
      trend.minScoreAt!,
    ).toLocaleDateString()}, ${formatDays(daysAfter)} after this transaction.`;
  }
  return `${displayName}'s health score stayed at or above ${trend.minScore} (green band) in the period after this transaction${suffix}.`;
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
    <div className="group space-y-3 rounded-2xl border border-border-subtle bg-surface/60 p-5 transition-colors hover:border-accent/25 hover:bg-surface/80">
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
        className="block truncate font-mono text-xs text-muted transition-colors group-hover:text-accent"
      >
        {match.signature} ↗
      </a>

      <div className="space-y-2 border-t border-border/30 pt-3">
        {match.bridges.map((b) => (
          <div key={b.bridge_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
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

      <div className="space-y-2 border-t border-border/30 pt-3">
        {match.bridges.map((b) => (
          <div key={`${b.bridge_id}-amount`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="text-muted">{b.display_name} value</span>
            {b.amountUsd === null ? (
              <span className="text-xs text-muted-dark">not indexed by us (predates or missed monitoring)</span>
            ) : b.amountUsd > 0 ? (
              <span className="font-mono font-medium text-text">{formatUsd(b.amountUsd)}</span>
            ) : (
              <span className="text-xs text-muted-dark">amount not tracked for this bridge yet</span>
            )}
          </div>
        ))}
      </div>

      {match.bridges.some((b) => b.retroactiveRisk) && (
        <div className="space-y-2 border-t border-border/30 pt-3">
          {match.bridges
            .filter((b) => b.retroactiveRisk)
            .map((b) => (
              <p
                key={`${b.bridge_id}-risk`}
                className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                  b.retroactiveRisk!.band === "red"
                    ? "border-red/30 bg-red-glow/40 text-red"
                    : "border-yellow/30 bg-yellow-glow/40 text-yellow"
                }`}
              >
                You used {b.display_name} on {when} — this bridge later showed a health score
                drop to {b.retroactiveRisk!.score} on{" "}
                {new Date(b.retroactiveRisk!.computed_at).toLocaleDateString()}. This does not mean
                your specific transaction was affected, just that the bridge had a detected
                anomaly afterward.
              </p>
            ))}
        </div>
      )}

      {match.blockTime && match.bridges.some((b) => b.scoreTrend) && (
        <div className="space-y-2 border-t border-border/30 pt-3">
          {match.bridges
            .filter((b) => b.scoreTrend)
            .map((b) => (
              <p key={`${b.bridge_id}-trend`} className="text-xs leading-relaxed text-text-secondary">
                {describeScoreTrend(b.display_name, match.blockTime!, b.scoreTrend!)}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

const categoryLabel: Record<TimelineCategory, string> = {
  transfer: "Transfer",
  swap: "Swap",
  stake: "Stake",
  nft: "NFT",
  program: "Program interaction",
  unknown: "Unknown",
};

const categoryBadge: Record<TimelineCategory, string> = {
  transfer: "bg-accent/10 text-accent border-accent/20",
  swap: "bg-green/10 text-green border-green/20",
  stake: "bg-accent/10 text-accent-bright border-accent/20",
  nft: "bg-yellow/10 text-yellow border-yellow/20",
  program: "bg-surface-3 text-text-secondary border-border-subtle",
  unknown: "bg-surface-3 text-muted-dark border-border-subtle",
};

function formatSol(lamports: number): string {
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`;
}

/** One real classified transaction from the wallet's full on-chain history —
 * type/description/source come directly from Helius's Enhanced Transactions
 * API response for this exact signature, never guessed client-side. */
function TimelineRow({ entry }: { entry: WalletTimelineEntry }) {
  const when = entry.blockTime ? new Date(entry.blockTime).toLocaleString() : "time unknown";
  return (
    <div className="group space-y-2 rounded-2xl border border-border-subtle bg-surface/60 p-4 transition-colors hover:border-accent/25 hover:bg-surface/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`badge border text-[11px] ${categoryBadge[entry.category]}`}
          title={`Raw Helius type: ${entry.heliusType}`}
        >
          {categoryLabel[entry.category]}
        </span>
        <span className="font-mono text-[11px] text-muted-dark">{when}</span>
      </div>

      <p className="text-sm text-text-secondary">
        {entry.description ?? `${entry.heliusType} via ${entry.source}`}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2 text-[11px] text-muted-dark">
        <a
          href={`https://solscan.io/tx/${entry.signature}`}
          target="_blank"
          rel="noreferrer"
          className="truncate font-mono transition-colors group-hover:text-accent"
        >
          {entry.signature.slice(0, 20)}… ↗
        </a>
        <span className="font-mono">fee {formatSol(entry.feeLamports)}</span>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
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
            <div key={t.mint} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
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

/** Real daily check-in streak, recorded by the effect above on every real
 * page load — see recordStreakActivity's doc comment for the increment/
 * reset rule this reflects. */
function StreakCard({ streak }: { streak: StreakEntry }) {
  return (
    <section className="glass-card-elevated flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-sm font-semibold text-text">Bridge Health Streak</h2>
        <p className="mt-1 text-xs text-muted-dark">
          Real daily check-ins for this wallet — resets on any missed real calendar day.
        </p>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="font-display text-2xl font-bold tracking-[-0.02em] text-text">
            🔥 {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-muted-dark">Current streak</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold text-text-secondary">{streak.longestStreak}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-dark">Longest streak</p>
        </div>
      </div>
    </section>
  );
}

/** Real Telegram weekly-digest subscription status + the real deep-link
 * button that starts it. The link itself
 * (https://t.me/bruhalert_bot?start=<wallet>) is real Telegram deep-linking
 * (https://core.telegram.org/bots/features#deep-linking) -- Telegram hands
 * the wallet address to the bot as the /start command's argument, and the
 * bot's real handler (crates/radar-alerter/src/commands.rs) writes the real
 * chat_id/wallet_address link. Nothing here writes the subscription itself;
 * this component only displays whatever real row that flow produced. */
function TelegramLinkCard({
  walletAddress,
  subscription,
}: {
  walletAddress: string;
  subscription: TelegramSubscription | null | undefined;
}) {
  const deepLink = `https://t.me/bruhalert_bot?start=${walletAddress}`;
  return (
    <section className="glass-card-elevated flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-sm font-semibold text-text">Weekly Summaries on Telegram</h2>
        <p className="mt-1 text-xs text-muted-dark">
          {subscription === undefined
            ? "Checking real subscription status…"
            : subscription
              ? `Linked to a real Telegram chat since ${new Date(subscription.subscribedAt).toLocaleDateString()} — the real weekly digest goes out every Sunday.`
              : "Not linked yet — get the real weekly digest (anomaly events, bridge health) delivered to Telegram."}
        </p>
      </div>
      {subscription === undefined ? (
        <div className="skeleton h-8 w-24 rounded-full" />
      ) : subscription ? (
        <span className="badge text-xs text-green">✓ Subscribed</span>
      ) : (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="badge shrink-0 text-xs transition-colors hover:text-text"
        >
          Link Telegram →
        </a>
      )}
    </section>
  );
}

/** Real trailing-7-real-day summary. Factual only, matching the existing
 * risk-flag feature's tone -- counts and dates, no "you should" language. */
function WeeklyDigestCard({ digest, walletTxThisWeek }: { digest: WeeklyDigest; walletTxThisWeek: number | null }) {
  const { bridgeHealthTally: tally } = digest;
  return (
    <section className="glass-card-elevated space-y-4 p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text">This Week</h2>
        <span className="font-mono text-[11px] text-muted-dark">
          {new Date(digest.windowStart).toLocaleDateString()} – {new Date(digest.windowEnd).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="font-mono text-xl font-semibold text-text">{digest.anomalyEventCount}</p>
          <p className="text-[11px] text-muted-dark">
            anomaly event{digest.anomalyEventCount === 1 ? "" : "s"} across {digest.monitoredBridgeCount} monitored
            bridges
          </p>
        </div>
        <div>
          <p className="font-mono text-xl font-semibold text-text">
            <span className="text-green">{tally.healthy}</span>
            <span className="text-muted-dark"> / </span>
            <span className="text-yellow">{tally.watch}</span>
            <span className="text-muted-dark"> / </span>
            <span className="text-red">{tally.alert}</span>
          </p>
          <p className="text-[11px] text-muted-dark">healthy / watch / alert right now</p>
        </div>
        {walletTxThisWeek !== null && (
          <div>
            <p className="font-mono text-xl font-semibold text-text">{walletTxThisWeek}</p>
            <p className="text-[11px] text-muted-dark">
              of your real bridge transaction{walletTxThisWeek === 1 ? "" : "s"} this window
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Capstone summary, placed at the end of the page since it synthesizes
 * data from every section above it (bridge usage, Feature 1's streak,
 * the existing per-match score-trend risk flag, and the scan's own
 * activity-window stats) rather than fetching anything new itself.
 * Strictly factual — real counts and real dates, never a subjective
 * "safety grade" the way the digest above it avoids advisory language too. */
function ReportCard({
  activityAddress,
  isOwnWallet,
  uniqueBridgeCount,
  monitoredBridgeCount,
  streak,
  scoreDropCount,
  matchCount,
  scan,
}: {
  activityAddress: string;
  isOwnWallet: boolean;
  uniqueBridgeCount: number;
  monitoredBridgeCount: number | null;
  streak: StreakEntry | null;
  scoreDropCount: number | null;
  matchCount: number;
  scan: { signatureCount: number; oldest: string | null; newest: string | null };
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/my-activity?wallet=${activityAddress}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Real clipboard permission can be denied by the browser — an honest
      // no-op is better than pretending it copied.
    }
  }

  return (
    <section className="glass-card-elevated space-y-5 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-text">Bridge Radar Report Card</h2>
          <p className="mt-1 text-xs text-muted-dark">
            {activityAddress.slice(0, 4)}…{activityAddress.slice(-4)} — real counts, no subjective grade.
          </p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          className="badge shrink-0 text-xs transition-colors hover:text-text"
        >
          {copied ? "Copied!" : "Share"}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-dark">Bridges used</dt>
          <dd className="font-mono text-lg font-semibold text-text">
            {uniqueBridgeCount}
            {monitoredBridgeCount !== null && <span className="text-muted-dark"> / {monitoredBridgeCount}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-dark">Transactions scanned</dt>
          <dd className="font-mono text-lg font-semibold text-text">{scan.signatureCount}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-dark">Activity window</dt>
          <dd className="font-mono text-xs font-semibold text-text">
            {scan.oldest ? new Date(scan.oldest).toLocaleDateString() : "—"}
            {" – "}
            {scan.newest ? new Date(scan.newest).toLocaleDateString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-dark">
            {isOwnWallet ? "Current streak" : "Streak"}
          </dt>
          <dd className="font-mono text-lg font-semibold text-text">
            {isOwnWallet ? (streak ? `🔥 ${streak.currentStreak}` : "—") : "own wallet only"}
          </dd>
        </div>
      </dl>

      {scoreDropCount !== null && (
        <p className="border-t border-border/30 pt-3 text-xs text-muted-dark">
          {scoreDropCount === 0
            ? matchCount === 0
              ? "No matched bridge transactions in the scanned window to check for a following score drop."
              : `None of the ${matchCount} matched bridge transaction${matchCount === 1 ? "" : "s"} in the scanned window were followed by a real health-score drop below the green band.`
            : `${scoreDropCount} of ${matchCount} matched bridge transaction${matchCount === 1 ? "" : "s"} in the scanned window were followed by a real health-score drop below the green band — see Full Transaction Timeline above for which ones.`}
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

/** Same accumulation pattern as ScanState, for the unfiltered full timeline. */
interface TimelineScanState {
  entries: WalletTimelineEntry[];
  signatureCount: number;
  unreachableCount: number;
  oldest: string | null;
  newest: string | null;
  nextBefore: string | null;
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
  const [streak, setStreak] = useState<StreakEntry | null>(null);
  const [streakError, setStreakError] = useState<string | null>(null);
  const [telegramSub, setTelegramSub] = useState<TelegramSubscription | null | undefined>(undefined);
  const [telegramSubError, setTelegramSubError] = useState<string | null>(null);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineScanState | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  /** When true, the bridge-activity scan (and the bridge-health features
   * built on it) run against EXAMPLE_WALLET_ADDRESS — a real, cited
   * transaction — instead of the connected wallet. Lets these features be
   * demonstrated with real data even when the connected wallet has no
   * bridge transaction history of its own. Never affects holdings or the
   * full timeline, which stay tied to the actually-connected wallet. */
  const [previewMode, setPreviewMode] = useState(false);
  /** Real read-only support for the Report Card's Share button: a
   * `?wallet=` link (see reportCardShareUrl below) resolves here on any
   * visitor's load, so a shared link genuinely shows that wallet's real
   * bridge-usage-derived sections without the visitor connecting anything —
   * same "read-only, nothing signed or stored" framing already used
   * elsewhere on this page. Deliberately NOT threaded into holdings, the
   * full timeline, or the streak effect below (all three stay hard-tied to
   * `publicKey`, matching their existing scope) — a shared link must never
   * record a check-in against someone else's real streak.
   */
  const [sharedWallet, setSharedWallet] = useState<string | null>(null);
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("wallet");
    if (w) setSharedWallet(w);
  }, []);
  const activityAddress = previewMode ? EXAMPLE_WALLET_ADDRESS : (publicKey?.toBase58() ?? sharedWallet);

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

  // Records one real check-in for the real connected wallet each time this
  // page loads — the server decides same-day/consecutive-day/gap from its
  // own clock (see recordStreakActivity's doc comment); this effect just
  // fires the real request and displays whatever real state comes back.
  // Never runs for previewMode — the streak tracks real visits by the real
  // connected wallet, not the demo.
  useEffect(() => {
    if (!publicKey) {
      setStreak(null);
      setStreakError(null);
      return;
    }
    let cancelled = false;
    recordStreakActivity(publicKey.toBase58())
      .then((r) => {
        if (!cancelled) setStreak(r.streak);
      })
      .catch((e) => {
        if (!cancelled) setStreakError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // Real read-only status check -- never writes. The row this reads is
  // written only by the real Telegram bot's /start deep-link handler (see
  // the "Link Telegram" button below), not by this effect.
  useEffect(() => {
    if (!publicKey) {
      setTelegramSub(undefined);
      setTelegramSubError(null);
      return;
    }
    let cancelled = false;
    getTelegramSubscriptionStatus(publicKey.toBase58())
      .then((r) => {
        if (!cancelled) setTelegramSub(r.subscription);
      })
      .catch((e) => {
        if (!cancelled) setTelegramSubError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // Real, wallet-independent -- fetched fresh every real page load, no
  // caching. Runs once on mount regardless of wallet-connection state
  // since anomaly events / bridge health are global facts, not per-wallet.
  useEffect(() => {
    let cancelled = false;
    getWeeklyDigest()
      .then((r) => {
        if (!cancelled) setDigest(r);
      })
      .catch((e) => {
        if (!cancelled) setDigestError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setTimeline(null);
      setTimelineError(null);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);
    setTimeline(null);
    getWalletTimeline(publicKey.toBase58())
      .then((r) => {
        if (cancelled) return;
        setTimeline({
          entries: r.entries,
          signatureCount: r.scanned.signatureCount,
          unreachableCount: r.scanned.unreachableCount,
          oldest: r.scanned.oldest,
          newest: r.scanned.newest,
          nextBefore: r.scanned.oldestSignature,
          hasMore: r.scanned.hasMore,
        });
      })
      .catch((e) => {
        if (!cancelled) setTimelineError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  useEffect(() => {
    if (!activityAddress) {
      setScan(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScan(null);
    getWalletActivity(activityAddress)
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
  }, [activityAddress]);

  /** Real, honest breakdown of trackable dollar value across every matched
   * bridge leg in the current scan — never fabricates a number for a leg
   * we don't have real pricing for. */
  const bridgedValue = useMemo(() => {
    let totalUsd = 0;
    let trackedLegs = 0;
    let untrackedLegs = 0;
    let notIndexedLegs = 0;
    for (const m of scan?.matches ?? []) {
      for (const b of m.bridges) {
        if (b.amountUsd === null) notIndexedLegs++;
        else if (b.amountUsd > 0) {
          totalUsd += b.amountUsd;
          trackedLegs++;
        } else untrackedLegs++;
      }
    }
    return { totalUsd, trackedLegs, untrackedLegs, notIndexedLegs };
  }, [scan?.matches]);

  /** Real, simple stats derived directly from the scan already fetched —
   * no separate query, nothing estimated. */
  const summaryStats = useMemo(() => {
    const uniqueBridges = new Set<string>();
    for (const m of scan?.matches ?? []) {
      for (const b of m.bridges) uniqueBridges.add(b.bridge_id);
    }
    return { uniqueBridgeCount: uniqueBridges.size };
  }, [scan?.matches]);

  /** Unique bridges this scan found real transaction history for — feeds
   * the opt-in notification toggles, one per bridge actually used. */
  const usedBridges = useMemo(() => {
    const byId = new Map<string, string>();
    for (const m of scan?.matches ?? []) {
      for (const b of m.bridges) byId.set(b.bridge_id, b.display_name);
    }
    return [...byId.entries()].map(([bridgeId, displayName]) => ({ bridgeId, displayName }));
  }, [scan?.matches]);

  /** Real per-bridge transaction counts for this scan — feeds the personal
   * usage summary. Counts bridge legs (not tx rows), so the rare ambiguous
   * wormhole/portal match counts once toward each, same as bridgedValue. */
  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of scan?.matches ?? []) {
      for (const b of m.bridges) counts[b.bridge_id] = (counts[b.bridge_id] ?? 0) + 1;
    }
    return counts;
  }, [scan?.matches]);

  /** Real count of this wallet's own real bridge-matched transactions whose
   * blockTime falls in the same trailing-7-real-day window the digest
   * reports for -- derived from the already-fetched real scan matches (the
   * same scan the page's own bridge-usage section uses), not a second RPC
   * scan. Only within the window the scan above has actually reached, same
   * honesty caveat as the rest of the scan UI. */
  const walletTxThisWeek = useMemo(() => {
    if (!scan) return null;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return scan.matches.filter((m) => m.blockTime && new Date(m.blockTime).getTime() >= cutoff).length;
  }, [scan]);

  /** Reuses the same real per-match ScoreTrend data the ActivityRow/
   * describeScoreTrend risk-flag feature already renders (built server-side
   * from real bridge_health_scores rows, see wallet-activity.ts) — counts
   * how many of this wallet's real matched transactions were followed by a
   * real health-score drop below the green band (80), purely factual. */
  const scoreDropCount = useMemo(() => {
    if (!scan) return null;
    let count = 0;
    for (const m of scan.matches) {
      if (m.bridges.some((b) => b.scoreTrend?.minScore !== null && b.scoreTrend?.minScore !== undefined && b.scoreTrend.minScore < 80)) {
        count += 1;
      }
    }
    return count;
  }, [scan]);

  async function scanFurtherBack() {
    if (!activityAddress || !scan?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await getWalletActivity(activityAddress, { before: scan.nextBefore });
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

  async function scanTimelineFurtherBack() {
    if (!publicKey || !timeline?.nextBefore || timelineLoadingMore) return;
    setTimelineLoadingMore(true);
    setTimelineError(null);
    try {
      const r = await getWalletTimeline(publicKey.toBase58(), { before: timeline.nextBefore });
      setTimeline((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.entries.map((e) => e.signature));
        const newEntries = r.entries.filter((e) => !seen.has(e.signature));
        return {
          entries: [...prev.entries, ...newEntries],
          signatureCount: prev.signatureCount + r.scanned.signatureCount,
          unreachableCount: prev.unreachableCount + r.scanned.unreachableCount,
          oldest: r.scanned.oldest ?? prev.oldest,
          newest: prev.newest,
          nextBefore: r.scanned.oldestSignature,
          hasMore: r.scanned.hasMore,
        };
      });
    } catch (e) {
      setTimelineError(e instanceof Error ? e.message : String(e));
    } finally {
      setTimelineLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <div className="space-y-3 border-b border-border/40 pb-5">
        <Link href="/bridges" className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-text">
          ← All bridges
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">My Activity</h1>
      </div>

      {connected && (
        <>
          {holdingsError ? (
            <div className="glass-card-elevated p-6 text-center">
              <p className="text-sm text-muted">Couldn't fetch wallet holdings. {holdingsError}</p>
            </div>
          ) : holdings ? (
            <Reveal>
              <WalletHoldingsCard holdings={holdings} />
            </Reveal>
          ) : (
            <div className="skeleton h-32 w-full rounded-2xl"></div>
          )}

          {streakError ? (
            <div className="glass-card-elevated p-6 text-center">
              <p className="text-sm text-muted">Couldn't load your streak. {streakError}</p>
            </div>
          ) : streak ? (
            <Reveal delayMs={60}>
              <StreakCard streak={streak} />
            </Reveal>
          ) : (
            <div className="skeleton h-24 w-full rounded-2xl"></div>
          )}

          {telegramSubError ? (
            <div className="glass-card-elevated p-6 text-center">
              <p className="text-sm text-muted">Couldn't check your Telegram link status. {telegramSubError}</p>
            </div>
          ) : publicKey ? (
            <Reveal delayMs={90}>
              <TelegramLinkCard walletAddress={publicKey.toBase58()} subscription={telegramSub} />
            </Reveal>
          ) : null}
        </>
      )}

      {!connected && !previewMode && !sharedWallet ? (
        <div className="grid overflow-hidden rounded-3xl border border-border-subtle shadow-card sm:grid-cols-2">
          <div className="relative flex flex-col justify-center gap-4 overflow-hidden bg-surface-0/80 p-8 sm:p-10">
            <div aria-hidden className="absolute inset-0 opacity-50">
              <OrbitGlow />
            </div>
            <div className="relative space-y-3">
              <span className="badge inline-flex w-fit items-center gap-2">
                <span className="status-dot status-dot-green"></span>
                Read-only
              </span>
              <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
                Your history against real health-score data
              </h2>
              <ul className="space-y-2 text-sm leading-relaxed text-text-secondary">
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                  Scans your wallet's real on-chain transactions via Solana RPC.
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                  Cross-references matches against our own recorded health-score history.
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                  Nothing is signed or stored — this only reads public chain data.
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 bg-surface/60 p-8 text-center sm:p-10">
            <p className="text-sm text-muted">Connect your wallet to get started.</p>
            <WalletConnectButton />
            <button
              type="button"
              onClick={() => setPreviewMode(true)}
              className="text-xs text-muted-dark underline transition-colors hover:text-text"
            >
              Or view an example with a real bridge transaction →
            </button>
          </div>
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
          {previewMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-glow/40 px-4 py-3 text-xs text-accent-bright">
              <span>
                Example wallet — for demonstration. This is real, on-chain data from a real wallet and a
                real bridge transaction (cited in BRIDGE_DISCOVERY.md), not the wallet connected above.
              </span>
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className="shrink-0 underline transition-colors hover:text-text"
              >
                Exit example
              </button>
            </div>
          )}

          {!previewMode && sharedWallet && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-glow/40 px-4 py-3 text-xs text-accent-bright">
              <span>
                Shared read-only view of {sharedWallet.slice(0, 4)}…{sharedWallet.slice(-4)}'s real bridge activity
                — via a Report Card share link. Nothing is signed or stored.
              </span>
              <Link href="/my-activity" className="shrink-0 underline transition-colors hover:text-text">
                View your own
              </Link>
            </div>
          )}

          <Reveal>
            <StatBar
              segments={
                [
                  { key: "scanned", label: "Transactions scanned", value: scan.signatureCount },
                  { key: "bridges", label: "Bridges used", value: summaryStats.uniqueBridgeCount },
                  {
                    key: "earliest",
                    label: "Earliest",
                    value: scan.oldest ? new Date(scan.oldest).toLocaleDateString() : "—",
                  },
                  {
                    key: "latest",
                    label: "Latest",
                    value: scan.newest ? new Date(scan.newest).toLocaleDateString() : "—",
                  },
                ] satisfies StatBarSegment[]
              }
            />
          </Reveal>

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

          <Reveal>
            <BridgeUsageSummary usageCounts={usageCounts} />
          </Reveal>

          {digestError ? (
            <div className="glass-card-elevated p-6 text-center">
              <p className="text-sm text-muted">Couldn't load this week's digest. {digestError}</p>
            </div>
          ) : digest ? (
            <Reveal delayMs={60}>
              <WeeklyDigestCard digest={digest} walletTxThisWeek={walletTxThisWeek} />
            </Reveal>
          ) : (
            <div className="skeleton h-24 w-full rounded-2xl"></div>
          )}

          {scan.matches.length > 0 && (
            <Reveal>
              <div className="rounded-xl border border-border-subtle bg-surface/60 p-4 text-sm transition-colors hover:border-accent/25 hover:bg-surface/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">Total historical bridged value (tracked amounts only)</span>
                  <span className="font-mono font-semibold text-text">
                    {bridgedValue.trackedLegs > 0 ? formatUsd(bridgedValue.totalUsd) : "$0.00"}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-dark">
                  {bridgedValue.trackedLegs} of{" "}
                  {bridgedValue.trackedLegs + bridgedValue.untrackedLegs + bridgedValue.notIndexedLegs} matched
                  bridge leg{bridgedValue.trackedLegs + bridgedValue.untrackedLegs + bridgedValue.notIndexedLegs === 1 ? "" : "s"} had a
                  real tracked dollar amount — {bridgedValue.untrackedLegs} had no pricing yet, and{" "}
                  {bridgedValue.notIndexedLegs} predate or otherwise missed our own monitoring, so their value is
                  genuinely unknown to us rather than zero.
                </p>
              </div>
            </Reveal>
          )}

          {usedBridges.length > 0 && (
            <Reveal>
              <BridgeScoreNotifications bridgesUsed={usedBridges} />
            </Reveal>
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
              {!previewMode && (
                <button
                  type="button"
                  onClick={() => setPreviewMode(true)}
                  className="block text-xs text-muted-dark underline transition-colors hover:text-text"
                >
                  View a real example transaction instead →
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

      {connected && (
        <div className="space-y-6 border-t border-border/40 pt-8">
          <Reveal>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-text">Full Transaction Timeline</h2>
              <p className="text-sm text-text-secondary">
                Every real transaction for this wallet — swaps, transfers, staking, NFT activity, and more — not
                just bridge-matching ones. Classified by Helius's Enhanced Transactions API.
              </p>
            </div>
          </Reveal>

          {timelineLoading ? (
            <div className="space-y-4">
              <div className="skeleton h-24 w-full rounded-2xl"></div>
              <div className="skeleton h-24 w-full rounded-2xl"></div>
              <div className="skeleton h-24 w-full rounded-2xl"></div>
            </div>
          ) : timelineError ? (
            <div className="glass-card-elevated p-10 text-center">
              <p className="text-sm text-muted">Couldn't load the full transaction timeline. {timelineError}</p>
            </div>
          ) : !timeline ? null : (
            <div className="space-y-4">
              <p className="text-xs text-muted-dark">
                Scanned {timeline.signatureCount} transaction{timeline.signatureCount === 1 ? "" : "s"} for this
                wallet
                {timeline.oldest && timeline.newest ? (
                  <>
                    {" "}
                    ({new Date(timeline.oldest).toLocaleDateString()} –{" "}
                    {new Date(timeline.newest).toLocaleDateString()})
                  </>
                ) : null}
                .
              </p>

              {timeline.unreachableCount > 0 && (
                <div className="rounded-xl border border-yellow/30 bg-yellow-glow/40 px-4 py-3 text-xs text-yellow">
                  Couldn't classify {timeline.unreachableCount} of {timeline.signatureCount} scanned transactions
                  (Helius's Enhanced Transactions API didn't return them, even after retries) — results below may
                  be incomplete.
                </div>
              )}

              {timeline.entries.length === 0 ? (
                <div className="glass-card-elevated space-y-4 p-10 text-center">
                  <p className="text-sm text-muted">
                    {timeline.unreachableCount > 0
                      ? "No transactions could be classified in this window."
                      : "No transactions found for this wallet."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {timeline.entries.map((e, i) => (
                    <Reveal key={e.signature} delayMs={i * 60}>
                      <TimelineRow entry={e} />
                    </Reveal>
                  ))}
                </div>
              )}

              {timeline.entries.length > 0 && timeline.hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={scanTimelineFurtherBack}
                    disabled={timelineLoadingMore}
                    className="badge text-xs transition-colors hover:text-text disabled:opacity-50"
                  >
                    {timelineLoadingMore ? "Scanning…" : "Scan further back →"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {scan && activityAddress && (
        <Reveal>
          <ReportCard
            activityAddress={activityAddress}
            isOwnWallet={!!publicKey && !previewMode && activityAddress === publicKey.toBase58()}
            uniqueBridgeCount={summaryStats.uniqueBridgeCount}
            monitoredBridgeCount={digest?.monitoredBridgeCount ?? null}
            streak={streak}
            scoreDropCount={scoreDropCount}
            matchCount={scan.matches.length}
            scan={{ signatureCount: scan.signatureCount, oldest: scan.oldest, newest: scan.newest }}
          />
        </Reveal>
      )}

      {/* Bridge Race removed from the visible page (2026-08-09) -- the game
          repeatedly fell short of acceptable visual/gameplay quality across
          several rebuild attempts. Intentionally not deleted: the component
          (components/bridge-race/*), its API routes, and the game_scores
          table are all left in place in case this gets revisited. This was
          previously:
            {connected && publicKey && <BridgeRaceSection />}
      */}
    </div>
  );
}
