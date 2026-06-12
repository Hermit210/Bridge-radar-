import Link from "next/link";
import { bandOf, type BridgeWithHealth } from "@radar/shared";

const bandColor = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
} as const;

const bandLabel = {
  green: "Healthy",
  yellow: "Watch",
  red: "Alert",
} as const;

const bandBarClass = {
  green: "health-bar-green",
  yellow: "health-bar-yellow",
  red: "health-bar-red",
} as const;

const bandDot = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
} as const;

const bandBorderColor = {
  green: "border-l-green/30",
  yellow: "border-l-yellow/30",
  red: "border-l-red/30",
} as const;

export function HealthCard({ bridge }: { bridge: BridgeWithHealth }) {
  const score = bridge.health?.score;
  const band = score !== undefined ? bandOf(score) : "yellow";
  const defilama = bridge.defilama;

  return (
    <Link
      href={`/bridges/${bridge.id}`}
      className={`group block glass-card-interactive p-6 border-l-2 ${bandBorderColor[band]}`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-xl font-bold group-hover:text-accent transition-colors duration-200">
            {bridge.display_name}
          </h3>
          <p className="text-[11px] text-muted-dark font-mono">{bridge.id}</p>
        </div>
        <div className="relative">
          <div className={`absolute inset-0 rounded-full ${band === "green" ? "bg-green/5" : band === "yellow" ? "bg-yellow/5" : "bg-red/5"} blur-sm scale-150`} />
          <div className={`relative text-4xl font-bold font-mono tabular-nums ${bandColor[band]}`}>
            {score ?? "—"}
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 health-bar">
          <div
            className={`health-bar-fill ${bandBarClass[band]}`}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted-dark tabular-nums">{score ?? 0}%</span>
      </div>

      {/* Status and time */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className={`status-dot ${bandDot[band]}`}></span>
          <span className={bandColor[band]}>{bandLabel[band]}</span>
        </span>
        <span className="text-muted-dark font-mono">
          {bridge.health?.computed_at
            ? new Date(bridge.health.computed_at).toLocaleTimeString()
            : "no score yet"}
        </span>
      </div>

      {/* DeFiLlama context */}
      {defilama && (
        <div className="mt-3 space-y-1 pt-3" style={{ borderTop: "1px solid", borderImage: "linear-gradient(90deg, rgba(110,168,255,0.15), rgba(167,139,250,0.1), transparent) 1" }}>
          <div className="flex justify-between text-xs">
            <span className="text-muted">TVL</span>
            <span className="font-mono text-text-secondary tabular-nums">{defilama.tvlFormatted}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">24h Vol</span>
            <span className="font-mono text-text-secondary tabular-nums">{defilama.volumeFormatted}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Chains</span>
            <span className="font-mono text-text-secondary tabular-nums">{defilama.chains.length}</span>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="badge text-[10px]">v0-naive</span>
        <span className="text-[10px] text-muted-dark opacity-60 group-hover:opacity-100 transition-opacity">
          parity + outflow only
        </span>
      </div>
    </Link>
  );
}
