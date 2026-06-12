import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 space-y-24 animate-fade-in">
      {/* Hero */}
      <section className="relative text-center space-y-8 py-12 overflow-hidden">
        <div className="absolute inset-0 hero-grid animate-grid-fade pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-[100px] pointer-events-none animate-float" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-green/10 blur-[100px] pointer-events-none animate-float" style={{ animationDelay: "3s" }} />

        <div className="relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2.5 glass-card px-4 py-1.5 text-xs text-muted">
            <span className="status-dot status-dot-green"></span>
            Live on Solana Devnet
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1]">
            Real-time{" "}
            <span className="text-gradient">Bridge Health</span>
            <br />
            for Solana
          </h1>

          <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
            Bridge Radar monitors every bridge with a Solana leg and gives you a single answer:{" "}
            <strong className="text-text">is this bridge safe right now?</strong>
          </p>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Link href="/bridges" className="rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-black shadow-glow-sm hover:shadow-glow-md hover:bg-accent-dim transition-all duration-300">
              View Live Dashboard
            </Link>
            <a href="https://github.com/Hermit210/Bridge-radar-" target="_blank" rel="noreferrer" className="glass-card px-8 py-3.5 text-sm text-text-secondary hover:text-text transition-all duration-300">
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center stagger-children">
        {[
          { value: "7", label: "Bridges Monitored" },
          { value: "$2.8B+", label: "Lost to Bridge Exploits" },
          { value: "100%", label: "Open Source" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-8 space-y-3 transition-all duration-300 hover:shadow-glow-sm hover:-translate-y-1">
            <div className="text-4xl font-bold font-mono text-gradient">{s.value}</div>
            <div className="text-sm text-text-secondary tracking-wide">{s.label}</div>
          </div>
        ))}
      </section>

      {/* What it detects */}
      <section className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">What it detects</h2>
          <div className="mt-3 h-0.5 w-12 rounded-full bg-accent" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 stagger-children">
          {[
            { title: "Lock vs Mint Parity", desc: "Detects asset imbalances across origin chain and Solana in real-time." },
            { title: "Outflow Anomaly", desc: "Z-score analysis over a rolling 30-day baseline flags unusual withdrawals." },
            { title: "Signer Set Changes", desc: "Watches Guardian, DVN, and signer rotations across all supported bridges." },
            { title: "Frontend Hijack Detection", desc: "Monitors bundle hashes to catch frontend attacks." },
            { title: "Oracle Staleness", desc: "Checks price feed freshness that bridges depend on." },
            { title: "On-chain Health Oracle", desc: "dApps can gate withdrawals based on live bridge health scores." },
          ].map((f) => (
            <div key={f.title} className="glass-card p-6 space-y-3 group transition-all duration-300 hover:border-accent/20 hover:shadow-glow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-text group-hover:text-accent transition-colors">
                <span className="inline-block w-1.5 h-1.5 rounded-sm bg-accent" />
                {f.title}
              </div>
              <div className="text-sm text-muted leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="gradient-border">
        <section className="glass-card-elevated p-12 text-center space-y-6">
          <h2 className="text-3xl font-bold">Ready to check bridge health?</h2>
          <p className="text-text-secondary text-sm">Live data. No token. No signup. Fully open source.</p>
          <Link href="/bridges" className="inline-block rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-black shadow-glow-sm hover:shadow-glow-md hover:bg-accent-dim transition-all duration-300">
            Open Dashboard
          </Link>
        </section>
      </div>
    </div>
  );
}
