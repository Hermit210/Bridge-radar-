/** Tiny synthesized sound effects via the real Web Audio API — no audio
 * files to source, host, or license, and no extra dependency. Each effect
 * is a couple of short oscillator tones. Silently does nothing if the
 * browser has no AudioContext (very old browsers) or the user hasn't
 * interacted with the page yet (autoplay policy) — never throws. */
export class Sfx {
  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  private tone(freq: number, startAt: number, duration: number, gain: number, type: OscillatorType = "sine") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
    gainNode.gain.setValueAtTime(0, ctx.currentTime + startAt);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + duration + 0.02);
  }

  jump() {
    this.tone(420, 0, 0.1, 0.06, "square");
    this.tone(620, 0.05, 0.09, 0.05, "square");
  }

  collect() {
    this.tone(880, 0, 0.07, 0.05, "sine");
    this.tone(1180, 0.04, 0.08, 0.045, "sine");
  }

  bridgeComplete() {
    [660, 830, 990, 1320].forEach((f, i) => this.tone(f, i * 0.06, 0.12, 0.05, "triangle"));
  }

  hazardHit() {
    this.tone(180, 0, 0.15, 0.07, "sawtooth");
  }

  gameOverFell() {
    this.tone(300, 0, 0.15, 0.06, "sawtooth");
    this.tone(180, 0.12, 0.25, 0.06, "sawtooth");
  }

  gameOverFinished() {
    [660, 880, 1100, 1320, 1560].forEach((f, i) => this.tone(f, i * 0.08, 0.14, 0.055, "triangle"));
  }
}
