/** Ambient hero decoration — a blurred glowing orb with concentric rotating
 * rings. Pure SVG + CSS (transform rotate, blur), no animation library;
 * purely decorative (aria-hidden), never carries real data. Rings spin at
 * different, deliberately slow speeds and alternating directions so the
 * motion reads as ambient rather than a spinner/loading indicator. */
export function OrbitGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70"
    >
      <div className="relative h-[420px] w-[420px] sm:h-[560px] sm:w-[560px]">
        <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25 blur-[70px] animate-glow-pulse" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40 blur-2xl" />

        <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full animate-orbit-slow [animation-direction:reverse]">
          <circle cx="280" cy="280" r="260" fill="none" stroke="rgba(212,165,116,0.14)" strokeWidth="1" strokeDasharray="3 11" />
        </svg>
        <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full animate-orbit-slow">
          <circle cx="280" cy="280" r="200" fill="none" stroke="rgba(212,165,116,0.18)" strokeWidth="1" strokeDasharray="2 9" />
        </svg>
        <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full animate-orbit-slower [animation-direction:reverse]">
          <circle cx="280" cy="280" r="140" fill="none" stroke="rgba(212,165,116,0.24)" strokeWidth="1.5" strokeDasharray="1 7" />
        </svg>
      </div>
    </div>
  );
}
