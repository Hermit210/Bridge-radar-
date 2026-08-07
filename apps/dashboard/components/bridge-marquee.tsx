"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { bandFor, type BridgeWithHealth, type HealthBand } from "@radar/shared";
import { listBridges } from "@/lib/api";

const POLL_MS = 5000;

const bandDot: Record<HealthBand, string> = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
  unmonitored: "status-dot-muted",
};

const bandText: Record<HealthBand, string> = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
  unmonitored: "text-muted-dark",
};

function MarqueeItem({ bridge }: { bridge: BridgeWithHealth }) {
  const band = bandFor(bridge);
  const score = band === "unmonitored" ? null : bridge.health?.score ?? null;
  return (
    <Link
      href={`/bridges/${bridge.id}`}
      className="group inline-flex shrink-0 items-center gap-2.5 px-6 text-sm transition-colors hover:text-text"
    >
      <span className={`status-dot ${bandDot[band]}`} aria-hidden />
      <span className="font-medium text-text-secondary transition-colors group-hover:text-text">
        {bridge.display_name}
      </span>
      <span className={`font-mono text-xs tabular-nums ${bandText[band]}`}>
        {score !== null ? score : "—"}
      </span>
    </Link>
  );
}

/** Real-data scrolling ticker — every bridge name and health dot/score
 * comes from the same polled /v1/bridges the rest of the app reads; the
 * list is duplicated once so the CSS marquee loop is seamless, never
 * padded with placeholder entries. Pauses on hover and respects
 * prefers-reduced-motion (falls back to a horizontally scrollable row). */
export function BridgeMarquee() {
  const [bridges, setBridges] = useState<BridgeWithHealth[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      listBridges()
        .then((r) => {
          if (!cancelled) setBridges(r.bridges.filter((b) => b.enabled));
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (bridges.length === 0) return null;

  const track = (key: string) => (
    <div key={key} className="flex shrink-0 items-center divide-x divide-border-subtle">
      {bridges.map((b) => (
        <MarqueeItem key={`${key}-${b.id}`} bridge={b} />
      ))}
    </div>
  );

  return (
    <div className="group/marquee w-full overflow-hidden rounded-full border border-border-subtle bg-surface-0/60 py-3 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <div className="flex w-max animate-marquee group-hover/marquee:[animation-play-state:paused]">
        {track("a")}
        {track("b")}
      </div>
    </div>
  );
}
