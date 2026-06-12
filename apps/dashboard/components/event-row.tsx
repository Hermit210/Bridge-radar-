import type { BridgeEvent } from "@radar/shared";

const kindColor: Record<string, string> = {
  lock: "text-accent",
  unlock: "text-accent",
  mint: "text-green",
  burn: "text-yellow",
  signer_change: "text-red",
  frontend_change: "text-red",
  oracle_stale: "text-red",
};

const kindBg: Record<string, string> = {
  lock: "bg-accent/10 text-accent",
  unlock: "bg-accent/10 text-accent",
  mint: "bg-green/10 text-green",
  burn: "bg-yellow/10 text-yellow",
  signer_change: "bg-red/10 text-red",
  frontend_change: "bg-red/10 text-red",
  oracle_stale: "bg-red/10 text-red",
};

export function EventRow({ event }: { event: BridgeEvent }) {
  const t = new Date(event.event_time).toLocaleTimeString();
  const amt = typeof event.amount_usd === "number" && event.amount_usd > 0
    ? `$${event.amount_usd.toLocaleString()}`
    : "—";
  return (
    <tr className="text-sm">
      <td className="py-2.5 px-5 text-muted font-mono text-xs tabular-nums whitespace-nowrap">{t}</td>
      <td className="py-2.5 pr-4 font-medium text-text-secondary">{event.bridge_id}</td>
      <td className="py-2.5 pr-4">
        <span className={`inline-flex items-center font-mono text-xs px-1.5 py-0.5 rounded ${kindBg[event.type] ?? "bg-surface-2 text-muted"}`}>
          {event.type}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-muted font-mono text-xs">
        {typeof event.chain === "string" ? event.chain : "—"}
      </td>
      <td className="py-2.5 pr-4 text-muted font-mono text-xs">
        {typeof event.asset === "string" ? event.asset : "—"}
      </td>
      <td className="py-2.5 pr-4 font-mono text-text-secondary tabular-nums">{amt}</td>
      <td className="py-2.5 pr-2 truncate max-w-[18ch] text-muted-dark font-mono text-xs">
        {typeof event.tx === "string" ? event.tx.slice(0, 12) + "…" : "—"}
      </td>
    </tr>
  );
}
