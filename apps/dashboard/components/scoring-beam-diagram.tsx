import { DETECTORS, fetchScoringWeights, type ScoringWeights } from "@/components/detector-grid";
import { Reveal } from "@/components/reveal";

// Five source nodes evenly spaced along the top edge, one destination node
// (the composite score) centered at the bottom — fixed SVG coordinates, no
// client-side layout measurement needed (same approach as OrbitGlow).
const SOURCE_X = [90, 265, 400, 535, 710];
const SOURCE_Y = 34;
const DEST = { x: 400, y: 220 };
const VIEWBOX = "0 0 800 260";

function beamPath(x: number, y: number): string {
  const midY = y + (DEST.y - y) * 0.55;
  return `M ${x} ${y} Q ${x} ${midY} ${DEST.x} ${DEST.y}`;
}

/** Real functional diagram, not decoration: stroke width and flow speed are
 * driven by each detector's actual live weight (fetched from the same
 * SCORING_META the DetectorGrid cards read) — the heaviest-weighted
 * detector (parity, 40%) visibly gets a thicker, faster beam than the
 * lightest (oracle, 10%), so the picture is a real representation of how
 * the composite score is built, not a generic five-line illustration. */
export async function ScoringBeamDiagram() {
  const weights = await fetchScoringWeights();
  if (!weights) return null;

  const maxWeight = Math.max(...Object.values(weights));

  return (
    <Reveal delayMs={160}>
      <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface-0/60 px-4 py-8 sm:px-8">
        <svg viewBox={VIEWBOX} className="mx-auto w-full max-w-3xl" aria-hidden>
          <defs>
            {DETECTORS.map((d) => (
              <linearGradient key={d.key} id={`beam-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={d.hex} stopOpacity="0" />
                <stop offset="55%" stopColor={d.hex} stopOpacity="0.9" />
                <stop offset="100%" stopColor={d.hex} stopOpacity="0.55" />
              </linearGradient>
            ))}
          </defs>

          {DETECTORS.map((d, i) => {
            const w = weights[d.key as keyof ScoringWeights];
            const strokeWidth = 1.25 + (w / maxWeight) * 3.5;
            // Heavier real weight -> visibly faster flow along the beam.
            const durationS = (2.6 - (w / maxWeight) * 1.4).toFixed(2);
            return (
              <path
                key={d.key}
                className="beam-path"
                d={beamPath(SOURCE_X[i]!, SOURCE_Y)}
                fill="none"
                stroke={`url(#beam-${d.key})`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray="5 7"
                style={{ "--beam-duration": `${durationS}s` } as React.CSSProperties}
              />
            );
          })}

          {DETECTORS.map((d, i) => (
            <g key={`node-${d.key}`} transform={`translate(${SOURCE_X[i]}, ${SOURCE_Y})`}>
              <circle r="5" fill={d.hex} />
              <circle r="9" fill="none" stroke={d.hex} strokeOpacity="0.35" strokeWidth="1" />
            </g>
          ))}

          <g transform={`translate(${DEST.x}, ${DEST.y})`}>
            <circle r="22" fill="rgba(224,165,48,0.12)" />
            <circle r="14" fill="#0a0a09" stroke="#e0a530" strokeWidth="1.5" />
          </g>
        </svg>

        <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          {DETECTORS.map((d) => (
            <span key={d.key} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-dark">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${d.dotClass}`} />
              {d.title} · {weights[d.key as keyof ScoringWeights]}%
            </span>
          ))}
        </div>
        <p className="mt-3 text-center font-display text-sm font-semibold tracking-[-0.01em] text-text">
          → Composite Health Score
        </p>
      </div>
    </Reveal>
  );
}
