import Link from "next/link";
import { LiveStatusStrip } from "@/components/live-status-strip";
import { Reveal } from "@/components/reveal";
import { DetectorGrid } from "@/components/detector-grid";
import { ScoringBeamDiagram } from "@/components/scoring-beam-diagram";
import { OrbitGlow } from "@/components/orbit-glow";
import { BridgeMarquee } from "@/components/bridge-marquee";
import { BridgeGlobe } from "@/components/bridge-globe";
import { RecentActivityStrip } from "@/components/recent-activity-strip";

const heroCtaClass =
  "cta-glow group inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 font-display text-sm font-semibold tracking-[-0.01em] text-bg transition-all duration-200 hover:scale-[1.03] hover:bg-accent-bright hover:shadow-glow-md active:scale-[0.98]";

const ctaClass =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 font-display text-sm font-semibold tracking-[-0.01em] text-bg shadow-glow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-accent-bright hover:shadow-glow-md active:scale-[0.98]";

function ArrowIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export default async function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-28 px-6 py-16 sm:space-y-36 sm:py-24">
      {/* Hero */}
      <section className="relative py-6 text-center">
        <div className="hero-grid pointer-events-none absolute inset-0 animate-grid-fade" />
        <OrbitGlow />

        <div className="stagger-children relative z-10 space-y-8">
          <h1 className="font-display text-6xl font-bold leading-[0.98] tracking-[-0.045em] sm:text-7xl md:text-8xl">
            Is this bridge
            <br />
            <span className="font-serif italic font-normal text-gradient">safe</span> right now?
          </h1>

          <p className="mx-auto max-w-xl text-base font-medium leading-[1.7] text-text-secondary sm:text-lg">
            Bridge Radar watches every bridge with a Solana leg in real time —
            five independent detectors, one score.
          </p>

          <div className="flex items-center justify-center pt-2">
            <Link href="/bridges" className={heroCtaClass}>
              View Live Dashboard
              <ArrowIcon />
            </Link>
          </div>
        </div>

        <Reveal delayMs={280} className="relative z-10 pt-12 sm:pt-16">
          <LiveStatusStrip />
        </Reveal>
      </section>

      {/* Live bridge network */}
      <Reveal>
        <section className="space-y-6 text-center">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text">
              The live bridge network
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-muted">
              Every arc is a real, currently-monitored bridge route, colored by its actual
              current health band. Hover or click an arc for details; drag to look around.
            </p>
          </div>
          <BridgeGlobe />
        </section>
      </Reveal>

      {/* Live bridge ticker */}
      <Reveal delayMs={80}>
        <BridgeMarquee />
      </Reveal>

      {/* Recent activity */}
      <Reveal>
        <RecentActivityStrip />
      </Reveal>

      {/* Why it matters */}
      <Reveal>
        <section className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr] md:gap-12">
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
        <DetectorGrid />
        <ScoringBeamDiagram />
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
              <ArrowIcon />
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
