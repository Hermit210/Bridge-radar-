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

export function HealthCard({ bridge }: { bridge: BridgeWithHealth }) {
  const score = bridge.health?.score;
  const band = score !== undefined ? bandOf(score) : "yellow";
  return (
    <Link
      href={`/bridges/${bridge.id}`}
      className="group block rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-lg font-semibold">{bridge.display_name}</h3>
          <p className="text-xs text-muted">{bridge.id}</p>
        </div>
        <div className={`text-3xl font-semibold ${bandColor[band]}`}>
          {score ?? "—"}
        </div>
      </div>
      <div className="mt-4 health-bar opacity-30" />
      <div className="mt-3 flex justify-between text-xs">
        <span className={`${bandColor[band]}`}>{bandLabel[band]}</span>
        <span className="text-muted">
          {bridge.health?.computed_at
            ? new Date(bridge.health.computed_at).toLocaleTimeString()
            : "no score yet"}
        </span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted">
        algorithm: v0-naive · parity + outflow only
      </p>
    </Link>
  );
}
