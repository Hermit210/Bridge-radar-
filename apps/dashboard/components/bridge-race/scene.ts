import Phaser from "phaser";
import { Sfx } from "./sfx";
import {
  speedAtDistance,
  gapWidthAtDistance,
  gapCostForWidth,
  hazardCountAtDistance,
  blocksOfferedForGap,
  highTierChanceAtDistance,
  trailingHazardChanceAtDistance,
} from "./difficulty";

/** Real result of one playthrough, handed back to React via the
 * `onGameOver` callback passed into the scene's init data. There is no
 * "finished" outcome — this is an endless runner with no win condition; a
 * run only ever ends because the player failed. */
export interface RunResult {
  score: number;
  blocksUsed: number;
  distance: number;
  outcome: "fell" | "hit";
}

export interface SceneInitData {
  onGameOver: (result: RunResult) => void;
}

/** Read-only run telemetry, mirrored to `window.__bridgeRaceDebug` every
 * frame. Never written back into by anything — it exists purely so the
 * real run state (distance, speed, the next gap's real position/cost) is
 * externally observable for QA/playtesting without adding any way to
 * influence the game other than the real keyboard input path. */
export interface BridgeRaceDebugState {
  distance: number;
  speed: number;
  blocksHeld: number;
  lives: number;
  ended: boolean;
  outcome?: "fell" | "hit";
  nextGap: { x: number; width: number; cost: number; built: boolean; buildZoneStart: number } | null;
  /** Hazards currently on screen ahead of the player — the same
   * information a sighted player reads directly off the rendered sprites;
   * exposing it doesn't add any way to affect the game, only to observe
   * what's already visible. */
  upcomingHazards: number[];
  upcomingBlocks: { x: number; tier: "low" | "high" }[];
}

declare global {
  interface Window {
    __bridgeRaceDebug?: BridgeRaceDebugState;
  }
}

type HazardKind = "signer" | "frontend";
type BlockTier = "low" | "high";

interface GapState {
  x: number;
  width: number;
  cost: number;
  built: boolean;
  label: Phaser.GameObjects.Text;
  marker: Phaser.GameObjects.Rectangle;
}

const GRAVITY_Y = 1000;
// Mario-style variable jump height: pressing jump always launches at full
// magnitude; releasing early while still ascending clamps the upward
// velocity down to JUMP_CUTOFF_VELOCITY, cutting the rest of the ascent
// short. Held through the full ascent (~0.56s) reaches ~157px above the
// player's resting height; the instant-release floor is ~33px (there's
// always at least one physics tick at full velocity before a same-frame
// release can clamp it) — LOW_BLOCK_Y is deliberately set well above that
// floor (a real tested run against an earlier ~44px-rise value showed a
// short hop can never actually reach it, since even the fastest possible
// release already overshoots ~33px and there's no way to land exactly on
// a target *below* the achievable minimum). Both cases are checked every
// frame directly against live key state — no input buffering.
const JUMP_VELOCITY = -560;
const JUMP_CUTOFF_VELOCITY = -220;
const GROUND_Y = 320;
const WORLD_HEIGHT = 760;
const FALL_THRESHOLD_Y = GROUND_Y + 260;
const GROUND_TILE_W = 64;
// Block pickup height tiers: LOW sits within a natural short-hop's real
// achievable range (comfortably above the floor above, comfortably below
// a full jump), HIGH sits near the apex of a fully-held jump — collecting
// either one requires the player to actually be airborne, at the right x,
// at the right moment. There is no ground-level auto-collect path.
const LOW_BLOCK_Y = GROUND_Y - 79;
const HIGH_BLOCK_Y = GROUND_Y - 140;
// Real signer-change/frontend-hijack hazards sit at running height and
// must be jumped over; a full-height jump covers more horizontal ground
// (longer airtime) than a tap, which matters once hazards are packed
// close together late-game — holding jump to clear one hazard can carry a
// player straight into the next one, since horizontal speed can't be
// cancelled mid-air. That tension is the point, not a bug.
const HAZARD_Y = GROUND_Y - 14;
const STARTING_LIVES = 3;

// --- Procedural segment layout (fixed spacing constants; the *content*
// inside each segment — hazard count, gap width, block scarcity — comes
// from the distance-based formulas in ./difficulty) ----------------------
const REFLEX_LEAD_IN = 70; // flat ground before each segment's hazards start
const HAZARD_ZONE_LEN = 220; // fixed-length reflex zone; density escalates, not length
const BLOCK_ZONE_LEAD_IN = 60; // gap between hazard zone and block zone — kept non-overlapping
// Blocks spawn in small clusters rather than one long evenly-spaced line:
// a single held-apex pass through a jump arc has a real, non-zero window
// at pickup height, wide enough to sweep a tight cluster but not a whole
// zone — so blocks 70px apart (roughly one full hop's ground track) would
// mean at best one pickup per jump, and jump airtime alone caps how many
// jumps fit in the zone at all: not nearly enough to hit a gap's block
// cost. Clustering (a few blocks ~24px apart, one cluster per jump) is
// what actually makes "jump to collect" a completable resource loop
// instead of a physically-impossible one — found by literally testing a
// scripted playthrough against the cost curve, not by inspection.
const BLOCK_CLUSTER_SIZE = 3;
const BLOCK_CLUSTER_INNER_SPACING = 22; // within a cluster — collectible in one jump arc
const BLOCK_CLUSTER_GAP = 170; // between cluster starts — needs a distinct jump per cluster
const BUILD_ZONE_LEN = 170; // window before the gap edge in which Build actually registers
const POST_GAP_RECOVERY = 90; // flat landing strip after a gap before the next segment begins
const TRAILING_HAZARD_OFFSET = 90; // late-game: distance before the gap edge for a combined hazard+build test
const LOOKAHEAD_DISTANCE = 1500; // how far ahead of the player to keep segments generated
const CULL_BEHIND_DISTANCE = 700; // how far behind the player before objects are destroyed

export class BridgeRaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private scannerLight!: Phaser.GameObjects.Image;
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private blockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private hazardGroup!: Phaser.Physics.Arcade.StaticGroup;
  private collectEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private landEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private distanceText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private blocksText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private buildKeyDown!: Phaser.Input.Keyboard.Key;
  private buildKeyS!: Phaser.Input.Keyboard.Key;
  private sfx = new Sfx();

  private blocksHeld = 0;
  private blocksCollectedTotal = 0;
  private blocksSpent = 0;
  private lives = STARTING_LIVES;
  private ended = false;
  private wasTouchingDown = true;
  private hazardsHit = new Set<Phaser.Physics.Arcade.Sprite>();
  private onGameOver!: (result: RunResult) => void;

  // Procedural generation state.
  private generatedUpToX = 0;
  private tileCursorX = 0;
  private pendingGaps: GapState[] = [];
  private groundTiles: Phaser.Physics.Arcade.Sprite[] = [];
  private hazardSprites: Phaser.Physics.Arcade.Sprite[] = [];
  private blockSprites: Phaser.Physics.Arcade.Sprite[] = [];
  private decor: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("BridgeRace");
  }

  init(data: SceneInitData) {
    this.onGameOver = data.onGameOver;
    this.blocksHeld = 0;
    this.blocksCollectedTotal = 0;
    this.blocksSpent = 0;
    this.lives = STARTING_LIVES;
    this.ended = false;
    this.wasTouchingDown = true;
    this.hazardsHit = new Set();
    this.generatedUpToX = 0;
    this.tileCursorX = 0;
    this.pendingGaps = [];
    this.groundTiles = [];
    this.hazardSprites = [];
    this.blockSprites = [];
    this.decor = [];
  }

  preload() {
    // Player: a small "radar drone" — a dark ring, an amber chassis
    // circle, and a separate bright scanner-light dot (animated
    // independently in update()/create() for the blink).
    this.makeCircleTexture("br-player-body", 15, 0xe0a530, 0x2b2721);
    this.makeCircleTexture("br-player-light", 4, 0xf5dca0);
    this.makeRectTexture("br-ground", GROUND_TILE_W, 28, 0x2b2721);
    this.makeRectTexture("br-block", 20, 20, 0xf0bd5c);
    this.makeRectTexture("br-block-high", 20, 20, 0xf5eecb);
    this.makeRectTexture("br-particle", 6, 6, 0xf0bd5c);
    this.makeHazardSignerTexture("br-hazard-signer", 24);
    this.makeHazardFrontendTexture("br-hazard-frontend", 24);
  }

  private makeCircleTexture(key: string, radius: number, fill: number, ring?: number) {
    if (this.textures.exists(key)) return;
    const size = radius * 2 + 4;
    const g = this.add.graphics();
    if (ring !== undefined) {
      g.lineStyle(2, ring, 1);
      g.strokeCircle(size / 2, size / 2, radius);
    }
    g.fillStyle(fill, 1);
    g.fillCircle(size / 2, size / 2, radius - 1);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeRectTexture(key: string, w: number, h: number, color: number) {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 3);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Real signer-change hazard icon: a red circle with a white X — reads at
   * a glance as "danger", themed to an actual Bridge Radar detector
   * (radar-watchers' signer-set diff watcher). */
  private makeHazardSignerTexture(key: string, size: number) {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0xb84f5e, 1);
    g.fillCircle(size / 2, size / 2, size / 2 - 2);
    g.lineStyle(2.5, 0xf2ede1, 1);
    const pad = size * 0.28;
    g.lineBetween(pad, pad, size - pad, size - pad);
    g.lineBetween(size - pad, pad, pad, size - pad);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  /** Real frontend-hijack hazard icon: a warning triangle with "!" —
   * themed to radar-watchers' frontend bundle-hash detector. */
  private makeHazardFrontendTexture(key: string, size: number) {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0xc98a3f, 1);
    g.beginPath();
    g.moveTo(size / 2, 1);
    g.lineTo(size - 1, size - 2);
    g.lineTo(1, size - 2);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x2b2721, 1);
    g.fillRect(size / 2 - 1.5, size * 0.4, 3, size * 0.28);
    g.fillCircle(size / 2, size * 0.82, 1.8);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  create() {
    this.cameras.main.setBackgroundColor("#0a0a09");
    this.buildBackground();

    this.groundGroup = this.physics.add.staticGroup();
    this.hazardGroup = this.physics.add.staticGroup();
    this.blockGroup = this.physics.add.staticGroup();

    this.buildParticleEmitters();
    this.buildPlayer();
    this.buildHud();
    this.ensureGenerated();

    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.overlap(this.player, this.blockGroup, (_player, block) => {
      this.collectBlock(block as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.hazardGroup, (_player, hazard) => {
      this.hitHazard(hazard as Phaser.Physics.Arcade.Sprite);
    });

    this.cameras.main.startFollow(this.player, true, 0.12, 0.08);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.buildKeyDown = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.buildKeyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    this.player.setVelocityX(speedAtDistance(0));
  }

  /** Dark gradient sky, fixed to the camera viewport rather than the world
   * — with the world now unbounded there is no single rect that could
   * cover it, and a flat per-frame background doesn't need one. */
  private buildBackground() {
    const cam = this.cameras.main;
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0a0a09, 0x0a0a09, 0x1a1310, 0x120d0a, 1);
    sky.fillRect(0, 0, cam.width, cam.height);
    sky.setScrollFactor(0).setDepth(-30);
  }

  private buildParticleEmitters() {
    this.collectEmitter = this.add.particles(0, 0, "br-particle", {
      speed: { min: 60, max: 160 },
      angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 380,
      gravityY: 300,
      emitting: false,
    });
    this.landEmitter = this.add.particles(0, 0, "br-particle", {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 260,
      tint: 0xc98a3f,
      emitting: false,
    });
  }

  private buildPlayer() {
    this.player = this.physics.add.sprite(60, GROUND_Y - 60, "br-player-body");
    this.player.setCollideWorldBounds(false);
    this.player.setCircle(14);
    (this.player.body as Phaser.Physics.Arcade.Body).setGravityY(GRAVITY_Y);

    this.scannerLight = this.add.image(this.player.x, this.player.y - 6, "br-player-light");
    this.tweens.add({
      targets: this.scannerLight,
      alpha: { from: 0.35, to: 1 },
      scale: { from: 0.8, to: 1.3 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    // Idle hover-bob — squash/stretch, not a position bob, so it never
    // fights the physics body's own gravity-driven Y.
    this.tweens.add({
      targets: this.player,
      scaleY: { from: 0.94, to: 1.06 },
      scaleX: { from: 1.04, to: 0.96 },
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private buildHud() {
    const textStyle = { fontFamily: "monospace", fontSize: "16px", color: "#f2ede1" };
    this.distanceText = this.add.text(12, 10, "Distance: 0", textStyle).setScrollFactor(0).setDepth(50);
    this.speedText = this.add
      .text(12, 32, "Speed: 220", { ...textStyle, fontSize: "13px", color: "#948a78" })
      .setScrollFactor(0)
      .setDepth(50);
    this.blocksText = this.add.text(12, 52, "Blocks: 0", textStyle).setScrollFactor(0).setDepth(50);
    this.livesText = this.add
      .text(12, 74, `Lives: ${"♥".repeat(STARTING_LIVES)}`, { ...textStyle, color: "#b84f5e" })
      .setScrollFactor(0)
      .setDepth(50);
    this.hint = this.add
      .text(12, 98, "↑/Space: hold for a higher jump — ↓/S: build a bridge at a gap", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#948a78",
      })
      .setScrollFactor(0)
      .setDepth(50);
  }

  // --- Procedural generation ---------------------------------------------

  private ensureGenerated() {
    while (this.generatedUpToX < this.player.x + LOOKAHEAD_DISTANCE) {
      this.generateSegment();
    }
  }

  /** Builds one full segment: a fixed-length reflex zone with distance-
   * scaled hazard density, a run-up of jump-timed block pickups whose
   * count follows the scarcity curve, then a gap whose width/cost follows
   * its own curve. All difficulty numbers come from ./difficulty, keyed on
   * `d` = this segment's starting world-x — the actual formulas the brief
   * asked to see are there, not eyeballed inline here. */
  private generateSegment() {
    const d = this.generatedUpToX;
    const segmentStart = this.generatedUpToX;

    const hazardZoneStart = segmentStart + REFLEX_LEAD_IN;
    const hazardCount = hazardCountAtDistance(d);
    for (let j = 0; j < hazardCount; j++) {
      const hx = hazardZoneStart + (HAZARD_ZONE_LEN / (hazardCount + 1)) * (j + 1);
      this.spawnHazard(hx, (Math.floor(d / 1000) + j) % 2 === 0 ? "signer" : "frontend");
    }
    const hazardZoneEnd = hazardZoneStart + HAZARD_ZONE_LEN;

    const gapWidth = gapWidthAtDistance(d);
    const cost = gapCostForWidth(gapWidth);
    const offered = blocksOfferedForGap(gapWidth, d);
    const blockZoneStart = hazardZoneEnd + BLOCK_ZONE_LEAD_IN;
    const clusterCount = Math.max(1, Math.ceil(offered / BLOCK_CLUSTER_SIZE));
    const blockZoneLen = Math.max(clusterCount * BLOCK_CLUSTER_GAP, 220);
    let placed = 0;
    for (let c = 0; c < clusterCount; c++) {
      const clusterX = blockZoneStart + (blockZoneLen / (clusterCount + 1)) * (c + 1);
      const tier: BlockTier = Math.random() < highTierChanceAtDistance(d) ? "high" : "low";
      const clusterSize = Math.min(BLOCK_CLUSTER_SIZE, offered - placed);
      for (let i = 0; i < clusterSize; i++) {
        this.spawnBlock(clusterX + i * BLOCK_CLUSTER_INNER_SPACING, tier);
      }
      placed += clusterSize;
    }
    const gapX = blockZoneStart + blockZoneLen + BUILD_ZONE_LEN;

    // Ground from the segment start through the near edge of the gap.
    this.spawnGroundRun(gapX);

    this.spawnGapDecor(gapX, gapWidth);

    // Late-game: a hazard planted inside the gap's own build window,
    // forcing the combined "clear it, then still land the Build press"
    // skill — never below TRAILING_HAZARD_START_D, ramping up after.
    if (Math.random() < trailingHazardChanceAtDistance(d)) {
      this.spawnHazard(gapX - TRAILING_HAZARD_OFFSET, Math.random() < 0.5 ? "signer" : "frontend");
    }

    const label = this.add
      .text(gapX - BUILD_ZONE_LEN / 2, GROUND_Y - 70, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e0a530",
        backgroundColor: "#0a0a09cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(40);
    const marker = this.add
      .rectangle(gapX - BUILD_ZONE_LEN, GROUND_Y - 4, 2, 12, 0xe0a530, 0.6)
      .setOrigin(0.5, 1)
      .setDepth(39);
    this.decor.push(label, marker);

    this.pendingGaps.push({ x: gapX, width: gapWidth, cost, built: false, label, marker });

    // Ground resumes on the far side of the gap, grid-snapped forward past
    // it, then a flat recovery strip before the next segment begins.
    this.tileCursorX = Math.max(this.tileCursorX, Math.ceil((gapX + gapWidth) / GROUND_TILE_W) * GROUND_TILE_W);
    this.generatedUpToX = gapX + gapWidth + POST_GAP_RECOVERY;
    this.spawnGroundRun(this.generatedUpToX);

    this.cameras.main.setBounds(0, 0, this.generatedUpToX + LOOKAHEAD_DISTANCE, WORLD_HEIGHT);
  }

  /** Lays ground tiles from the persistent grid cursor up to `toX`,
   * grid-aligned to the same global GROUND_TILE_W spacing bridge planks
   * use later — misaligned tiles previously stalled the player dead at a
   * seam, so this cursor only ever advances, never resets per-segment. */
  private spawnGroundRun(toX: number) {
    while (this.tileCursorX < toX) {
      const tile = this.groundGroup.create(
        this.tileCursorX + GROUND_TILE_W / 2,
        GROUND_Y + 14,
        "br-ground",
      ) as Phaser.Physics.Arcade.Sprite;
      tile.refreshBody();
      this.groundTiles.push(tile);
      this.tileCursorX += GROUND_TILE_W;
    }
  }

  private spawnHazard(x: number, kind: HazardKind) {
    const key = kind === "signer" ? "br-hazard-signer" : "br-hazard-frontend";
    const sprite = this.hazardGroup.create(x, HAZARD_Y, key) as Phaser.Physics.Arcade.Sprite;
    sprite.setData("kind", kind);
    sprite.refreshBody();
    this.hazardSprites.push(sprite);
  }

  private spawnBlock(x: number, tier: BlockTier) {
    const y = tier === "low" ? LOW_BLOCK_Y : HIGH_BLOCK_Y;
    const key = tier === "low" ? "br-block" : "br-block-high";
    const block = this.blockGroup.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    block.setData("tier", tier);
    block.refreshBody();
    this.blockSprites.push(block);
  }

  /** Visible danger: a dark pit fill sunk below the ground line, plus red
   * warning edges at the lip — decoration only, no physics (the actual
   * fall trigger is the world-bounds Y check in update()). */
  private spawnGapDecor(gapX: number, gapWidth: number) {
    const pit = this.add.graphics();
    pit.fillStyle(0x050403, 1);
    pit.fillRect(gapX, GROUND_Y + 4, gapWidth, WORLD_HEIGHT - GROUND_Y - 4);
    pit.fillGradientStyle(0x3a0f14, 0x3a0f14, 0x050403, 0x050403, 0.55, 0.55, 0, 0);
    pit.fillRect(gapX, GROUND_Y + 4, gapWidth, 70);
    pit.setDepth(-5);
    this.decor.push(pit);

    const edge = this.add.graphics();
    edge.fillStyle(0xb84f5e, 0.85);
    edge.fillRect(gapX - 4, GROUND_Y, 4, 6);
    edge.fillRect(gapX + gapWidth, GROUND_Y, 4, 6);
    for (const lipX of [gapX, gapX + gapWidth]) {
      edge.fillStyle(0xb84f5e, 0.7);
      edge.beginPath();
      edge.moveTo(lipX - 6, GROUND_Y);
      edge.lineTo(lipX + 6, GROUND_Y);
      edge.lineTo(lipX, GROUND_Y - 7);
      edge.closePath();
      edge.fillPath();
    }
    this.decor.push(edge);
  }

  /** Destroys anything whose x has fallen more than CULL_BEHIND_DISTANCE
   * behind the player — ground, hazards, blocks, decorations — so a run
   * that goes on for a very long time stays bounded in memory instead of
   * accumulating every object ever spawned. */
  private cullBehind(thresholdX: number) {
    this.groundTiles = this.cullSpriteArray(this.groundTiles, thresholdX);
    this.hazardSprites = this.cullSpriteArray(this.hazardSprites, thresholdX);
    this.blockSprites = this.cullSpriteArray(this.blockSprites, thresholdX);
    this.decor = this.decor.filter((obj) => {
      const x = (obj as unknown as { x: number }).x;
      if (!obj.active || x < thresholdX) {
        obj.destroy();
        return false;
      }
      return true;
    });
  }

  private cullSpriteArray(
    arr: Phaser.Physics.Arcade.Sprite[],
    thresholdX: number,
  ): Phaser.Physics.Arcade.Sprite[] {
    const kept: Phaser.Physics.Arcade.Sprite[] = [];
    for (const obj of arr) {
      if (!obj.active) continue;
      if (obj.x < thresholdX) obj.destroy();
      else kept.push(obj);
    }
    return kept;
  }

  // --- Gameplay events -----------------------------------------------

  private collectBlock(block: Phaser.Physics.Arcade.Sprite) {
    this.collectEmitter.explode(7, block.x, block.y);
    block.destroy();
    this.blocksHeld += 1;
    this.blocksCollectedTotal += 1;
    this.blocksText.setText(`Blocks: ${this.blocksHeld}`);
    this.punch(this.blocksText);
    this.sfx.collect();
  }

  private hitHazard(hazard: Phaser.Physics.Arcade.Sprite) {
    if (this.hazardsHit.has(hazard) || this.ended) return;
    this.hazardsHit.add(hazard);
    hazard.destroy();
    this.sfx.hazardHit();
    this.cameras.main.shake(120, 0.006);
    this.player.setTint(0xb84f5e);
    this.time.delayedCall(140, () => this.player.clearTint());

    this.lives -= 1;
    this.livesText.setText(
      `Lives: ${"♥".repeat(Math.max(0, this.lives))}${"♡".repeat(STARTING_LIVES - Math.max(0, this.lives))}`,
    );
    this.punch(this.livesText);

    if (this.lives <= 0) {
      this.finish("hit");
    }
  }

  /** Attempts to build a bridge across the next unresolved gap. Only
   * succeeds if the player is physically inside the gap's build window
   * (a real, visible zone — see the marker/label spawned with the gap)
   * *and* is holding enough blocks. Pressed early, late, or under-
   * resourced: nothing happens except denial feedback, and the run
   * continues toward a gap that will not have ground under it. */
  private tryBuild(px: number) {
    const gap = this.pendingGaps.find((g) => !g.built);
    if (!gap) return;
    const zoneStart = gap.x - BUILD_ZONE_LEN;
    if (px < zoneStart || px > gap.x) {
      this.sfx.buildDenied();
      return;
    }
    if (this.blocksHeld < gap.cost) {
      this.sfx.buildDenied();
      this.punch(this.blocksText, 0xb84f5e);
      return;
    }
    this.buildBridge(gap);
  }

  private punch(target: Phaser.GameObjects.Text, tint?: number) {
    const original = target.style.color;
    if (tint !== undefined) target.setColor(`#${tint.toString(16).padStart(6, "0")}`);
    this.tweens.add({
      targets: target,
      scale: { from: 1.35, to: 1 },
      duration: 220,
      ease: "Back.easeOut",
      onComplete: () => {
        if (tint !== undefined) target.setColor(original);
      },
    });
  }

  update() {
    if (this.ended) return;
    this.ensureGenerated();

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const jumpHeld = this.cursors.up.isDown || this.spaceKey.isDown;
    const jumpJustPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.spaceKey);

    if (jumpJustPressed && body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
      this.tweens.add({
        targets: this.player,
        scaleX: 0.8,
        scaleY: 1.25,
        duration: 120,
        yoyo: true,
        ease: "Quad.easeOut",
      });
      this.sfx.jump();
    }
    // Variable height: releasing the key while still ascending faster than
    // the cutoff truncates the rest of the jump — checked every frame
    // against live key state, so release feels instant, not buffered.
    if (!jumpHeld && body.velocity.y < JUMP_CUTOFF_VELOCITY) {
      body.setVelocityY(JUMP_CUTOFF_VELOCITY);
    }

    const px = this.player.x;
    const speed = speedAtDistance(px);
    this.player.setVelocityX(speed);

    // Landing squash — fires once on the down-transition of touching.down.
    if (!this.wasTouchingDown && body.touching.down) {
      this.tweens.add({
        targets: this.player,
        scaleX: 1.2,
        scaleY: 0.8,
        duration: 100,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }
    this.wasTouchingDown = body.touching.down;

    this.scannerLight.setPosition(this.player.x, this.player.y - 16);
    this.distanceText.setText(`Distance: ${Math.floor(px)}`);
    this.speedText.setText(`Speed: ${Math.round(speed)}`);

    const buildJustPressed =
      Phaser.Input.Keyboard.JustDown(this.buildKeyDown) || Phaser.Input.Keyboard.JustDown(this.buildKeyS);
    if (buildJustPressed) this.tryBuild(px);
    this.updateGapLabels(px);

    while (this.pendingGaps.length > 0 && this.pendingGaps[0]!.built && px > this.pendingGaps[0]!.x + this.pendingGaps[0]!.width) {
      this.pendingGaps.shift();
    }

    this.publishDebugState(px, speed);

    if (this.player.y > FALL_THRESHOLD_Y) {
      this.finish("fell");
      return;
    }

    this.cullBehind(px - CULL_BEHIND_DISTANCE);
  }

  private publishDebugState(px: number, speed: number) {
    if (typeof window === "undefined") return;
    const gap = this.pendingGaps.find((g) => !g.built) ?? null;
    window.__bridgeRaceDebug = {
      distance: px,
      speed,
      blocksHeld: this.blocksHeld,
      lives: this.lives,
      ended: this.ended,
      nextGap: gap && { x: gap.x, width: gap.width, cost: gap.cost, built: gap.built, buildZoneStart: gap.x - BUILD_ZONE_LEN },
      upcomingHazards: this.hazardSprites.filter((h) => h.active && h.x > px).map((h) => h.x),
      upcomingBlocks: this.blockSprites
        .filter((b) => b.active && b.x > px)
        .map((b) => ({ x: b.x, tier: b.getData("tier") as "low" | "high" })),
    };
  }

  /** Keeps each pending gap's world-space sign current: shows the real
   * block cost, turns green the moment the player is actually carrying
   * enough to cross, red once they're past the build window and the gap
   * still isn't built (a dead run walking, visibly). */
  private updateGapLabels(px: number) {
    for (const gap of this.pendingGaps) {
      if (gap.built) continue;
      const zoneStart = gap.x - BUILD_ZONE_LEN;
      const inZone = px >= zoneStart && px <= gap.x;
      const pastWindow = px > gap.x;
      const ready = this.blocksHeld >= gap.cost;
      gap.label.setText(`↓/S BUILD  need ${gap.cost} · have ${this.blocksHeld}`);
      gap.label.setColor(pastWindow ? "#b84f5e" : ready ? "#2d9a77" : inZone ? "#e0a530" : "#948a78");
    }
  }

  /** Real bridge-building visual: planks drop in one at a time (staggered),
   * each falling from above into place with a bounce-settle, a small dust
   * burst on landing, and a short camera flash once the whole span is
   * down. Grid-aligned to the same GROUND_TILE_W-spaced global grid the
   * ground-laying loop uses, so tiles slot in with zero gap and zero
   * overlap against the neighboring ground tiles. */
  private buildBridge(gap: GapState) {
    gap.built = true;
    gap.label.destroy();
    gap.marker.destroy();
    this.blocksHeld -= gap.cost;
    this.blocksSpent += gap.cost;
    this.blocksText.setText(`Blocks: ${this.blocksHeld}`);
    this.punch(this.blocksText);

    const firstTile = Math.ceil(gap.x / GROUND_TILE_W) * GROUND_TILE_W;
    let i = 0;
    for (let x = firstTile; x < gap.x + gap.width; x += GROUND_TILE_W) {
      const targetY = GROUND_Y + 14;
      const plank = this.groundGroup.create(x + GROUND_TILE_W / 2, targetY, "br-ground") as Phaser.Physics.Arcade.Sprite;
      plank.setTint(0xc98a3f);
      plank.refreshBody();
      plank.setY(targetY - 90);
      plank.setAlpha(0);
      this.groundTiles.push(plank);
      const delay = i * 90;
      this.tweens.add({
        targets: plank,
        y: targetY,
        alpha: 1,
        duration: 260,
        delay,
        ease: "Bounce.easeOut",
        onComplete: () => {
          plank.refreshBody();
          this.landEmitter.explode(8, plank.x, targetY + 8);
          this.cameras.main.shake(60, 0.002);
        },
      });
      i += 1;
    }
    this.time.delayedCall(i * 90 + 200, () => {
      this.cameras.main.flash(140, 224, 165, 48, false);
      this.sfx.bridgeComplete();
    });
  }

  private finish(outcome: "fell" | "hit") {
    this.ended = true;
    this.player.setVelocityX(0);
    const distance = Math.max(0, Math.floor(this.player.x));
    const score = distance + this.blocksCollectedTotal * 5;
    if (typeof window !== "undefined" && window.__bridgeRaceDebug) {
      window.__bridgeRaceDebug = { ...window.__bridgeRaceDebug, ended: true, outcome };
    }

    this.sfx.gameOverFell();

    const panel = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      340,
      120,
      0x0a0a09,
      0.85,
    );
    panel.setStrokeStyle(1, 0x3a352c, 1).setScrollFactor(0).setDepth(60);

    const labelMap = { fell: "Fell short", hit: "Hit too many hazards" } as const;
    this.add
      .text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 24, labelMap[outcome], {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#b84f5e",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(61);
    this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 14,
        `${distance}m · ${this.blocksCollectedTotal} blocks collected · score ${score}`,
        { fontFamily: "monospace", fontSize: "13px", color: "#c7bfae" },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(61);

    this.time.delayedCall(500, () => {
      this.onGameOver({ score, blocksUsed: this.blocksSpent, distance, outcome });
    });
  }
}
