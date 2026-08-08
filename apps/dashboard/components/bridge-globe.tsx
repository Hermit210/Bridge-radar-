"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { GlobeMethods } from "react-globe.gl";
import { bandFor, type BridgeWithHealth } from "@radar/shared";
import { listBridges, listEvents, listRegistry, type RegistryEntry } from "@/lib/api";

// react-globe.gl wraps three.js/WebGL and has no meaningful server-rendered
// output — load it client-only so it never blocks or bloats pages that
// don't render the globe (e.g. any future SSR/streaming of this page).
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const POLL_MS = 5000;

/** The chains we actually run an indexer against — Solana (radar-indexer-solana)
 * plus every EVM chain radar-indexer-evm polls (see .env: ETH/ARBITRUM/BASE/
 * OPTIMISM/BNB/POLYGON_RPC_URL). Anything a bridge's registry entry lists
 * beyond this set (avalanche, sui, aptos, bitcoin, starknet, tron, ...) has
 * no adapter watching it and is deliberately excluded from the globe.
 *
 * Coordinates are NOT a claim about where a chain "is" — blockchains are
 * distributed networks with no single physical location, and asserting
 * otherwise would be exactly the kind of false precision this project
 * avoids everywhere else. These are fixed, arbitrary anchor points (evenly
 * spaced in longitude, alternating latitude) chosen only so each chain has
 * a distinct, visually legible spot on the sphere for real arcs to connect.
 */
const MONITORED_CHAINS: { id: string; label: string; lat: number; lng: number }[] = [
  { id: "solana", label: "Solana", lat: 15, lng: 0 },
  { id: "ethereum", label: "Ethereum", lat: -20, lng: 51 },
  { id: "arbitrum", label: "Arbitrum", lat: 25, lng: 103 },
  { id: "base", label: "Base", lat: -15, lng: 154 },
  { id: "optimism", label: "Optimism", lat: 20, lng: -154 },
  { id: "bnb", label: "BNB Chain", lat: -25, lng: -103 },
  { id: "polygon", label: "Polygon", lat: 15, lng: -51 },
];

const MONITORED_CHAIN_IDS = new Set(MONITORED_CHAINS.map((c) => c.id));

// The bridge registry (apps/api/src/bridges.ts) mixes "bsc" and "bnb" across
// entries for the same chain; our own indexed events + ChainId type
// (packages/shared) standardize on "bnb". Normalize before intersecting.
function normalizeChain(chain: string): string {
  return chain === "bsc" ? "bnb" : chain;
}

const BAND_COLOR: Record<string, string> = {
  green: "#2d9a77",
  yellow: "#c98a3f",
  red: "#b84f5e",
  unmonitored: "#695f52",
};

interface Arc {
  bridgeId: string;
  bridgeName: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  otherChain: string;
  color: string;
  score: number | undefined;
  band: string;
  animateTime: number;
}

interface ChainPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  bridgeCount: number;
}

/** Builds one arc per (bridge, monitored non-Solana chain it operates on) —
 * real registry data only, no invented chain pairs. Color is that bridge's
 * real current health band; arcs for bridges with a real event in the last
 * hour animate faster (`animateTime`) than quiet ones, so "flowing" is tied
 * to genuine recent activity, not a uniform decorative loop. */
function buildArcs(
  bridges: BridgeWithHealth[],
  registry: RegistryEntry[],
  activeBridgeIds: Set<string>,
): Arc[] {
  const solana = MONITORED_CHAINS.find((c) => c.id === "solana")!;
  const byId = new Map(MONITORED_CHAINS.map((c) => [c.id, c]));
  const scoreById = new Map(bridges.map((b) => [b.id, b]));

  const arcs: Arc[] = [];
  for (const entry of registry) {
    const bridge = scoreById.get(entry.id);
    if (!bridge || !bridge.enabled) continue; // only real, currently-monitored bridges
    const band = bandFor(bridge);
    const chains = new Set(entry.supportedChains.map(normalizeChain).filter((c) => MONITORED_CHAIN_IDS.has(c)));
    chains.delete("solana");
    if (chains.size === 0) continue; // bridge only touches chains we don't index

    const fast = activeBridgeIds.has(entry.id);
    for (const chainId of chains) {
      const chain = byId.get(chainId);
      if (!chain) continue;
      arcs.push({
        bridgeId: entry.id,
        bridgeName: entry.name,
        startLat: solana.lat,
        startLng: solana.lng,
        endLat: chain.lat,
        endLng: chain.lng,
        otherChain: chain.label,
        color: BAND_COLOR[band] ?? BAND_COLOR.unmonitored,
        score: bridge.health?.score,
        band,
        animateTime: fast ? 1500 : 4000,
      });
    }
  }
  return arcs;
}

function buildPoints(arcs: Arc[]): ChainPoint[] {
  return MONITORED_CHAINS.map((c) => ({
    ...c,
    bridgeCount:
      c.id === "solana"
        ? new Set(arcs.map((a) => a.bridgeId)).size
        : new Set(arcs.filter((a) => a.endLat === c.lat && a.endLng === c.lng).map((a) => a.bridgeId)).size,
  }));
}

export function BridgeGlobe() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 320, height: 420 });
  const [bridges, setBridges] = useState<BridgeWithHealth[] | null>(null);
  const [registry, setRegistry] = useState<RegistryEntry[] | null>(null);
  const [activeBridgeIds, setActiveBridgeIds] = useState<Set<string>>(new Set());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      setSize({ width, height: Math.round(Math.min(560, Math.max(360, width * 0.62))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const oneHourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const poll = () => {
      Promise.all([
        listBridges().catch(() => null),
        listRegistry().catch(() => null),
        listEvents({ since: oneHourAgo(), limit: 1000 }).catch(() => null),
      ]).then(([b, r, e]) => {
        if (cancelled) return;
        if (b) setBridges(b.bridges);
        if (r) setRegistry(r.implemented);
        if (e) setActiveBridgeIds(new Set(e.events.map((ev) => ev.bridge_id)));
        setUpdatedAt(Date.now());
      });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const arcs = useMemo(
    () => (bridges && registry ? buildArcs(bridges, registry, activeBridgeIds) : []),
    [bridges, registry, activeBridgeIds],
  );
  const points = useMemo(() => buildPoints(arcs), [arcs]);
  const ready = bridges !== null && registry !== null;

  // Slow ambient rotation until the visitor grabs the globe — three.js's
  // OrbitControls (the underlying drag/zoom handler) turns autoRotate off
  // on the first manual drag and never re-enables it, so a deliberate
  // look-around stays exactly where the visitor left it.
  function handleGlobeReady() {
    const instance = globeRef.current;
    if (!instance) return;
    instance.pointOfView({ lat: -2, lng: 25, altitude: 1.7 }, 0);
    const controls = instance.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
  }

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-center gap-1.5 rounded-full border border-border-subtle bg-surface-0/60 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-dark mx-auto w-fit">
        <span className="status-dot status-dot-green"></span>
        {ready ? `Live · ${arcs.length} bridge routes · updated ${Math.max(0, Math.round((Date.now() - (updatedAt ?? Date.now())) / 1000))}s ago` : "Loading live bridge network…"}
      </div>
      <div
        ref={containerRef}
        className="relative mx-auto flex w-full max-w-3xl items-center justify-center overflow-hidden rounded-3xl border border-border-subtle bg-surface-0/70 shadow-card"
        style={{ height: size.height }}
        onMouseEnter={() => {
          const controls = globeRef.current?.controls();
          if (controls) controls.autoRotate = false;
        }}
        onMouseLeave={() => {
          const controls = globeRef.current?.controls();
          if (controls) controls.autoRotate = true;
        }}
      >
        {ready && (
          <Globe
            ref={globeRef}
            onGlobeReady={handleGlobeReady}
            width={size.width}
            height={size.height}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="/globe/earth-night.jpg"
            showAtmosphere
            atmosphereColor="#e0a530"
            atmosphereAltitude={0.18}
            pointsData={points}
            pointLat="lat"
            pointLng="lng"
            pointColor={() => "#e0a530"}
            pointAltitude={0.012}
            pointRadius={0.35}
            pointLabel={(p: object) => {
              const pt = p as ChainPoint;
              return `<div style="font:600 12px system-ui;color:#f2ede1;background:#1a1815;border:1px solid #3a352c;border-radius:8px;padding:6px 10px">${pt.label}<br/><span style="color:#948a78;font-weight:400">${pt.bridgeCount} monitored bridge${pt.bridgeCount === 1 ? "" : "s"}</span></div>`;
            }}
            arcsData={arcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor={(a: object) => (a as Arc).color}
            arcAltitude={0.28}
            arcStroke={0.55}
            arcDashLength={0.4}
            arcDashGap={0.2}
            arcDashAnimateTime={(a: object) => (a as Arc).animateTime}
            arcLabel={(a: object) => {
              const arc = a as Arc;
              const scoreText = arc.score !== undefined ? `${arc.score}/100 (${arc.band})` : "no score yet";
              return `<div style="font:600 12px system-ui;color:#f2ede1;background:#1a1815;border:1px solid #3a352c;border-radius:8px;padding:6px 10px">${arc.bridgeName}<br/><span style="color:#948a78;font-weight:400">Solana ↔ ${arc.otherChain} · ${scoreText}</span></div>`;
            }}
            onArcClick={(a: object) => router.push(`/bridges/${(a as Arc).bridgeId}`)}
            onPointClick={() => router.push("/bridges")}
            enablePointerInteraction
            animateIn={false}
          />
        )}
      </div>
    </div>
  );
}
