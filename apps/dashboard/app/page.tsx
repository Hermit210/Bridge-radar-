import Link from "next/link";
import { apiUrls } from "@/lib/api";
import { LiveStatusStrip } from "@/components/live-status-strip";
import { Reveal } from "@/components/reveal";

const heroCtaClass =
  "cta-glow inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 font-display text-sm font-semibold tracking-[-0.01em] text-bg transition-all duration-200 hover:scale-[1.03] hover:bg-accent-bright hover:shadow-glow-md active:scale-[0.98]";

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

function ParityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="5.5" opacity="0.9" />
      <circle cx="15" cy="12" r="5.5" opacity="0.5" />
    </svg>
  );
}

function OutflowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v15" />
      <path d="M6.5 13.5 12 19l5.5-5.5" />
    </svg>
  );
}

function SignerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11 20 20" />
      <path d="M15.5 15.5 18 13" />
      <path d="M18 18 20.5 15.5" />
    </svg>
  );
}

function FrontendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18" />
      <circle cx="6" cy="7.25" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function OracleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}

const DETECTORS = [
  {
    key: "parity",
    title: "Lock / mint parity",
    desc: "Flags imbalance between origin-chain locks and Solana-side mints.",
    icon: <ParityIcon />,
  },
  {
    key: "outflow",
    title: "Outflow anomaly",
    desc: "Z-score over a rolling 30-day baseline catches unusual withdrawal volume.",
    icon: <OutflowIcon />,
  },
  {
    key: "signer",
    title: "Signer set drift",
    desc: "Watches guardian / DVN signer sets for unexpected rotations.",
    icon: <SignerIcon />,
  },
  {
    key: "frontend",
    title: "Frontend integrity",
    desc: "Hashes the live bundle to catch a hijacked front end before users do.",
    icon: <FrontendIcon />,
  },
  {
    key: "oracle",
    title: "Oracle staleness",
    desc: "Checks that the price feeds a bridge depends on are still fresh.",
    icon: <OracleIcon />,
  },
] as const;

const ctaClass =
  "inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 font-display text-sm font-semibold tracking-[-0.01em] text-bg shadow-glow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-accent-bright hover:shadow-glow-md active:scale-[0.98]";

export default async function LandingPage() {
  const weights = await fetchScoringWeights();

  return (
    <div className="mx-auto max-w-5xl space-y-28 px-6 py-16 sm:space-y-36 sm:py-24">
      {/* Hero */}
      <section className="relative overflow-hidden py-6 text-center">
        <div className="hero-grid pointer-events-none absolute inset-0 animate-grid-fade" />

        <div className="stagger-children relative z-10 space-y-8">
          <span className="badge inline-flex items-center gap-2">
            <span className="status-dot status-dot-green"></span>
            Monitoring Solana Mainnet
            <span className="text-muted-dark">· Oracle on Devnet</span>
          </span>

          <h1 className="font-display text-6xl font-bold leading-[0.98] tracking-[-0.045em] sm:text-7xl md:text-8xl">
            Is this bridge
            <br />
            <span className="italic text-gradient">safe</span> right now?
          </h1>

          <p className="mx-auto max-w-xl text-base font-medium leading-[1.7] text-text-secondary sm:text-lg">
            Bridge Radar watches every bridge with a Solana leg in real time —
            five independent detectors, one score.
          </p>

          <div className="flex items-center justify-center pt-2">
            <Link href="/bridges" className={heroCtaClass}>
              View Live Dashboard
            </Link>
          </div>
        </div>

        <Reveal delayMs={280} className="relative z-10 pt-12 sm:pt-16">
          <LiveStatusStrip />
        </Reveal>
      </section>

      {/* Why it matters */}
      <Reveal>
        <section className="space-y-5">
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text">
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
      </Reveal>

      {/* How it works */}
      <section className="space-y-8">
        <Reveal>
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text">
              How it works
            </h2>
            <p className="mt-2 text-sm font-medium text-muted">
              Five independent detectors, weighted and composed into one score.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DETECTORS.map((d, i) => (
            <Reveal key={d.key} delayMs={i * 90}>
              <div className="group relative h-full space-y-4 overflow-hidden rounded-3xl border border-border-subtle bg-surface/60 p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-glow-sm">
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-5 top-4 font-display text-4xl font-bold text-text-secondary/[0.05] transition-colors duration-300 group-hover:text-accent/10"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full bg-accent/0 blur-2xl transition-colors duration-500 group-hover:bg-accent/[0.12]"
                />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-accent/5 text-accent transition-colors duration-300 group-hover:from-accent/25 group-hover:to-accent/10">
                  <span className="h-5 w-5">{d.icon}</span>
                </div>
                <div className="relative">
                  <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-text">
                    {d.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{d.desc}</p>
                </div>
                <div className="relative font-mono text-xs tabular-nums text-muted-dark">
                  {weights ? `${weights[d.key]}% weight` : "— weight"}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Close */}
      <Reveal>
        <section className="rounded-3xl border border-accent/20 bg-surface-0/80 p-10 text-center shadow-glow-sm backdrop-blur-sm sm:p-16">
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
            Ready to check bridge health?
          </h2>
          <p className="mt-3 text-sm font-medium text-text-secondary">
            No token. No signup. Fully open source.
          </p>
          <div className="mt-7 flex items-center justify-center">
            <Link href="/bridges" className={ctaClass}>
              Open the dashboard
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
