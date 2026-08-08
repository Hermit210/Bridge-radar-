import Phaser from "phaser";
import { Sfx } from "./sfx";

/** Real result of one playthrough, handed back to React via the
 * `onGameOver` callback passed into the scene's init data. */
export interface RunResult {
  score: number;
  blocksUsed: number;
  distance: number;
  outcome: "finished" | "fell" | "hit";
}

export interface SceneInitData {
  onGameOver: (result: RunResult) => void;
}

interface GapDef {
  x: number;
  width: number;
  cost: number;
}

type HazardKind = "signer" | "frontend";

interface HazardDef {
  x: number;
  kind: HazardKind;
}

const PLAYER_SPEED = 220;
const JUMP_VELOCITY = -430;
const GRAVITY_Y = 950;
// Max horizontal distance coverable by a single jump at the speed/gravity
// above is ~200px — every gap is wider than that on purpose, so bridging
// with collected blocks is the only way across, never jumping.
const MAX_JUMP_DISTANCE = 200;
const GROUND_Y = 320;
const WORLD_HEIGHT = 760;
const FALL_THRESHOLD_Y = GROUND_Y + 260;
const GROUND_TILE_W = 64;
// Hazards cost a life, never a block — blocks are purely the
// bridge-building resource. A shared-resource design (hazards also costing
// blocks) was tried and found genuinely unfair in testing: hitting the very
// first hazard before collecting any blocks at all was an instant game
// over. A separate small life pool keeps "dodge hazards" and "manage your
// block economy" as two distinct skills, matching the brief's own "jump
// over or lose a life" framing.
const STARTING_LIVES = 3;

/** Difficulty ramps with distance: gaps get wider (more blocks required)
 * and spaced with proportionally more run-up room for the extra blocks
 * they cost — six gaps, widths 260 -> 435px, costs 3 -> 13. */
function generateGaps(): GapDef[] {
  const gaps: GapDef[] = [];
  let x = 900;
  for (let i = 0; i < 6; i++) {
    const width = 260 + i * 35;
    const cost = 3 + i * 2;
    gaps.push({ x, width, cost });
    x += width + 620 + i * 70;
  }
  return gaps;
}

const GAPS = generateGaps();
const WORLD_WIDTH = GAPS[GAPS.length - 1]!.x + GAPS[GAPS.length - 1]!.width + 500;
const FINISH_X = WORLD_WIDTH - 100;

// Hazards live in a fixed-length "reflex zone" right after landing from the
// previous gap; block clusters start only once that zone has fully ended.
// Keeping the two zones strictly non-overlapping means a hazard can never
// eat into the block buffer a player needs for the very next gap — hazards
// test reflexes, blocks test resource planning, deliberately not the same
// moment. Escalating hazard count inside a *fixed*-length zone (not a
// widening one) is what actually makes later zones harder: same real
// estate, tighter timing.
const HAZARD_ZONE_START_OFFSET = 90;
const HAZARD_ZONE_LEN = 210;
const BLOCK_ZONE_START_OFFSET = HAZARD_ZONE_START_OFFSET + HAZARD_ZONE_LEN + 70;

/** Hazards sit in the dedicated reflex zone after each landing, alternating
 * the two detector-themed kinds, with density increasing on later (harder)
 * segments — real difficulty progression, not a flat repeat. */
function generateHazards(): HazardDef[] {
  const hazards: HazardDef[] = [];
  let prevGapEnd = 40;
  GAPS.forEach((gap, i) => {
    const zoneStart = prevGapEnd + HAZARD_ZONE_START_OFFSET;
    const count = 1 + Math.floor(i / 2); // 1,1,2,2,3,3 — gentler, still escalating
    for (let j = 0; j < count; j++) {
      hazards.push({
        x: zoneStart + (HAZARD_ZONE_LEN / (count + 1)) * (j + 1),
        kind: (i + j) % 2 === 0 ? "signer" : "frontend",
      });
    }
    prevGapEnd = gap.x + gap.width;
  });
  return hazards;
}

const HAZARDS = generateHazards();

/** One cluster of block pickups on the real run-up before each gap, starting
 * only after the hazard reflex zone has fully ended — `cost + 3` blocks per
 * cluster (a real buffer that survives one hazard hit), spaced across the
 * available approach distance, positioned low enough to auto-collect while
 * running (no jump required — collecting is the strategic-resource loop;
 * jumping is reserved for dodging hazards). */
function buildBlockPositions(): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  let prevGapEnd = 40;
  for (const gap of GAPS) {
    const count = gap.cost + 3;
    const start = prevGapEnd + BLOCK_ZONE_START_OFFSET;
    const end = gap.x - 60;
    const span = Math.max(end - start, count * 40);
    for (let i = 0; i < count; i++) {
      // Player rests with its circle body centered at GROUND_Y - 14 (14 =
      // its collision radius) — blocks must sit at that same height to
      // actually overlap the player while running, not float above it.
      positions.push({ x: start + (span / count) * i, y: GROUND_Y - 14 });
    }
    prevGapEnd = gap.x + gap.width;
  }
  return positions;
}

export class BridgeRaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private scannerLight!: Phaser.GameObjects.Image;
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private blockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private hazardGroup!: Phaser.Physics.Arcade.StaticGroup;
  private collectEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private landEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private distanceText!: Phaser.GameObjects.Text;
  private blocksText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private sfx = new Sfx();

  private blocksHeld = 0;
  private blocksCollectedTotal = 0;
  private blocksSpent = 0;
  private lives = STARTING_LIVES;
  private ended = false;
  private wasTouchingDown = true;
  private bridgesBuilt = new Set<number>();
  private hazardsHit = new Set<Phaser.Physics.Arcade.Sprite>();
  private onGameOver!: (result: RunResult) => void;

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
    this.bridgesBuilt = new Set();
    this.hazardsHit = new Set();
  }

  preload() {
    // Player: a small "radar drone" — a dark ring, an amber chassis
    // circle, and a separate bright scanner-light dot (animated
    // independently in update()/create() for the blink).
    this.makeCircleTexture("br-player-body", 15, 0xe0a530, 0x2b2721);
    this.makeCircleTexture("br-player-light", 4, 0xf5dca0);
    this.makeRectTexture("br-ground", GROUND_TILE_W, 28, 0x2b2721);
    this.makeRectTexture("br-block", 20, 20, 0xf0bd5c);
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
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#0a0a09");

    this.buildBackground();
    this.buildGroundAndGaps();
    this.buildHazards();
    this.buildBlocks();
    this.buildParticleEmitters();
    this.buildPlayer();
    this.buildHud();

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

    this.player.setVelocityX(PLAYER_SPEED);
  }

  /** Dark gradient sky (a live Graphics fill, not a baked texture —
   * gradients don't survive generateTexture's Canvas-API path) plus a
   * sparse, hand-placed "network node" field (faint dots + occasional
   * connecting lines between near neighbors) at a slower parallax scroll
   * factor than the foreground, for real depth. Deliberately NOT a
   * repeating tiled pattern — an earlier version used a TileSprite here and
   * it read as a loud, distracting polka-dot moiré rather than atmosphere;
   * a small fixed count of dots at low alpha, placed once with a seeded
   * PRNG (deterministic, not Math.random()), stays genuinely subtle. */
  private buildBackground() {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0a0a09, 0x0a0a09, 0x1a1310, 0x120d0a, 1);
    sky.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    sky.setScrollFactor(0.15, 0.05);
    sky.setDepth(-30);

    // mulberry32 — tiny, deterministic PRNG so the node field is stable
    // across runs instead of reshuffling every game.
    let seed = 1337;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const nodes = this.buildNetworkNodes(rand);
    const lines = this.add.graphics();
    lines.lineStyle(1, 0xe0a530, 0.08);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 180) lines.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    lines.setScrollFactor(0.35, 0.15);
    lines.setDepth(-25);

    const dotsLayer = this.add.graphics();
    dotsLayer.fillStyle(0xe0a530, 0.22);
    for (const n of nodes) dotsLayer.fillCircle(n.x, n.y, 2);
    dotsLayer.setScrollFactor(0.35, 0.15);
    dotsLayer.setDepth(-24);
  }

  /** ~1 node per 220px of world width, kept in the upper sky band so they
   * never compete visually with the ground/gameplay layer. */
  private buildNetworkNodes(rand: () => number): { x: number; y: number }[] {
    const nodes: { x: number; y: number }[] = [];
    const count = Math.round(WORLD_WIDTH / 220);
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: rand() * WORLD_WIDTH,
        y: 20 + rand() * (GROUND_Y - 100),
      });
    }
    return nodes;
  }

  private buildGroundAndGaps() {
    this.groundGroup = this.physics.add.staticGroup();
    let x = 0;
    while (x < WORLD_WIDTH) {
      const gap = GAPS.find((g) => x >= g.x && x < g.x + g.width);
      if (gap) {
        x += GROUND_TILE_W;
        continue;
      }
      const tile = this.groundGroup.create(x + GROUND_TILE_W / 2, GROUND_Y + 14, "br-ground") as Phaser.Physics.Arcade.Sprite;
      tile.refreshBody();
      x += GROUND_TILE_W;
    }

    // Real visible danger: a dark pit fill sunk below the ground line, plus
    // red warning edges right at the lip of every gap — decoration only,
    // no physics (the actual fall trigger is the world-bounds Y check).
    for (const gap of GAPS) {
      const pit = this.add.graphics();
      pit.fillStyle(0x050403, 1);
      pit.fillRect(gap.x, GROUND_Y + 4, gap.width, WORLD_HEIGHT - GROUND_Y - 4);
      pit.fillGradientStyle(0x3a0f14, 0x3a0f14, 0x050403, 0x050403, 0.55, 0.55, 0, 0);
      pit.fillRect(gap.x, GROUND_Y + 4, gap.width, 70);
      pit.setDepth(-5);

      const edge = this.add.graphics();
      edge.fillStyle(0xb84f5e, 0.85);
      edge.fillRect(gap.x - 4, GROUND_Y, 4, 6);
      edge.fillRect(gap.x + gap.width, GROUND_Y, 4, 6);
      // Small warning chevrons at each lip.
      for (const lipX of [gap.x, gap.x + gap.width]) {
        edge.fillStyle(0xb84f5e, 0.7);
        edge.beginPath();
        edge.moveTo(lipX - 6, GROUND_Y);
        edge.lineTo(lipX + 6, GROUND_Y);
        edge.lineTo(lipX, GROUND_Y - 7);
        edge.closePath();
        edge.fillPath();
      }
    }
  }

  private buildHazards() {
    this.hazardGroup = this.physics.add.staticGroup();
    for (const hz of HAZARDS) {
      const key = hz.kind === "signer" ? "br-hazard-signer" : "br-hazard-frontend";
      const sprite = this.hazardGroup.create(hz.x, GROUND_Y - 14, key) as Phaser.Physics.Arcade.Sprite;
      sprite.setData("kind", hz.kind);
      sprite.refreshBody();
    }
  }

  private buildBlocks() {
    this.blockGroup = this.physics.add.staticGroup();
    for (const pos of buildBlockPositions()) {
      const block = this.blockGroup.create(pos.x, pos.y, "br-block") as Phaser.Physics.Arcade.Sprite;
      block.refreshBody();
    }
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
    this.blocksText = this.add.text(12, 32, "Blocks: 0", textStyle).setScrollFactor(0).setDepth(50);
    this.livesText = this.add
      .text(12, 54, `Lives: ${"♥".repeat(STARTING_LIVES)}`, { ...textStyle, color: "#b84f5e" })
      .setScrollFactor(0)
      .setDepth(50);
    this.hint = this.add
      .text(12, 78, "↑ / Space to jump — dodge hazards, bridge every gap with real collected blocks", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#948a78",
      })
      .setScrollFactor(0)
      .setDepth(50);
  }

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
    this.livesText.setText(`Lives: ${"♥".repeat(Math.max(0, this.lives))}${"♡".repeat(STARTING_LIVES - Math.max(0, this.lives))}`);
    this.punch(this.livesText);

    if (this.lives <= 0) {
      this.finish("hit");
    }
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

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const jumpPressed = this.cursors.up.isDown || this.spaceKey.isDown;
    if (jumpPressed && body.touching.down) {
      this.player.setVelocityY(JUMP_VELOCITY);
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
    this.player.setVelocityX(PLAYER_SPEED);

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

    const px = this.player.x;
    this.distanceText.setText(`Distance: ${Math.floor(px)}`);

    for (const gap of GAPS) {
      if (this.bridgesBuilt.has(gap.x)) continue;
      if (px > gap.x - 90 && px < gap.x + gap.width && this.blocksHeld >= gap.cost) {
        this.buildBridge(gap);
      }
    }

    if (this.player.y > FALL_THRESHOLD_Y) {
      this.finish("fell");
      return;
    }
    if (px >= FINISH_X) {
      this.finish("finished");
    }
  }

  /** Real bridge-building visual: planks drop in one at a time (staggered),
   * each falling from above into place with a bounce-settle, a small dust
   * burst on landing, and a short camera flash once the whole span is
   * down — not just an instant color change. Grid-aligned to the exact
   * same GROUND_TILE_W-spaced global grid the ground loop uses, so tiles
   * slot in with zero gap and zero overlap against the neighboring real
   * ground tiles (a real bug here previously stalled the player dead at
   * the seam — see PROGRESS.md / the fix commit). */
  private buildBridge(gap: GapDef) {
    this.bridgesBuilt.add(gap.x);
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

  private finish(outcome: "finished" | "fell" | "hit") {
    this.ended = true;
    this.player.setVelocityX(0);
    const distance = Math.max(0, Math.floor(this.player.x));
    const score = distance + this.blocksCollectedTotal * 5 + (outcome === "finished" ? 500 : 0);

    if (outcome === "finished") this.sfx.gameOverFinished();
    else this.sfx.gameOverFell();

    const panel = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      340,
      120,
      0x0a0a09,
      0.85,
    );
    panel.setStrokeStyle(1, 0x3a352c, 1).setScrollFactor(0).setDepth(60);

    const labelMap = { finished: "Finished!", fell: "Fell short", hit: "Hit too many hazards" } as const;
    const colorMap = { finished: "#2d9a77", fell: "#b84f5e", hit: "#b84f5e" } as const;
    this.add
      .text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 24, labelMap[outcome], {
        fontFamily: "monospace",
        fontSize: "24px",
        color: colorMap[outcome],
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
