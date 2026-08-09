/** Pure difficulty-curve math for Bridge Race — deliberately free of any
 * Phaser import so it can be run and unit-tested in plain Node, outside a
 * browser. Every curve is a function of raw world-x distance traveled
 * (px), not elapsed time: a skilled player who covers more distance per
 * second reaches the ramp sooner. Skill drives difficulty, not a clock. */

// --- Scroll speed --------------------------------------------------------
// speed(d) = BASE + (CAP - BASE) * (1 - e^(-d / K))
// Asymptotic: approaches CAP but mathematically never reaches it. At d=K
// the ramp is 63% done, at d=3K it's 95% done. With K=25000 that's roughly
// two to three minutes of sustained skilled running before the game is
// within a few percent of max speed — and it is never fully capped, no
// matter how far a run goes.
export const BASE_SPEED = 220;
export const MAX_SPEED = 480;
const SPEED_RAMP_K = 25000;
export function speedAtDistance(d: number): number {
  return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-Math.max(0, d) / SPEED_RAMP_K));
}

// --- Gap width -------------------------------------------------------
// Same asymptotic shape, its own rate constant. MIN_GAP is already wider
// than the horizontal distance a full-height held jump covers at
// BASE_SPEED, and MAX_GAP stays wider than a full jump even at MAX_SPEED
// (see scene.ts's jump-distance note) — jumping a gap directly is never
// viable at any distance in the run. Building is always the only way
// across.
export const MIN_GAP = 300;
export const MAX_GAP = 650;
const GAP_RAMP_K = 20000;
export function gapWidthAtDistance(d: number): number {
  return MIN_GAP + (MAX_GAP - MIN_GAP) * (1 - Math.exp(-Math.max(0, d) / GAP_RAMP_K));
}

// One block plants roughly this many px of bridge deck.
export const BLOCK_SPAN = 42;
export function gapCostForWidth(width: number): number {
  return Math.ceil(width / BLOCK_SPAN);
}

// --- Hazard density --------------------------------------------------
// A flat step count, not asymptotic: one more hazard crammed into the
// same fixed-length reflex zone every HAZARD_RAMP_K px, hard-capped so the
// zone never becomes physically un-thread-able.
export const MIN_HAZARDS_PER_ZONE = 1;
export const MAX_HAZARDS_PER_ZONE = 6;
const HAZARD_RAMP_K = 3200;
export function hazardCountAtDistance(d: number): number {
  return Math.min(MAX_HAZARDS_PER_ZONE, MIN_HAZARDS_PER_ZONE + Math.floor(Math.max(0, d) / HAZARD_RAMP_K));
}

// --- Block scarcity ----------------------------------------------------
// blocksOffered(d) = exact cost of the upcoming gap + a decaying buffer.
// Early runs get a forgiving buffer (a missed pickup or two is still
// recoverable); by the time distance is a few multiples of the ramp
// constant, the buffer has decayed to ~0 — every block pickup on offer
// must actually be hit, or the gap is literally uncrossable. Real,
// escalating resource scarcity, not just a bigger number to grind past.
export const BLOCK_BUFFER_MAX = 4;
export const BLOCK_BUFFER_MIN = 0;
const BLOCK_BUFFER_RAMP_K = 18000;
export function blockBufferAtDistance(d: number): number {
  return (
    BLOCK_BUFFER_MIN + (BLOCK_BUFFER_MAX - BLOCK_BUFFER_MIN) * Math.exp(-Math.max(0, d) / BLOCK_BUFFER_RAMP_K)
  );
}
export function blocksOfferedForGap(width: number, d: number): number {
  return gapCostForWidth(width) + Math.round(blockBufferAtDistance(d));
}

// --- Block pickup tier (jump-height requirement) ------------------------
// Every block requires a jump to reach (never floor-height auto-collect).
// highTierChance(d) is the probability a given pickup sits in the "high"
// band that only a fully-held jump reaches, rather than the "low" band a
// tapped short-hop reaches — ramping up so late-game resource collection
// increasingly demands the harder, full-height jump under tighter timing.
const HIGH_TIER_RAMP_D = 40000;
const HIGH_TIER_MAX_CHANCE = 0.65;
export function highTierChanceAtDistance(d: number): number {
  return Math.min(HIGH_TIER_MAX_CHANCE, (Math.max(0, d) / HIGH_TIER_RAMP_D) * HIGH_TIER_MAX_CHANCE);
}

// --- Combined hazard+gap patterns --------------------------------------
// Below TRAILING_HAZARD_START_D, no gap has a hazard planted inside its
// own build window. Past that distance a hazard is planted there with
// linearly ramping probability — forcing the late-game combined skill the
// design calls for: clear the hazard *and* land the Build press in the
// same short window, ramping from "never" to "most of the time".
export const TRAILING_HAZARD_START_D = 15000;
export const TRAILING_HAZARD_FULL_D = 55000;
export const TRAILING_HAZARD_MAX_CHANCE = 0.75;
export function trailingHazardChanceAtDistance(d: number): number {
  if (d <= TRAILING_HAZARD_START_D) return 0;
  const t = (d - TRAILING_HAZARD_START_D) / (TRAILING_HAZARD_FULL_D - TRAILING_HAZARD_START_D);
  return Math.min(TRAILING_HAZARD_MAX_CHANCE, t * TRAILING_HAZARD_MAX_CHANCE);
}
