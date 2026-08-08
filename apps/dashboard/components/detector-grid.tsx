import { apiUrls } from "@/lib/api";
import { Reveal } from "@/components/reveal";

export interface ScoringWeights {
  parity: number;
  outflow: number;
  signer: number;
  frontend: number;
  oracle: number;
}

/** Reads the real weighting the scorer actually uses (SCORING_META, served
 * on /v1/bridges) so the numbers shown can never drift from what the
 * detectors are really doing — no hardcoded duplicate of that config.
 * Exported so the beam diagram (scoring-beam-diagram.tsx) reads the exact
 * same live values instead of a second hand-copied fetch. */
export async function fetchScoringWeights(): Promise<ScoringWeights | null> {
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

export const DETECTORS = [
  {
    key: "parity",
    title: "Lock / mint parity",
    desc: "Flags imbalance between origin-chain locks and Solana-side mints.",
    icon: <ParityIcon />,
    barClass: "bg-accent/70",
    dotClass: "bg-accent",
    hex: "#e0a530",
  },
  {
    key: "outflow",
    title: "Outflow anomaly",
    desc: "Z-score over a rolling 30-day baseline catches unusual withdrawal volume.",
    icon: <OutflowIcon />,
    barClass: "bg-green/70",
    dotClass: "bg-green",
    hex: "#2d9a77",
  },
  {
    key: "signer",
    title: "Signer set drift",
    desc: "Watches guardian / DVN signer sets for unexpected rotations.",
    icon: <SignerIcon />,
    barClass: "bg-yellow/70",
    dotClass: "bg-yellow",
    hex: "#c98a3f",
  },
  {
    key: "frontend",
    title: "Frontend integrity",
    desc: "Hashes the live bundle to catch a hijacked front end before users do.",
    icon: <FrontendIcon />,
    barClass: "bg-red/70",
    dotClass: "bg-red",
    hex: "#b84f5e",
  },
  {
    key: "oracle",
    title: "Oracle staleness",
    desc: "Checks that the price feeds a bridge depends on are still fresh.",
    icon: <OracleIcon />,
    barClass: "bg-accent-bright/70",
    dotClass: "bg-accent-bright",
    hex: "#f0bd5c",
  },
] as const;

/** The 5-detector grid — icons, index numerals, hover glow orb, real
 * live weight percentages. Shared between the homepage and /about so
 * both always show the same real weighting, never two hand-copied lists
 * that can silently drift out of sync. */
export async function DetectorGrid({ reveal = true }: { reveal?: boolean }) {
  const weights = await fetchScoringWeights();

  const grid = (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {DETECTORS.map((d, i) => (
        <Reveal key={d.key} delayMs={reveal ? i * 90 : 0}>
          <div className="group relative h-full space-y-4 overflow-hidden rounded-3xl border border-border-subtle bg-surface/60 p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-glow-sm">
            <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${d.barClass}`} />
            <span
              aria-hidden
              className="pointer-events-none absolute right-5 top-6 font-display text-4xl font-bold text-text-secondary/[0.05] transition-colors duration-300 group-hover:text-accent/10"
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
              <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-text">{d.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{d.desc}</p>
            </div>
            <div className="relative flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-dark">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${d.dotClass}`} />
              {weights ? `${weights[d.key]}% weight` : "— weight"}
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );

  return grid;
}
