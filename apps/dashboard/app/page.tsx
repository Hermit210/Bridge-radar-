import Link from "next/link";
import { apiUrls } from "@/lib/api";

async function implementedBridgeCount(): Promise<number | null> {
  try {
    const r = await fetch(`${apiUrls.base}/v1/registry`, { cache: "no-store" });
    if (!r.ok) return null;
    const data = (await r.json()) as { summary?: { implemented?: number } };
    return data.summary?.implemented ?? null;
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const bridgeCount = await implementedBridgeCount();
  const features = [
    { title: "Lock vs Mint Parity", desc: "Detects asset imbalances across origin chain and Solana in real-time." },
    { title: "Outflow Anomaly", desc: "Z-score analysis over a rolling 30-day baseline flags unusual withdrawals." },
    { title: "Signer Set Changes", desc: "Watches Guardian, DVN, and signer rotations across all supported bridges." },
    { title: "Frontend Hijack Detection", desc: "Monitors bundle hashes to catch frontend attacks." },
    { title: "Oracle Staleness", desc: "Checks price feed freshness that bridges depend on." },
    { title: "On-chain Health Oracle", desc: "dApps can gate withdrawals based on live bridge health scores." },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 space-y-20 animate-fade-in">
      {/* Hero */}
      <section className="relative text-center space-y-8 py-16 overflow-hidden">
        <div className="absolute inset-0 hero-grid animate-grid-fade pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/[0.04] blur-[100px] pointer-events-none animate-float" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-green/[0.03] blur-[100px] pointer-events-none animate-float" style={{ animationDelay: "4s" }} />

        <div className="relative z-10 space-y-7">
          <div className="inline-flex items-center gap-2">
            <span className="badge">
              <span className="status-dot status-dot-green"></span>
              Live on Solana Devnet
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-display font-bold tracking-[-0.04em] leading-[1.08]">
            Real-time{" "}
            <span className="text-gradient">Bridge Health</span>
            <br />
            for Solana
          </h1>

          <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-[1.7] font-medium">
            Bridge Radar monitors every bridge with a Solana leg and gives you a single answer:{" "}
            <strong className="text-text font-semibold">is this bridge safe right now?</strong>
          </p>

          <div className="flex items-center justify-center pt-2">
            <Link
              href="/bridges"
              className="rounded-lg bg-accent px-7 py-3.5 text-[13px] font-display font-semibold tracking-[-0.01em] text-bg shadow-glow-sm hover:bg-accent-bright hover:shadow-glow-md transition-all duration-200"
            >
              View Live Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-center stagger-children">
        {[
          { value: bridgeCount !== null ? String(bridgeCount) : "—", label: "Bridges Monitored" },
          { value: "$2.8B+", label: "Lost to Bridge Exploits (industry-wide, historical)" },
          { value: "100%", label: "Open Source" },
        ].map((s) => (
          <div
            key={s.label}
            className="glass-card p-8 space-y-2 transition-all duration-200 hover:border-border-glow"
          >
            <div className="text-3xl font-display font-bold text-accent">{s.value}</div>
            <div className="text-xs text-muted tracking-[0.08em] uppercase font-medium">{s.label}</div>
          </div>
        ))}
      </section>

      {/* What it detects */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-display font-bold tracking-[-0.02em]">What it detects</h2>
          <p className="mt-2 text-sm text-muted font-medium">Six independent risk signals, scored and composed in real-time.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 stagger-children">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="glass-card-interactive p-6 space-y-2 group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono text-muted-dark font-medium">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] font-display font-semibold tracking-[-0.01em] text-text group-hover:text-accent-bright transition-colors">
                  {f.title}
                </span>
              </div>
              <div className="text-sm text-muted leading-[1.7] pl-7">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="gradient-border">
        <section className="glass-card-elevated p-12 text-center space-y-5">
          <h2 className="text-3xl font-display font-bold tracking-[-0.02em]">Ready to check bridge health?</h2>
          <p className="text-text-secondary text-sm font-medium leading-relaxed">Live data. No token. No signup. Fully open source.</p>
          <Link
            href="/bridges"
            className="inline-block rounded-lg bg-accent px-7 py-3.5 text-[13px] font-display font-semibold tracking-[-0.01em] text-bg shadow-glow-sm hover:bg-accent-bright hover:shadow-glow-md transition-all duration-200"
          >
            Open Dashboard
          </Link>
        </section>
      </div>
    </div>
  );
}
