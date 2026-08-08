import Phaser from "phaser";

/** Real result of one playthrough, handed back to React via the
 * `onGameOver` callback passed into the scene's init data. Every number
 * here comes from this actual run (distance traveled, blocks genuinely
 * collected and spent) — nothing estimated or padded. */
export interface RunResult {
  score: number;
  blocksUsed: number;
  distance: number;
  outcome: "finished" | "fell";
}

export interface SceneInitData {
  onGameOver: (result: RunResult) => void;
}

interface GapDef {
  x: number;
  width: number;
  /** Real blocks required to bridge this gap — insufficient blocks at the
   * gap's edge means no platform gets built and the player falls through. */
  cost: number;
}

const PLAYER_SPEED = 220;
const JUMP_VELOCITY = -420;
const GRAVITY_Y = 900;
// Max horizontal distance coverable by a single jump at the speed/gravity
// above is ~205px — every gap below is wider than that on purpose, so
// bridging with collected blocks is the only way across, never jumping.
const GAPS: GapDef[] = [
  { x: 900, width: 260, cost: 3 },
  { x: 1900, width: 280, cost: 5 },
  { x: 2900, width: 300, cost: 7 },
  { x: 3900, width: 320, cost: 10 },
];
const WORLD_WIDTH = 4500;
const WORLD_HEIGHT = 700;
const GROUND_Y = 300;
const FINISH_X = 4400;
const FALL_THRESHOLD_Y = GROUND_Y + 260;
const GROUND_TILE_W = 64;

/** One cluster of block pickups placed on the real run-up before each gap —
 * `cost + 2` blocks per cluster (a small buffer over what's strictly
 * needed), spaced across the available approach distance. Never placed
 * inside a gap or past the finish line. */
function buildBlockPositions(): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  let prevGapEnd = 40;
  for (const gap of GAPS) {
    const count = gap.cost + 2;
    const start = prevGapEnd + 60;
    const end = gap.x - 60;
    const span = Math.max(end - start, count * 40);
    for (let i = 0; i < count; i++) {
      positions.push({ x: start + (span / count) * i, y: GROUND_Y - 46 });
    }
    prevGapEnd = gap.x + gap.width;
  }
  return positions;
}

export class BridgeRaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private blockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private distanceText!: Phaser.GameObjects.Text;
  private blocksText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private blocksHeld = 0;
  private blocksCollectedTotal = 0;
  private blocksSpent = 0;
  private ended = false;
  private bridgesBuilt = new Set<number>();
  private onGameOver!: (result: RunResult) => void;

  constructor() {
    super("BridgeRace");
  }

  init(data: SceneInitData) {
    this.onGameOver = data.onGameOver;
    this.blocksHeld = 0;
    this.blocksCollectedTotal = 0;
    this.blocksSpent = 0;
    this.ended = false;
    this.bridgesBuilt = new Set();
  }

  preload() {
    this.makeRectTexture("br-player", 26, 40, 0xe0a530);
    // Bridge planks reuse this exact same texture (just tinted) rather than
    // a differently-sized one — real bug found in testing: a shorter plank
    // texture put the bridge's walkable surface a few px below the regular
    // ground's, and the two static bodies' overlapping-but-offset collision
    // geometry stalled the player dead at the seam. Identical geometry
    // everywhere sidesteps that entirely.
    this.makeRectTexture("br-ground", GROUND_TILE_W, 28, 0x2b2721);
    this.makeRectTexture("br-block", 20, 20, 0xf0bd5c);
  }

  /** Simple flat-color textures generated at runtime via Graphics — no
   * external image assets to source, host, or license. */
  private makeRectTexture(key: string, w: number, h: number, color: number) {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 3);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#0a0a09");

    this.groundGroup = this.physics.add.staticGroup();
    let x = 0;
    while (x < WORLD_WIDTH) {
      const inGap = GAPS.some((g) => x >= g.x && x < g.x + g.width);
      if (inGap) {
        x += GROUND_TILE_W;
        continue;
      }
      const tile = this.groundGroup.create(x + GROUND_TILE_W / 2, GROUND_Y + 14, "br-ground") as Phaser.Physics.Arcade.Sprite;
      tile.refreshBody();
      x += GROUND_TILE_W;
    }

    this.blockGroup = this.physics.add.staticGroup();
    for (const pos of buildBlockPositions()) {
      const block = this.blockGroup.create(pos.x, pos.y, "br-block") as Phaser.Physics.Arcade.Sprite;
      block.refreshBody();
    }

    this.player = this.physics.add.sprite(60, GROUND_Y - 60, "br-player");
    this.player.setCollideWorldBounds(false);
    (this.player.body as Phaser.Physics.Arcade.Body).setGravityY(GRAVITY_Y);

    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.overlap(this.player, this.blockGroup, (_player, block) => {
      (block as Phaser.Physics.Arcade.Sprite).destroy();
      this.blocksHeld += 1;
      this.blocksCollectedTotal += 1;
      this.blocksText.setText(`Blocks: ${this.blocksHeld}`);
    });

    this.cameras.main.startFollow(this.player, true, 0.12, 0.08);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    const textStyle = { fontFamily: "monospace", fontSize: "16px", color: "#f2ede1" };
    this.distanceText = this.add.text(12, 10, "Distance: 0", textStyle).setScrollFactor(0);
    this.blocksText = this.add.text(12, 32, "Blocks: 0", textStyle).setScrollFactor(0);
    this.add
      .text(12, 54, "↑ / Space to jump — bridge every gap with real collected blocks", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#948a78",
      })
      .setScrollFactor(0);

    this.player.setVelocityX(PLAYER_SPEED);
  }

  update() {
    if (this.ended) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const jumpPressed = this.cursors.up.isDown || this.spaceKey.isDown;
    if (jumpPressed && body.touching.down) {
      this.player.setVelocityY(JUMP_VELOCITY);
    }
    this.player.setVelocityX(PLAYER_SPEED);

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

  private buildBridge(gap: GapDef) {
    this.bridgesBuilt.add(gap.x);
    this.blocksHeld -= gap.cost;
    this.blocksSpent += gap.cost;
    this.blocksText.setText(`Blocks: ${this.blocksHeld}`);

    // Grid-aligned to the exact same GROUND_TILE_W-spaced global grid the
    // ground loop in create() uses (tile starts at multiples of
    // GROUND_TILE_W from world x=0) — these are precisely the tile slots
    // that loop skipped for this gap, so bridge tiles slot in with zero
    // gap and zero overlap against the neighboring real ground tiles.
    const firstTile = Math.ceil(gap.x / GROUND_TILE_W) * GROUND_TILE_W;
    for (let x = firstTile; x < gap.x + gap.width; x += GROUND_TILE_W) {
      const plank = this.groundGroup.create(x + GROUND_TILE_W / 2, GROUND_Y + 14, "br-ground") as Phaser.Physics.Arcade.Sprite;
      plank.setTint(0xc98a3f);
      plank.setAlpha(0);
      plank.refreshBody();
      this.tweens.add({ targets: plank, alpha: 1, duration: 180 });
    }
    this.cameras.main.flash(120, 224, 165, 48, false);
  }

  private finish(outcome: "finished" | "fell") {
    this.ended = true;
    this.player.setVelocityX(0);
    const distance = Math.max(0, Math.floor(this.player.x));
    const score = distance + this.blocksCollectedTotal * 5 + (outcome === "finished" ? 500 : 0);

    const label = outcome === "finished" ? "Finished!" : "Fell short";
    this.add
      .text(this.cameras.main.width / 2, this.cameras.main.height / 2, label, {
        fontFamily: "monospace",
        fontSize: "28px",
        color: outcome === "finished" ? "#2d9a77" : "#b84f5e",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.time.delayedCall(500, () => {
      this.onGameOver({ score, blocksUsed: this.blocksSpent, distance, outcome });
    });
  }
}
