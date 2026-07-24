// Loads the repo-root .env into process.env before anything else in this
// process reads it. Node/tsx do NOT do this automatically (unlike the Rust
// side, which uses dotenvy), and `pnpm --filter @radar/api dev` runs with
// cwd=apps/api — dotenv's default `path: ./.env` would silently miss the
// real .env at the workspace root, so every process.env.X read would fall
// through to its hardcoded default with no error. That's exactly how
// SOLANA_RPC_URL kept resolving to the public endpoint even after a real
// Helius URL was set in .env.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) || fs.existsSync(path.join(dir, "Cargo.toml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const envPath = path.join(findWorkspaceRoot(process.cwd()), ".env");
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`[radar-api] no .env found at ${envPath} (${result.error.message}) — using process env / defaults only`);
} else {
  console.log(`[radar-api] loaded env from ${envPath}`);
}
