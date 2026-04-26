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

export function EventRow({ event }: { event: BridgeEvent }) {
  const t = new Date(event.event_time).toLocaleTimeString();
  const amt = typeof event.amount_usd === "number" && event.amount_usd > 0
    ? `$${event.amount_usd.toLocaleString()}`
    : "—";
  return (
    <tr className="border-b border-border/60 text-sm">
      <td className="py-2 pr-4 text-muted">{t}</td>
      <td className="py-2 pr-4 font-medium">{event.bridge_id}</td>
      <td className={`py-2 pr-4 ${kindColor[event.type] ?? ""}`}>{event.type}</td>
      <td className="py-2 pr-4 text-muted">
        {typeof event.chain === "string" ? event.chain : "—"}
      </td>
      <td className="py-2 pr-4 text-muted">
        {typeof event.asset === "string" ? event.asset : "—"}
      </td>
      <td className="py-2 pr-4">{amt}</td>
      <td className="py-2 pr-2 truncate max-w-[18ch] text-muted">
        {typeof event.tx === "string" ? event.tx.slice(0, 12) + "…" : "—"}
      </td>
    </tr>
  );
}
