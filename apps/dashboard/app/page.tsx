import Link from "next/link";
import { apiUrls } from "@/lib/api";
import { LiveStatusStrip } from "@/components/live-status-strip";

interface ScoringWeights {
  parity: number;
  outflow: number;
  signer: number;
  frontend: number;
  oracle: number;
}

/** Reads the real weighting the scorer actually uses (SCORING_META, served
 * on /v1/bridges) so the numbers below can never drift from what the
 * detectors are really doing — no hardcoded duplicate of that config. */
async function fetchScoringWeights(): Promise<ScoringWeights | null> {
  try {
    const r = await fetch(`${apiUrls.base}/v1/bridges`, { cache: "no-store" });
    if (!r.ok) return null;
    const data = (await r.json()) as { scoring?: { weights?: ScoringWeights } };
    return data.scoring?.weights ?? null;
  } catch {
    return null;
  }
}

const DETECTORS = [
  {
    key: "parity",
    title: "Lock / mint parity",
    desc: "Flags imbalance between origin-chain locks and Solana-side mints.",
  },
  {
    key: "outflow",
    title: "Outflow anomaly",
    desc: "Z-score over a rolling 30-day baseline catches unusual withdrawal volume.",
  },
  {
    key: "signer",
    title: "Signer set drift",
    desc: "Watches guardian / DVN signer sets for unexpected rotations.",
  },
  {
    key: "frontend",
    title: "Frontend integrity",
    desc: "Hashes the live bundle to catch a hijacked front end before users do.",
  },
  {
    key: "oracle",
    title: "Oracle staleness",
    desc: "Checks that the price feeds a bridge depends on are still fresh.",
  },
] as const;

export default async function LandingPage() {
  const weights = await fetchScoringWeights();

  return (
    <div className="mx-auto max-w-4xl space-y-24 px-6 py-16 sm:py-20">
      {/* Hero */}
      <section className="relative space-y-9 overflow-hidden py-6 text-center">
        <div className="hero-grid pointer-events-none absolute inset-0 animate-grid-fade" />

        <div className="relative z-10 space-y-7">
          <span className="badge inline-flex items-center gap-2">
            <span className="status-dot status-dot-green"></span>
            Monitoring Solana Mainnet
            <span className="text-muted-dark">· Oracle on Devnet</span>
          </span>

          <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-6xl">
            Real-time <span className="text-gradient">Bridge Health</span>
            <br />
            for Solana
          </h1>

          <p className="mx-auto max-w-xl text-[15px] font-medium leading-[1.7] text-text-secondary sm:text-lg">
            Bridge Radar watches every bridge with a Solana leg and answers one
            question: <strong className="font-semibold text-text">is it safe right now?</strong>
          </p>

          <div className="flex items-center justify-center pt-1">
            <Link
              href="/bridges"
              className="rounded-lg bg-accent px-7 py-3.5 font-display text-[13px] font-semibold tracking-[-0.01em] text-bg shadow-glow-sm transition-all duration-200 hover:bg-accent-bright hover:shadow-glow-md"
            >
              View Live Dashboard
            </Link>
          </div>
        </div>

        <div className="relative z-10 pt-4">
          <LiveStatusStrip />
        </div>
      </section>

      {/* Why it matters */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-text">
          Why bridges are the weak point
        </h2>
        <p className="max-w-2xl text-[15px] leading-[1.75] text-text-secondary">
          Cross-chain bridges concentrate enormous value behind a small number of
          trust assumptions — a multisig, an oracle feed, a front-end bundle. When
          one of those breaks, funds move before anyone notices.{" "}
          <span className="font-medium text-text">
            Over $2.8B has been lost to bridge exploits industry-wide since 2020
          </span>{" "}
          <span className="text-muted-dark">
            (a historical, industry-wide figure — not something Bridge Radar
            measured itself)
          </span>
          . Bridge Radar exists to surface the early signals before a hack
          completes, not after.
        </p>
      </section>

      {/* How it works */}
      <section className="space-y-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-text">
            How it works
          </h2>
          <p className="mt-1.5 text-sm font-medium text-muted">
            Five independent detectors, weighted and composed into one score.
          </p>
        </div>
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {DETECTORS.map((d, i) => (
            <div key={d.key} className="flex items-start gap-5 py-5">
              <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-muted-dark">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text">
                    {d.title}
                  </h3>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-dark">
                    {weights ? `${weights[d.key]}%` : "—"}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="space-y-4 pb-2 text-center">
        <p className="text-sm text-muted">No token. No signup. Fully open source.</p>
        <Link
          href="/bridges"
          className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-accent transition-colors hover:text-accent-bright"
        >
          Open the dashboard <span aria-hidden>→</span>
        </Link>
      </section>
    </div>
  );
}
