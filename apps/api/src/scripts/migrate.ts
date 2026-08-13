// Applies migrations/*.sql to DATABASE_URL, in filename order. Every
// statement in every migration file uses IF NOT EXISTS / ON CONFLICT DO
// NOTHING, so running this on every boot is safe and idempotent — this is
// what the Render deploy's start command does instead of requiring a manual
// `psql -f` step against a database Render provisions fresh. No-ops for the
// SQLite dev default, which bakes its schema inline on connect instead.
//
// TimescaleDB's availability on Render's managed Postgres is unconfirmed as
// of writing — 0001_init.sql is the only file that depends on it. If
// `CREATE EXTENSION timescaledb` or `create_hypertable` fails specifically,
// this falls back to plain (non-hypertable) Postgres tables and says so
// loudly, rather than either fabricating success or leaving the database
// unmigrated.
//
// Run with: pnpm --filter @radar/api migrate

import "../load-env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "sqlite://./data/radar.db";
  if (dbUrl.startsWith("sqlite:") || dbUrl.startsWith("sqlite://")) {
    console.log("[migrate] DATABASE_URL is SQLite — schema is created inline on connect, nothing to apply.");
    return;
  }

  const migrationsDir = path.join(findWorkspaceRoot(__dirname), "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log(`[migrate] connected, applying ${files.length} migration file(s) from ${migrationsDir}`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await client.query(sql);
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (file === "0001_init.sql" && /timescaledb|create_hypertable/i.test(message)) {
        console.warn(
          `[migrate] ${file}: TimescaleDB unavailable on this Postgres (${message}) — ` +
            "retrying as plain Postgres tables, no hypertables/compression",
        );
        const fallback = sql
          .replace(/CREATE EXTENSION IF NOT EXISTS timescaledb;/i, "")
          .replace(/SELECT create_hypertable\([^;]*\);/gi, "");
        await client.query(fallback);
        console.log(`[migrate] applied ${file} (plain Postgres, no hypertables)`);
      } else {
        await client.end();
        throw err;
      }
    }
  }

  await client.end();
  console.log("[migrate] done");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
