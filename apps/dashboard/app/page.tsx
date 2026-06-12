import Link from "next/link";

export default function LandingPage() {
  const features = [
    { title: "Lock vs Mint Parity", desc: "Detects asset imbalances across origin chain and Solana in real-time." },
    { title: "Outflow Anomaly", desc: "Z-score analysis over a rolling 30-day baseline flags unusual withdrawals." },
    { title: "Signer Set Changes", desc: "Watches Guardian, DVN, and signer rotations across all supported bridges." },
    { title: "Frontend Hijack Detection", desc: "Monitors bundle hashes to catch frontend attacks." },
    { title: "Oracle Staleness", desc: "Checks price feed freshness that bridges depend on." },
    { title: "On-chain Health Oracle", desc: "dApps can gate withdrawals based on live bridge health scores." },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 space-y-24 animate-fade-in">
      {/* Hero */}
      <section className="relative text-center space-y-8 py-20 overflow-hidden gradient-bg">
        {/* Decorative background */}
        <div className="absolute inset-0 hero-grid animate-grid-fade pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px] pointer-events-none animate-float" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-green/10 blur-[120px] pointer-events-none animate-float" style={{ animationDelay: "3s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-purple/5 blur-[100px] pointer-events-none animate-float" style={{ animationDelay: "5s" }} />

        <div className="relative z-10 space-y-8">
          <div className="inline-flex items-center gap-3">
            <span className="badge">
              <span className="status-dot status-dot-green" style={{ width: 8, height: 8 }}></span>
              Live on Solana Devnet
            </span>
            <span className="badge">v0-preview</span>
          </div>

          <h1 className="text-6xl sm:text-8xl font-bold tracking-tight leading-[1.05]">
            Real-time{" "}
            <span className="gradient-text-vivid">Bridge Health</span>
            <br />
            for Solana
          </h1>

          <p className="text-xl text-text-secondary max-w-3xl mx-auto leading-loose">
            Bridge Radar monitors every bridge with a Solana leg and gives you a single answer:{" "}
            <strong className="text-text">is this bridge safe right now?</strong>
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Link
              href="/bridges"
              className="rounded-2xl bg-gradient-to-r from-accent via-purple to-green px-10 py-4 text-base font-bold text-black shadow-glow-md hover:shadow-glow-lg hover:scale-105 transition-all duration-300"
              style={{ backgroundSize: "200% auto", animation: "gradient-shift 4s ease infinite" }}
            >
              View Live Dashboard
            </Link>
            <a
              href="https://github.com/Hermit210/Bridge-radar-"
              target="_blank"
              rel="noreferrer"
              className="animated-border"
            >
              <span className="block px-10 py-4 text-base font-bold text-text-secondary hover:text-text transition-all duration-300">
                GitHub
              </span>
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
          <div
            key={s.label}
            className="glass-card p-10 space-y-4 transition-all duration-300 hover:shadow-glow-sm hover:-translate-y-1"
          >
            <div className="w-8 h-0.5 mx-auto rounded-full bg-gradient-to-r from-accent to-purple opacity-50" />
            <div className="text-5xl font-bold font-mono gradient-text-vivid">{s.value}</div>
            <div className="text-sm text-text-secondary tracking-wide">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Section Divider */}
      <div className="section-divider" />

      {/* What it detects */}
      <section className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">What it detects</h2>
          <div className="mt-3 section-divider max-w-[4rem]" style={{ opacity: 0.6 }} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 stagger-children">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="glass-card-interactive p-8 space-y-3 group border-l-2 border-l-accent/20 hover:border-l-accent/50"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold gradient-text-vivid">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-base font-bold text-text group-hover:text-accent transition-colors">
                  {f.title}
                </span>
              </div>
              <div className="text-sm text-muted leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="animated-border">
        <section className="glass-card-elevated p-16 text-center space-y-6">
          <h2 className="text-3xl font-bold gradient-text-vivid">Ready to check bridge health?</h2>
          <p className="text-text-secondary text-sm">Live data. No token. No signup. Fully open source.</p>
          <Link
            href="/bridges"
            className="inline-block rounded-2xl bg-gradient-to-r from-accent via-purple to-green px-10 py-4 text-base font-bold text-black shadow-glow-md hover:shadow-glow-lg hover:scale-105 transition-all duration-300"
            style={{ backgroundSize: "200% auto", animation: "gradient-shift 4s ease infinite" }}
          >
            Open Dashboard
          </Link>
        </section>
      </div>
    </div>
  );
}
