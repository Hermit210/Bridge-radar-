// Storage abstraction for the API. Two backends implement the same
// `RadarDb` interface — SQLite (v0 dev loop, `better-sqlite3`, sync under the
// hood but wrapped in `async` so callers never care) and Postgres+Timescale
// (production, `pg`). `createDb(url)` picks the backend from the
// `DATABASE_URL` scheme, mirroring `radar_core::storage::connect_any` on the
// Rust side — same idea, same dispatch rule, independently implemented here
// because Node and Rust don't share a storage layer.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import type {
  BridgeEvent,
  BridgeEventKind,
  BridgeRow,
  HealthComponents,
  HealthScore,
} from "@radar/shared";

const { Pool } = pg;

export interface DefiLlamaRow {
  category: string;
  key: string;
  payload: string;
  fetched_at: string;
}

/** One bridge_events row read back off the wire, paired with the cursor value
 * (that row's own event_time) a caller should pass as `since` on the next
 * poll to resume strictly after it. */
export interface CursoredEvent {
  cursor: string;
  event: BridgeEvent;
}

/** A "Bridge Race" mini-game run, as reported by the client after a real
 * playthrough. There is no server-side replay verification in v0 — only
 * sane-bounds validation at the API layer (see index.ts) — so this is real
 * data from a real client, honestly not tamper-proof. */
export interface GameScoreEntry {
  walletAddress: string;
  score: number;
  blocksUsed: number;
  distance: number;
}

export interface GameScoreRow extends GameScoreEntry {
  completedAt: string;
}

/** A wallet's real daily check-in streak, keyed by real UTC calendar day —
 * see `recordActivity`'s doc comment for the increment/reset rule. */
export interface StreakRow {
  walletAddress: string;
  lastActiveDate: string;
  currentStreak: number;
  longestStreak: number;
}

export interface RadarDb {
  listBridges(): Promise<BridgeRow[]>;
  latestScores(): Promise<HealthScore[]>;
  scoreHistory(bridgeId: string, since: string): Promise<HealthScore[]>;
  nearestScore(bridgeId: string, atIso: string): Promise<HealthScore | null>;
  worstScoreAfter(bridgeId: string, afterIso: string): Promise<HealthScore | null>;
  listEvents(opts: {
    bridgeId?: string;
    kind?: BridgeEventKind;
    chain?: string;
    since?: string;
    limit?: number;
  }): Promise<BridgeEvent[]>;
  eventsByTx(tx: string): Promise<BridgeEvent[]>;
  /** Cursor positioned at the current head — used on startup so the WS
   * tailer only broadcasts events that land after the API came up. */
  latestEventCursor(): Promise<string>;
  eventsSince(cursor: string, limit?: number): Promise<CursoredEvent[]>;
  countEvents(): Promise<number>;
  /** Real count of events of the given kinds at or after `sinceIso`, across
   * every bridge — used for the weekly digest's anomaly-event tally. A real
   * COUNT query, not `listEvents(...).length` against a capped/limited
   * result set, so it stays accurate regardless of volume. */
  countEventsSince(sinceIso: string, kinds: BridgeEventKind[]): Promise<number>;
  defillamaList(category: string): Promise<DefiLlamaRow[]>;
  defillamaGet(category: string, key: string): Promise<DefiLlamaRow | undefined>;
  insertGameScore(entry: GameScoreEntry): Promise<GameScoreRow>;
  topGameScores(limit: number): Promise<GameScoreRow[]>;
  /** Records one real check-in for `walletAddress` on real UTC calendar day
   * `todayUtc` (YYYY-MM-DD) and returns the resulting streak state. Same-day
   * repeat calls are a no-op (idempotent). See implementations for the real
   * increment/reset rule. */
  recordActivity(walletAddress: string, todayUtc: string): Promise<StreakRow>;
  close(): Promise<void>;
}

/** No events recorded yet: any real event_time sorts after this. */
const EPOCH = "1970-01-01T00:00:00.000Z";

function rowToScore(r: {
  bridge_id: string;
  computed_at: string;
  score: number;
  parity_severity: number;
  outflow_severity: number;
  signer_recency: number;
  frontend_recency: number;
  oracle_staleness: number;
}): HealthScore {
  const components: HealthComponents = {
    parity_severity: r.parity_severity,
    outflow_severity: r.outflow_severity,
    signer_recency: r.signer_recency,
    frontend_recency: r.frontend_recency,
    oracle_staleness: r.oracle_staleness,
  };
  return {
    bridge_id: r.bridge_id,
    computed_at: r.computed_at,
    score: r.score,
    components,
  };
}

function rowToEvent(r: { id: string; event_time: string; bridge_id: string; payload: unknown }): BridgeEvent {
  const payload = (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as Record<
    string,
    unknown
  >;
  return {
    id: r.id,
    bridge_id: r.bridge_id,
    event_time: r.event_time,
    type: payload.type as BridgeEventKind,
    ...payload,
  } as BridgeEvent;
}

// ─── SQLite (v0 dev loop) ─────────────────────────────────────────────────

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(dir, "Cargo.toml"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function resolveDbPath(url: string): string {
  // Accept "sqlite:///abs/path", "sqlite://./relative", or a bare path. Relative
  // paths resolve against the workspace root, not the API's cwd, so running
  // `pnpm --filter @radar/api dev` from any directory hits the same file the
  // Rust indexer writes to.
  const stripped = url.replace(/^sqlite:\/\//, "");
  if (path.isAbsolute(stripped)) return stripped;
  const root = findWorkspaceRoot(process.cwd());
  return path.resolve(root, stripped);
}

class SqliteRadarDb implements RadarDb {
  private db: Database.Database;

  constructor(url: string) {
    const dbPath = resolveDbPath(url);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { readonly: false, fileMustExist: false });
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.ensureSchema();
  }

  // The Rust side seeds bridges + creates tables on connect. If the API
  // happens to start before the indexer ever has, create the bare minimum
  // so /v1/bridges doesn't 500. Idempotent.
  private ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bridges (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        homepage TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE IF NOT EXISTS bridge_events (
        id TEXT PRIMARY KEY,
        event_time TEXT NOT NULL,
        bridge_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        chain_id TEXT,
        asset TEXT,
        amount_usd REAL,
        tx TEXT,
        payload TEXT NOT NULL,
        ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS bridge_events_bridge_time_idx
        ON bridge_events (bridge_id, event_time DESC);
      CREATE TABLE IF NOT EXISTS bridge_health_scores (
        bridge_id TEXT NOT NULL,
        computed_at TEXT NOT NULL,
        score INTEGER NOT NULL,
        parity_severity REAL NOT NULL DEFAULT 0,
        outflow_severity REAL NOT NULL DEFAULT 0,
        signer_recency REAL NOT NULL DEFAULT 0,
        frontend_recency REAL NOT NULL DEFAULT 0,
        oracle_staleness REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (bridge_id, computed_at)
      );
      CREATE TABLE IF NOT EXISTS defillama_cache (
        category    TEXT NOT NULL,
        key         TEXT NOT NULL,
        payload     TEXT NOT NULL,
        fetched_at  TEXT NOT NULL,
        PRIMARY KEY (category, key)
      );
      CREATE TABLE IF NOT EXISTS game_scores (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        score          INTEGER NOT NULL,
        blocks_used    INTEGER NOT NULL,
        distance       INTEGER NOT NULL,
        completed_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS game_scores_score_idx ON game_scores (score DESC);
      CREATE TABLE IF NOT EXISTS user_streaks (
        wallet_address    TEXT PRIMARY KEY,
        last_active_date  TEXT NOT NULL,
        current_streak    INTEGER NOT NULL DEFAULT 1,
        longest_streak    INTEGER NOT NULL DEFAULT 1,
        updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT OR IGNORE INTO bridges (id, display_name, homepage) VALUES
        ('wormhole','Wormhole','https://wormhole.com'),
        ('allbridge','Allbridge','https://allbridge.io'),
        ('debridge','deBridge','https://debridge.finance'),
        ('layerzero','LayerZero','https://layerzero.network'),
        ('mayan','Mayan','https://mayan.finance'),
        ('portal','Portal','https://portalbridge.com'),
        ('axelar','Axelar','https://axelar.network'),
        ('relay','Relay','https://relay.link'),
        ('across','Across Protocol','https://across.to'),
        ('garden','Garden Finance','https://garden.finance'),
        ('base-solana-bridge','Coinbase Bridge (Base-Solana)','https://docs.base.org/base-chain/quickstart/base-solana-bridge'),
        ('atomiq','Atomiq Exchange','https://atomiq.exchange'),
        ('rhinofi','rhino.fi','https://rhino.fi'),
        ('orderly','Orderly Network','https://orderly.network');

      -- cctp/hyperlane are real bridges but have no adapter watching a
      -- verified Solana program yet (see crate::bridges::registry doc
      -- comment in the Rust side). Seeded disabled so the scorer skips them
      -- instead of writing a green 100 for "never monitored". Separate
      -- statement: different column list (explicit enabled = 0).
      INSERT OR IGNORE INTO bridges (id, display_name, homepage, enabled) VALUES
        ('cctp','Circle CCTP','https://www.circle.com/en/usdc/bridge',0),
        ('hyperlane','Hyperlane','https://hyperlane.xyz',0);

      -- One-time reconciliation for local DBs seeded before this fix: lido
      -- (liquid staking, not a bridge), magic-eden (NFT marketplace, not a
      -- bridge), and stargate (confirmed not deployed on Solana) were
      -- previously inserted here and picked up a false 100 health score
      -- because the scorer scores every *enabled* row regardless of whether
      -- a real adapter watches it. Idempotent no-op once cleaned.
      DELETE FROM bridge_health_scores WHERE bridge_id IN ('lido','magic-eden','stargate');
      DELETE FROM bridge_events WHERE bridge_id IN ('lido','magic-eden','stargate');
      DELETE FROM bridges WHERE id IN ('lido','magic-eden','stargate');

      -- cctp/hyperlane also get reconciled every startup in case an older
      -- run left them enabled with a stale score.
      DELETE FROM bridge_health_scores WHERE bridge_id IN ('cctp','hyperlane');
      DELETE FROM bridge_events WHERE bridge_id IN ('cctp','hyperlane');
      UPDATE bridges SET enabled = 0 WHERE id IN ('cctp','hyperlane');
    `);
  }

  async listBridges(): Promise<BridgeRow[]> {
    const rows = this.db
      .prepare("SELECT id, display_name, homepage, enabled FROM bridges ORDER BY id")
      .all() as { id: string; display_name: string; homepage: string | null; enabled: number }[];
    return rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      homepage: r.homepage ?? undefined,
      enabled: r.enabled !== 0,
    }));
  }

  async latestScores(): Promise<HealthScore[]> {
    const rows = this.db
      .prepare(
        `SELECT s.bridge_id, s.computed_at, s.score,
                s.parity_severity, s.outflow_severity, s.signer_recency,
                s.frontend_recency, s.oracle_staleness
           FROM bridge_health_scores s
           INNER JOIN (
             SELECT bridge_id, MAX(computed_at) AS m
               FROM bridge_health_scores GROUP BY bridge_id
           ) latest
             ON latest.bridge_id = s.bridge_id AND latest.m = s.computed_at`,
      )
      .all() as DbScoreRow[];
    return rows.map(rowToScore);
  }

  async scoreHistory(bridgeId: string, since: string): Promise<HealthScore[]> {
    const rows = this.db
      .prepare(
        `SELECT bridge_id, computed_at, score,
                parity_severity, outflow_severity, signer_recency,
                frontend_recency, oracle_staleness
           FROM bridge_health_scores
           WHERE bridge_id = ? AND computed_at >= ?
           ORDER BY computed_at ASC`,
      )
      .all(bridgeId, since) as DbScoreRow[];
    return rows.map(rowToScore);
  }

  async nearestScore(bridgeId: string, atIso: string): Promise<HealthScore | null> {
    const row = this.db
      .prepare(
        `SELECT bridge_id, computed_at, score,
                parity_severity, outflow_severity, signer_recency,
                frontend_recency, oracle_staleness
           FROM bridge_health_scores
           WHERE bridge_id = ?
           ORDER BY ABS(julianday(computed_at) - julianday(?)) ASC
           LIMIT 1`,
      )
      .get(bridgeId, atIso) as DbScoreRow | undefined;
    return row ? rowToScore(row) : null;
  }

  async worstScoreAfter(bridgeId: string, afterIso: string): Promise<HealthScore | null> {
    const row = this.db
      .prepare(
        `SELECT bridge_id, computed_at, score,
                parity_severity, outflow_severity, signer_recency,
                frontend_recency, oracle_staleness
           FROM bridge_health_scores
           WHERE bridge_id = ? AND computed_at > ?
           ORDER BY score ASC, computed_at ASC
           LIMIT 1`,
      )
      .get(bridgeId, afterIso) as DbScoreRow | undefined;
    return row ? rowToScore(row) : null;
  }

  async listEvents(opts: {
    bridgeId?: string;
    kind?: BridgeEventKind;
    chain?: string;
    since?: string;
    limit?: number;
  }): Promise<BridgeEvent[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.bridgeId) {
      where.push("bridge_id = ?");
      params.push(opts.bridgeId);
    }
    if (opts.kind) {
      where.push("event_type = ?");
      params.push(opts.kind);
    }
    if (opts.chain) {
      where.push("chain_id = ?");
      params.push(opts.chain);
    }
    if (opts.since) {
      where.push("event_time >= ?");
      params.push(opts.since);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT id, event_time, bridge_id, payload
           FROM bridge_events
           ${whereSql}
           ORDER BY event_time DESC LIMIT ?`,
      )
      .all(...params) as { id: string; event_time: string; bridge_id: string; payload: string }[];
    return rows.map(rowToEvent);
  }

  async eventsByTx(tx: string): Promise<BridgeEvent[]> {
    const rows = this.db
      .prepare(`SELECT id, event_time, bridge_id, payload FROM bridge_events WHERE tx = ?`)
      .all(tx) as { id: string; event_time: string; bridge_id: string; payload: string }[];
    return rows.map(rowToEvent);
  }

  async latestEventCursor(): Promise<string> {
    const r = this.db
      .prepare("SELECT MAX(event_time) AS m FROM bridge_events")
      .get() as { m: string | null } | undefined;
    return r?.m ?? EPOCH;
  }

  async eventsSince(cursor: string, limit = 200): Promise<CursoredEvent[]> {
    const rows = this.db
      .prepare(
        `SELECT id, event_time, bridge_id, payload
           FROM bridge_events
           WHERE event_time > ?
           ORDER BY event_time ASC LIMIT ?`,
      )
      .all(cursor, limit) as { id: string; event_time: string; bridge_id: string; payload: string }[];
    return rows.map((r) => ({ cursor: r.event_time, event: rowToEvent(r) }));
  }

  async countEvents(): Promise<number> {
    const r = this.db.prepare("SELECT COUNT(*) AS c FROM bridge_events").get() as { c: number };
    return r.c;
  }

  async countEventsSince(sinceIso: string, kinds: BridgeEventKind[]): Promise<number> {
    if (kinds.length === 0) return 0;
    const placeholders = kinds.map(() => "?").join(",");
    const r = this.db
      .prepare(`SELECT COUNT(*) AS c FROM bridge_events WHERE event_time >= ? AND event_type IN (${placeholders})`)
      .get(sinceIso, ...kinds) as { c: number };
    return r.c;
  }

  async defillamaList(category: string): Promise<DefiLlamaRow[]> {
    return this.db
      .prepare(
        "SELECT category, key, payload, fetched_at FROM defillama_cache WHERE category = ? ORDER BY key",
      )
      .all(category) as DefiLlamaRow[];
  }

  async defillamaGet(category: string, key: string): Promise<DefiLlamaRow | undefined> {
    return this.db
      .prepare(
        "SELECT category, key, payload, fetched_at FROM defillama_cache WHERE category = ? AND key = ?",
      )
      .get(category, key) as DefiLlamaRow | undefined;
  }

  async insertGameScore(entry: GameScoreEntry): Promise<GameScoreRow> {
    const completedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO game_scores (wallet_address, score, blocks_used, distance, completed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(entry.walletAddress, entry.score, entry.blocksUsed, entry.distance, completedAt);
    return { ...entry, completedAt };
  }

  async topGameScores(limit: number): Promise<GameScoreRow[]> {
    const rows = this.db
      .prepare(
        `SELECT wallet_address, score, blocks_used, distance, completed_at
           FROM game_scores
           ORDER BY score DESC, completed_at ASC
           LIMIT ?`,
      )
      .all(limit) as {
      wallet_address: string;
      score: number;
      blocks_used: number;
      distance: number;
      completed_at: string;
    }[];
    return rows.map((r) => ({
      walletAddress: r.wallet_address,
      score: r.score,
      blocksUsed: r.blocks_used,
      distance: r.distance,
      completedAt: r.completed_at,
    }));
  }

  /** Real streak increment/reset rule, evaluated against the row's previous
   * `last_active_date` before this call overwrites it:
   *   - same as `todayUtc` already -> no-op (repeat visit same real day)
   *   - exactly one real day before `todayUtc` -> current_streak + 1
   *   - anything else (a real gap, or the very first visit) -> reset to 1
   * `longest_streak` is the real running max, never decreases. */
  async recordActivity(walletAddress: string, todayUtc: string): Promise<StreakRow> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO user_streaks (wallet_address, last_active_date, current_streak, longest_streak, updated_at)
         VALUES (?, ?, 1, 1, ?)
         ON CONFLICT(wallet_address) DO UPDATE SET
           current_streak = CASE
             WHEN last_active_date = excluded.last_active_date THEN current_streak
             WHEN date(last_active_date, '+1 day') = excluded.last_active_date THEN current_streak + 1
             ELSE 1
           END,
           longest_streak = MAX(longest_streak, CASE
             WHEN last_active_date = excluded.last_active_date THEN current_streak
             WHEN date(last_active_date, '+1 day') = excluded.last_active_date THEN current_streak + 1
             ELSE 1
           END),
           last_active_date = excluded.last_active_date,
           updated_at = excluded.updated_at`,
      )
      .run(walletAddress, todayUtc, now);
    const row = this.db
      .prepare(
        `SELECT wallet_address, last_active_date, current_streak, longest_streak
           FROM user_streaks WHERE wallet_address = ?`,
      )
      .get(walletAddress) as {
      wallet_address: string;
      last_active_date: string;
      current_streak: number;
      longest_streak: number;
    };
    return {
      walletAddress: row.wallet_address,
      lastActiveDate: row.last_active_date,
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

// ─── Postgres + Timescale (production) ───────────────────────────────────
//
// Schema lives in migrations/0001_init.sql + 0002_defillama_cache.sql,
// applied via docker-compose's initdb mount (or `psql -f` manually) — this
// class is purely the query layer, same column names / row shapes as the
// SQLite impl above and radar-core's PostgresStorage on the Rust side, so
// swapping DATABASE_URL requires no code changes anywhere else.

interface DbScoreRow {
  bridge_id: string;
  computed_at: string;
  score: number;
  parity_severity: number;
  outflow_severity: number;
  signer_recency: number;
  frontend_recency: number;
  oracle_staleness: number;
}

function isoOf(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : v;
}

class PostgresRadarDb implements RadarDb {
  private pool: InstanceType<typeof Pool>;

  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 8 });
  }

  async listBridges(): Promise<BridgeRow[]> {
    const { rows } = await this.pool.query<{
      id: string;
      display_name: string;
      homepage: string | null;
      enabled: boolean;
    }>("SELECT id, display_name, homepage, enabled FROM bridges ORDER BY id");
    return rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      homepage: r.homepage ?? undefined,
      enabled: r.enabled,
    }));
  }

  private mapScoreRow(r: {
    bridge_id: string;
    computed_at: string | Date;
    score: number;
    parity_severity: number;
    outflow_severity: number;
    signer_recency: number;
    frontend_recency: number;
    oracle_staleness: number;
  }): HealthScore {
    return rowToScore({ ...r, computed_at: isoOf(r.computed_at) });
  }

  async latestScores(): Promise<HealthScore[]> {
    const { rows } = await this.pool.query(
      `SELECT s.bridge_id, s.computed_at, s.score,
              s.parity_severity, s.outflow_severity, s.signer_recency,
              s.frontend_recency, s.oracle_staleness
         FROM bridge_health_scores s
         INNER JOIN (
             SELECT bridge_id, MAX(computed_at) AS m
               FROM bridge_health_scores GROUP BY bridge_id
         ) latest ON latest.bridge_id = s.bridge_id AND latest.m = s.computed_at`,
    );
    return rows.map((r) => this.mapScoreRow(r));
  }

  async scoreHistory(bridgeId: string, since: string): Promise<HealthScore[]> {
    const { rows } = await this.pool.query(
      `SELECT bridge_id, computed_at, score,
              parity_severity, outflow_severity, signer_recency,
              frontend_recency, oracle_staleness
         FROM bridge_health_scores
         WHERE bridge_id = $1 AND computed_at >= $2
         ORDER BY computed_at ASC`,
      [bridgeId, since],
    );
    return rows.map((r) => this.mapScoreRow(r));
  }

  async nearestScore(bridgeId: string, atIso: string): Promise<HealthScore | null> {
    const { rows } = await this.pool.query(
      `SELECT bridge_id, computed_at, score,
              parity_severity, outflow_severity, signer_recency,
              frontend_recency, oracle_staleness
         FROM bridge_health_scores
         WHERE bridge_id = $1
         ORDER BY ABS(EXTRACT(EPOCH FROM (computed_at - $2::timestamptz))) ASC
         LIMIT 1`,
      [bridgeId, atIso],
    );
    return rows.length ? this.mapScoreRow(rows[0]) : null;
  }

  async worstScoreAfter(bridgeId: string, afterIso: string): Promise<HealthScore | null> {
    const { rows } = await this.pool.query(
      `SELECT bridge_id, computed_at, score,
              parity_severity, outflow_severity, signer_recency,
              frontend_recency, oracle_staleness
         FROM bridge_health_scores
         WHERE bridge_id = $1 AND computed_at > $2
         ORDER BY score ASC, computed_at ASC
         LIMIT 1`,
      [bridgeId, afterIso],
    );
    return rows.length ? this.mapScoreRow(rows[0]) : null;
  }

  private mapEventRow(r: { id: string; event_time: string | Date; bridge_id: string; payload: unknown }): BridgeEvent {
    return rowToEvent({ ...r, event_time: isoOf(r.event_time) });
  }

  async listEvents(opts: {
    bridgeId?: string;
    kind?: BridgeEventKind;
    chain?: string;
    since?: string;
    limit?: number;
  }): Promise<BridgeEvent[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.bridgeId) {
      params.push(opts.bridgeId);
      where.push(`bridge_id = $${params.length}`);
    }
    if (opts.kind) {
      params.push(opts.kind);
      where.push(`event_type = $${params.length}`);
    }
    if (opts.chain) {
      params.push(opts.chain);
      where.push(`chain_id = $${params.length}`);
    }
    if (opts.since) {
      params.push(opts.since);
      where.push(`event_time >= $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT id, event_time, bridge_id, payload
         FROM bridge_events
         ${whereSql}
         ORDER BY event_time DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => this.mapEventRow(r));
  }

  async eventsByTx(tx: string): Promise<BridgeEvent[]> {
    const { rows } = await this.pool.query(
      `SELECT id, event_time, bridge_id, payload FROM bridge_events WHERE tx = $1`,
      [tx],
    );
    return rows.map((r) => this.mapEventRow(r));
  }

  async latestEventCursor(): Promise<string> {
    const { rows } = await this.pool.query<{ m: string | Date | null }>(
      "SELECT MAX(event_time) AS m FROM bridge_events",
    );
    const m = rows[0]?.m;
    return m ? isoOf(m) : EPOCH;
  }

  async eventsSince(cursor: string, limit = 200): Promise<CursoredEvent[]> {
    const { rows } = await this.pool.query(
      `SELECT id, event_time, bridge_id, payload
         FROM bridge_events
         WHERE event_time > $1
         ORDER BY event_time ASC LIMIT $2`,
      [cursor, limit],
    );
    return rows.map((r) => {
      const event = this.mapEventRow(r);
      return { cursor: event.event_time, event };
    });
  }

  async countEvents(): Promise<number> {
    const { rows } = await this.pool.query<{ c: string }>("SELECT COUNT(*) AS c FROM bridge_events");
    return Number(rows[0]?.c ?? 0);
  }

  async countEventsSince(sinceIso: string, kinds: BridgeEventKind[]): Promise<number> {
    if (kinds.length === 0) return 0;
    const { rows } = await this.pool.query<{ c: string }>(
      "SELECT COUNT(*) AS c FROM bridge_events WHERE event_time >= $1 AND event_type = ANY($2::text[])",
      [sinceIso, kinds],
    );
    return Number(rows[0]?.c ?? 0);
  }

  async defillamaList(category: string): Promise<DefiLlamaRow[]> {
    const { rows } = await this.pool.query(
      "SELECT category, key, payload, fetched_at FROM defillama_cache WHERE category = $1 ORDER BY key",
      [category],
    );
    return rows.map((r) => ({
      category: r.category,
      key: r.key,
      payload: JSON.stringify(r.payload),
      fetched_at: isoOf(r.fetched_at),
    }));
  }

  async defillamaGet(category: string, key: string): Promise<DefiLlamaRow | undefined> {
    const { rows } = await this.pool.query(
      "SELECT category, key, payload, fetched_at FROM defillama_cache WHERE category = $1 AND key = $2",
      [category, key],
    );
    const r = rows[0];
    if (!r) return undefined;
    return { category: r.category, key: r.key, payload: JSON.stringify(r.payload), fetched_at: isoOf(r.fetched_at) };
  }

  async insertGameScore(entry: GameScoreEntry): Promise<GameScoreRow> {
    const { rows } = await this.pool.query<{ completed_at: string | Date }>(
      `INSERT INTO game_scores (wallet_address, score, blocks_used, distance)
       VALUES ($1, $2, $3, $4)
       RETURNING completed_at`,
      [entry.walletAddress, entry.score, entry.blocksUsed, entry.distance],
    );
    return { ...entry, completedAt: isoOf(rows[0]!.completed_at) };
  }

  async topGameScores(limit: number): Promise<GameScoreRow[]> {
    const { rows } = await this.pool.query<{
      wallet_address: string;
      score: number;
      blocks_used: number;
      distance: number;
      completed_at: string | Date;
    }>(
      `SELECT wallet_address, score, blocks_used, distance, completed_at
         FROM game_scores
         ORDER BY score DESC, completed_at ASC
         LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      walletAddress: r.wallet_address,
      score: r.score,
      blocksUsed: r.blocks_used,
      distance: r.distance,
      completedAt: isoOf(r.completed_at),
    }));
  }

  /** Same real increment/reset rule as the SQLite implementation above —
   * see that method's doc comment. A single atomic upsert (ON CONFLICT DO
   * UPDATE referencing the pre-update row via the table name, matching
   * Postgres's real semantics for excluded/target-row references within an
   * UPSERT) so concurrent requests for the same wallet can't race. */
  async recordActivity(walletAddress: string, todayUtc: string): Promise<StreakRow> {
    const { rows } = await this.pool.query<{
      wallet_address: string;
      last_active_date: string | Date;
      current_streak: number;
      longest_streak: number;
    }>(
      `INSERT INTO user_streaks (wallet_address, last_active_date, current_streak, longest_streak, updated_at)
       VALUES ($1, $2::date, 1, 1, NOW())
       ON CONFLICT (wallet_address) DO UPDATE SET
         current_streak = CASE
           WHEN user_streaks.last_active_date = $2::date THEN user_streaks.current_streak
           WHEN user_streaks.last_active_date = $2::date - INTERVAL '1 day' THEN user_streaks.current_streak + 1
           ELSE 1
         END,
         longest_streak = GREATEST(
           user_streaks.longest_streak,
           CASE
             WHEN user_streaks.last_active_date = $2::date THEN user_streaks.current_streak
             WHEN user_streaks.last_active_date = $2::date - INTERVAL '1 day' THEN user_streaks.current_streak + 1
             ELSE 1
           END
         ),
         last_active_date = $2::date,
         updated_at = NOW()
       RETURNING wallet_address, last_active_date, current_streak, longest_streak`,
      [walletAddress, todayUtc],
    );
    const r = rows[0]!;
    return {
      walletAddress: r.wallet_address,
      lastActiveDate: isoOf(r.last_active_date).slice(0, 10),
      currentStreak: r.current_streak,
      longestStreak: r.longest_streak,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Connect to whichever backend `url` points at — `sqlite://...` opens
 * SqliteRadarDb and any other prefix is routed to PostgresRadarDb. Mirrors
 * `radar_core::storage::connect_any` on the Rust side. */
export function createDb(url: string): RadarDb {
  if (url.startsWith("sqlite:") || url.startsWith("sqlite://")) {
    return new SqliteRadarDb(url);
  }
  return new PostgresRadarDb(url);
}
