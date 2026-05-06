// Thin synchronous SQLite reader. The Rust indexer is the only writer; the
// API only reads, so better-sqlite3 (sync, zero-overhead) is the right tool.
//
// Runs against the same DB file the indexer writes to (DATABASE_URL). When
// we move to Postgres+Timescale this file is the only thing that changes.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  BridgeEvent,
  BridgeEventKind,
  BridgeRow,
  HealthComponents,
  HealthScore,
} from "@radar/shared";

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

export class RadarDb {
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
      INSERT OR IGNORE INTO bridges (id, display_name, homepage) VALUES
        ('wormhole','Wormhole','https://wormhole.com'),
        ('allbridge','Allbridge','https://allbridge.io'),
        ('debridge','deBridge','https://debridge.finance'),
        ('layerzero','LayerZero','https://layerzero.network'),
        ('mayan','Mayan','https://mayan.finance'),
        ('portal','Portal','https://portalbridge.com'),
        ('axelar','Axelar','https://axelar.network'),
        ('stargate','Stargate','https://stargate.finance'),
        ('cctp','Circle CCTP','https://www.circle.com/en/usdc/bridge'),
        ('hyperlane','Hyperlane','https://hyperlane.xyz'),
        ('lido','Lido','https://lido.fi'),
        ('magic-eden','Magic Eden Bridge','https://magiceden.io');
    `);
  }

  listBridges(): BridgeRow[] {
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

  latestScores(): HealthScore[] {
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

  scoreHistory(bridgeId: string, since: string): HealthScore[] {
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

  listEvents(opts: {
    bridgeId?: string;
    kind?: BridgeEventKind;
    chain?: string;
    since?: string;
    limit?: number;
  }): BridgeEvent[] {
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
    return rows.map((r) => {
      const payload = JSON.parse(r.payload) as Record<string, unknown>;
      return {
        id: r.id,
        bridge_id: r.bridge_id,
        event_time: r.event_time,
        type: payload.type as BridgeEventKind,
        ...payload,
      } as BridgeEvent;
    });
  }

  // Used by the WS broadcast loop to find rows that landed since the last poll.
  eventsSince(rowidThreshold: number, limit = 50): { rowid: number; event: BridgeEvent }[] {
    const rows = this.db
      .prepare(
        `SELECT rowid, id, event_time, bridge_id, payload
           FROM bridge_events
           WHERE rowid > ?
           ORDER BY rowid ASC LIMIT ?`,
      )
      .all(rowidThreshold, limit) as {
      rowid: number;
      id: string;
      event_time: string;
      bridge_id: string;
      payload: string;
    }[];
    return rows.map((r) => {
      const payload = JSON.parse(r.payload) as Record<string, unknown>;
      return {
        rowid: r.rowid,
        event: {
          id: r.id,
          bridge_id: r.bridge_id,
          event_time: r.event_time,
          type: payload.type as BridgeEventKind,
          ...payload,
        } as BridgeEvent,
      };
    });
  }

  maxEventRowid(): number {
    const r = this.db.prepare("SELECT COALESCE(MAX(rowid), 0) AS m FROM bridge_events").get() as
      | { m: number }
      | undefined;
    return r?.m ?? 0;
  }

  countEvents(): number {
    const r = this.db.prepare("SELECT COUNT(*) AS c FROM bridge_events").get() as { c: number };
    return r.c;
  }
}

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

function rowToScore(r: DbScoreRow): HealthScore {
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
