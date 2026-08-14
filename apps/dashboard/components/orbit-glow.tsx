/** Ambient hero decoration — a blurred glowing orb with concentric rotating
 * rings. Pure SVG + CSS (transform rotate, blur), no animation library;
 * purely decorative (aria-hidden), never carries real data. Rings spin at
 * different, deliberately slow speeds and alternating directions so the
 * motion reads as ambient rather than a spinner/loading indicator. */
export function OrbitGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[40%] z-0 -translate-x-1/2 -translate-y-1/2 opacity-95"
    >
      <div className="relative h-[300px] w-[300px] sm:h-[440px] sm:w-[440px] md:h-[600px] md:w-[600px]">
        <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/45 blur-[80px] animate-glow-pulse" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-bright/70 blur-2xl" />

        <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full animate-orbit-slow [animation-direction:reverse]">
          <circle cx="280" cy="280" r="260" fill="none" stroke="rgba(224,165,48,0.34)" strokeWidth="1.5" strokeDasharray="3 11" />
        </svg>
        <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full animate-orbit-slow">
          <circle cx="280" cy="280" r="200" fill="none" stroke="rgba(224,165,48,0.42)" strokeWidth="1.5" strokeDasharray="2 9" />
        </svg>
        <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full animate-orbit-slower [animation-direction:reverse]">
          <circle cx="280" cy="280" r="140" fill="none" stroke="rgba(240,189,92,0.50)" strokeWidth="2" strokeDasharray="1 7" />
        </svg>
      </div>
    </div>
  );
}
